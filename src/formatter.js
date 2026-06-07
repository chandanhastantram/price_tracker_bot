/**
 * Message formatter for Telegram
 * Telegram supports *bold*, _italic_, and `code` in MarkdownV2
 * We use simple Markdown (parse_mode: 'Markdown') for easy reading
 */

function formatPrice(price) {
  if (price == null) return '—';
  return '₹' + Number(price).toLocaleString('en-IN', { maximumFractionDigits: 2 });
}

function formatDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${String(d.getDate()).padStart(2,'0')}-${months[d.getMonth()]}-${String(d.getFullYear()).slice(2)}`;
}

function formatDateTime(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${String(d.getDate()).padStart(2,'0')}-${months[d.getMonth()]}-${d.getFullYear()} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}

function priceArrow(current, last) {
  if (last == null) return '';
  const diff = current - last;
  if (diff === 0) return '➡️ Same price as last time';
  if (diff < 0) return `⬇️ ${formatPrice(Math.abs(diff))} cheaper than last`;
  return `⬆️ ${formatPrice(diff)} more expensive than last`;
}

function formatPurchaseConfirmation(purchase) {
  let msg = `📦 *Purchase Recorded!*\n\n`;
  msg += `*Product:* ${purchase.product}\n`;
  msg += `*Vendor:* ${purchase.vendor}\n`;
  msg += `*Price:* ${formatPrice(purchase.price)}`;

  if (purchase.quantity && purchase.quantity !== 1) {
    msg += ` × ${purchase.quantity} ${purchase.unit || ''}`;
    msg += `\n*Total:* ${formatPrice(purchase.price * purchase.quantity)}`;
  } else if (purchase.unit && purchase.unit !== 'piece') {
    msg += `/${purchase.unit}`;
  }

  msg += `\n*Date:* ${formatDateTime(new Date().toISOString())}`;

  if (purchase.lastPurchase) {
    msg += `\n\n${priceArrow(purchase.price, purchase.lastPurchase.price)}`;
    msg += `\n_Last: ${formatPrice(purchase.lastPurchase.price)} from ${purchase.lastPurchase.vendor_name} on ${formatDate(purchase.lastPurchase.purchased_at)}_`;
  }

  return msg;
}

function formatPriceHistory(productName, history) {
  if (history.length === 0) return `📊 No purchase history for *${productName}*.`;

  let msg = `📊 *Price History — ${productName}*\n\n`;
  history.forEach((h, i) => {
    msg += `${i === 0 ? '🔵' : '⚪'} *${formatPrice(h.price)}*`;
    if (h.quantity && h.quantity !== 1) msg += ` × ${h.quantity} ${h.unit || ''}`;
    else if (h.unit && h.unit !== 'piece') msg += `/${h.unit}`;
    msg += `\n   📍 ${h.vendor_name}  📅 ${formatDate(h.purchased_at)}`;
    if (h.notes) msg += `\n   📝 ${h.notes}`;
    msg += '\n\n';
  });

  const prices = history.map(h => h.price);
  msg += `━━━━━━━━━━━━━━━\n`;
  msg += `📉 *Lowest:* ${formatPrice(Math.min(...prices))}\n`;
  msg += `📈 *Highest:* ${formatPrice(Math.max(...prices))}\n`;
  msg += `📊 *Average:* ${formatPrice(prices.reduce((a,b)=>a+b,0)/prices.length)}\n`;
  msg += `🔢 *Records:* ${history.length}`;
  return msg;
}

function formatProductList(products, categoryFilter) {
  if (products.length === 0) {
    const extra = categoryFilter ? ` in "${categoryFilter}"` : '';
    return `📋 No products found${extra}.\n\nAdd one: /add_product cement`;
  }
  const title = categoryFilter ? `Products in "${categoryFilter}"` : 'All Products';
  let msg = `📋 *${title}* (${products.length})\n\n`;
  let currentCat = null;
  products.forEach(p => {
    const cat = p.category_name || 'Uncategorized';
    if (cat !== currentCat) { currentCat = cat; msg += `📁 *${cat}*\n`; }
    msg += `  • ${p.name}`;
    if (p.unit && p.unit !== 'piece') msg += ` (${p.unit})`;
    if (p.last_price) { msg += ` — ${formatPrice(p.last_price)}`; if (p.last_vendor) msg += ` @ ${p.last_vendor}`; }
    msg += '\n';
  });
  return msg;
}

function formatCategoryList(categories) {
  if (categories.length === 0) return `📁 No categories yet.\n\nAdd one: /add_category Construction`;
  let msg = `📁 *Categories* (${categories.length})\n\n`;
  categories.forEach(c => { msg += `• *${c.name}* — ${c.product_count} product${c.product_count !== 1 ? 's' : ''}\n`; });
  return msg;
}

function formatVendorList(vendors) {
  if (vendors.length === 0) return `🏪 No vendors yet. They're created automatically when you record a purchase.`;
  let msg = `🏪 *Vendors* (${vendors.length})\n\n`;
  vendors.forEach(v => {
    msg += `• *${v.name}*`;
    if (v.purchase_count) msg += ` — ${v.purchase_count} purchase${v.purchase_count !== 1 ? 's' : ''}`;
    if (v.last_purchase_date) msg += ` (last: ${formatDate(v.last_purchase_date)})`;
    msg += '\n';
  });
  return msg;
}

