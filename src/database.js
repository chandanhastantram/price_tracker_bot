/**
 * Database layer using sql.js (pure JavaScript SQLite)
 * Per-user data isolation via Telegram user ID
 */

const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', 'pricetracker.db');
let db = null;

function saveDb() {
  if (!db) return;
  fs.writeFileSync(DB_PATH, Buffer.from(db.export()));
}

async function initDatabase() {
  const SQL = await initSqlJs();
  if (fs.existsSync(DB_PATH)) {
    db = new SQL.Database(fs.readFileSync(DB_PATH));
    console.log('✅ Database loaded from', DB_PATH);
  } else {
    db = new SQL.Database();
    console.log('✅ Database created at', DB_PATH);
  }

  db.run('PRAGMA foreign_keys = ON;');

  db.run(`CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL COLLATE NOCASE,
    user_id TEXT NOT NULL DEFAULT 'default',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(name, user_id)
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL COLLATE NOCASE,
    category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
    unit TEXT DEFAULT 'piece',
    user_id TEXT NOT NULL DEFAULT 'default',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(name, user_id)
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS vendors (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL COLLATE NOCASE,
    contact TEXT,
    user_id TEXT NOT NULL DEFAULT 'default',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(name, user_id)
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS purchases (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    vendor_id INTEGER NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
    price REAL NOT NULL,
    quantity REAL DEFAULT 1,
    unit TEXT,
    notes TEXT,
    user_id TEXT NOT NULL DEFAULT 'default',
    purchased_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  db.run('CREATE INDEX IF NOT EXISTS idx_purchases_product ON purchases(product_id)');
  db.run('CREATE INDEX IF NOT EXISTS idx_purchases_user ON purchases(user_id)');

  saveDb();
  return db;
}

// ─── Helpers ───────────────────────────────────────────

function queryAll(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const results = [];
  while (stmt.step()) results.push(stmt.getAsObject());
  stmt.free();
  return results;
}

function queryOne(sql, params = []) {
  const r = queryAll(sql, params);
  return r.length > 0 ? r[0] : null;
}

function runSql(sql, params = []) {
  db.run(sql, params);
  const lastId = db.exec('SELECT last_insert_rowid() as id')[0]?.values[0]?.[0];
  saveDb();
  return { lastInsertRowid: lastId };
}

// ─── CATEGORIES ────────────────────────────────────────

function addCategory(name, userId) {
  const t = name.trim();
  const ex = queryOne('SELECT * FROM categories WHERE name=? COLLATE NOCASE AND user_id=?', [t, userId]);
  if (ex) return { success: false, message: `Category "${ex.name}" already exists.` };
  const r = runSql('INSERT INTO categories(name,user_id) VALUES(?,?)', [t, userId]);
  return { success: true, id: r.lastInsertRowid, name: t };
}

function listCategories(userId) {
  return queryAll(`
    SELECT c.id, c.name,
      (SELECT COUNT(*) FROM products WHERE category_id=c.id AND user_id=?) as product_count
    FROM categories c WHERE c.user_id=? ORDER BY c.name
  `, [userId, userId]);
}

function deleteCategory(name, userId) {
  const cat = queryOne('SELECT * FROM categories WHERE name=? COLLATE NOCASE AND user_id=?', [name.trim(), userId]);
  if (!cat) return { success: false, message: `Category "${name}" not found.` };
  runSql('DELETE FROM categories WHERE id=?', [cat.id]);
  return { success: true, name: cat.name };
}

// ─── PRODUCTS ──────────────────────────────────────────

function addProduct(name, categoryName, unit, userId) {
  const n = name.trim();
  const ex = queryOne('SELECT * FROM products WHERE name=? COLLATE NOCASE AND user_id=?', [n, userId]);
  if (ex) return { success: false, message: `Product "${ex.name}" already exists.` };

  let categoryId = null;
  if (categoryName) {
    const cat = queryOne('SELECT * FROM categories WHERE name=? COLLATE NOCASE AND user_id=?', [categoryName.trim(), userId]);
    if (!cat) return { success: false, message: `Category "${categoryName}" not found. Add it first:\n/add_category ${categoryName}` };
    categoryId = cat.id;
  }

  const r = runSql('INSERT INTO products(name,category_id,unit,user_id) VALUES(?,?,?,?)', [n, categoryId, unit || 'piece', userId]);
  return { success: true, id: r.lastInsertRowid, name: n, category: categoryName, unit: unit || 'piece' };
}

function listProducts(categoryName, userId) {
  const base = `
    SELECT p.id, p.name, p.unit, c.name as category_name,
      (SELECT COUNT(*) FROM purchases WHERE product_id=p.id AND user_id=?) as purchase_count,
      (SELECT price FROM purchases WHERE product_id=p.id AND user_id=? ORDER BY purchased_at DESC LIMIT 1) as last_price,
      (SELECT v.name FROM purchases pu JOIN vendors v ON pu.vendor_id=v.id WHERE pu.product_id=p.id AND pu.user_id=? ORDER BY pu.purchased_at DESC LIMIT 1) as last_vendor
    FROM products p LEFT JOIN categories c ON p.category_id=c.id
  `;
  if (categoryName) {
    return queryAll(base + ' WHERE c.name=? COLLATE NOCASE AND p.user_id=? ORDER BY p.name',
      [userId, userId, userId, categoryName.trim(), userId]);
  }
  return queryAll(base + ' WHERE p.user_id=? ORDER BY COALESCE(c.name,"zzz"), p.name',
    [userId, userId, userId, userId]);
}

function deleteProduct(name, userId) {
  const p = queryOne('SELECT * FROM products WHERE name=? COLLATE NOCASE AND user_id=?', [name.trim(), userId]);
  if (!p) return { success: false, message: `Product "${name}" not found.` };
  runSql('DELETE FROM purchases WHERE product_id=? AND user_id=?', [p.id, userId]);
  runSql('DELETE FROM products WHERE id=?', [p.id]);
  return { success: true, name: p.name };
}

function searchProducts(query, userId) {
  return queryAll(`
    SELECT p.id, p.name, p.unit, c.name as category_name,
      (SELECT price FROM purchases WHERE product_id=p.id AND user_id=? ORDER BY purchased_at DESC LIMIT 1) as last_price,
      (SELECT v.name FROM purchases pu JOIN vendors v ON pu.vendor_id=v.id WHERE pu.product_id=p.id AND pu.user_id=? ORDER BY pu.purchased_at DESC LIMIT 1) as last_vendor
    FROM products p LEFT JOIN categories c ON p.category_id=c.id
    WHERE p.name LIKE ? AND p.user_id=? ORDER BY p.name
  `, [userId, userId, `%${query.trim()}%`, userId]);
}

function updateProductUnit(name, unit, userId) {
  const p = queryOne('SELECT * FROM products WHERE name=? COLLATE NOCASE AND user_id=?', [name.trim(), userId]);
  if (!p) return { success: false, message: `Product "${name}" not found.` };
  runSql('UPDATE products SET unit=? WHERE id=?', [unit, p.id]);
  return { success: true, name: p.name, unit };
}

// ─── VENDORS ───────────────────────────────────────────

function listVendors(userId) {
  return queryAll(`
    SELECT v.id, v.name,
      (SELECT COUNT(*) FROM purchases WHERE vendor_id=v.id AND user_id=?) as purchase_count,
      (SELECT MAX(purchased_at) FROM purchases WHERE vendor_id=v.id AND user_id=?) as last_purchase_date
    FROM vendors v WHERE v.user_id=? ORDER BY v.name
  `, [userId, userId, userId]);
}

// ─── PURCHASES ─────────────────────────────────────────

function recordPurchase(productName, vendorName, price, quantity, unit, notes, userId) {
  let product = queryOne('SELECT * FROM products WHERE name=? COLLATE NOCASE AND user_id=?', [productName.trim(), userId]);
  if (!product) {
    runSql('INSERT INTO products(name,unit,user_id) VALUES(?,?,?)', [productName.trim(), unit || 'piece', userId]);
    product = queryOne('SELECT * FROM products WHERE name=? COLLATE NOCASE AND user_id=?', [productName.trim(), userId]);
  }

  let vendor = queryOne('SELECT * FROM vendors WHERE name=? COLLATE NOCASE AND user_id=?', [vendorName.trim(), userId]);
  if (!vendor) {
    runSql('INSERT INTO vendors(name,user_id) VALUES(?,?)', [vendorName.trim(), userId]);
    vendor = queryOne('SELECT * FROM vendors WHERE name=? COLLATE NOCASE AND user_id=?', [vendorName.trim(), userId]);
  }

  const lastPurchase = queryOne(`
    SELECT pu.price, pu.quantity, pu.unit, v.name as vendor_name, pu.purchased_at
    FROM purchases pu JOIN vendors v ON pu.vendor_id=v.id
    WHERE pu.product_id=? AND pu.user_id=?
    ORDER BY pu.purchased_at DESC LIMIT 1
  `, [product.id, userId]);

  const purchaseUnit = unit || product.unit || 'piece';
  runSql('INSERT INTO purchases(product_id,vendor_id,price,quantity,unit,notes,user_id) VALUES(?,?,?,?,?,?,?)',
    [product.id, vendor.id, price, quantity || 1, purchaseUnit, notes || null, userId]);

  return { success: true, product: product.name, vendor: vendor.name, price, quantity: quantity || 1, unit: purchaseUnit, lastPurchase };
}

function getLastPrice(productName, userId) {
  const p = queryOne('SELECT * FROM products WHERE name=? COLLATE NOCASE AND user_id=?', [productName.trim(), userId]);
  if (!p) return null;
  const pu = queryOne(`
    SELECT pu.price, pu.quantity, pu.unit, v.name as vendor_name, pu.purchased_at
    FROM purchases pu JOIN vendors v ON pu.vendor_id=v.id
    WHERE pu.product_id=? AND pu.user_id=?
    ORDER BY pu.purchased_at DESC LIMIT 1
  `, [p.id, userId]);
  return pu ? { ...pu, product_name: p.name } : null;
}

function getPriceHistory(productName, userId, limit) {
  const p = queryOne('SELECT * FROM products WHERE name=? COLLATE NOCASE AND user_id=?', [productName.trim(), userId]);
  if (!p) return { product: null, history: [] };
  const history = queryAll(`
    SELECT pu.price, pu.quantity, pu.unit, pu.notes, pu.purchased_at, v.name as vendor_name
    FROM purchases pu JOIN vendors v ON pu.vendor_id=v.id
    WHERE pu.product_id=? AND pu.user_id=?
    ORDER BY pu.purchased_at DESC LIMIT ?
  `, [p.id, userId, limit || 20]);
  return { product: p, history };
}

function getVendorPurchases(vendorName, userId, limit) {
  const v = queryOne('SELECT * FROM vendors WHERE name=? COLLATE NOCASE AND user_id=?', [vendorName.trim(), userId]);
  if (!v) return { vendor: null, purchases: [] };
  const purchases = queryAll(`
    SELECT p.name as product_name, pu.price, pu.quantity, pu.unit, pu.purchased_at
    FROM purchases pu JOIN products p ON pu.product_id=p.id
    WHERE pu.vendor_id=? AND pu.user_id=?
    ORDER BY pu.purchased_at DESC LIMIT ?
  `, [v.id, userId, limit || 20]);
  return { vendor: v, purchases };
}

function getCheapestVendor(productName, userId) {
  const p = queryOne('SELECT * FROM products WHERE name=? COLLATE NOCASE AND user_id=?', [productName.trim(), userId]);
  if (!p) return null;
  const vendors = queryAll(`
    SELECT v.name as vendor_name, MIN(pu.price) as min_price, MAX(pu.price) as max_price,
           COUNT(*) as times_bought, MAX(pu.purchased_at) as last_bought
    FROM purchases pu JOIN vendors v ON pu.vendor_id=v.id
    WHERE pu.product_id=? AND pu.user_id=?
    GROUP BY v.id ORDER BY min_price ASC
  `, [p.id, userId]);
  return { product: p.name, vendors };
}

function deletePurchase(id, userId) {
  const pu = queryOne('SELECT * FROM purchases WHERE id=? AND user_id=?', [id, userId]);
  if (!pu) return { success: false, message: `Purchase #${id} not found.` };
  runSql('DELETE FROM purchases WHERE id=?', [id]);
  return { success: true };
}

function getStats(userId) {
  return {
    totalProducts: queryOne('SELECT COUNT(*) as c FROM products WHERE user_id=?', [userId])?.c || 0,
    totalVendors: queryOne('SELECT COUNT(*) as c FROM vendors WHERE user_id=?', [userId])?.c || 0,
    totalPurchases: queryOne('SELECT COUNT(*) as c FROM purchases WHERE user_id=?', [userId])?.c || 0,
    totalCategories: queryOne('SELECT COUNT(*) as c FROM categories WHERE user_id=?', [userId])?.c || 0,
    totalSpent: queryOne('SELECT COALESCE(SUM(price*quantity),0) as t FROM purchases WHERE user_id=?', [userId])?.t || 0,
    recentPurchases: queryAll(`
      SELECT p.name as product_name, v.name as vendor_name, pu.price, pu.quantity, pu.unit, pu.purchased_at
      FROM purchases pu JOIN products p ON pu.product_id=p.id JOIN vendors v ON pu.vendor_id=v.id
      WHERE pu.user_id=? ORDER BY pu.purchased_at DESC LIMIT 5
    `, [userId])
  };
}

module.exports = {
  initDatabase,
  addCategory, listCategories, deleteCategory,
  addProduct, listProducts, deleteProduct, searchProducts, updateProductUnit,
  listVendors,
  recordPurchase, getLastPrice, getPriceHistory,
  getVendorPurchases, getCheapestVendor, deletePurchase,
  getStats
};
