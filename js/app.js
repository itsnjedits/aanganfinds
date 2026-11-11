/* GharSansar — storefront application (vanilla JS, no build step).
 *
 * Sections: 1 config · 2 storage · 3 helpers · 4 theme · 5 search engine · 6 catalogue rendering
 *           7 wishlist & cart · 8 WhatsApp · 9 overlays (drawer + product sheet) · 10 search UI · 11 events · 12 init
 *
 * To change the WhatsApp number edit WHATSAPP_NUMBER only (country code + number, digits only).
 */
'use strict';

/* ───────── 1. Config ───────── */
const WHATSAPP_NUMBER = '917568443870';
const STORE_NAME = 'GharSansar';
const STORAGE_KEYS = { wishlist: 'gharsansar:v2:wishlist', cart: 'gharsansar:v2:cart', theme: 'gharsansar:v2:theme', activity: 'gharsansar:v1:activity', alerts: 'gharsansar:v1:alerts', release: 'gharsansar:v1:release' };
const RELEASE_ID = 'p8-20261111';
const PLACEHOLDER = './assets/brand/product-placeholder.svg';
const MAX_QTY = 99;
const SEARCH_DEBOUNCE_MS = 80;
const ADD_GUARD_MS = 350;

const state = {
  products: [],
  byId: new Map(),
  categories: [],
  activeCategory: 'all',
  query: '',
  sort: 'featured',
  wishlist: new Set(),
  cart: {},
  drawerMode: 'cart',
  modal: { id: null, qty: 1, index: 0 },
  installPrompt: null,
  shareProductId: null,
  shareCategoryId: null,
  activity: null,
  loaded: false,
};
let toastTimer = null;
let searchTimer = null;
let searchActivityTimer = null;
let lastRenderKey = '';
let storageWarned = false;
const lastAddAt = new Map();

/* ───────── 2. Storage (all access is guarded; corrupt data never crashes the app) ───────── */
function readStorage(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback;
    const parsed = JSON.parse(raw);
    return parsed ?? fallback;
  } catch (_) { return fallback; }
}
function writeStorage(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); return true; }
  catch (_) {
    if (!storageWarned) { storageWarned = true; showToast('Your browser could not save this change on this device.'); }
    return false;
  }
}
function sanitizeWishlist(raw) {
  return Array.isArray(raw) ? [...new Set(raw.filter(id => typeof id === 'string' && id))] : [];
}
function sanitizeCart(raw) {
  const clean = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return clean;
  for (const [id, qty] of Object.entries(raw)) {
    const n = Math.floor(Number(qty));
    if (id && Number.isFinite(n) && n >= 1) clean[id] = Math.min(MAX_QTY, n);
  }
  return clean;
}
function loadSavedLists() {
  state.wishlist = new Set(sanitizeWishlist(readStorage(STORAGE_KEYS.wishlist, [])));
  state.cart = sanitizeCart(readStorage(STORAGE_KEYS.cart, {}));
}
function persistWishlist() { writeStorage(STORAGE_KEYS.wishlist, [...state.wishlist]); updateCounts(); }
function persistCart() { writeStorage(STORAGE_KEYS.cart, state.cart); updateCounts(); }
function cleanCounterMap(value) {
  const clean = {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) return clean;
  for (const [key, raw] of Object.entries(value)) {
    const n = Math.max(0, Math.min(250, Math.floor(Number(raw) || 0)));
    if (key && n) clean[key] = n;
  }
  return clean;
}
function loadActivity() {
  const raw = readStorage(STORAGE_KEYS.activity, {});
  state.activity = {
    productViews: cleanCounterMap(raw.productViews),
    wishlistAdds: cleanCounterMap(raw.wishlistAdds),
    cartAdds: cleanCounterMap(raw.cartAdds),
    categoryViews: cleanCounterMap(raw.categoryViews),
    searchQueries: Array.isArray(raw.searchQueries) ? raw.searchQueries.filter(x => typeof x === 'string').slice(-20) : [],
    visits: Math.max(0, Math.floor(Number(raw.visits) || 0)),
    lastVisitAt: Number(raw.lastVisitAt) || 0,
    lastGreetingDate: String(raw.lastGreetingDate || ''),
  };
}
function saveActivity() { if (state.activity) writeStorage(STORAGE_KEYS.activity, state.activity); }
function incrementActivity(mapName, key, amount = 1) {
  if (!state.activity || !key || !state.activity[mapName]) return;
  state.activity[mapName][key] = Math.min(250, (Number(state.activity[mapName][key]) || 0) + amount);
  saveActivity();
}
function recordProductView(id) {
  const p = getProduct(id); if (!p) return;
  incrementActivity('productViews', id);
  incrementActivity('categoryViews', p.category);
  renderRecommendations();
}
function recordSearch(query, results) {
  if (!state.activity || !query || !query.trim()) return;
  const clean = query.trim().slice(0, 70);
  if (!clean) return;
  state.activity.searchQueries = [...state.activity.searchQueries.filter(x => x !== clean), clean].slice(-20);
  [...new Set((results || []).slice(0, 5).map(p => p && p.category).filter(Boolean))].forEach(category => { state.activity.categoryViews[category] = Math.min(250, (state.activity.categoryViews[category] || 0) + 1); });
  saveActivity();
}

/* ───────── 3. Helpers ───────── */
const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const cssEscape = value => (window.CSS && CSS.escape ? CSS.escape(value) : String(value).replace(/"/g, '\\"'));
const prefersReducedMotion = () => window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

function esc(value = '') {
  return String(value).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}
function money(value) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(Number(value) || 0);
}
function hasPrice(p) { return p && p.price !== null && p.price !== undefined && p.price !== '' && Number.isFinite(Number(p.price)); }
function unitSuffix(p) { return p.priceUnit === 'pair' ? ' / pair' : p.priceUnit === 'piece' ? ' / piece' : ''; }
function priceText(p) { return hasPrice(p) ? `${money(p.price)}${unitSuffix(p)}` : 'Price on enquiry'; }
function priceHtml(p) {
  return hasPrice(p)
    ? `<span class="price">${esc(money(p.price))}</span>${p.priceUnit === 'pair' ? '<span class="price-unit">/ pair</span>' : p.priceUnit === 'piece' ? '<span class="price-unit">/ piece</span>' : ''}`
    : '<span class="price is-pending">Price on enquiry</span>';
}
function isAvailable(p) { return !!p && p.active !== false; }
function getProduct(id) { return state.byId.get(id); }
function productImages(p) { return Array.isArray(p.images) && p.images.length ? p.images : [PLACEHOLDER]; }
function cartQty(id) { return Number(state.cart[id]) || 0; }
function cartCount() { return Object.values(state.cart).reduce((sum, q) => sum + (Number(q) || 0), 0); }
function clampQty(n) { return Math.max(1, Math.min(MAX_QTY, Math.floor(Number(n)) || 1)); }
function categoryLabel(id) { const c = state.categories.find(x => x.id === id); return c ? c.label : 'All Products'; }
function scrollBehavior() { return prefersReducedMotion() ? 'auto' : 'smooth'; }
function scrollToCatalogue() { const target = $('#catalogue'); if (target) target.scrollIntoView({ behavior: scrollBehavior(), block: 'start' }); }

function showToast(message) {
  const toast = $('#toast');
  toast.textContent = message;
  toast.classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('visible'), 2400);
}
function icon(id) { return `<svg class="icon" aria-hidden="true"><use href="#i-${id}"/></svg>`; }

/* ───────── 4. Theme ───────── */
function savedTheme() {
  try {
    const value = String(localStorage.getItem(STORAGE_KEYS.theme) || '').replace(/["']/g, '');
    return value === 'dark' || value === 'light' ? value : null;
  } catch (_) { return null; }
}
function applyTheme(theme, persist) {
  const dark = theme === 'dark';
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  const toggle = $('#themeToggle');
  if (toggle) { toggle.setAttribute('aria-pressed', String(dark)); toggle.setAttribute('aria-label', 'Dark mode'); toggle.title = dark ? 'Switch to light mode' : 'Switch to dark mode'; }
  const meta = $('#themeColorMeta');
  if (meta) meta.setAttribute('content', '#3a0717');
  if (persist) { try { localStorage.setItem(STORAGE_KEYS.theme, dark ? 'dark' : 'light'); } catch (_) { /* theme still applies for this visit */ } }
}
function initTheme() {
  const saved = savedTheme();
  const system = window.matchMedia && matchMedia('(prefers-color-scheme: dark)');
  applyTheme(saved || (system && system.matches ? 'dark' : 'light'), false);
  if (system && system.addEventListener) system.addEventListener('change', event => { if (!savedTheme()) applyTheme(event.matches ? 'dark' : 'light', false); });
}

/* ───────── 5. Search engine (typo-tolerant, dependency-free) ───────── */
const GENERIC_TAGS = new Set(['gharsansar', 'shopping']);
const BOILERPLATE = /product details and included pieces can be confirmed with gharsansar on whatsapp\.?/i;

function normalize(value = '') {
  return String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^\p{L}\p{N}\p{M}]+/gu, ' ').trim();
}
function stem(word) { return word.length > 3 && /^[a-z]+$/.test(word) && word.endsWith('s') && !word.endsWith('ss') ? word.slice(0, -1) : word; }
function tokenize(value) { return normalize(value).split(' ').filter(Boolean).map(stem); }

