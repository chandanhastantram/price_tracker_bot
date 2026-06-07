/**
 * Telegram Price Tracker Bot — Main Entry Point
 * Uses Telegraf framework with the official Telegram Bot API
 *
 * Features:
 *   - Persistent reply keyboard (buttons at bottom) for all actions
 *   - Comma-shorthand purchase: "jeera, Raj, 380"
 *   - Natural language still works: "bought jeera from Raj at 380"
 *   - Per-user data isolation via Telegram user ID
 */

require('dotenv').config();

const { Telegraf, Markup } = require('telegraf');
const { initDatabase } = require('./database');
const db = require('./database');
const fmt = require('./formatter');

const BOT_TOKEN = process.env.BOT_TOKEN;

if (!BOT_TOKEN) {
  console.error('❌ BOT_TOKEN is missing! Copy .env.example to .env and add your token from @BotFather.');
  process.exit(1);
}

const bot = new Telegraf(BOT_TOKEN);

// ─── Persistent keyboard shown at bottom of every chat ──
const MAIN_KEYBOARD = Markup.keyboard([
  ['📊 Stats', '📋 Products'],
  ['📁 Categories', '🏪 Vendors'],
  ['❓ Help'],
]).resize().persistent();

// ─── Helper: send reply with Markdown + keyboard ────────
async function reply(ctx, text, extra = {}) {
  try {
    await ctx.reply(text, { parse_mode: 'Markdown', ...MAIN_KEYBOARD, ...extra });
  } catch {
    await ctx.reply(text, { ...MAIN_KEYBOARD, ...extra });
  }
}

// ─── Get user ID ────────────────────────────────────────
function userId(ctx) {
  return String(ctx.from.id);
}

// ─── /start ─────────────────────────────────────────────
bot.start(async (ctx) => {
  await reply(ctx,
    `👋 Welcome, *${ctx.from.first_name}*!\n\n` +
    `I track product prices for you.\n\n` +
    `*Quick Start — just type:*\n` +
    `\`jeera, Raj, 380\`\n` +
    `\`50 kg pepper, SK Traders, 520\`\n\n` +
    `Format: \`product, vendor, price\`\n\n` +
    `Use the buttons below to view your data! 👇`
  );
});

// ─── /help ──────────────────────────────────────────────
bot.help(async (ctx) => {
  await reply(ctx, fmt.formatHelp());
});

// ─── Button: ❓ Help ─────────────────────────────────────
bot.hears('❓ Help', async (ctx) => {
  await reply(ctx, fmt.formatHelp());
});

// ─── Button: 📊 Stats ───────────────────────────────────
bot.hears('📊 Stats', async (ctx) => {
  await reply(ctx, fmt.formatStats(db.getStats(userId(ctx))));
});
bot.command('stats', async (ctx) => {
  await reply(ctx, fmt.formatStats(db.getStats(userId(ctx))));
});

// ─── Button: 📋 Products ────────────────────────────────
bot.hears('📋 Products', async (ctx) => {
  await reply(ctx, fmt.formatProductList(db.listProducts(null, userId(ctx)), null));
});
bot.command('list_products', async (ctx) => {
  const cat = ctx.message.text.replace(/^\/list_products\s*/i, '').trim() || null;
  await reply(ctx, fmt.formatProductList(db.listProducts(cat, userId(ctx)), cat));
});

// ─── Button: 📁 Categories ──────────────────────────────
bot.hears('📁 Categories', async (ctx) => {
  await reply(
    ctx,
    fmt.formatCategoryList(db.listCategories(userId(ctx))) +
    '\n\n_To add: type_ `add category Spices`\n_To delete: type_ `del category Spices`'
  );
});
bot.command('list_categories', async (ctx) => {
  await reply(ctx, fmt.formatCategoryList(db.listCategories(userId(ctx))));
});
bot.command('add_category', async (ctx) => {
  const name = ctx.message.text.replace(/^\/add_category\s*/i, '').trim();
  if (!name) return reply(ctx, '⚠️ Type the category name after the command.\nExample: `/add_category Spices`');
  const result = db.addCategory(name, userId(ctx));
  if (!result.success) return reply(ctx, `⚠️ ${result.message}`);
  await reply(ctx, `✅ Category *"${result.name}"* created!`);
});
bot.command('del_category', async (ctx) => {
  const name = ctx.message.text.replace(/^\/del_category\s*/i, '').trim();
  if (!name) return reply(ctx, '⚠️ Type the category name after the command.\nExample: `/del_category Spices`');
  const result = db.deleteCategory(name, userId(ctx));
  if (!result.success) return reply(ctx, `⚠️ ${result.message}`);
  await reply(ctx, `🗑️ Category *"${result.name}"* deleted.`);
});