function formatVendorPurchases(vendor, purchases) {
  if (purchases.length === 0) return `🏪 No purchases from *${vendor.name}*.`;
  let msg = `🏪 *Purchases from ${vendor.name}*\n\n`;
  purchases.forEach(p => {
    msg += `• ${p.product_name} — ${formatPrice(p.price)}`;
    if (p.quantity && p.quantity !== 1) msg += ` × ${p.quantity}`;
    msg += ` _(${formatDate(p.purchased_at)})_\n`;
  });
  return msg;
}

function formatCheapestVendor(productName, vendors) {
  if (!vendors || vendors.length === 0) return `📊 No purchase records for *${productName}*.`;
  let msg = `🏆 *Best Prices — ${productName}*\n\n`;
  vendors.forEach((v, i) => {
    const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : '  •';
    msg += `${medal} *${v.vendor_name}*\n`;
    msg += `   Best: ${formatPrice(v.min_price)}`;
    if (v.max_price !== v.min_price) msg += ` | Highest: ${formatPrice(v.max_price)}`;
    msg += `\n   Bought ${v.times_bought}x (last: ${formatDate(v.last_bought)})\n\n`;
  });
  return msg;
}

function formatSearchResults(query, results) {
  if (results.length === 0) return `🔍 No products found matching "${query}".`;
  let msg = `🔍 *Search: "${query}"* (${results.length})\n\n`;
  results.forEach(p => {
    msg += `• *${p.name}*`;
    if (p.category_name) msg += ` [${p.category_name}]`;
    if (p.last_price) msg += `\n  Last: ${formatPrice(p.last_price)} @ ${p.last_vendor || 'unknown'}`;
    msg += '\n';
  });
  return msg;
}

function formatStats(stats) {
  let msg = `📈 *My Dashboard*\n\n`;
  msg += `📦 Products: ${stats.totalProducts}\n`;
  msg += `📁 Categories: ${stats.totalCategories}\n`;
  msg += `🏪 Vendors: ${stats.totalVendors}\n`;
  msg += `🧾 Purchases: ${stats.totalPurchases}\n`;
  msg += `💰 Total Spent: ${formatPrice(stats.totalSpent)}\n`;
  if (stats.recentPurchases.length > 0) {
    msg += `\n*Recent:*\n`;
    stats.recentPurchases.forEach(p => {
      msg += `• ${p.product_name} — ${formatPrice(p.price)} @ ${p.vendor_name} _(${formatDate(p.purchased_at)})_\n`;
    });
  }
  return msg;
}

function formatHelp() {
  return `🤖 *Price Tracker Bot*
━━━━━━━━━━━━━━━━━━━

📦 *ADD PURCHASE (Shorthand)*
\`jeera, Raj, 380\`
\`50 kg pepper, SK Traders, 520\`

📦 *ADD PURCHASE (Full)*
\`bought jeera from Raj at 380\`

📊 *CHECK PRICES*
\`price jeera\` — full history
\`last pepper\` — last purchase
\`compare jeera\` — best vendor

🔍 *OTHER*
\`search je\` — search products
\`vendor Raj\` — vendor history

━━━━━━━━━━━━━━━━━━━
💡 _Use the buttons below for quick access!_
💡 _Products & vendors are auto-created when you record a purchase!_`;
}

module.exports = {
  formatPrice, formatDate, formatDateTime,
  formatPurchaseConfirmation, formatPriceHistory,
  formatProductList, formatCategoryList,
  formatVendorList, formatVendorPurchases,
  formatCheapestVendor, formatSearchResults,
  formatStats, formatHelp
};
