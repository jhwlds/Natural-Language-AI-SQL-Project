import "dotenv/config";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import OpenAI from "openai";
import initSqlJs from "sql.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 3000);
const MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";
const OPENAI_TIMEOUT_MS = Number(process.env.OPENAI_TIMEOUT_MS || 45000);
const OPENAI_MAX_RETRIES = Number(process.env.OPENAI_MAX_RETRIES || 1);

function sqlGuard(rawSql) {
  if (typeof rawSql !== "string") return { ok: false, reason: "SQL is not a string." };
  let sql = rawSql.trim();
  if (!sql) return { ok: false, reason: "SQL is empty." };

  // Allow a single trailing semicolon (common formatting), but block multi-statement SQL.
  if (sql.endsWith(";")) sql = sql.slice(0, -1).trimEnd();
  if (sql.includes(";")) return { ok: false, reason: "Multi-statement SQL is not allowed." };
  if (sql.includes("--") || sql.includes("/*") || sql.includes("*/")) {
    return { ok: false, reason: "SQL comments are not allowed." };
  }

  // Must start with SELECT or WITH (CTE).
  if (!/^\s*(select|with)\b/i.test(sql)) {
    return { ok: false, reason: "Only SELECT queries are allowed." };
  }

  // Block dangerous SQLite keywords/features.
  const forbidden = [
    "pragma",
    "attach",
    "detach",
    "vacuum",
    "drop",
    "alter",
    "create",
    "insert",
    "update",
    "delete",
    "replace",
    "truncate",
    "reindex",
    "analyze",
    "load_extension"
  ];
  const lower = sql.toLowerCase();
  for (const kw of forbidden) {
    const re = new RegExp(`\\b${kw}\\b`, "i");
    if (re.test(lower)) return { ok: false, reason: `Forbidden keyword: ${kw}` };
  }

  let finalSql = sql;
  if (!/\blimit\b/i.test(finalSql)) {
    finalSql = `${finalSql} LIMIT 200`;
  }
  return { ok: true, sql: finalSql };
}

function execToRows(db, sql) {
  const resultSets = db.exec(sql);
  if (!resultSets || resultSets.length === 0) return { columns: [], rows: [] };
  const { columns, values } = resultSets[0];
  const rows = values.map((row) => Object.fromEntries(columns.map((c, i) => [c, row[i]])));
  return { columns, rows };
}

function truncateJsonForPrompt(obj, maxChars = 8000) {
  const s = JSON.stringify(obj);
  if (s.length <= maxChars) return s;
  return s.slice(0, maxChars) + "...(truncated)";
}

function sqlSystemPrompt({ schemaSql }) {
  return [
    "You are an expert data analyst that writes SQLite SELECT queries.",
    "",
    "Task: Convert the user's question into ONE safe SQLite query.",
    "",
    "Rules:",
    "- Output ONLY the JSON required by the response schema.",
    "- Use SQLite syntax.",
    "- Only SELECT (WITH allowed). No mutations, no PRAGMA, no ATTACH, no multiple statements.",
    "- The `sql` field must contain ONLY SQL (no comments like `-- ...` or `/* ... */`, no explanations).",
    "- If the question is ambiguous, make a reasonable assumption and proceed.",
    "- Prefer joining by IDs and using explicit table aliases.",
    "- Do NOT use SQL keywords as aliases (e.g., do not alias a table as `in`, `on`, `from`, `where`, `select`).",
    "- Use LIMIT when returning many rows (if unsure, LIMIT 50).",
    "",
    "Nutrition notes:",
    "- All item nutrient amounts are stored per 100g in item_nutrients.amount_per_100g.",
    "- Recipe nutrient totals can be computed by summing (recipe_items.amount_g * item_nutrients.amount_per_100g / 100.0).",
    "- Meal log nutrient totals can be computed by multiplying recipe totals by meal_logs.servings_eaten.",
    "- Use nutrient names exactly as stored in nutrients.name (snake_case like 'vitamin_c_mg', not 'Vitamin C').",
    "",
    "SQLite schema (DDL):",
    schemaSql
  ].join("\n");
}

