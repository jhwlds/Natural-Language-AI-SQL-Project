import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import initSqlJs from "sql.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function mulberry32(seed) {
  let t = seed >>> 0;
  return function rand() {
    t += 0x6d2b79f5;
    let x = Math.imul(t ^ (t >>> 15), 1 | t);
    x ^= x + Math.imul(x ^ (x >>> 7), 61 | x);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

function pick(rand, arr) {
  return arr[Math.floor(rand() * arr.length)];
}

function randFloat(rand, min, max, decimals = 1) {
  const val = min + (max - min) * rand();
  const p = 10 ** decimals;
  return Math.round(val * p) / p;
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function toIsoLocal(dt) {
  const pad = (n) => String(n).padStart(2, "0");
  return (
    `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}` +
    `T${pad(dt.getHours())}:${pad(dt.getMinutes())}:${pad(dt.getSeconds())}`
  );
}

const NUTRIENTS = [
  { name: "calories_kcal", unit: "kcal" },
  { name: "protein_g", unit: "g" },
  { name: "fat_g", unit: "g" },
  { name: "carbs_g", unit: "g" },
  { name: "fiber_g", unit: "g" },
  { name: "sugar_g", unit: "g" },
  { name: "sodium_mg", unit: "mg" },
  { name: "vitamin_c_mg", unit: "mg" },
  { name: "vitamin_d_mcg", unit: "mcg" },
  { name: "iron_mg", unit: "mg" },
  { name: "magnesium_mg", unit: "mg" },
  { name: "omega3_g", unit: "g" }
];

const INGREDIENT_CATALOG = {
  fruits: [
    "Apple",
    "Banana",
    "Orange",
    "Blueberries",
    "Strawberries",
    "Grapes",
    "Pineapple",
    "Mango",
    "Kiwi",
    "Peach",
    "Pear",
    "Watermelon",
    "Lemon",
    "Avocado",
    "Cherries"
  ],
  vegetables: [
    "Broccoli",
    "Spinach",
    "Kale",
    "Carrot",
    "Bell pepper",
    "Tomato",
    "Cucumber",
    "Onion",
    "Garlic",
    "Zucchini",
    "Mushrooms",
    "Cauliflower",
    "Sweet potato",
    "Green beans",
    "Asparagus"
  ],
  proteins: [
    "Chicken breast",
    "Salmon",
    "Tuna",
    "Shrimp",
    "Turkey",
    "Lean beef",
    "Egg",
    "Tofu",
    "Tempeh",
    "Lentils (cooked)",
    "Black beans (cooked)",
    "Chickpeas (cooked)",
    "Greek yogurt",
    "Cottage cheese",
    "Edamame"
  ],
  grains: [
    "White rice (cooked)",
    "Brown rice (cooked)",
    "Quinoa (cooked)",
    "Oats",
    "Whole wheat pasta (cooked)",
    "Bread (whole wheat)",
    "Tortilla (whole wheat)",
    "Rice noodles (cooked)",
    "Couscous (cooked)",
    "Granola",
    "Bagel",
    "Corn tortilla",
    "Barley (cooked)",
    "Buckwheat (cooked)",
    "Pita bread"
  ],
  oils: ["Olive oil", "Canola oil", "Butter", "Coconut oil", "Sesame oil"],
  condiments: [
    "Soy sauce",
    "Salsa",
    "Ketchup",
    "Mustard",
    "Hot sauce",
    "Pesto",
    "Mayonnaise",
    "Vinaigrette",
    "Peanut butter",
    "Honey"
  ]
};

const SUPPLEMENTS = [
  {
    name: "Vitamin C 1000mg Tablet",
    brand: "NutriPlus",
    serving_size_g: 1.6,
    per_serving: { vitamin_c_mg: 1000, sodium_mg: 5 }
  },
  {
    name: "Vitamin D3 2000 IU Softgel",
    brand: "SunHealth",
    serving_size_g: 1.2,
    per_serving: { vitamin_d_mcg: 50 } // 2000 IU ~= 50 mcg
  },
  {
    name: "Magnesium Citrate 200mg",
    brand: "MineralWorks",
    serving_size_g: 2.0,
    per_serving: { magnesium_mg: 200 }
  },
  {
    name: "Iron 18mg",
    brand: "DailyBasics",
    serving_size_g: 1.0,
    per_serving: { iron_mg: 18 }
  },
  {
    name: "Omega-3 Fish Oil 1000mg",
    brand: "OceanPure",
    serving_size_g: 1.3,
    per_serving: { omega3_g: 0.3, fat_g: 1.0, calories_kcal: 9 }
  },
  {
    name: "Multivitamin (Once Daily)",
    brand: "DailyBasics",
    serving_size_g: 1.4,
    per_serving: { vitamin_c_mg: 60, vitamin_d_mcg: 20, iron_mg: 8, magnesium_mg: 50 }
  },
  {
    name: "Electrolyte Mix (Zero Sugar)",
    brand: "HydraMix",
    serving_size_g: 6.5,
    per_serving: { sodium_mg: 400, magnesium_mg: 60 }
  },
  {
    name: "Protein Powder (Whey)",
    brand: "StrongLab",
    serving_size_g: 30,
    per_serving: { protein_g: 24, carbs_g: 3, fat_g: 2, calories_kcal: 120, sodium_mg: 120 }
  },
  {
    name: "Vitamin C Gummies 250mg",
    brand: "ChewJoy",
    serving_size_g: 5.0,
    per_serving: { vitamin_c_mg: 250, sugar_g: 2, calories_kcal: 15, carbs_g: 4 }
  },
  {
    name: "Magnesium Glycinate 120mg",
    brand: "MineralWorks",
    serving_size_g: 1.8,
    per_serving: { magnesium_mg: 120 }
  }
];

function ingredientNutrients(rand, category, name) {
  // Base profiles per 100g (not scientifically exact; designed for varied querying).
  if (name === "Olive oil") {
    return { calories_kcal: 884, fat_g: 100, carbs_g: 0, protein_g: 0, fiber_g: 0, sugar_g: 0, sodium_mg: 0 };
  }
  if (name === "Chicken breast") {
    return { calories_kcal: 165, protein_g: 31, fat_g: 3.6, carbs_g: 0, fiber_g: 0, sugar_g: 0, sodium_mg: 74 };
  }
  if (name === "Broccoli") {
    return { calories_kcal: 34, protein_g: 2.8, fat_g: 0.4, carbs_g: 6.6, fiber_g: 2.6, sugar_g: 1.7, sodium_mg: 33, vitamin_c_mg: 89 };
  }
  if (name === "Spinach") {
    return { calories_kcal: 23, protein_g: 2.9, fat_g: 0.4, carbs_g: 3.6, fiber_g: 2.2, sugar_g: 0.4, sodium_mg: 79, iron_mg: 2.7, magnesium_mg: 79, vitamin_c_mg: 28 };
  }

  if (category === "fruits") {
    const carbs = randFloat(rand, 8, 22);
    const sugar = clamp(randFloat(rand, 5, 18), 0, carbs);
    return {
      calories_kcal: Math.round(carbs * 4 + randFloat(rand, 5, 20, 0)),
      protein_g: randFloat(rand, 0.2, 1.5),
      fat_g: randFloat(rand, 0.1, 0.6),
      carbs_g: carbs,
      fiber_g: randFloat(rand, 1, 5),
      sugar_g: sugar,
      sodium_mg: randFloat(rand, 0, 10, 0),
      vitamin_c_mg: randFloat(rand, 5, 70, 0)
    };
  }

  if (category === "vegetables") {
    const carbs = randFloat(rand, 3, 12);
    return {
      calories_kcal: Math.round(carbs * 4 + randFloat(rand, 5, 15, 0)),
      protein_g: randFloat(rand, 0.8, 4.0),
      fat_g: randFloat(rand, 0.1, 0.8),
      carbs_g: carbs,
      fiber_g: randFloat(rand, 1.2, 6.0),
      sugar_g: randFloat(rand, 0.3, 5.0),
      sodium_mg: randFloat(rand, 5, 80, 0),
      vitamin_c_mg: randFloat(rand, 10, 120, 0),
      magnesium_mg: randFloat(rand, 10, 60, 0)
    };
  }

  if (category === "proteins") {
    const protein = randFloat(rand, 18, 35);
    const fat = randFloat(rand, 2, 18);
    const carbs = randFloat(rand, 0, 6);
    return {
      calories_kcal: Math.round(protein * 4 + fat * 9 + carbs * 4),
      protein_g: protein,
      fat_g: fat,
      carbs_g: carbs,
      fiber_g: randFloat(rand, 0, 3),
      sugar_g: randFloat(rand, 0, 2),
      sodium_mg: randFloat(rand, 40, 140, 0),
      iron_mg: randFloat(rand, 0.2, 3.5),
      magnesium_mg: randFloat(rand, 10, 45, 0),
      omega3_g: randFloat(rand, 0, 2.5)
    };
  }

  if (category === "grains") {
    const carbs = randFloat(rand, 18, 75);
    const protein = randFloat(rand, 2, 17);
    const fat = randFloat(rand, 0.5, 9);
    const fiber = randFloat(rand, 1, 12);
    const calories = Math.round(protein * 4 + fat * 9 + carbs * 4);
    return {
      calories_kcal: calories,
      protein_g: protein,
      fat_g: fat,
      carbs_g: carbs,
      fiber_g: fiber,
      sugar_g: randFloat(rand, 0.2, 12),
      sodium_mg: randFloat(rand, 0, 150, 0),
      iron_mg: randFloat(rand, 0.3, 4.0),
      magnesium_mg: randFloat(rand, 10, 80, 0)
    };
  }

  if (category === "oils") {
    return { calories_kcal: 884, fat_g: 100, carbs_g: 0, protein_g: 0, fiber_g: 0, sugar_g: 0, sodium_mg: 0 };
  }

  // condiments (varied)
  const isSalty = ["Soy sauce", "Hot sauce", "Mustard"].includes(name);
  const isSweet = ["Honey", "Ketchup"].includes(name);
  const fat = name === "Mayonnaise" ? randFloat(rand, 60, 75) : randFloat(rand, 0, 15);
  const carbs = isSweet ? randFloat(rand, 15, 80) : randFloat(rand, 1, 20);
  const protein = randFloat(rand, 0, 5);
  return {
    calories_kcal: Math.round(protein * 4 + fat * 9 + carbs * 4),
    protein_g: protein,
    fat_g: fat,
    carbs_g: carbs,
    fiber_g: randFloat(rand, 0, 3),
    sugar_g: isSweet ? randFloat(rand, 10, Math.max(10, carbs)) : randFloat(rand, 0, 6),
    sodium_mg: isSalty ? randFloat(rand, 500, 5000, 0) : randFloat(rand, 0, 400, 0)
  };
}

function perServingToPer100g(perServing, servingSizeG) {
  const per100 = {};
  for (const [k, v] of Object.entries(perServing)) {
    per100[k] = (v / servingSizeG) * 100;
  }
  return per100;
}

async function main() {
  const rand = mulberry32(452); // deterministic

  const sqlJsDist = path.resolve(__dirname, "../node_modules/sql.js/dist");
  const SQL = await initSqlJs({
    locateFile: (file) => path.join(sqlJsDist, file)
  });

  const schemaPath = path.resolve(__dirname, "schema.sql");
  const schemaSql = await fs.readFile(schemaPath, "utf-8");

  const db = new SQL.Database();
  db.run(schemaSql);
  db.run("PRAGMA foreign_keys = ON;");

  db.run("BEGIN;");

  // nutrients
  const nutrientIdByName = new Map();
  {
    const stmt = db.prepare("INSERT INTO nutrients (name, unit) VALUES (?, ?)");
    for (const n of NUTRIENTS) {
      stmt.run([n.name, n.unit]);
      const res = db.exec("SELECT last_insert_rowid() AS id");
      const id = res[0].values[0][0];
      nutrientIdByName.set(n.name, id);
    }
    stmt.free();
  }

  // items + item_nutrients
  const itemIdByNameType = new Map(); // key `${type}:${name}`
  const insertItemStmt = db.prepare(
    "INSERT INTO items (name, item_type, brand, serving_size_g) VALUES (?, ?, ?, ?)"
  );
  const insertItemNutrStmt = db.prepare(
    "INSERT INTO item_nutrients (item_id, nutrient_id, amount_per_100g) VALUES (?, ?, ?)"
  );

  function addItem({ name, item_type, brand = null, serving_size_g = null, nutrientsPer100g = {} }) {
    insertItemStmt.run([name, item_type, brand, serving_size_g]);
    const res = db.exec("SELECT last_insert_rowid() AS id");
    const itemId = res[0].values[0][0];

    for (const [nutrientName, amount] of Object.entries(nutrientsPer100g)) {
      const nutrientId = nutrientIdByName.get(nutrientName);
      if (!nutrientId) continue;
      if (amount === null || amount === undefined) continue;
      const val = Number(amount);
      if (!Number.isFinite(val)) continue;
      insertItemNutrStmt.run([itemId, nutrientId, val]);
    }

    itemIdByNameType.set(`${item_type}:${name}`, itemId);
    return itemId;
  }

  // ingredients
  for (const [category, names] of Object.entries(INGREDIENT_CATALOG)) {
    for (const name of names) {
      const nutrients = ingredientNutrients(rand, category, name);
      addItem({ name, item_type: "ingredient", nutrientsPer100g: nutrients });
    }
  }

  // supplements
  for (const s of SUPPLEMENTS) {
    const nutrientsPer100g = perServingToPer100g(s.per_serving, s.serving_size_g);
    addItem({
      name: s.name,
      item_type: "supplement",
      brand: s.brand,
      serving_size_g: s.serving_size_g,
      nutrientsPer100g
    });
  }

  // add extra generated supplements to reach a richer catalog
  const extraSupplementNames = [
    "Vitamin C 500mg",
    "Vitamin D3 1000 IU",
    "Zinc 15mg",
    "Calcium 500mg",
    "Magnesium 100mg",
    "Iron 28mg",
    "Omega-3 600mg",
    "Electrolyte Tabs",
    "Creatine Monohydrate",
    "B-Complex"
  ];
  const brands = ["DailyBasics", "NutriPlus", "SunHealth", "MineralWorks", "StrongLab"];

  for (const name of extraSupplementNames) {
    const brand = pick(rand, brands);
    const serving_size_g = randFloat(rand, 1.0, 8.0, 1);
    const perServing = {};

    if (name.includes("Vitamin C")) perServing.vitamin_c_mg = randFloat(rand, 250, 1000, 0);
    if (name.includes("Vitamin D3")) perServing.vitamin_d_mcg = randFloat(rand, 10, 50, 0);
    if (name.includes("Magnesium")) perServing.magnesium_mg = randFloat(rand, 80, 250, 0);
    if (name.includes("Iron")) perServing.iron_mg = randFloat(rand, 10, 28, 0);
    if (name.includes("Omega-3")) perServing.omega3_g = randFloat(rand, 0.2, 0.8, 1);
    if (name.includes("Electrolyte")) perServing.sodium_mg = randFloat(rand, 200, 800, 0);
    if (name.includes("Creatine")) perServing.protein_g = 0;
    if (name.includes("B-Complex")) perServing.vitamin_c_mg = randFloat(rand, 0, 120, 0);

    addItem({
      name: `${name} (${brand})`,
      item_type: "supplement",
      brand,
      serving_size_g,
      nutrientsPer100g: perServingToPer100g(perServing, serving_size_g)
    });
  }

  // recipes
  const recipes = [
    { name: "Chicken Broccoli Bowl", servings: 2 },
    { name: "Salmon Avocado Salad", servings: 2 },
    { name: "Tofu Veggie Stir-Fry", servings: 3 },
    { name: "Greek Yogurt Berry Parfait", servings: 2 },
    { name: "Oatmeal Banana Peanut Bowl", servings: 2 },
    { name: "Turkey Spinach Wrap", servings: 2 },
    { name: "Beef Quinoa Power Bowl", servings: 3 },
    { name: "Lentil Tomato Soup", servings: 4 },
    { name: "Pasta Pesto Chicken", servings: 3 },
    { name: "Veggie Omelet", servings: 2 },
    { name: "Chickpea Cucumber Salad", servings: 3 },
    { name: "Shrimp Rice Veggie Plate", servings: 2 }
  ];

  const insertRecipeStmt = db.prepare("INSERT INTO recipes (name, servings, instructions) VALUES (?, ?, ?)");
  const insertRecipeItemStmt = db.prepare(
    "INSERT INTO recipe_items (recipe_id, item_id, amount_g) VALUES (?, ?, ?)"
  );

  const ingredientId = (name) => {
    const id = itemIdByNameType.get(`ingredient:${name}`);
    if (!id) throw new Error(`Missing ingredient: ${name}`);
    return id;
  };

  const recipeIdByName = new Map();

  for (const r of recipes) {
    insertRecipeStmt.run([
      r.name,
      r.servings,
      `Simple instructions: combine ingredients for "${r.name}", cook as needed, and serve.`
    ]);
    const res = db.exec("SELECT last_insert_rowid() AS id");
    const recipeId = res[0].values[0][0];
    recipeIdByName.set(r.name, recipeId);
  }

  // hard-coded-ish ingredient composition (grams) to make queries stable
  const recipeCompositions = {
    "Chicken Broccoli Bowl": [
      ["Chicken breast", 180],
      ["Broccoli", 160],
      ["White rice (cooked)", 220],
      ["Soy sauce", 15],
      ["Olive oil", 10],
      ["Garlic", 6]
    ],
    "Salmon Avocado Salad": [
      ["Salmon", 170],
      ["Avocado", 120],
      ["Spinach", 60],
      ["Tomato", 80],
      ["Vinaigrette", 20],
      ["Lemon", 20]
    ],
    "Tofu Veggie Stir-Fry": [
      ["Tofu", 200],
      ["Bell pepper", 120],
      ["Onion", 60],
      ["Zucchini", 120],
      ["Soy sauce", 18],
      ["Sesame oil", 8],
      ["Garlic", 6]
    ],
    "Greek Yogurt Berry Parfait": [
      ["Greek yogurt", 220],
      ["Blueberries", 80],
      ["Strawberries", 80],
      ["Granola", 60],
      ["Honey", 12]
    ],
    "Oatmeal Banana Peanut Bowl": [
      ["Oats", 80],
      ["Banana", 120],
      ["Peanut butter", 20],
      ["Honey", 8]
    ],
    "Turkey Spinach Wrap": [
      ["Turkey", 140],
      ["Spinach", 50],
      ["Tortilla (whole wheat)", 90],
      ["Mustard", 10],
      ["Tomato", 60]
    ],
    "Beef Quinoa Power Bowl": [
      ["Lean beef", 160],
      ["Quinoa (cooked)", 220],
      ["Kale", 70],
      ["Salsa", 30],
      ["Olive oil", 10]
    ],
    "Lentil Tomato Soup": [
      ["Lentils (cooked)", 300],
      ["Tomato", 240],
      ["Onion", 90],
      ["Garlic", 10],
      ["Olive oil", 10]
    ],
    "Pasta Pesto Chicken": [
      ["Whole wheat pasta (cooked)", 300],
      ["Chicken breast", 160],
      ["Pesto", 35],
      ["Tomato", 120],
      ["Olive oil", 8]
    ],
    "Veggie Omelet": [
      ["Egg", 180],
      ["Spinach", 50],
      ["Mushrooms", 80],
      ["Onion", 40],
      ["Butter", 10]
    ],
    "Chickpea Cucumber Salad": [
      ["Chickpeas (cooked)", 240],
      ["Cucumber", 180],
      ["Tomato", 120],
      ["Onion", 40],
      ["Vinaigrette", 25]
    ],
    "Shrimp Rice Veggie Plate": [
      ["Shrimp", 170],
      ["Brown rice (cooked)", 220],
      ["Green beans", 120],
      ["Carrot", 70],
      ["Olive oil", 10]
    ]
  };

  for (const [recipeName, parts] of Object.entries(recipeCompositions)) {
    const recipeId = recipeIdByName.get(recipeName);
    for (const [ingredientName, grams] of parts) {
      insertRecipeItemStmt.run([recipeId, ingredientId(ingredientName), grams]);
    }
  }

  // meal logs (last 21 days)
  const insertLogStmt = db.prepare("INSERT INTO meal_logs (eaten_at, recipe_id, servings_eaten) VALUES (?, ?, ?)");
  const recipeNames = Array.from(recipeIdByName.keys());
  const now = new Date();
  for (let i = 0; i < 30; i++) {
    const daysAgo = Math.floor(rand() * 21);
    const hour = Math.floor(rand() * 12) + 8; // 08-19
    const minute = Math.floor(rand() * 60);
    const dt = new Date(now);
    dt.setDate(now.getDate() - daysAgo);
    dt.setHours(hour, minute, 0, 0);
    const eaten_at = toIsoLocal(dt);

    const recipeName = pick(rand, recipeNames);
    const recipeId = recipeIdByName.get(recipeName);
    const servings_eaten = randFloat(rand, 1, 2, 1);
    insertLogStmt.run([eaten_at, recipeId, servings_eaten]);
  }

  insertItemStmt.free();
  insertItemNutrStmt.free();
  insertRecipeStmt.free();
  insertRecipeItemStmt.free();
  insertLogStmt.free();

  db.run("COMMIT;");

  const outPath = path.resolve(__dirname, "aidb.sqlite");
  const data = db.export();
  await fs.writeFile(outPath, Buffer.from(data));

  const itemsCount = db.exec("SELECT COUNT(*) AS c FROM items")[0].values[0][0];
  const recipesCount = db.exec("SELECT COUNT(*) AS c FROM recipes")[0].values[0][0];
  const logsCount = db.exec("SELECT COUNT(*) AS c FROM meal_logs")[0].values[0][0];
  console.log(`Seeded db/aidb.sqlite`);
  console.log(`items=${itemsCount} recipes=${recipesCount} meal_logs=${logsCount}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});

