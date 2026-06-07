/**
 * Telegram Price Tracker Bot — Main Entry Point
 * Uses Telegraf framework with the official Telegram Bot API
 *
 * Setup:
 *   1. Message @BotFather on Telegram → /newbot → copy token
 *   2. cp .env.example .env → paste token
 *   3. npm start
 *   Done! No QR codes, no sessions, works 24/7.
 */

require('dotenv').config();

const { Telegraf } = require('telegraf');
const { initDatabase } = require('./database');
const db = require('./database');
const fmt = require('./formatter');

const BOT_TOKEN = process.env.BOT_TOKEN;

if (!BOT_TOKEN) {
  console.error('❌ BOT_TOKEN is missing! Copy .env.example to .env and add your token from @BotFather.');
  process.exit(1);
}

const bot = new Telegraf(BOT_TOKEN);

// ─── Helper: send reply with Markdown ─────────────────
async function reply(ctx, text) {
  try {
    await ctx.reply(text, { parse_mode: 'Markdown' });
  } catch {
    // Fallback without markdown if formatting fails
    await ctx.reply(text);
  }
}

// ─── Get user ID (unique per Telegram user) ────────────
function userId(ctx) {
  return String(ctx.from.id);
}

// ─── /start and /help ─────────────────────────────────
bot.start(async (ctx) => {
  await reply(ctx, `👋 Welcome, *${ctx.from.first_name}*!\n\n` + fmt.formatHelp());
});

bot.help(async (ctx) => {
  await reply(ctx, fmt.formatHelp());
});

// ─── /stats ───────────────────────────────────────────
bot.command('stats', async (ctx) => {
  await reply(ctx, fmt.formatStats(db.getStats(userId(ctx))));
});

// ─── CATEGORIES ───────────────────────────────────────
bot.command('add_category', async (ctx) => {
  const name = ctx.message.text.replace(/^\/add_category\s*/i, '').trim();
  if (!name) return reply(ctx, '⚠️ Usage: /add\\_category *Construction*');
  const result = db.addCategory(name, userId(ctx));
  if (!result.success) return reply(ctx, `⚠️ ${result.message}`);
  await reply(ctx, `✅ Category *"${result.name}"* created!`);
});

bot.command('list_categories', async (ctx) => {
  await reply(ctx, fmt.formatCategoryList(db.listCategories(userId(ctx))));
});

bot.command('del_category', async (ctx) => {
  const name = ctx.message.text.replace(/^\/del_category\s*/i, '').trim();
  if (!name) return reply(ctx, '⚠️ Usage: /del\\_category *Construction*');
  const result = db.deleteCategory(name, userId(ctx));
  if (!result.success) return reply(ctx, `⚠️ ${result.message}`);
  await reply(ctx, `🗑️ Category *"${result.name}"* deleted.`);
});

// ─── PRODUCTS ─────────────────────────────────────────
bot.command('list_products', async (ctx) => {
  const cat = ctx.message.text.replace(/^\/list_products\s*/i, '').trim() || null;
  await reply(ctx, fmt.formatProductList(db.listProducts(cat, userId(ctx)), cat));
});

bot.command('add_product', async (ctx) => {
  const args = ctx.message.text.replace(/^\/add_product\s*/i, '').trim();
  if (!args) return reply(ctx, '⚠️ Usage: /add\\_product cement\nor: `add product cement in Construction unit bag`');
  const result = db.addProduct(args, null, null, userId(ctx));
  if (!result.success) return reply(ctx, `⚠️ ${result.message}`);
  let msg = `✅ Product *"${result.name}"* added!`;
  if (result.unit !== 'piece') msg += `\n📏 Unit: ${result.unit}`;
  msg += `\n\nRecord a purchase:\n\`bought ${result.name} from <vendor> at <price>\``;
  await reply(ctx, msg);
});

bot.command('del_product', async (ctx) => {
  const name = ctx.message.text.replace(/^\/del_product\s*/i, '').trim();
  if (!name) return reply(ctx, '⚠️ Usage: /del\\_product cement');
  const result = db.deleteProduct(name, userId(ctx));
  if (!result.success) return reply(ctx, `⚠️ ${result.message}`);
  await reply(ctx, `🗑️ Product *"${result.name}"* and all its records deleted.`);
});