function normalizeSqlForSQLite(rawSql) {
  let sql = String(rawSql || "");

  // Strip comments if the model included them inside the SQL field.
  // (We already capture assumptions separately; comments just cause guard rejections.)
  sql = sql.replace(/--.*$/gm, "");
  sql = sql.replace(/\/\*[\s\S]*?\*\//g, "");

  // Fix a common model mistake: reserved keyword alias `in`.
  // Handles: "item_nutrients in" and "item_nutrients AS in"
  sql = sql.replace(/\bitem_nutrients\b\s+(as\s+)?in\b/gi, "item_nutrients inut");
  sql = sql.replace(/\bin\./g, "inut.");

  return sql.trim();
}

function sqlFewShotExamples() {
  const examples = [
    {
      q: "Top 5 supplements by vitamin C per 100g.",
      sql: [
        "SELECT i.name, i.brand, inut.amount_per_100g AS vitamin_c_mg_per_100g",
        "FROM items i",
        "JOIN nutrients n ON n.name = 'vitamin_c_mg'",
        "JOIN item_nutrients inut ON inut.item_id = i.item_id AND inut.nutrient_id = n.nutrient_id",
        "WHERE i.item_type = 'supplement'",
        "ORDER BY vitamin_c_mg_per_100g DESC",
        "LIMIT 5"
      ].join("\n")
    },
    {
      q: "How many calories did I consume each day in the last 7 days?",
      sql: [
        "WITH recipe_kcal AS (",
        "  SELECT r.recipe_id,",
        "         SUM(ri.amount_g * inut.amount_per_100g / 100.0) AS kcal_per_recipe",
        "  FROM recipes r",
        "  JOIN recipe_items ri ON ri.recipe_id = r.recipe_id",
        "  JOIN nutrients n ON n.name = 'calories_kcal'",
        "  JOIN item_nutrients inut ON inut.item_id = ri.item_id AND inut.nutrient_id = n.nutrient_id",
        "  GROUP BY r.recipe_id",
        ")",
        "SELECT date(ml.eaten_at) AS day,",
        "       SUM(ml.servings_eaten * rk.kcal_per_recipe) AS calories_kcal",
        "FROM meal_logs ml",
        "JOIN recipe_kcal rk ON rk.recipe_id = ml.recipe_id",
        "WHERE ml.eaten_at >= datetime('now', '-7 days')",
        "GROUP BY date(ml.eaten_at)",
        "ORDER BY day ASC",
        "LIMIT 200"
      ].join("\n")
    }
  ];

  return examples.flatMap((ex) => [
    { role: "user", content: ex.q },
    { role: "assistant", content: JSON.stringify({ sql: ex.sql }) }
  ]);
}

async function createApp() {
  const apiKey = process.env.OPENAI_API_KEY;
  const client = apiKey
    ? new OpenAI({ apiKey, timeout: OPENAI_TIMEOUT_MS, maxRetries: OPENAI_MAX_RETRIES })
    : null;

  const schemaSql = await fs.readFile(path.resolve(__dirname, "db/schema.sql"), "utf-8");
  const dbPath = path.resolve(__dirname, "db/aidb.sqlite");

  let dbBytes;
  try {
    dbBytes = await fs.readFile(dbPath);
  } catch {
    throw new Error('Missing "db/aidb.sqlite". Run: npm run db:seed');
  }

  const sqlJsDist = path.resolve(__dirname, "node_modules/sql.js/dist");
  const SQL = await initSqlJs({ locateFile: (file) => path.join(sqlJsDist, file) });
  const db = new SQL.Database(new Uint8Array(dbBytes));

  const app = express();
  app.use(express.json({ limit: "1mb" }));
  app.use(express.static(path.resolve(__dirname, "public")));

  // Lightweight request timing logs (helps diagnose "it's stuck").
  app.use((req, res, next) => {
    const start = Date.now();
    res.on("finish", () => {
      const ms = Date.now() - start;
      if (req.path.startsWith("/api/")) {
        console.log(`[api] ${req.method} ${req.path} -> ${res.statusCode} (${ms}ms)`);
      }
    });
    next();
  });

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true });
  });

  app.post("/api/ask", async (req, res) => {
    const question = String(req.body?.question || "").trim();
    const strategy = (req.body?.strategy || "few").toLowerCase(); // "zero" | "few"

    if (!question) return res.status(400).json({ error: "Missing question." });
    if (!["zero", "few"].includes(strategy)) return res.status(400).json({ error: "Invalid strategy." });
    if (!client) {
      return res.status(500).json({
        error: "Missing OPENAI_API_KEY. Set it in your environment and restart the server."
      });
    }

    // Don't let requests hang forever at the HTTP layer.
    res.setTimeout(OPENAI_TIMEOUT_MS + 15000);

    console.log(`[ask] strategy=${strategy} q="${question}"`);

    const responseFormatSql = {
      type: "json_schema",
      json_schema: {
        name: "sql_generation",
        strict: true,
        schema: {
          type: "object",
          properties: {
            sql: { type: "string" },
            assumptions: { type: "array", items: { type: "string" } }
          },
          required: ["sql", "assumptions"],
          additionalProperties: false
        }
      }
    };

    const responseFormatAnswer = {
      type: "json_schema",
      json_schema: {
        name: "nl_answer",
        strict: true,
        schema: {
          type: "object",
          properties: {
            answer: { type: "string" },
            caveats: { type: "array", items: { type: "string" } }
          },
          required: ["answer", "caveats"],
          additionalProperties: false
        }
      }
    };

    const baseMessages = [
      { role: "system", content: sqlSystemPrompt({ schemaSql }) },
      ...(strategy === "few" ? sqlFewShotExamples() : []),
      { role: "user", content: question }
    ];

    let attempts = 0;
    let generatedSql = "";
    let assumptions = [];
    let guardReason = null;
    let columns = [];
    let rows = [];
    let execError = null;

    while (attempts < 3) {
      attempts += 1;
      try {
        const t0 = Date.now();
        const completion = await client.chat.completions.create({
          model: MODEL,
          temperature: 0,
          messages:
            attempts === 1
              ? baseMessages
              : [
                  ...baseMessages,
                  {
                    role: "user",
                    content:
                      `The previous SQL failed to execute in SQLite.\n\n` +
                      `Previous SQL:\n${generatedSql}\n\n` +
                      `SQLite error:\n${execError}\n\n` +
                      `Please return a corrected SQL query for the same question. ` +
                      `Remember: avoid SQL keyword aliases (do not use alias 'in') and use nutrient names exactly as stored (e.g., 'vitamin_c_mg').`
                  }
                ],
          response_format: responseFormatSql
        });
        console.log(`[ask] sql_gen attempt=${attempts} (${Date.now() - t0}ms)`);

        const msg = completion.choices?.[0]?.message;
        if (!msg?.content) throw new Error("Empty model response.");
        const parsed = JSON.parse(msg.content);
        generatedSql = normalizeSqlForSQLite(String(parsed.sql || "").trim());
        assumptions = Array.isArray(parsed.assumptions) ? parsed.assumptions.map(String) : [];

        const guarded = sqlGuard(generatedSql);
        if (!guarded.ok) {
          guardReason = guarded.reason;
          return res.status(400).json({
            error: "SQL rejected by guard.",
            guard_reason: guardReason,
            sql: generatedSql,
            assumptions,
            strategy,
            attempts
          });
        }

        const executed = execToRows(db, guarded.sql);
        columns = executed.columns;
        rows = executed.rows;
        execError = null;
        break;
      } catch (err) {
        execError = err?.message || String(err);
        console.log(`[ask] sql_gen_or_exec attempt=${attempts} error=${execError}`);
        if (attempts >= 3) break;
      }
    }

    if (execError) {
      return res.status(500).json({
        error: "Failed to generate executable SQL.",
        sql: generatedSql,
        assumptions,
        strategy,
        attempts,
        exec_error: execError
      });
    }

    const rowsPreview = rows.slice(0, 50);
    const answerPrompt = [
      "You are a helpful assistant that answers questions using database query results.",
      "Answer in English.",
      "",
      "If the result rows are empty, say that there was no data matching the query.",
      "Do not mention that you are an AI model. Do not fabricate data not present in the rows.",
      "",
      `User question: ${question}`,
      "",
      "SQL used:",
      generatedSql,
      "",
      `Row count: ${rows.length}`,
      "Rows (JSON preview):",
      truncateJsonForPrompt(rowsPreview, 8000)
    ].join("\n");

    try {
      const t1 = Date.now();
      const completion2 = await client.chat.completions.create({
        model: MODEL,
        temperature: 0.2,
        messages: [{ role: "system", content: answerPrompt }],
        response_format: responseFormatAnswer
      });
      console.log(`[ask] answer_gen (${Date.now() - t1}ms) rows=${rows.length}`);
      const msg2 = completion2.choices?.[0]?.message;
      if (!msg2?.content) throw new Error("Empty answer response.");
      const parsed2 = JSON.parse(msg2.content);

      return res.json({
        strategy,
        attempts,
        sql: generatedSql,
        assumptions,
        columns,
        row_count: rows.length,
        rows: rows.slice(0, 20),
        answer: parsed2.answer,
        caveats: parsed2.caveats
      });
    } catch (err) {
      return res.status(500).json({
        error: "Failed to generate natural language answer.",
        strategy,
        attempts,
        sql: generatedSql,
        assumptions,
        columns,
        row_count: rows.length,
        rows: rows.slice(0, 20),
        exec_error: execError,
        answer_error: err?.message || String(err)
      });
    }
  });

  return app;
}

createApp()
  .then((app) => {
    app.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error(err.message || err);
    process.exitCode = 1;
  });