/* Optimal-string-alignment distance: insert/delete/substitute/adjacent-swap each cost 1. Bails out above `limit`. */
function osaDistance(a, b, limit) {
  if (a === b) return 0;
  const la = a.length, lb = b.length;
  if (Math.abs(la - lb) > limit) return limit + 1;
  let prev2 = new Array(lb + 1).fill(0);
  let prev = Array.from({ length: lb + 1 }, (_, j) => j);
  for (let i = 1; i <= la; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= lb; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, prev2[j - 2] + 1);
      cur[j] = v;
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > limit) return limit + 1;
    prev2 = prev; prev = cur;
  }
  return prev[lb];
}

function makeField(text, weight) {
  const words = tokenize(text);
  return words.length ? { words, set: new Set(words), compact: words.join(''), weight } : null;
}
function buildSearchIndex(product) {
  const specs = Object.entries(product.specifications || {}).flat().join(' ');
  const description = String(product.description || '').replace(BOILERPLATE, '').trim();
  const tags = (product.tags || []).filter(tag => !GENERIC_TAGS.has(normalize(tag))).join(' ');
  const shortDesc = /details on enquiry/i.test(product.shortDescription || '') ? '' : product.shortDescription || '';
  const fields = [
    makeField(product.name, 5),
    makeField(tags, 3),
    makeField(`${product.categoryLabel || ''} ${String(product.category || '').replace(/-/g, ' ')}`, 2.4),
    makeField(specs, 1.4),
    normalize(description) !== normalize(product.name) ? makeField(description, 1) : null,
    makeField(shortDesc, 1),
  ].filter(Boolean);
  return { fields, name: normalize(product.name) };
}

function scoreToken(token, field) {
  const w = field.weight;
  if (field.set.has(token)) return 10 * w;
  if (token.length <= 2) return field.words.some(word => word.startsWith(token)) ? 4.5 * w : 0;
  let best = 0;
  for (const word of field.words) if (word.startsWith(token)) { best = 8 * w; break; }
  if (best) return best;
  if (token.length >= 4 && field.compact.includes(token)) return 6.5 * w;
  const tolerance = token.length <= 4 ? 0 : token.length <= 6 ? 1 : 2;
  if (!tolerance) return 0;
  for (const word of field.words) {
    if (word.length < 3) continue;
    let d = osaDistance(token, word, tolerance);
    if (d <= tolerance) best = Math.max(best, (5.8 - d * 0.9) * w);
    if (token.length >= 5 && word.length > token.length) { // typo inside a partially typed word
      d = osaDistance(token, word.slice(0, token.length), tolerance);
      if (d <= tolerance) best = Math.max(best, (5.2 - d * 0.9) * w);
    }
  }
  return best;
}
function scoreProduct(index, tokens) {
  let total = 0;
  for (const token of tokens) {
    let best = 0;
    for (const field of index.fields) { const s = scoreToken(token, field); if (s > best) best = s; }
    if (!best) { total = 0; break; } // every word must match something, exactly or approximately
    total += best;
  }
  let score = total / tokens.length;
  if (tokens.length > 1) { // "mangal sutra" should still find "Mangalsutra"
    const joined = tokens.join('');
    for (const field of index.fields) if (field.compact.includes(joined)) score = Math.max(score, 6.5 * field.weight);
  }
  if (score && index.name.includes(tokens.join(' '))) score += 8;
  return score;
}

