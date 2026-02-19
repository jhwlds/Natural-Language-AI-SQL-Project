-- DrawSQL-friendly schema (tables + PK/FK only).
-- Source of truth remains: db/schema.sql

CREATE TABLE items (
  item_id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  item_type TEXT NOT NULL,
  brand TEXT,
  serving_size_g REAL
);

CREATE TABLE nutrients (
  nutrient_id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  unit TEXT NOT NULL
);

CREATE TABLE item_nutrients (
  item_id INTEGER NOT NULL,
  nutrient_id INTEGER NOT NULL,
  amount_per_100g REAL NOT NULL,
  PRIMARY KEY (item_id, nutrient_id),
  FOREIGN KEY (item_id) REFERENCES items(item_id),
  FOREIGN KEY (nutrient_id) REFERENCES nutrients(nutrient_id)
);

CREATE TABLE recipes (
  recipe_id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  servings REAL NOT NULL,
  instructions TEXT
);

CREATE TABLE recipe_items (
  recipe_id INTEGER NOT NULL,
  item_id INTEGER NOT NULL,
  amount_g REAL NOT NULL,
  PRIMARY KEY (recipe_id, item_id),
  FOREIGN KEY (recipe_id) REFERENCES recipes(recipe_id),
  FOREIGN KEY (item_id) REFERENCES items(item_id)
);

CREATE TABLE meal_logs (
  log_id INTEGER PRIMARY KEY,
  eaten_at TEXT NOT NULL,
  recipe_id INTEGER NOT NULL,
  servings_eaten REAL NOT NULL,
  FOREIGN KEY (recipe_id) REFERENCES recipes(recipe_id)
);