// ─── Button: 🏪 Vendors ─────────────────────────────────
bot.hears('🏪 Vendors', async (ctx) => {
  await reply(
    ctx,
    fmt.formatVendorList(db.listVendors(userId(ctx))) +
    '\n\n_To view a vendor\'s purchases: type_ `vendor Raj`'
  );
});
bot.command('list_vendors', async (ctx) => {
  await reply(ctx, fmt.formatVendorList(db.listVendors(userId(ctx))));
});

// ─── /del_product ───────────────────────────────────────
bot.command('del_product', async (ctx) => {
  const name = ctx.message.text.replace(/^\/del_product\s*/i, '').trim();
  if (!name) return reply(ctx, '⚠️ Type the product name.\nExample: `/del_product jeera`');
  const result = db.deleteProduct(name, userId(ctx));
  if (!result.success) return reply(ctx, `⚠️ ${result.message}`);
  await reply(ctx, `🗑️ Product *"${result.name}"* and all its records deleted.`);
});

// ─── FREE TEXT handler ──────────────────────────────────
// Handles: comma-shorthand, natural language, price checks, etc.
bot.on('text', async (ctx) => {
  const text = ctx.message.text.trim();
  const lower = text.toLowerCase();
  const uid = userId(ctx);

  try {

    // ── COMMA SHORTHAND: "jeera, Raj, 380" or "50 kg jeera, Raj, 380" ──
    // Format: [qty unit] product, vendor, price [notes]
    const commaMatch = text.match(
      /^(?:(\d+(?:\.\d+)?)\s+(\w+)\s+)?([^,]+),\s*([^,]+),\s*(\d+(?:\.\d+)?)\s*(.*)$/
    );
    if (commaMatch && !lower.startsWith('add ') && !lower.startsWith('del ') &&
        !lower.startsWith('search ') && !lower.startsWith('find ') &&
        !lower.startsWith('vendor ') && !lower.startsWith('compare ') &&
        !lower.startsWith('price ') && !lower.startsWith('last ') &&
        !lower.startsWith('set ') && !lower.startsWith('update ') &&
        !lower.startsWith('bought ') && !lower.startsWith('purchased ')) {
      const quantity = commaMatch[1] ? parseFloat(commaMatch[1]) : 1;
      const unit = commaMatch[2] || null;
      const productName = commaMatch[3].trim();
      const vendorName = commaMatch[4].trim();
      const price = parseFloat(commaMatch[5]);
      const notes = commaMatch[6]?.trim() || null;
      if (!isNaN(price) && price > 0 && productName && vendorName) {
        const result = db.recordPurchase(productName, vendorName, price, quantity, unit, notes, uid);
        return reply(ctx, fmt.formatPurchaseConfirmation(result));
      }
    }

    // ── ADD CATEGORY ───────────────────────────────────
    const addCatMatch = text.match(/^add\s+cat(?:egory)?\s+(.+)$/i);
    if (addCatMatch) {
      const result = db.addCategory(addCatMatch[1].trim(), uid);
      if (!result.success) return reply(ctx, `⚠️ ${result.message}`);
      return reply(ctx, `✅ Category *"${result.name}"* created!`);
    }

    // ── DELETE CATEGORY ────────────────────────────────
    const delCatMatch = text.match(/^del(?:ete)?\s+cat(?:egory)?\s+(.+)$/i);
    if (delCatMatch) {
      const result = db.deleteCategory(delCatMatch[1].trim(), uid);
      if (!result.success) return reply(ctx, `⚠️ ${result.message}`);
      return reply(ctx, `🗑️ Category *"${result.name}"* deleted.`);
    }

    // ── NATURAL LANGUAGE PURCHASE ──────────────────────
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
      if (isNaN(price) || price <= 0) return reply(ctx, '⚠️ Invalid price.\nExample: `jeera, Raj, 380`');
      const result = db.recordPurchase(productName, vendorName, price, quantity, unit, notes, uid);
      return reply(ctx, fmt.formatPurchaseConfirmation(result));
    }

    // ── LAST PRICE ─────────────────────────────────────
    const lastMatch = text.match(/^last\s+(.+)$/i);
    if (lastMatch) {
      const last = db.getLastPrice(lastMatch[1].trim(), uid);
      if (!last) return reply(ctx, `⚠️ No records for *"${lastMatch[1].trim()}"*.`);
      return reply(ctx, `🔵 *Last Purchase — ${last.product_name}*\n\n💰 ${fmt.formatPrice(last.price)}/${last.unit || 'piece'}\n🏪 ${last.vendor_name}\n📅 ${fmt.formatDate(last.purchased_at)}`);
    }

    // ── COMPARE / CHEAPEST ─────────────────────────────
    const compareMatch = text.match(/^(?:compare|cheapest|best\s+price)\s+(.+)$/i);
    if (compareMatch) {
      const result = db.getCheapestVendor(compareMatch[1].trim(), uid);
      if (!result) return reply(ctx, `⚠️ Product not found.`);
      return reply(ctx, fmt.formatCheapestVendor(result.product, result.vendors));
    }

    // ── VENDOR PURCHASES ───────────────────────────────
    const vendorMatch = text.match(/^vendor\s+(.+)$/i);
    if (vendorMatch) {
      const { vendor, purchases } = db.getVendorPurchases(vendorMatch[1].trim(), uid);
      if (!vendor) return reply(ctx, `⚠️ Vendor *"${vendorMatch[1]}"* not found.`);
      return reply(ctx, fmt.formatVendorPurchases(vendor, purchases));
    }

    // ── SEARCH ─────────────────────────────────────────
    const searchMatch = text.match(/^(?:search|find)\s+(.+)$/i);
    if (searchMatch) {
      return reply(ctx, fmt.formatSearchResults(searchMatch[1], db.searchProducts(searchMatch[1], uid)));
    }

    // ── UPDATE UNIT ────────────────────────────────────
    const unitMatch = text.match(/^(?:set|update)\s+unit\s+(?:of\s+)?(.+?)\s+(?:to|as)\s+(.+)$/i);
    if (unitMatch) {
      const result = db.updateProductUnit(unitMatch[1], unitMatch[2], uid);
      if (!result.success) return reply(ctx, `⚠️ ${result.message}`);
      return reply(ctx, `✅ Unit for *"${result.name}"* updated to *${result.unit}*.`);
    }

    // ── DELETE PRODUCT ─────────────────────────────────
    const delProdMatch = text.match(/^del(?:ete)?\s+(?:product\s+)?(.+)$/i);
    if (delProdMatch && !/^(cat|purchase)/i.test(delProdMatch[1])) {
      const result = db.deleteProduct(delProdMatch[1].trim(), uid);
      if (!result.success) return reply(ctx, `⚠️ ${result.message}`);
      return reply(ctx, `🗑️ Product *"${result.name}"* deleted.`);
    }

    // ── PRICE HISTORY (prefix: "price jeera") ─────────
    const priceExMatch = text.match(/^price(?:\s+of)?\s+(.+)$/i);
    if (priceExMatch) {
      const { product, history } = db.getPriceHistory(priceExMatch[1].trim(), uid);
      if (!product) return reply(ctx, `⚠️ Product *"${priceExMatch[1].trim()}"* not found.\n\nRecord a purchase first:\n\`${priceExMatch[1].trim()}, YourVendor, 100\``);
      return reply(ctx, fmt.formatPriceHistory(product.name, history));
    }

    // ── PRICE HISTORY (suffix: "jeera price?") ────────
    const priceSufMatch = text.match(/^(.+?)\s+price\??\s*$/i);
    if (priceSufMatch) {
      const pn = priceSufMatch[1].trim();
      if (!/^(help|hi|hello|stats|list|add|del|bought|search|vendor|compare|last|set|update|find)$/i.test(pn)) {
        const { product, history } = db.getPriceHistory(pn, uid);
        if (product) return reply(ctx, fmt.formatPriceHistory(product.name, history));
      }
    }

    // ── GREETING ───────────────────────────────────────
    if (/^(hi|hello|hey|start|\?)$/i.test(lower)) {
      return reply(ctx, fmt.formatHelp());
    }

    // ── FALLBACK ───────────────────────────────────────
    await reply(ctx,
      `🤔 I didn't understand that.\n\n` +
      `*To record a purchase, type:*\n` +
      `\`jeera, Raj, 380\`\n` +
      `\`50 kg pepper, SK Traders, 520\`\n\n` +
      `Use the buttons below for other options 👇`
    );

  } catch (error) {
    console.error('❌ Error:', error.message);
    await reply(ctx, '⚠️ Something went wrong. Please try again.');
  }
});

// ─── Error Handler ──────────────────────────────────────
bot.catch((err, ctx) => {
  console.error('❌ Bot error:', err.message);
});

// ─── Start ──────────────────────────────────────────────
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