/* ───────── 6. Catalogue: filtering, sorting, rendering ───────── */
function sortList(list) {
  const by = state.sort;
  if (by === 'price-low') return list.sort((a, b) => (hasPrice(a) ? a.price : Infinity) - (hasPrice(b) ? b.price : Infinity));
  if (by === 'price-high') return list.sort((a, b) => (hasPrice(b) ? b.price : -Infinity) - (hasPrice(a) ? a.price : -Infinity));
  if (by === 'name') return list.sort((a, b) => a.name.localeCompare(b.name));
  return list;
}
function searchAll(query) {
  const tokens = tokenize(query);
  if (!tokens.length) return [];
  return state.products
    .filter(isAvailable)
    .map(product => ({ product, score: scoreProduct(product.__index, tokens) }))
    .filter(r => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .map(r => r.product);
}
function currentResults() {
  let list;
  if (normalize(state.query)) list = searchAll(state.query);
  else list = state.products.filter(isAvailable).sort((a, b) => Number(b.featured) - Number(a.featured));
  if (state.activeCategory !== 'all') list = list.filter(p => p.category === state.activeCategory);
  if (state.sort !== 'featured') list = sortList([...list]);
  return list;
}

function renderCategories() {
  $('#categoryBar').innerHTML = state.categories.map(c =>
    `<div class="category-chip-wrap"><button class="category-chip" type="button" data-category="${esc(c.id)}" aria-pressed="${c.id === state.activeCategory}">${esc(c.label)}</button><button class="category-chip-share" type="button" data-action="share-category" data-category-id="${esc(c.id)}" aria-label="Share ${esc(c.label)} category" title="Share ${esc(c.label)}">${icon('share')}</button></div>`).join('');
  syncCategoryHighlights();
}
function syncCategoryHighlights() {
  $$('#categoryBar [data-category]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.category === state.activeCategory)));
  $$('#primaryNav [data-category]').forEach(b => b.classList.toggle('is-active', b.dataset.category === state.activeCategory));
}

function buyHtml(p) {
  const id = esc(p.id), name = esc(p.name), qty = cartQty(p.id);
  if (!qty) return `<button type="button" class="pc-add" data-action="add" data-id="${id}" aria-label="Add ${name} to cart">${icon('bag')}Add to cart</button>`;
  const minus = qty <= 1
    ? `<button type="button" data-action="cart-remove" data-id="${id}" aria-label="Remove ${name} from cart">${icon('trash')}</button>`
    : `<button type="button" data-action="cart-dec" data-id="${id}" aria-label="Decrease quantity of ${name}">${icon('minus')}</button>`;
  return `<div class="stepper" role="group" aria-label="Cart quantity for ${name}">${minus}<output>${qty} in cart</output><button type="button" data-action="cart-inc" data-id="${id}" aria-label="Increase quantity of ${name}"${qty >= MAX_QTY ? ' disabled' : ''}>${icon('plus')}</button></div>`;
}
function productCard(p) {
  const id = esc(p.id), name = esc(p.name);
  const wished = state.wishlist.has(p.id);
  const src = productImages(p)[0];
  return `<article class="product-card" data-card="${id}">
    <div class="pc-media">
      <button type="button" class="pc-open" data-action="details" data-id="${id}" tabindex="-1" aria-label="${name} — view details"><img src="${esc(src)}" alt="${name}" width="520" height="650" loading="lazy" decoding="async"></button>
      <button type="button" class="pc-heart" data-action="wish" data-id="${id}" aria-pressed="${wished}" aria-label="Save ${name} to wishlist"><span class="disc">${icon('heart')}</span></button>
      <button type="button" class="pc-share" data-action="share" data-id="${id}" aria-label="Share ${name}" title="Share product"><span class="disc">${icon('share')}</span></button>
    </div>
    <div class="pc-body">
      <p class="pc-cat">${esc(p.categoryLabel || 'GharSansar')}</p>
      <h3 class="pc-name"><button type="button" data-action="details" data-id="${id}" title="${name}"><span class="clamp-2">${name}</span></button></h3>
      <div class="pc-price">${priceHtml(p)}</div>
      <div class="pc-buy">${buyHtml(p)}</div>
      <div class="pc-wa">
        <button type="button" data-action="order" data-id="${id}" aria-label="Order ${name} on WhatsApp">${icon('whatsapp')}Order</button>
        <button type="button" data-action="enquire" data-id="${id}" aria-label="Ask about ${name} on WhatsApp">${icon('whatsapp')}Ask</button>
      </div>
    </div>
  </article>`;
}

function recommendationProfile() {
  const activity = state.activity || {};
  const categoryScores = {};
  const seedProducts = new Map();
  const addCategory = (id, weight) => { if (id) categoryScores[id] = (categoryScores[id] || 0) + weight; };
  const addSeed = (id, weight) => { const p = getProduct(id); if (!p) return; seedProducts.set(id, (seedProducts.get(id) || 0) + weight); addCategory(p.category, weight * 1.1); };
  for (const [id, n] of Object.entries(activity.productViews || {})) addSeed(id, Math.min(10, n) * 0.8);
  for (const [id, n] of Object.entries(activity.wishlistAdds || {})) addSeed(id, Math.min(8, n) * 2.2);
  for (const [id, n] of Object.entries(activity.cartAdds || {})) addSeed(id, Math.min(8, n) * 2.8);
  for (const [cat, n] of Object.entries(activity.categoryViews || {})) addCategory(cat, Math.min(12, n) * 0.55);
  for (const id of state.wishlist) addSeed(id, 3.5);
  for (const [id, qty] of Object.entries(state.cart)) addSeed(id, Math.min(5, qty) * 3.8);
  const topCategory = Object.entries(categoryScores).sort((a,b)=>b[1]-a[1])[0];
  return { categoryScores, seedProducts, topCategory, hasSignals: seedProducts.size > 0 || !!topCategory };
}
function recommendedProducts(limit = 8) {
  const active = state.products.filter(isAvailable);
  if (!active.length) return [];
  const profile = recommendationProfile();
  const owned = new Set([...state.wishlist, ...Object.keys(state.cart)]);
  const candidates = active.filter(p => !owned.has(p.id));
  if (!profile.hasSignals) {
    return candidates.sort((a,b) => {
      const batch = (p) => Number((String(p.batch || '').match(/\d+/) || [0])[0]);
      return Number(b.featured)-Number(a.featured) || batch(b)-batch(a) || String(b.id).localeCompare(String(a.id));
    }).slice(0, limit);
  }
  const seedTags = new Map();
  for (const [id, weight] of profile.seedProducts) {
    const p = getProduct(id); if (!p) continue;
    for (const tag of (p.tags || []).map(normalize).filter(Boolean)) seedTags.set(tag, (seedTags.get(tag) || 0) + weight);
  }
  return candidates.map(p => {
    let score = (profile.categoryScores[p.category] || 0) * 2.2;
    for (const tag of (p.tags || []).map(normalize)) if (seedTags.has(tag)) score += Math.min(6, seedTags.get(tag)) * 0.32;
    score += Number(p.featured) * 0.35;
    if (p.batch === 'P7') score += 0.2;
    return { p, score };
  }).sort((a,b) => b.score-a.score || a.p.name.localeCompare(b.p.name)).slice(0,limit).map(x=>x.p);
}
function renderRecommendations() {
  const section = $('#recommendSection');
  if (!section || !state.loaded) return;
  const isHome = state.activeCategory === 'all' && !state.query.trim();
  section.hidden = !isHome;
  if (!isHome) return;
  const list = recommendedProducts(8);
  const profile = recommendationProfile();
  const topCategory = profile.topCategory && state.categories.find(c=>c.id===profile.topCategory[0]);
  $('#recommendTitle').innerHTML = profile.hasSignals ? 'Picked <em>for you</em>' : 'Fresh <em>finds</em> for you';
  $('#recommendNote').textContent = profile.hasSignals
    ? `${topCategory ? `You seem to enjoy ${topCategory.label.toLowerCase()} — ` : ''}Suggestions are shaped by what you view, save and add to your bag, on this device.`
    : 'A few lovely new finds to explore. Your picks will become more personal as you browse.';
  $('#recommendGrid').innerHTML = list.map(productCard).join('');
  const alertButton = $('#enableAlertsButton');
  if (alertButton) {
    const supported = 'Notification' in window && 'serviceWorker' in navigator;
    const enabled = supported && Notification.permission === 'granted' && readStorage(STORAGE_KEYS.alerts, false) === true;
    alertButton.hidden = !supported || enabled;
    if (enabled) alertButton.textContent = 'Alerts enabled';
  }
}
function resetBrowsingInsights() {
  if (!state.activity) return;
  state.activity.productViews = {}; state.activity.wishlistAdds = {}; state.activity.cartAdds = {};
  state.activity.categoryViews = {}; state.activity.searchQueries = [];
  saveActivity(); renderRecommendations(); showToast('Browsing insights reset. Your wishlist and bag are untouched.');
}

function renderProducts(force = false) {
  if (!state.loaded) return;
  const list = currentResults();
  const q = state.query.trim();
  const count = $('#resultCount');
  count.textContent = q ? `${list.length} ${list.length === 1 ? 'match' : 'matches'} for “${q}”`
    : `${list.length} ${list.length === 1 ? 'product' : 'products'}${state.activeCategory !== 'all' ? ` in ${categoryLabel(state.activeCategory)}` : ''}`;
  const grid = $('#productGrid'), empty = $('#emptyState');
  const key = `${state.activeCategory}|${state.sort}|${q}|${list.map(p => p.id).join(',')}`;
  empty.hidden = list.length > 0;
  grid.hidden = list.length === 0;
  if (!list.length) {
    $('#emptyTitle').textContent = q ? `No match for “${q}”` : 'No products here yet';
    $('#emptyText').textContent = q ? 'Check the spelling, or try a broader word such as “earrings”, “gift” or “diya”.' : 'Please choose another category.';
    $('#resetFilters').textContent = q ? 'Clear search' : 'Show all products';
    grid.innerHTML = ''; lastRenderKey = ''; grid.setAttribute('aria-busy', 'false');
    return;
  }
  if (key === lastRenderKey && !force) return; // same result set: keep DOM, avoid flicker and scroll jumps
  lastRenderKey = key;
  grid.innerHTML = list.map(productCard).join('');
  grid.setAttribute('aria-busy', 'false');
}

function refreshCard(id) {
  const cards = $$(`[data-card="${cssEscape(id)}"]`);
  const p = getProduct(id);
  if (!cards.length || !p) return;
  for (const card of cards) {
    const buy = $('.pc-buy', card);
    const active = document.activeElement;
    const hadFocus = buy && buy.contains(active) ? active.dataset.action : null;
    if (buy) buy.innerHTML = buyHtml(p);
    if (hadFocus && buy) {
      const next = { add: 'cart-inc', 'cart-remove': 'add', 'cart-inc': 'cart-inc', 'cart-dec': 'cart-dec' }[hadFocus];
      const target = $(`[data-action="${next}"]:not(:disabled)`, buy) || $('button:not(:disabled)', buy);
      if (target) target.focus({ preventScroll: true });
    }
  }
}
function refreshHeart(id, animate) {
  const hearts = $$(`[data-card="${cssEscape(id)}"] .pc-heart`);
  if (!hearts.length) return;
  for (const heart of hearts) {
    heart.setAttribute('aria-pressed', String(state.wishlist.has(id)));
    if (animate) { heart.classList.remove('pop'); void heart.offsetWidth; heart.classList.add('pop'); }
  }
}
function updateCounts() {
  const cart = cartCount(), saved = state.wishlist.size;
  const label = n => (n > 99 ? '99+' : String(n));
  [['#cartCount', cart], ['#mobileCartCount', cart], ['#savedCount', saved], ['#mobileSavedCount', saved]].forEach(([sel, n]) => {
    const node = $(sel); node.textContent = label(n); node.hidden = !n;
  });
  $('#cartButton').setAttribute('aria-label', cart ? `Open cart, ${cart} item${cart === 1 ? '' : 's'}` : 'Open cart');
  $('#mobileCartButton').setAttribute('aria-label', cart ? `Open cart, ${cart} item${cart === 1 ? '' : 's'}` : 'Open cart');
  $('#savedButton').setAttribute('aria-label', saved ? `Open wishlist, ${saved} saved` : 'Open wishlist');
  $('#mobileSavedButton').setAttribute('aria-label', saved ? `Open wishlist, ${saved} saved` : 'Open wishlist');
}

function selectCategory(id, scroll) {
  state.activeCategory = state.categories.some(c => c.id === id) ? id : 'all';
  if (state.activeCategory !== 'all') incrementActivity('categoryViews', state.activeCategory);
  syncCategoryHighlights();
  renderProducts();
  renderRecommendations();
  if (scroll) scrollToCatalogue();
}

/* ───────── 7. Wishlist & cart ───────── */
function toggleWishlist(id) {
  const p = getProduct(id); if (!p) return;
  const adding = !state.wishlist.has(id);
  if (adding) { state.wishlist.add(id); incrementActivity('wishlistAdds', id); } else state.wishlist.delete(id);
  persistWishlist();
  renderRecommendations();
  showToast(adding ? 'Saved to your wishlist' : 'Removed from your wishlist');
  refreshHeart(id, adding);
  syncModalHeart();
  if (isOpen('drawer') && state.drawerMode === 'saved') renderDrawer();
}
function addToCart(id, qty = 1) {
  const p = getProduct(id);
  if (!p || !isAvailable(p)) { showToast('This product is not available right now.'); return false; }
  const now = Date.now();
  if (now - (lastAddAt.get(id) || 0) < ADD_GUARD_MS) return false; // ignore accidental double-taps
  lastAddAt.set(id, now);
  const before = cartQty(id);
  state.cart[id] = Math.min(MAX_QTY, before + clampQty(qty));
  incrementActivity('cartAdds', id);
  persistCart(); refreshCard(id); renderRecommendations();
  showToast(before >= MAX_QTY ? `Maximum ${MAX_QTY} per item` : `Added to cart · ${state.cart[id]} in total`);
  if (isOpen('drawer') && state.drawerMode === 'cart') renderDrawer();
  return true;
}
function changeCartQty(id, delta) {
  if (!cartQty(id)) return;
  if (delta > 0 && Date.now() - (lastAddAt.get(id) || 0) < ADD_GUARD_MS) return;
  const next = cartQty(id) + delta;
  if (next < 1) return; // quantity never drops below 1 — use Remove to take an item out
  state.cart[id] = Math.min(MAX_QTY, next);
  persistCart(); refreshCard(id); renderRecommendations();
  if (isOpen('drawer') && state.drawerMode === 'cart') renderDrawer();
}
function removeFromCart(id) {
  if (!(id in state.cart)) return;
  delete state.cart[id];
  persistCart(); refreshCard(id); renderRecommendations();
  showToast('Removed from your cart');
  if (isOpen('drawer') && state.drawerMode === 'cart') renderDrawer();
}
function cartItems() {
  return Object.entries(state.cart).map(([id, qty]) => ({ product: getProduct(id), qty: Number(qty) })).filter(i => i.product && i.qty > 0);
}

/* ───────── 8. WhatsApp ───────── */
function waLink(message) { return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`; }
function openWhatsApp(message) {
  const url = waLink(message);
  const win = window.open(url, '_blank', 'noopener');
  if (!win) window.location.href = url; // pop-up blocked: navigate in the same tab instead
}
function singleOrderMessage(p, qty) {
  const lines = [`Namaste ${STORE_NAME}! I would like to place an order.`, '', `Product: ${p.name}`, `Product ID: ${p.id}`, `Quantity: ${qty}`];
  if (hasPrice(p)) lines.push(`Unit price: ${priceText(p)}`, `Subtotal: ${money(Number(p.price) * qty)}`);
  else lines.push('Unit price: please confirm', 'Subtotal: to be confirmed');
  lines.push('', 'Please confirm availability, delivery charges and the final payable amount. Thank you!');
  return lines.join('\n');
}
function enquiryMessage(p) {
  return [`Namaste ${STORE_NAME}! I have a question about a product (I have not placed an order yet).`, '', `Product: ${p.name}`, `Product ID: ${p.id}`, `Displayed price: ${priceText(p)}`, '',
    'Could you please share more details and let me know if it is currently available? Thank you!'].join('\n');
}
function cartOrderMessage(items) {
  const lines = items.map(({ product: p, qty }, i) => hasPrice(p)
    ? `${i + 1}. ${p.name}\n   Product ID: ${p.id}\n   Qty: ${qty} × ${priceText(p)} = ${money(Number(p.price) * qty)}`
    : `${i + 1}. ${p.name}\n   Product ID: ${p.id}\n   Qty: ${qty} × price to be confirmed`);
  const priced = items.filter(i => hasPrice(i.product));
  const unpriced = items.length - priced.length;
  const total = priced.reduce((sum, i) => sum + Number(i.product.price) * i.qty, 0);
  const totalLine = unpriced ? `Total of priced items: ${money(total)}\n(${unpriced} item${unpriced === 1 ? '' : 's'} need price confirmation)` : `Total: ${money(total)}`;
  return `Namaste ${STORE_NAME}! I would like to order the following items:\n\n${lines.join('\n\n')}\n\n${totalLine}\n\nPlease confirm availability, delivery charges and the final payable amount. Thank you!`;
}
function orderProduct(id, qty) { const p = getProduct(id); if (p && isAvailable(p)) openWhatsApp(singleOrderMessage(p, clampQty(qty))); }
function enquireProduct(id) { const p = getProduct(id); if (p) openWhatsApp(enquiryMessage(p)); }
function orderCart() {
  const items = cartItems().filter(i => isAvailable(i.product));
  if (!items.length) { showToast('Your cart is empty.'); return; }
  openWhatsApp(cartOrderMessage(items));
}

/* ───────── 9. Share Engine: product URLs, social links, native image sharing ───────── */
function categoryShareUrl(categoryId) {
  const base = new URL('./', document.baseURI);
  return new URL(`categories/${encodeURIComponent(categoryId)}/`, base).href;
}
function categoryShareCopy(category, url) {
  const count = state.products.filter(p => isAvailable(p) && (category.id === 'all' || p.category === category.id)).length;
  return `Explore ${category.label} at GharSansar — Har Ghar ki Pasand!\n\n${count} curated ${count === 1 ? 'find' : 'finds'} in this collection.\n\nBrowse the collection: ${url}`;
}
function openCategoryShareDialog(categoryId) {
  const category = state.categories.find(c => c.id === categoryId); if (!category) return;
  state.shareCategoryId = categoryId; state.shareProductId = null;
  const url = categoryShareUrl(categoryId), count = state.products.filter(p => isAvailable(p) && (categoryId === 'all' || p.category === categoryId)).length;
  const text = categoryShareCopy(category, url);
  const wa = `https://wa.me/?text=${encodeURIComponent(text)}`;
  const telegram = `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(`${category.label} · ${count} curated finds | GharSansar`)}`;
  const artwork = categoryId === 'old-books' ? './assets/categories/old-books.svg' : categoryId === 'home-living' ? './assets/categories/home-living.svg' : categoryId === 'gifts-hampers' ? './assets/categories/gifts-hampers.svg' : categoryId === 'festive-decor' ? './assets/categories/festive-decor.svg' : categoryId === 'clothing-apparel' ? './assets/categories/clothing-apparel.svg' : './assets/categories/artificial-jewellery.svg';
  $('#shareTitle').textContent = `Share ${category.label}`;
  $('.share-header .eyebrow').textContent = 'Share a whole collection';
  $('#shareContent').innerHTML = `
    <div class="share-product-preview category-share-preview"><img src="${esc(artwork)}" alt="" width="88" height="104"><div class="share-product-copy"><span>GHARSANSAR · COLLECTION</span><strong>${esc(category.label)}</strong><b>${count} curated ${count === 1 ? 'find' : 'finds'}</b><small>Har Ghar ki Pasand</small></div></div>
    <p class="share-hint">Share this collection link. Friends will land directly on the ${esc(category.label)} products.</p>
    <div class="share-options">
      <a class="share-choice share-whatsapp" href="${esc(wa)}" target="_blank" rel="noopener noreferrer">${icon('whatsapp')}<span>WhatsApp</span></a>
      <a class="share-choice share-telegram" href="${esc(telegram)}" target="_blank" rel="noopener noreferrer">${icon('send')}<span>Telegram</span></a>
      <button class="share-choice" type="button" data-action="share-category-copy" data-category-id="${esc(categoryId)}">${icon('copy')}<span>Copy link</span></button>
      <button class="share-choice" type="button" data-action="share-category-native" data-category-id="${esc(categoryId)}">${icon('share')}<span>More options</span></button>
    </div>
    <div class="share-link-row"><span>${esc(url)}</span><button type="button" data-action="share-category-copy" data-category-id="${esc(categoryId)}" aria-label="Copy category link">${icon('copy')}</button></div>`;
  openOverlay('share');
}
async function copyCategoryShareLink(categoryId) {
  const category = state.categories.find(c=>c.id===categoryId); if (!category) return;
  const url = categoryShareUrl(categoryId);
  try {
    if (navigator.clipboard && window.isSecureContext) await navigator.clipboard.writeText(url);
    else { const box=document.createElement('textarea'); box.value=url; box.setAttribute('readonly',''); box.style.position='fixed'; box.style.opacity='0'; document.body.appendChild(box); box.select(); const ok=document.execCommand('copy'); box.remove(); if(!ok) throw new Error('copy failed'); }
    showToast(`${category.label} link copied. Share it anywhere!`);
  } catch (_) { showToast('Could not copy automatically. Please try again.'); }
}
async function nativeShareCategory(categoryId) {
  const category=state.categories.find(c=>c.id===categoryId); if(!category) return;
  const url=categoryShareUrl(categoryId), text=categoryShareCopy(category,url);
  if(!navigator.share) return copyCategoryShareLink(categoryId);
  try { await navigator.share({title:`${category.label} | GharSansar`,text,url}); }
  catch(error) { if(error && error.name!=='AbortError') showToast('Sharing could not be opened. Try WhatsApp or Copy link.'); }
}


function websiteShareUrl() {
  return new URL('./', document.baseURI).href;
}
function websiteShareCopy(url) {
  return `GharSansar — Har Ghar ki Pasand\n\nDiscover curated jewellery, clothing, thoughtful gifts, home and festive finds in one place. Explore the collection and share your favourites.\n\nVisit GharSansar: ${url}`;
}
function openWebsiteShareDialog() {
  state.shareProductId = null; state.shareCategoryId = null;
  const url = websiteShareUrl();
  const text = websiteShareCopy(url);
  const wa = `https://wa.me/?text=${encodeURIComponent(text)}`;
  const telegram = `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent('GharSansar — Har Ghar ki Pasand | Curated jewellery, clothing, gifts and home finds.')}`;
  $('#shareTitle').textContent = 'Share GharSansar';
  $('.share-header .eyebrow').textContent = 'Invite someone to discover us';
  $('#shareContent').innerHTML = `
    <article class="site-share-preview" aria-label="GharSansar website share card">
      <img src="./assets/banners/gharsansar-hero.webp" alt="GharSansar — Har Ghar ki Pasand" width="1672" height="941">
      <div class="site-share-copy">
        <span>GHARSANSAR · HAR GHAR KI PASAND</span>
        <h3>GharSansar</h3>
        <p>Discover curated jewellery, clothing, thoughtful gifts, home finds and festive décor — all in one welcoming place.</p>
        <small>${esc(new URL(url).host + new URL(url).pathname)}</small>
      </div>
    </article>
    <p class="share-hint">Share our website with friends and family. The link preview uses GharSansar’s image, name and description when the receiving app supports website previews.</p>
    <div class="share-options">
      <a class="share-choice share-whatsapp" href="${esc(wa)}" target="_blank" rel="noopener noreferrer">${icon('whatsapp')}<span>WhatsApp</span></a>
      <a class="share-choice share-telegram" href="${esc(telegram)}" target="_blank" rel="noopener noreferrer">${icon('send')}<span>Telegram</span></a>
      <button class="share-choice" type="button" data-action="share-site-copy">${icon('copy')}<span>Copy website link</span></button>
      <button class="share-choice" type="button" data-action="share-site-native">${icon('share')}<span>More apps</span></button>
    </div>
    <div class="share-link-row"><span>${esc(url)}</span><button type="button" data-action="share-site-copy" aria-label="Copy GharSansar website link">${icon('copy')}</button></div>`;
  openOverlay('share');
}
async function copyWebsiteShareLink() {
  const url = websiteShareUrl();
  try {
    if (navigator.clipboard && window.isSecureContext) await navigator.clipboard.writeText(url);
    else {
      const box = document.createElement('textarea'); box.value = url; box.setAttribute('readonly','');
      box.style.position = 'fixed'; box.style.opacity = '0'; document.body.appendChild(box); box.select();
      const ok = document.execCommand('copy'); box.remove(); if (!ok) throw new Error('copy failed');
    }
    showToast('GharSansar website link copied. Share it anywhere!');
  } catch (_) { showToast('Could not copy automatically. Please copy the website link shown above.'); }
}
async function nativeShareWebsite() {
  const url = websiteShareUrl(), text = websiteShareCopy(url);
  if (!navigator.share) { await copyWebsiteShareLink(); return; }
  try { await navigator.share({ title: 'GharSansar — Har Ghar ki Pasand', text, url }); }
  catch (error) { if (error && error.name !== 'AbortError') showToast('Sharing could not be opened. Try WhatsApp, Telegram or Copy website link.'); }
}

function productShareUrl(product) {
  const slug = String(product.slug || product.id).trim();
  const base = new URL('./', document.baseURI);
  return new URL(`products/${encodeURIComponent(slug)}/`, base).href;
}
function productShareCopy(product, url) {
  const priceLine = hasPrice(product) ? `Price: ${priceText(product)}` : 'Price: Please enquire';
  return `A lovely find from GharSansar — Har Ghar ki Pasand!\n\n${product.name}\n${priceLine}\nProduct ID: ${product.id}\n\nExplore this product: ${url}`;
}
function openShareDialog(id) {
  const p = getProduct(id); if (!p) return;
  state.shareProductId = id; state.shareCategoryId = null;
  $('#shareTitle').textContent = 'Share this product'; $('.share-header .eyebrow').textContent = 'Spread a lovely find';
  const url = productShareUrl(p);
  const text = productShareCopy(p, url);
  const image = productImages(p)[0] || PLACEHOLDER;
  const wa = `https://wa.me/?text=${encodeURIComponent(text)}`;
  const telegram = `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(`${p.name} · ${hasPrice(p) ? priceText(p) : 'Price on enquiry'} | GharSansar`)}`;
  $('#shareContent').innerHTML = `
    <div class="share-product-preview">
      <img src="${esc(image)}" alt="" width="88" height="104" loading="lazy">
      <div class="share-product-copy"><span>GHARSANSAR · ${esc(p.id)}</span><strong>${esc(p.name)}</strong><b>${esc(priceText(p))}</b><small>Har Ghar ki Pasand</small></div>
    </div>
    <p class="share-hint">Share the product link. WhatsApp and Telegram can show its photo, name and price as a preview.</p>
    <div class="share-options">
      <a class="share-choice share-whatsapp" href="${esc(wa)}" target="_blank" rel="noopener noreferrer">${icon('whatsapp')}<span>WhatsApp</span></a>
      <a class="share-choice share-telegram" href="${esc(telegram)}" target="_blank" rel="noopener noreferrer">${icon('send')}<span>Telegram</span></a>
      <button class="share-choice" type="button" data-action="share-copy" data-id="${esc(id)}">${icon('copy')}<span>Copy link</span></button>
      <button class="share-choice" type="button" data-action="share-native" data-id="${esc(id)}">${icon('share')}<span>More options</span></button>
      <button class="share-choice share-photo" type="button" data-action="share-photo" data-id="${esc(id)}">${icon('image')}<span>Share photo + link</span></button>
    </div>
    <div class="share-link-row"><span>${esc(url)}</span><button type="button" data-action="share-copy" data-id="${esc(id)}" aria-label="Copy product link">${icon('copy')}</button></div>`;
  openOverlay('share');
}
async function copyShareLink(id) {
  const p = getProduct(id); if (!p) return;
  const url = productShareUrl(p);
  try {
    if (navigator.clipboard && window.isSecureContext) await navigator.clipboard.writeText(url);
    else {
      const box = document.createElement('textarea'); box.value = url; box.setAttribute('readonly','');
      box.style.position = 'fixed'; box.style.opacity = '0'; document.body.appendChild(box); box.select();
      const ok = document.execCommand('copy'); box.remove(); if (!ok) throw new Error('copy failed');
    }
    showToast('Product link copied. Share it anywhere!');
  } catch (_) { showToast('Could not copy automatically. Select the product link shown above.'); }
}
async function nativeShareProduct(id, includeImage = false) {
  const p = getProduct(id); if (!p) return;
  const url = productShareUrl(p), text = productShareCopy(p, url);
  if (!navigator.share) { await copyShareLink(id); return; }
  try {
    if (includeImage) {
      const imageUrl = new URL(productImages(p)[0], document.baseURI).href;
      const response = await fetch(imageUrl, { cache: 'no-cache' });
      if (!response.ok) throw new Error('Product image is not available yet.');
      const blob = await response.blob();
      const ext = (blob.type.split('/')[1] || 'jpg').replace('jpeg','jpg');
      const file = new File([blob], `GharSansar-${p.slug || p.id}.${ext}`, { type: blob.type || 'image/jpeg' });
      if (!navigator.canShare || !navigator.canShare({ files: [file] })) throw new Error('Photo sharing is not supported by this browser.');
      await navigator.share({ files: [file], title: p.name, text });
    } else {
      await navigator.share({ title: `${p.name} | GharSansar`, text, url });
    }
  } catch (error) {
    if (error && error.name === 'AbortError') return;
    showToast(error && error.message ? error.message : 'Sharing could not be opened. Try WhatsApp or Copy link.');
  }
}

/* ───────── 10. Overlays: drawer + product sheet + share sheet ───────── */
const OVERLAYS = { drawer: { overlay: '#drawerOverlay', panel: '#drawerPanel' }, modal: { overlay: '#productModalOverlay', panel: '#productModal' }, share: { overlay: '#shareOverlay', panel: '#sharePanel' } };
let activeOverlay = null;
let returnFocus = null;

function isOpen(kind) { return activeOverlay === kind; }
function openOverlay(kind) {
  closeSearchPanel();
  if (activeOverlay && activeOverlay !== kind) closeOverlay(false);
  if (!returnFocus) returnFocus = document.activeElement;
  const { overlay, panel } = OVERLAYS[kind];
  activeOverlay = kind;
  const node = $(overlay);
  node.setAttribute('aria-hidden', 'false');
  node.classList.add('is-open');
  $('#app').inert = true;
  document.body.classList.add('no-scroll');
  requestAnimationFrame(() => $(panel).focus({ preventScroll: true }));
}
function closeOverlay(restoreFocus = true) {
  if (!activeOverlay) return;
  const { overlay } = OVERLAYS[activeOverlay];
  const node = $(overlay);
  node.classList.remove('is-open');
  node.setAttribute('aria-hidden', 'true');
  activeOverlay = null;
  $('#app').inert = false;
  document.body.classList.remove('no-scroll');
  if (restoreFocus) {
    const target = returnFocus && document.contains(returnFocus) && returnFocus.offsetParent !== null ? returnFocus : null;
    if (target) target.focus({ preventScroll: true });
    returnFocus = null;
  }
}
function trapFocus(event) {
  if (event.key !== 'Tab' || !activeOverlay) return;
  const panel = $(OVERLAYS[activeOverlay].panel);
  const items = $$('a[href], button:not(:disabled), input, select, [tabindex]:not([tabindex="-1"])', panel).filter(el => el.offsetParent !== null);
  if (!items.length) { event.preventDefault(); panel.focus(); return; }
  const first = items[0], last = items[items.length - 1];
  if (event.shiftKey && (document.activeElement === first || document.activeElement === panel)) { event.preventDefault(); last.focus(); }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
}

/* Drawer (cart / wishlist) */
function openDrawer(mode) { state.drawerMode = mode; renderDrawer(); openOverlay('drawer'); }
function drawerRow(p, qty, mode) {
  const id = esc(p.id), name = esc(p.name), available = isAvailable(p);
  const img = `<img src="${esc(productImages(p)[0])}" alt="" width="72" height="90" loading="lazy" decoding="async">`;
  let controls;
  if (mode === 'saved') {
    controls = `${available ? `<button type="button" class="button button-outline" style="min-height:40px;padding:0 16px" data-action="saved-add" data-id="${id}">${icon('bag')}Add to cart</button>` : ''}
      <button type="button" class="text-btn" data-action="details" data-id="${id}">Details</button>
      <button type="button" class="text-btn danger" data-action="unsave" data-id="${id}" aria-label="Remove ${name} from wishlist">${icon('trash')}Remove</button>`;
  } else {
    controls = `${available ? `<div class="stepper" role="group" aria-label="Quantity for ${name}">
        <button type="button" data-action="drawer-dec" data-id="${id}" aria-label="Decrease quantity of ${name}"${qty <= 1 ? ' disabled' : ''}>${icon('minus')}</button>
        <output>${qty}</output>
        <button type="button" data-action="drawer-inc" data-id="${id}" aria-label="Increase quantity of ${name}"${qty >= MAX_QTY ? ' disabled' : ''}>${icon('plus')}</button></div>` : ''}
      <button type="button" class="text-btn danger" data-action="cart-remove" data-id="${id}" aria-label="Remove ${name} from cart">${icon('trash')}Remove</button>`;
  }
  const line = mode === 'cart' && available && hasPrice(p) && qty > 1 ? `<span class="di-line">${qty} × ${esc(money(p.price))} = ${esc(money(Number(p.price) * qty))}</span>` : '';
  return `<div class="drawer-item" data-row="${id}">${img}<div><p class="di-name">${name}</p><div class="di-meta">${priceHtml(p)}${line}</div>${available ? '' : '<p class="unavailable-note">Currently unavailable</p>'}<div class="di-controls">${controls}</div></div></div>`;
}
function renderDrawer() {
  const saved = state.drawerMode === 'saved';
  $('#drawerEyebrow').textContent = saved ? 'Your saved finds' : 'Your GharSansar cart';
  $('#drawerTitle').textContent = saved ? 'Wishlist' : 'Your cart';
  const content = $('#drawerContent');
  const list = $('.drawer-list', content);
  const scrollTop = list ? list.scrollTop : 0;
  const active = document.activeElement;
  const refocus = content.contains(active) && active.dataset ? { action: active.dataset.action, id: active.dataset.id } : null;
  let html;
  if (saved) {
    const items = [...state.wishlist].map(getProduct).filter(Boolean);
    html = !items.length
      ? `<div class="drawer-empty">${icon('heart')}<h3>Nothing saved yet</h3><p>Tap the heart on anything you love. It will wait here on this device until you come back.</p><button class="button button-primary" type="button" data-action="shop">Start browsing</button></div>`
      : `<div class="drawer-list">${items.map(p => drawerRow(p, 0, 'saved')).join('')}</div><div class="drawer-footer"><button class="drawer-secondary" type="button" data-action="shop" style="margin-top:0">Keep browsing</button></div>`;
  } else {
    const items = cartItems();
    if (!items.length) {
      html = `<div class="drawer-empty">${icon('bag')}<h3>Your cart is empty</h3><p>Add something you like and adjust quantities here before sending your order on WhatsApp.</p><button class="button button-primary" type="button" data-action="shop">Explore the collection</button></div>`;
    } else {
      const orderable = items.filter(i => isAvailable(i.product));
      const priced = orderable.filter(i => hasPrice(i.product));
      const subtotal = priced.reduce((s, i) => s + Number(i.product.price) * i.qty, 0);
      const unpriced = orderable.length - priced.length;
      const totalText = !priced.length ? 'To be confirmed' : unpriced ? `${money(subtotal)} + ${unpriced} to confirm` : money(subtotal);
      html = `<div class="drawer-list">${items.map(i => drawerRow(i.product, i.qty, 'cart')).join('')}</div>
        <div class="drawer-footer">
          <div class="drawer-total"><span>Estimated total</span><strong>${esc(totalText)}</strong></div>
          <p class="drawer-note">Opens WhatsApp with your list ready to send. Nothing is ordered until you send it and we confirm availability and delivery.</p>
          <button class="drawer-checkout" type="button" data-action="order-cart"${orderable.length ? '' : ' disabled'}>${icon('whatsapp')}Continue on WhatsApp</button>
          <button class="drawer-secondary" type="button" data-action="shop">Keep browsing</button>
        </div>`;
    }
  }
  content.innerHTML = html;
  const newList = $('.drawer-list', content);
  if (newList) newList.scrollTop = scrollTop;
  if (refocus && refocus.action) {
    const target = $(`[data-action="${cssEscape(refocus.action)}"][data-id="${cssEscape(refocus.id || '')}"]:not(:disabled)`, content);
    if (target) target.focus({ preventScroll: true });
    else if (isOpen('drawer')) $('#drawerPanel').focus({ preventScroll: true });
  }
}

/* Product sheet / dialog */
function openProduct(id) {
  const p = getProduct(id); if (!p) return;
  recordProductView(id);
  state.modal = { id, qty: 1, index: 0 };
  const images = productImages(p);
  const specs = Object.entries(p.specifications || {}).map(([k, v]) => `<div class="spec-row"><span>${esc(k)}</span><span>${esc(v)}</span></div>`).join('');
  const thumbs = images.length > 1
    ? `<div class="modal-thumbs" role="group" aria-label="Product photos">${images.map((src, i) => `<button type="button" class="modal-thumb" data-action="gallery" data-index="${i}" aria-pressed="${i === 0}" aria-label="Show photo ${i + 1} of ${images.length}"><img src="${esc(src)}" alt="" width="56" height="68" loading="lazy"></button>`).join('')}</div>` : '';
  const arrows = images.length > 1
    ? `<button type="button" class="gal-nav gal-prev" data-action="gallery-prev" aria-label="Previous photo">${icon('left')}</button><button type="button" class="gal-nav gal-next" data-action="gallery-next" aria-label="Next photo">${icon('right')}</button>` : '';
  const available = isAvailable(p);
  $('#productModalContent').innerHTML = `
    <div class="modal-body">
      <div class="modal-gallery"><div class="modal-main"><img id="modalMainImage" src="${esc(images[0])}" alt="${esc(p.name)}" width="520" height="650" decoding="async">${arrows}</div>${thumbs}</div>
      <div class="modal-info">
        <p class="eyebrow">${esc(p.categoryLabel || '')} · ${esc(p.id)}</p>
        <h2 id="modalProductName">${esc(p.name)}</h2>
        <div class="modal-price">${priceHtml(p)}</div>
        <p class="modal-desc">${esc(String(p.description || '').replace(BOILERPLATE, '').trim() || 'Ask us on WhatsApp for exact details and availability.')}</p>
        ${specs ? `<div class="spec-list">${specs}</div>` : ''}
        <p class="modal-note">Product details, variants and delivery are confirmed with you on WhatsApp before your order is final.</p>
        <button type="button" class="modal-enquire" data-action="modal-enquire" data-id="${esc(p.id)}">${icon('whatsapp')}Ask about this product</button>
        <button type="button" class="modal-share-btn" data-action="modal-share" data-id="${esc(p.id)}">${icon('share')}Share this product</button>
        <button type="button" class="text-btn" id="modalWish" data-action="modal-wish" data-id="${esc(p.id)}" aria-pressed="${state.wishlist.has(p.id)}" style="margin-top:6px;padding-left:0">${icon('heart')}<span></span></button>
      </div>
    </div>
    <div class="modal-actions">
      <div class="stepper" role="group" aria-label="Choose quantity"><button type="button" data-action="modal-dec" aria-label="Decrease quantity" disabled>${icon('minus')}</button><output id="modalQty" aria-live="polite">1</output><button type="button" data-action="modal-inc" aria-label="Increase quantity">${icon('plus')}</button></div>
      <button type="button" class="modal-add" data-action="modal-add" data-id="${esc(p.id)}"${available ? '' : ' disabled'}>${icon('bag')}Add to cart</button>
      <button type="button" class="modal-order" data-action="modal-order" data-id="${esc(p.id)}"${available ? '' : ' disabled'}>${icon('whatsapp')}Order on WhatsApp</button>
      </div>`;
  syncModalHeart();
  openOverlay('modal');
}
function syncModalHeart() {
  const btn = $('#modalWish'); if (!btn) return;
  const on = state.wishlist.has(btn.dataset.id);
  btn.setAttribute('aria-pressed', String(on));
  btn.style.color = on ? 'var(--heart)' : '';
  $('svg', btn).style.fill = on ? 'currentColor' : 'none';
  $('span', btn).textContent = on ? 'Saved to wishlist' : 'Save to wishlist';
}
function setGalleryIndex(i) {
  const p = getProduct(state.modal.id); if (!p) return;
  const images = productImages(p);
  const index = (i + images.length) % images.length;
  state.modal.index = index;
  const main = $('#modalMainImage');
  if (main) {
    main.classList.remove('is-placeholder'); delete main.dataset.fallback;
    main.src = images[index];
    main.alt = images.length > 1 ? `${p.name} — photo ${index + 1} of ${images.length}` : p.name;
  }
  $$('.modal-thumb').forEach((b, n) => b.setAttribute('aria-pressed', String(n === index)));
}
function setModalQty(qty) {
  state.modal.qty = clampQty(qty);
  $('#modalQty').textContent = state.modal.qty;
  $('[data-action="modal-dec"]').disabled = state.modal.qty <= 1;
  $('[data-action="modal-inc"]').disabled = state.modal.qty >= MAX_QTY;
}

/* ───────── 10. Search UI ───────── */
const searchWrap = () => $('#searchWrap');
function closeSearchPanel() {
  const panel = $('#searchPanel'); if (!panel || panel.hidden) return;
  panel.hidden = true; $('#searchInput').setAttribute('aria-expanded', 'false');
}
function renderSearchPanel() {
  const panel = $('#searchPanel');
  const q = state.query.trim();
  if (!q || !state.loaded) { closeSearchPanel(); return; }
  const results = searchAll(q);
  if (!results.length) {
    panel.innerHTML = `<div class="sp-empty" role="status"><p><strong>No match for “${esc(q)}”</strong></p><p>Check the spelling or try a broader word. You can also browse a category:</p>
      <div class="sp-chips">${state.categories.filter(c => c.id !== 'all').slice(0, 4).map(c => `<button type="button" class="sp-chip" data-action="search-category" data-category-id="${esc(c.id)}">${esc(c.label)}</button>`).join('')}</div></div>`;
  } else {
    const top = results.slice(0, 5);
    panel.innerHTML = `<div class="sp-head" role="status"><span><strong>${results.length}</strong> ${results.length === 1 ? 'match' : 'matches'}</span><span>Updating as you type</span></div>
      ${top.map(p => `<button type="button" class="sp-item" data-action="search-open" data-id="${esc(p.id)}" role="option"><img src="${esc(productImages(p)[0])}" alt="" width="40" height="48" decoding="async"><span class="sp-name">${esc(p.name)}</span><span class="sp-price">${esc(hasPrice(p) ? money(p.price) : 'Ask')}</span></button>`).join('')}
      <button type="button" class="sp-more" data-action="search-all">See all ${results.length} ${results.length === 1 ? 'result' : 'results'} ${icon('arrow')}</button>`;
  }
  panel.hidden = false;
  $('#searchInput').setAttribute('aria-expanded', 'true');
}
function applySearch() {
  const input = $('#searchInput');
  const value = input.value;
  $('#searchClear').hidden = !value;
  const wasEmpty = !normalize(state.query);
  state.query = value;
  if (wasEmpty && normalize(value) && state.activeCategory !== 'all') { state.activeCategory = 'all'; syncCategoryHighlights(); } // searching always starts from the whole catalogue
  renderProducts();
  renderSearchPanel();
}
function clearSearch(focus = true) {
  const input = $('#searchInput');
  input.value = ''; applySearch();
  if (focus) input.focus();
}
function onSearchInput() {
  $('#searchClear').hidden = !$('#searchInput').value;
  clearTimeout(searchTimer); clearTimeout(searchActivityTimer);
  searchTimer = setTimeout(applySearch, SEARCH_DEBOUNCE_MS);
  // Store a settled search query rather than every keystroke. This remains local to this browser.
  searchActivityTimer = setTimeout(() => { applySearch(); recordSearch(state.query, currentResults()); }, 850);
}
function onSearchKeydown(event) {
  const items = $$('.sp-item, .sp-more, .sp-chip', $('#searchPanel'));
  if (event.key === 'ArrowDown' && items.length && !$('#searchPanel').hidden) { event.preventDefault(); items[0].focus(); }
  else if (event.key === 'Escape') {
    if (!$('#searchPanel').hidden) { closeSearchPanel(); event.stopPropagation(); }
    else if (event.target.value) { clearSearch(false); }
  }
}
function onPanelKeydown(event) {
  const items = $$('.sp-item, .sp-more, .sp-chip', $('#searchPanel'));
  const i = items.indexOf(document.activeElement);
  if (event.key === 'ArrowDown') { event.preventDefault(); (items[i + 1] || items[0]).focus(); }
  else if (event.key === 'ArrowUp') { event.preventDefault(); if (i <= 0) $('#searchInput').focus(); else items[i - 1].focus(); }
  else if (event.key === 'Escape') { event.stopPropagation(); closeSearchPanel(); $('#searchInput').focus(); }
}
function submitSearch(event) {
  event.preventDefault();
  clearTimeout(searchTimer); clearTimeout(searchActivityTimer); applySearch(); recordSearch(state.query, currentResults()); closeSearchPanel();
  $('#searchInput').blur(); // dismiss the mobile keyboard
  scrollToCatalogue();
}

/* ───────── 11. Events (delegated) ───────── */
function onClick(event) {
  const catBtn = event.target.closest('[data-category]');
  if (catBtn && !event.target.closest('[data-action]')) {
    selectCategory(catBtn.dataset.category, !catBtn.closest('#categoryBar'));
    return;
  }
  const target = event.target.closest('[data-action]');
  if (!target) return;
  const { action, id } = target.dataset;
  switch (action) {
    case 'details': openProduct(id); break;
    case 'share': case 'modal-share': openShareDialog(id); break;
    case 'share-site': openWebsiteShareDialog(); break;
    case 'share-site-copy': copyWebsiteShareLink(); break;
    case 'share-site-native': nativeShareWebsite(); break;
    case 'share-category': openCategoryShareDialog(target.dataset.categoryId); break;
    case 'share-category-copy': copyCategoryShareLink(target.dataset.categoryId); break;
    case 'share-category-native': nativeShareCategory(target.dataset.categoryId); break;
    case 'share-copy': copyShareLink(id); break;
    case 'share-native': nativeShareProduct(id, false); break;
    case 'share-photo': nativeShareProduct(id, true); break;
    case 'wish': toggleWishlist(id); break;
    case 'add': addToCart(id, 1); break;
    case 'cart-inc': case 'drawer-inc': changeCartQty(id, 1); break;
    case 'cart-dec': case 'drawer-dec': changeCartQty(id, -1); break;
    case 'cart-remove': removeFromCart(id); break;
    case 'order': orderProduct(id, 1); break;
    case 'enquire': enquireProduct(id); break;
    case 'order-cart': orderCart(); break;
    case 'saved-add': addToCart(id, 1); break;
    case 'unsave':
      state.wishlist.delete(id); persistWishlist(); refreshHeart(id); renderDrawer(); renderRecommendations(); showToast('Removed from your wishlist'); break;
    case 'shop': closeOverlay(false); returnFocus = null; scrollToCatalogue(); break;
    case 'gallery': setGalleryIndex(Number(target.dataset.index) || 0); break;
    case 'gallery-prev': setGalleryIndex(state.modal.index - 1); break;
    case 'gallery-next': setGalleryIndex(state.modal.index + 1); break;
    case 'modal-dec': setModalQty(state.modal.qty - 1); break;
    case 'modal-inc': setModalQty(state.modal.qty + 1); break;
    case 'modal-wish': toggleWishlist(id); break;
    case 'modal-add': if (addToCart(id, state.modal.qty)) closeOverlay(); break;
    case 'modal-order': orderProduct(id, state.modal.qty); break;
    case 'modal-enquire': enquireProduct(id); break;
    case 'search-open': closeSearchPanel(); openProduct(id); break;
    case 'search-all': closeSearchPanel(); scrollToCatalogue(); break;
    case 'search-category': clearSearch(false); closeSearchPanel(); selectCategory(target.dataset.categoryId, true); break;
    case 'enable-alerts': enableBrowserAlerts(); break;
    case 'reset-activity': clearActivityInsights(); break;
    case 'retry': loadCatalogue(); break;
    default: break;
  }
}
function bindEvents() {
  document.addEventListener('click', onClick);
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && activeOverlay) { event.preventDefault(); closeOverlay(); }
    trapFocus(event);
  });
  // Broken product photos fall back to the branded placeholder (no broken-image icons).
  document.addEventListener('error', event => {
    const img = event.target;
    if (img instanceof HTMLImageElement && !img.dataset.fallback && !img.src.endsWith('product-placeholder.svg')) {
      img.dataset.fallback = '1'; img.classList.add('is-placeholder'); img.src = PLACEHOLDER;
    }
  }, true);

  $('#themeToggle').addEventListener('click', () => applyTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark', true));
  $('#sortSelect').addEventListener('change', event => { state.sort = event.target.value; renderProducts(); });
  $('#resetFilters').addEventListener('click', () => {
    state.activeCategory = 'all'; state.sort = 'featured'; $('#sortSelect').value = 'featured';
    $('#searchInput').value = ''; $('#searchClear').hidden = true; state.query = '';
    syncCategoryHighlights(); closeSearchPanel(); renderProducts(); renderRecommendations();
  });

  const input = $('#searchInput');
  input.addEventListener('input', onSearchInput);
  input.addEventListener('keydown', onSearchKeydown);
  input.addEventListener('focus', () => { if (input.value.trim()) renderSearchPanel(); });
  $('#searchForm').addEventListener('submit', submitSearch);
  $('#searchClear').addEventListener('click', () => clearSearch(true));
  $('#searchPanel').addEventListener('keydown', onPanelKeydown);
  searchWrap().addEventListener('focusout', event => { if (!searchWrap().contains(event.relatedTarget)) setTimeout(() => { if (!searchWrap().contains(document.activeElement)) closeSearchPanel(); }, 0); });
  document.addEventListener('pointerdown', event => { if (!searchWrap().contains(event.target)) closeSearchPanel(); });

  [['#savedButton', 'saved'], ['#mobileSavedButton', 'saved'], ['#cartButton', 'cart'], ['#mobileCartButton', 'cart']]
    .forEach(([sel, mode]) => $(sel).addEventListener('click', () => openDrawer(mode)));
  $('#mobileSearchButton').addEventListener('click', () => { window.scrollTo({ top: 0, behavior: scrollBehavior() }); input.focus({ preventScroll: true }); });
  $('#closeDrawer').addEventListener('click', () => closeOverlay());
  $('#closeProductModal').addEventListener('click', () => closeOverlay());
  $('#closeShare').addEventListener('click', () => closeOverlay());
  $('#drawerOverlay').addEventListener('click', e => { if (e.target === e.currentTarget) closeOverlay(); });
  $('#productModalOverlay').addEventListener('click', e => { if (e.target === e.currentTarget) closeOverlay(); });
  $('#shareOverlay').addEventListener('click', e => { if (e.target === e.currentTarget) closeOverlay(); });

  const installButtons = ['#headerInstallButton', '#installButton'].map(sel => $(sel)).filter(Boolean);
  async function requestInstall() {
    if (!state.installPrompt) {
      const isAppleMobile = /iphone|ipad|ipod/i.test(navigator.userAgent);
      showToast(isAppleMobile ? 'On iPhone/iPad: use Share → Add to Home Screen.' : 'Open your browser menu and choose Install app or Add to Home Screen.');
      return;
    }
    const promptEvent = state.installPrompt; state.installPrompt = null;
    try {
      await promptEvent.prompt();
      const choice = await promptEvent.userChoice.catch(() => null);
      if (choice && choice.outcome === 'accepted') { writeStorage('gharsansar:v1:installed', true); syncInstallButtons(); }
    } catch (_) {}
  }
  installButtons.forEach(button => button.addEventListener('click', requestInstall));
  syncInstallButtons();
  window.addEventListener('beforeinstallprompt', event => { event.preventDefault(); state.installPrompt = event; if (!isAppInstalled()) installButtons.forEach(b => { b.hidden = false; b.dataset.installReady = 'true'; b.title = 'Install GharSansar'; }); });
  window.addEventListener('appinstalled', () => { writeStorage('gharsansar:v1:installed', true); installButtons.forEach(b => { b.hidden = true; }); showToast('GharSansar is ready on your home screen.'); });
  if (window.matchMedia) { const standaloneQuery = window.matchMedia('(display-mode: standalone)'); if (standaloneQuery.addEventListener) standaloneQuery.addEventListener('change', syncInstallButtons); }

  // Keep several open tabs consistent.
  window.addEventListener('storage', event => {
    if (![STORAGE_KEYS.wishlist, STORAGE_KEYS.cart, STORAGE_KEYS.theme, STORAGE_KEYS.activity].includes(event.key)) return;
    if (event.key === STORAGE_KEYS.theme) { const t = savedTheme(); if (t) applyTheme(t, false); return; }
    if (event.key === STORAGE_KEYS.activity) { loadActivity(); renderRecommendations(); return; }
    loadSavedLists(); pruneUnknownIds(); updateCounts(); renderProducts(true); renderRecommendations();
    if (isOpen('drawer')) renderDrawer();
  });

  // Light deterrents against casual text selection, image dragging and mobile long-press menus.
  document.addEventListener('contextmenu', event => {
    if (event.target.closest('.pc-open img, .modal-gallery img, .modal-thumbs img, .share-product-preview img')) event.preventDefault();
  });
  document.addEventListener('dragstart', event => {
    if (event.target instanceof HTMLImageElement) event.preventDefault();
  });

  // Sticky-header offset for anchors and the sticky category bar.
  const header = $('#siteHeader');
  const measure = () => document.documentElement.style.setProperty('--header-h', getComputedStyle(header).position === 'sticky' ? `${header.offsetHeight}px` : '0px');
  measure(); window.addEventListener('resize', measure);
  if (window.ResizeObserver) new ResizeObserver(measure).observe(header);
}

