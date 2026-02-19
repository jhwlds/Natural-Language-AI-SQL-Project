const el = (id) => document.getElementById(id);

const questionEl = el("question");
const strategyEl = el("strategy");
const askBtn = el("askBtn");
const statusEl = el("status");

const resultEl = el("result");
const errorBoxEl = el("errorBox");
const errorTextEl = el("errorText");

const metaStrategyEl = el("metaStrategy");
const metaAttemptsEl = el("metaAttempts");
const metaRowsEl = el("metaRows");

const sqlEl = el("sql");
const toggleSqlBtn = el("toggleSql");
const answerEl = el("answer");
const caveatsWrapEl = el("caveatsWrap");
const caveatsEl = el("caveats");
const rowsTableEl = el("rowsTable");

function setStatus(text) {
  statusEl.textContent = text || "";
}

function showError(obj) {
  errorBoxEl.classList.remove("hidden");
  errorTextEl.textContent = typeof obj === "string" ? obj : JSON.stringify(obj, null, 2);
}

function clearError() {
  errorBoxEl.classList.add("hidden");
  errorTextEl.textContent = "";
}

function showResult() {
  resultEl.classList.remove("hidden");
}

function hideResult() {
  resultEl.classList.add("hidden");
}

function renderTable(rows) {
  rowsTableEl.innerHTML = "";
  if (!rows || rows.length === 0) {
    rowsTableEl.innerHTML = "<tr><td style='padding:10px;color:rgba(255,255,255,0.65)'>No rows</td></tr>";
    return;
  }

  const cols = Object.keys(rows[0]);
  const thead = document.createElement("thead");
  const trh = document.createElement("tr");
  for (const c of cols) {
    const th = document.createElement("th");
    th.textContent = c;
    trh.appendChild(th);
  }
  thead.appendChild(trh);
  rowsTableEl.appendChild(thead);

  const tbody = document.createElement("tbody");
  for (const r of rows) {
    const tr = document.createElement("tr");
    for (const c of cols) {
      const td = document.createElement("td");
      const v = r[c];
      td.textContent = v === null || v === undefined ? "" : String(v);
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  }
  rowsTableEl.appendChild(tbody);
}

async function ask() {
  clearError();
  hideResult();

  const question = questionEl.value.trim();
  const strategy = strategyEl.value;
  if (!question) {
    setStatus("Type a question first.");
    return;
  }

  askBtn.disabled = true;
  setStatus("Thinking… generating SQL and querying the database.");

  try {
    const resp = await fetch("/api/ask", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question, strategy })
    });
    const data = await resp.json();

    if (!resp.ok) {
      showError(data);
      setStatus("Request failed.");
      return;
    }

    metaStrategyEl.textContent = `strategy: ${data.strategy}`;
    metaAttemptsEl.textContent = `attempts: ${data.attempts}`;
    metaRowsEl.textContent = `rows: ${data.row_count}`;

    sqlEl.textContent = data.sql || "";
    answerEl.textContent = data.answer || "";

    if (Array.isArray(data.caveats) && data.caveats.length > 0) {
      caveatsWrapEl.classList.remove("hidden");
      caveatsEl.innerHTML = "";
      for (const c of data.caveats) {
        const li = document.createElement("li");
        li.textContent = c;
        caveatsEl.appendChild(li);
      }
    } else {
      caveatsWrapEl.classList.add("hidden");
      caveatsEl.innerHTML = "";
    }

    renderTable(data.rows || []);
    showResult();
    setStatus("Done.");
  } catch (err) {
    showError(err?.message || String(err));
    setStatus("Request failed.");
  } finally {
    askBtn.disabled = false;
  }
}

toggleSqlBtn.addEventListener("click", () => {
  const isHidden = sqlEl.classList.toggle("hidden");
  toggleSqlBtn.textContent = isHidden ? "show" : "hide";
});

askBtn.addEventListener("click", ask);
questionEl.addEventListener("keydown", (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key === "Enter") ask();
});

// Convenience: put a starter question in the box.
questionEl.value = "Top 5 supplements by vitamin C per 100g.";

