PRAGMA foreign_keys = ON;

-- items = ingredients and supplements (distinguished by item_type)
CREATE TABLE IF NOT EXISTS items (
  item_id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  item_type TEXT NOT NULL CHECK (item_type IN ('ingredient', 'supplement')),
  brand TEXT,
  serving_size_g REAL CHECK (serving_size_g IS NULL OR serving_size_g > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_items_unique_name_brand_type
  ON items(name, COALESCE(brand, ''), item_type);

-- nutrients master list
CREATE TABLE IF NOT EXISTS nutrients (
  nutrient_id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  unit TEXT NOT NULL
);

-- nutrient amounts per item (standardized to per 100g)
CREATE TABLE IF NOT EXISTS item_nutrients (
  item_id INTEGER NOT NULL,
  nutrient_id INTEGER NOT NULL,
  amount_per_100g REAL NOT NULL,
  PRIMARY KEY (item_id, nutrient_id),
  FOREIGN KEY (item_id) REFERENCES items(item_id) ON DELETE CASCADE,
  FOREIGN KEY (nutrient_id) REFERENCES nutrients(nutrient_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_item_nutrients_nutrient_id ON item_nutrients(nutrient_id);

-- recipes
CREATE TABLE IF NOT EXISTS recipes (
  recipe_id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  servings REAL NOT NULL DEFAULT 1 CHECK (servings > 0),
  instructions TEXT
);

-- recipe composition (grams of each item)
CREATE TABLE IF NOT EXISTS recipe_items (
  recipe_id INTEGER NOT NULL,
  item_id INTEGER NOT NULL,
  amount_g REAL NOT NULL CHECK (amount_g > 0),
  PRIMARY KEY (recipe_id, item_id),
  FOREIGN KEY (recipe_id) REFERENCES recipes(recipe_id) ON DELETE CASCADE,
  FOREIGN KEY (item_id) REFERENCES items(item_id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_recipe_items_item_id ON recipe_items(item_id);

-- meal logs (recipe consumption only)
CREATE TABLE IF NOT EXISTS meal_logs (
  log_id INTEGER PRIMARY KEY,
  eaten_at TEXT NOT NULL, -- ISO 8601 datetime string
  recipe_id INTEGER NOT NULL,
  servings_eaten REAL NOT NULL CHECK (servings_eaten > 0),
  FOREIGN KEY (recipe_id) REFERENCES recipes(recipe_id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_meal_logs_eaten_at ON meal_logs(eaten_at);