/* ───────── 12. Init ───────── */
function pruneUnknownIds() {
  if (!state.loaded) return;
  const wl = [...state.wishlist].filter(id => state.byId.has(id));
  const cartIds = Object.keys(state.cart);
  const removedCart = cartIds.filter(id => !state.byId.has(id));
  if (wl.length !== state.wishlist.size) { state.wishlist = new Set(wl); persistWishlist(); }
  if (removedCart.length) { removedCart.forEach(id => delete state.cart[id]); persistCart(); }
}
async function loadCatalogue() {
  const grid = $('#productGrid');
  grid.setAttribute('aria-busy', 'true');
  try {
    const [pr, cr] = await Promise.all([fetch('./data/products.json', { cache: 'no-cache' }), fetch('./data/categories.json', { cache: 'no-cache' })]);
    if (!pr.ok || !cr.ok) throw new Error('Catalogue files could not be loaded.');
    const [products, categories] = await Promise.all([pr.json(), cr.json()]);
    if (!Array.isArray(products)) throw new Error('products.json is not a list.');
    state.products = products.filter(p => p && typeof p.id === 'string' && p.id).map(p => { p.name = String(p.name || p.id); p.__index = buildSearchIndex(p); return p; });
    state.byId = new Map(state.products.map(p => [p.id, p]));
    state.categories = Array.isArray(categories) ? categories.filter(c => c && c.id) : [];
    state.loaded = true;
    pruneUnknownIds();
    renderCategories(); renderProducts(true); renderRecommendations(); updateCounts();
    if ($('#searchInput').value) applySearch();
    const deepCategoryId = new URLSearchParams(window.location.search).get('category');
    if (deepCategoryId && state.categories.some(c => c.id === deepCategoryId)) {
      selectCategory(deepCategoryId, false);
      setTimeout(() => scrollToCatalogue(), 140);
    }
    const deepProductId = new URLSearchParams(window.location.search).get('product');
    if (deepProductId) {
      const deepProduct = getProduct(deepProductId);
      if (deepProduct) setTimeout(() => openProduct(deepProductId), 120);
      else showToast('This product link is no longer available. Browse the latest collection instead.');
    }
    recordVisitAndWelcome();
  } catch (error) {
    console.error(error);
    grid.hidden = false; $('#emptyState').hidden = true;
    grid.innerHTML = `<div class="state-card" style="flex-direction:column"><p>We couldn’t load the catalogue.<br>Please check your connection and try again. If you opened this file directly from a folder, use the GitHub Pages link or a local server instead.</p><button type="button" class="button button-primary" data-action="retry">Try again</button></div>`;
    grid.setAttribute('aria-busy', 'false');
    $('#resultCount').textContent = 'Catalogue unavailable';
  }
}
function recordVisitAndWelcome() {
  if (!state.activity) return;
  const now = Date.now();
  state.activity.visits += 1; state.activity.lastVisitAt = now;
  const today = new Date().toLocaleDateString('en-CA');
  const previouslyTracked = Boolean(readStorage(STORAGE_KEYS.release, '')) || Boolean(readStorage(STORAGE_KEYS.wishlist, null)) || Boolean(readStorage(STORAGE_KEYS.cart, null));
  const previousRelease = readStorage(STORAGE_KEYS.release, previouslyTracked ? 'p5' : '');
  const isUpdate = Boolean(previousRelease && previousRelease !== RELEASE_ID);
  writeStorage(STORAGE_KEYS.release, RELEASE_ID);
  if (isUpdate) {
    const message = 'Fresh finds have arrived at GharSansar — 32 new products are waiting for you.';
    showToast(message);
    if (readStorage(STORAGE_KEYS.alerts, false) === true && 'Notification' in window && Notification.permission === 'granted') {
      sendVisitNotification('New finds at GharSansar', '32 fresh products have joined the collection.', './?category=all');
    }
  } else if (state.activity.lastGreetingDate !== today) {
    const hour = new Date().getHours();
    const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
    let context = '';
    if (cartCount()) context = ' Your bag is saved just where you left it.';
    else if (state.wishlist.size) context = ' Your saved favourites are waiting for you.';
    else {
      const pref = recommendationProfile().topCategory;
      const cat = pref && state.categories.find(c=>c.id===pref[0]);
      if (cat) context = ` A few more ${cat.label.toLowerCase()} finds are waiting.`;
    }
    showToast(`${greeting}! Welcome to GharSansar.${context}`);
    state.activity.lastGreetingDate = today;
  } else if (cartCount()) {
    // Keep the welcome gentle: only a brief in-app message, never an interruptive random popup.
    showToast('Your GharSansar bag is safely saved on this device.');
  }
  saveActivity();
}
async function sendVisitNotification(title, body, categoryUrl) {
  try {
    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.ready;
      if (reg && reg.showNotification) await reg.showNotification(title, { body, icon: './assets/brand/gharsansar-app-icon-192.png', badge: './assets/brand/gharsansar-app-icon-192.png', tag: 'gharsansar-catalogue-update', data: { url: categoryUrl } });
    } else if ('Notification' in window) new Notification(title, { body, icon: './assets/brand/gharsansar-app-icon-192.png' });
  } catch (e) { console.warn('Visit notification could not be shown:', e); }
}
async function enableBrowserAlerts() {
  if (!('Notification' in window)) { showToast('This browser does not support notifications.'); return; }
  try {
    const permission = await Notification.requestPermission();
    if (permission === 'granted') { writeStorage(STORAGE_KEYS.alerts, true); renderRecommendations(); showToast('New-arrival alerts enabled for your next visits.'); }
    else showToast('Notifications were not enabled. You can still see updates when you visit.');
  } catch (_) { showToast('Could not enable browser alerts on this device.'); }
}
function clearActivityInsights() {
  if (!state.activity) return;
  state.activity.productViews = {}; state.activity.wishlistAdds = {}; state.activity.cartAdds = {}; state.activity.categoryViews = {}; state.activity.searchQueries = [];
  saveActivity(); renderRecommendations();
  showToast('Browsing insights cleared. Wishlist and cart remain saved.');
}
function isAppInstalled() {
  return Boolean((window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true || document.referrer.startsWith('android-app://') || readStorage('gharsansar:v1:installed', false) === true);
}
function syncInstallButtons() {
  const installed = isAppInstalled();
  ['#headerInstallButton','#installButton'].forEach(sel=>{ const b=$(sel); if(b) b.hidden=installed; });
}

async function registerServiceWorker() {
  if (!('serviceWorker' in navigator) || location.protocol === 'file:') return;
  try { await navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' }); }
  catch (error) { console.warn('Service worker registration skipped:', error); }
}
function init() {
  $('#currentYear').textContent = new Date().getFullYear();
  const wa = $('#footerWhatsApp'); if (wa) wa.href = waLink('Namaste GharSansar! I have a product enquiry.');
  initTheme();
  loadSavedLists();
  loadActivity();
  bindEvents();
  updateCounts();
  loadCatalogue();
  registerServiceWorker();
}
init();
