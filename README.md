# Natural-Language-AI-SQL-Project (Recipes + Supplements)

This project demonstrates a natural language interface to a SQLite database:

**Natural language question → GPT generates SQLite SQL → SQL runs on a local DB → GPT summarizes results in plain English**

## Database purpose
Track recipes, ingredients, supplements, nutrient information (standardized per 100g), and recipe meal logs so a user can ask nutrition/food questions in plain English.

## Tech stack
- Frontend: HTML/CSS/JS (served statically)
- Backend: Node.js + Express
- Database: SQLite file generated via `sql.js` (WASM SQLite)
- AI: OpenAI API (Structured Outputs / JSON Schema)

## Setup
### 1) Install
```bash
npm install
```

### 2) Generate the SQLite database
```bash
npm run db:seed
```
This creates `db/aidb.sqlite`.

### 3) Set your OpenAI API key (DO NOT commit it)
Create a `.env` file (recommended) using `.env.example` as a template:

```bash
cp .env.example .env
```

Then edit `.env` and set `OPENAI_API_KEY=...`.

Alternatively, you can export it in your shell:
```bash
export OPENAI_API_KEY="YOUR_KEY_HERE"
```

Optional:
```bash
export OPENAI_MODEL="gpt-4o-mini"
```

### 4) Run
```bash
npm start
```
Open `http://localhost:3000`.

## Prompting strategies tried
The backend supports two primary strategies, plus an execution-guided repair loop:
- **Zero-shot**: schema + rules + question → SQL
- **Few-shot (single-domain)**: same as above + 2 in-domain examples → SQL
- **Execution-guided (repair loop)**: if SQL execution errors, the app sends the SQLite error back to GPT and requests a corrected query (max 2 retries). Empty rows are not automatically treated as failure.

You can toggle Zero-shot vs Few-shot in the UI.

## Schema picture
![Schema diagram](drawSQL-image-export-2026-02-19.png)

Ways to generate:
- Use an ERD tool (e.g., DrawSQL). For easy import, use `db/drawsql_schema.sql` (tables + PK/FK only).
- Or generate from the SQLite schema using a tool like SchemaCrawler

## Sample that worked (fill after running)
- **Question**: Top 5 supplements by vitamin C per 100g.
- **Generated SQL**:

```sql
SELECT i.name AS supplement_name, inut.amount_per_100g AS vitamin_c_mg
FROM items AS i
JOIN item_nutrients inut ON i.item_id = inut.item_id
JOIN nutrients AS n ON inut.nutrient_id = n.nutrient_id
WHERE i.item_type = 'supplement' AND n.name = 'vitamin_c_mg'
ORDER BY inut.amount_per_100g DESC
LIMIT 5;
```

- **Response**:
  - The top 5 supplements by vitamin C per 100g are:
    1. Vitamin C 1000mg Tablet - 62500 mg
    2. Vitamin C 500mg (SunHealth) - 17883.72 mg
    3. Vitamin C Gummies 250mg - 5000 mg
    4. Multivitamin (Once Daily) - 4285.71 mg
    5. B-Complex (DailyBasics) - 1682.54 mg

## Sample that did not work (fill after running)
- **Question**: What supplements did I take last week?
- **Generated SQL**:

```sql
SELECT DISTINCT i.name, i.brand
FROM meal_logs ml
JOIN recipes r ON ml.recipe_id = r.recipe_id
JOIN recipe_items ri ON r.recipe_id = ri.recipe_id
JOIN items i ON ri.item_id = i.item_id
WHERE i.item_type = 'supplement' AND ml.eaten_at >= date('now', '-7 days')
LIMIT 50;
```

- **What went wrong**:
  - This database does **not** track supplement intake in `meal_logs` (we only log recipe consumption).
  - The model tried to infer supplements from meal logs by joining through `recipe_items`, but recipes only contain ingredients in our data.
  - Result: the query returned 0 rows even though the user question sounds reasonable in a real app. This highlights a limitation: the AI can produce syntactically valid SQL that doesn't match the underlying data/modeling assumptions.

## More examples
See `examples.md` for at least 6 additional questions to try.

## Notes
- The server will start without `OPENAI_API_KEY`, but `/api/ask` will return an error until you set it.
- The SQL guard only allows `SELECT` / `WITH` queries and blocks dangerous keywords (PRAGMA/ATTACH/etc.).