// ─── VENDORS ──────────────────────────────────────────
bot.command('list_vendors', async (ctx) => {
  await reply(ctx, fmt.formatVendorList(db.listVendors(userId(ctx))));
});

// ─── FREE TEXT COMMANDS ───────────────────────────────
// All natural language commands (bought, price, compare, etc.)
bot.on('text', async (ctx) => {
  const text = ctx.message.text.trim();
  const lower = text.toLowerCase();
  const uid = userId(ctx);

  try {
    // ── ADD CATEGORY ──────────────────────────
    const addCatMatch = text.match(/^add\s+cat(?:egory)?\s+(.+)$/i);
    if (addCatMatch) {
      const result = db.addCategory(addCatMatch[1].trim(), uid);
      if (!result.success) return reply(ctx, `⚠️ ${result.message}`);
      return reply(ctx, `✅ Category *"${result.name}"* created!`);
    }

    // ── ADD PRODUCT (natural language) ────────
    const addProdMatch = text.match(/^add\s+(?:product\s+)?(.+?)(?:\s+in\s+(.+?))?(?:\s+unit\s+(.+?))?$/i);
    if (addProdMatch && !/^(cat|vendor|category)/i.test(addProdMatch[1])) {
      const name = addProdMatch[1].trim();
      const category = addProdMatch[2]?.trim() || null;
      const unit = addProdMatch[3]?.trim() || null;
      const result = db.addProduct(name, category, unit, uid);
      if (!result.success) return reply(ctx, `⚠️ ${result.message}`);
      let msg = `✅ Product *"${result.name}"* added!`;
      if (result.category) msg += `\n📁 Category: ${result.category}`;
      if (result.unit !== 'piece') msg += `\n📏 Unit: ${result.unit}`;
      msg += `\n\nRecord a purchase:\n\`bought ${result.name} from <vendor> at <price>\``;
      return reply(ctx, msg);
    }

    // ── RECORD PURCHASE ───────────────────────
    const purchaseMatch = text.match(
      /^(?:bought|purchased|buy)\s+(?:(\d+(?:\.\d+)?)\s*(\w+)\s+)?(.+?)\s+from\s+(.+?)\s+(?:at|@|for)\s+(\d+(?:\.\d+)?)\s*(.*)$/i
    );
    if (purchaseMatch) {
      const quantity = purchaseMatch[1] ? parseFloat(purchaseMatch[1]) : 1;
      const unit = purchaseMatch[2] || null;
      const productName = purchaseMatch[3].trim();
      const vendorName = purchaseMatch[4].trim();
      const price = parseFloat(purchaseMatch[5]);
      const notes = purchaseMatch[6]?.trim() || null;
      if (isNaN(price) || price <= 0) return reply(ctx, '⚠️ Invalid price.\nExample: `bought cement from Raj at 380`');
      const result = db.recordPurchase(productName, vendorName, price, quantity, unit, notes, uid);
      return reply(ctx, fmt.formatPurchaseConfirmation(result));
    }

    // ── LAST PRICE ────────────────────────────
    const lastMatch = text.match(/^last\s+(.+)$/i);
    if (lastMatch) {
      const last = db.getLastPrice(lastMatch[1].trim(), uid);
      if (!last) return reply(ctx, `⚠️ No records for *"${lastMatch[1].trim()}"*.`);
      return reply(ctx, `🔵 *Last Purchase — ${last.product_name}*\n\n💰 ${fmt.formatPrice(last.price)}/${last.unit || 'piece'}\n🏪 ${last.vendor_name}\n📅 ${fmt.formatDate(last.purchased_at)}`);
    }

    // ── COMPARE / CHEAPEST ────────────────────
    const compareMatch = text.match(/^(?:compare|cheapest|best\s+price)\s+(.+)$/i);
    if (compareMatch) {
      const result = db.getCheapestVendor(compareMatch[1].trim(), uid);
      if (!result) return reply(ctx, `⚠️ Product not found.`);
      return reply(ctx, fmt.formatCheapestVendor(result.product, result.vendors));
    }

    // ── VENDOR PURCHASES ──────────────────────
    const vendorMatch = text.match(/^vendor\s+(.+)$/i);
    if (vendorMatch) {
      const { vendor, purchases } = db.getVendorPurchases(vendorMatch[1].trim(), uid);
      if (!vendor) return reply(ctx, `⚠️ Vendor *"${vendorMatch[1]}"* not found.`);
      return reply(ctx, fmt.formatVendorPurchases(vendor, purchases));
    }

    // ── SEARCH ────────────────────────────────
    const searchMatch = text.match(/^(?:search|find)\s+(.+)$/i);
    if (searchMatch) {
      return reply(ctx, fmt.formatSearchResults(searchMatch[1], db.searchProducts(searchMatch[1], uid)));
    }

    // ── UPDATE UNIT ───────────────────────────
    const unitMatch = text.match(/^(?:set|update)\s+unit\s+(?:of\s+)?(.+?)\s+(?:to|as)\s+(.+)$/i);
    if (unitMatch) {
      const result = db.updateProductUnit(unitMatch[1], unitMatch[2], uid);
      if (!result.success) return reply(ctx, `⚠️ ${result.message}`);
      return reply(ctx, `✅ Unit for *"${result.name}"* updated to *${result.unit}*.`);
    }

    // ── DELETE PRODUCT ────────────────────────
    const delProdMatch = text.match(/^del(?:ete)?\s+(?:product\s+)?(.+)$/i);
    if (delProdMatch && !/^(cat|purchase)/i.test(delProdMatch[1])) {
      const result = db.deleteProduct(delProdMatch[1].trim(), uid);
      if (!result.success) return reply(ctx, `⚠️ ${result.message}`);
      return reply(ctx, `🗑️ Product *"${result.name}"* deleted.`);
    }

    // ── PRICE HISTORY (explicit) ──────────────
    const priceExMatch = text.match(/^price(?:\s+of)?\s+(.+)$/i);
    if (priceExMatch) {
      const { product, history } = db.getPriceHistory(priceExMatch[1].trim(), uid);
      if (!product) return reply(ctx, `⚠️ Product *"${priceExMatch[1].trim()}"* not found.\n\nAdd it: \`add product ${priceExMatch[1].trim()}\``);
      return reply(ctx, fmt.formatPriceHistory(product.name, history));
    }

    // ── PRICE HISTORY (suffix: "cement price?") ──
    const priceSufMatch = text.match(/^(.+?)\s+price\??\s*$/i);
    if (priceSufMatch) {
      const pn = priceSufMatch[1].trim();
      if (!/^(help|hi|hello|stats|list|add|del|bought|search|vendor|compare|last|set|update|find)$/i.test(pn)) {
        const { product, history } = db.getPriceHistory(pn, uid);
        if (!product) return reply(ctx, `⚠️ Product *"${pn}"* not found.\n\nAdd it: \`add product ${pn}\``);
        return reply(ctx, fmt.formatPriceHistory(product.name, history));
      }
    }

    // ── GREETING ─────────────────────────────
    if (/^(hi|hello|hey|start|\?)$/i.test(lower)) {
      return reply(ctx, fmt.formatHelp());
    }

    // ── FALLBACK ─────────────────────────────
    await reply(ctx, `🤔 I didn't understand that.\n\nTry:\n• \`bought cement from Raj at 380\`\n• \`price cement\`\n• /help`);

  } catch (error) {
    console.error('❌ Error:', error.message);
    await reply(ctx, '⚠️ Something went wrong. Please try again.');
  }
});

// ─── Error Handler ─────────────────────────────────────
bot.catch((err, ctx) => {
  console.error('❌ Bot error:', err.message);
});

// ─── Start ─────────────────────────────────────────────
async function start() {
  console.log(`
╔═══════════════════════════════════════════════╗
║  🤖 Telegram Price Tracker Bot                ║
║  📦 Starting up...                            ║
╚═══════════════════════════════════════════════╝
  `);

  await initDatabase();

  // Launch bot (long polling — runs forever)
  bot.launch().catch(err => {
    console.error('❌ Bot crashed:', err.message);
    process.exit(1);
  });

  // bot.launch() never resolves — log ready state immediately
  console.log(`
╔═══════════════════════════════════════════════╗
║  ✅ Bot is running!                           ║
║  👤 @Priceeeeeeeeeeee_bot                     ║
║  💬 Open Telegram and message your bot now!   ║
╚═══════════════════════════════════════════════╝
  `);
}

// Graceful shutdown
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));

start().catch(err => {
  console.error('❌ Failed to start:', err.message);
  process.exit(1);
});
