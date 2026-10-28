/* Aangan Finds — front-end only starter store.
 * Change WHATSAPP_NUMBER to country code + number, with no +, spaces or dashes.
 */
const WHATSAPP_NUMBER = '917568443870';
const STORAGE_KEYS = { wishlist: 'aangan-finds:wishlist:v1', cart: 'aangan-finds:cart:v1', theme: 'aangan-finds:theme' };

const state = {
  products: [],
  categories: [],
  activeCategory: 'all',
  query: '',
  sort: 'featured',
  wishlist: new Set(readStorage(STORAGE_KEYS.wishlist, [])),
  cart: readStorage(STORAGE_KEYS.cart, {}),
  cardQty: {},
  modalQty: 1,
  drawerMode: 'cart',
  installPrompt: null,
  toastTimer: null,
};

const el = (selector, root = document) => root.querySelector(selector);
const els = (selector, root = document) => [...root.querySelectorAll(selector)];

function readStorage(key, fallback) {
  try {
    const parsed = JSON.parse(localStorage.getItem(key));
    return parsed ?? fallback;
  } catch (error) {
    return fallback;
  }
}
function writeStorage(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); }
  catch (error) { showToast('Your browser could not save this change.'); }
}
function escapeHtml(value = '') {
  return String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
}
function money(value) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(Number(value) || 0);
}
function getProduct(id) { return state.products.find(product => product.id === id); }
function activeProducts() { return state.products.filter(product => product.active !== false); }
function cartCount() { return Object.values(state.cart).reduce((sum, quantity) => sum + Math.max(0, Number(quantity) || 0), 0); }
function persistWishlist() { writeStorage(STORAGE_KEYS.wishlist, [...state.wishlist]); updateCounts(); }
function persistCart() { writeStorage(STORAGE_KEYS.cart, state.cart); updateCounts(); }

function applyTheme(theme, persist = true) {
  const selected = theme === 'dark' ? 'dark' : 'light';
  document.documentElement.dataset.theme = selected;
  const isDark = selected === 'dark';
  const toggle = el('#themeToggle');
  if (toggle) {
    toggle.setAttribute('aria-pressed', String(isDark));
    toggle.setAttribute('aria-label', isDark ? 'Switch to light mode' : 'Switch to dark mode');
    toggle.title = isDark ? 'Switch to light mode' : 'Switch to dark mode';
  }
  const glyph = el('#themeToggleGlyph');
  if (glyph) glyph.textContent = isDark ? '☀' : '☾';
  const meta = el('#themeColorMeta');
  if (meta) meta.setAttribute('content', isDark ? '#191418' : '#401a25');
  if (persist) {
    try { localStorage.setItem(STORAGE_KEYS.theme, selected); }
    catch (_) { /* Theme still works for this page view if storage is unavailable. */ }
  }
}

async function init() {
  el('#currentYear').textContent = new Date().getFullYear();
  let savedTheme = 'light';
  try { savedTheme = localStorage.getItem(STORAGE_KEYS.theme) === 'dark' ? 'dark' : 'light'; } catch (_) {}
  applyTheme(document.documentElement.dataset.theme || savedTheme, false);
  try {
    const [productsResponse, categoriesResponse] = await Promise.all([
      fetch('./data/products.json', { cache: 'no-cache' }),
      fetch('./data/categories.json', { cache: 'no-cache' }),
    ]);
    if (!productsResponse.ok || !categoriesResponse.ok) throw new Error('Catalogue files could not be loaded.');
    const [products, categories] = await Promise.all([productsResponse.json(), categoriesResponse.json()]);
    state.products = Array.isArray(products) ? products : [];
    state.categories = Array.isArray(categories) ? categories : [];
    // Protect saved data from stale or malformed product IDs.
    state.wishlist = new Set([...state.wishlist].filter(id => state.products.some(p => p.id === id)));
    for (const id of Object.keys(state.cart)) if (!state.products.some(p => p.id === id)) delete state.cart[id];
    persistWishlist(); persistCart();
    renderCategories(); renderProducts(); updateCounts();
    el('#productGrid').setAttribute('aria-busy', 'false');
  } catch (error) {
    console.error(error);
    el('#productGrid').innerHTML = `<div class="loading-card"><span class="loading-sun">✦</span><span>Catalogue load nahi ho paaya. Please website ko local server ya GitHub Pages se open karein — directly index.html par double-click na karein.</span></div>`;
    el('#productGrid').setAttribute('aria-busy', 'false');
  }
  bindEvents();
  registerServiceWorker();
}

function renderCategories() {
  const bar = el('#categoryBar');
  bar.innerHTML = state.categories.map(category => {
    const active = category.id === state.activeCategory ? ' active' : '';
    return `<button class="category-chip${active}" type="button" data-category="${escapeHtml(category.id)}">${escapeHtml(category.label)} <span aria-hidden="true">${escapeHtml(category.symbol || '✦')}</span></button>`;
  }).join('');
}

function normalizeSearchText(value = '') {
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

// Small, dependency-free Levenshtein distance for typo-tolerant search.
function editDistance(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  if (Math.abs(a.length - b.length) > 2) return Math.abs(a.length - b.length);
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min(current[j - 1] + 1, previous[j] + 1, previous[j - 1] + cost);
      rowMin = Math.min(rowMin, current[j]);
    }
    if (rowMin > 2) return rowMin;
    previous = current;
  }
  return previous[b.length];
}

function productSearchFields(product) {
  const specs = Object.entries(product.specifications || {}).flatMap(([key, value]) => [key, value]);
  return [
    { text: normalizeSearchText(product.name), weight: 5 },
    { text: normalizeSearchText(product.categoryLabel || product.category), weight: 2 },
    { text: normalizeSearchText((product.tags || []).join(' ')), weight: 3.2 },
    { text: normalizeSearchText(product.shortDescription || ''), weight: 1.7 },
    { text: normalizeSearchText(product.description || ''), weight: 1.2 },
    { text: normalizeSearchText(specs.join(' ')), weight: 1.1 },
  ].filter(field => field.text);
}

function fuzzyDistance(a, b) {
  const distance = editDistance(a, b);
  if (distance <= 1 || a.length !== b.length) return distance;
  // Treat a single adjacent-letter swap (e.g. ligths → lights) as one typo.
  for (let i = 0; i < a.length - 1; i++) {
    if (a[i] !== b[i] && a[i] === b[i + 1] && a[i + 1] === b[i] && a.slice(i + 2) === b.slice(i + 2)) return 1;
  }
  return distance;
}

function scoreTokenAgainstField(queryToken, fieldText, weight) {
  if (!fieldText) return 0;
  const words = fieldText.split(' ');
  if (words.includes(queryToken)) return 10 * weight;
  // Short queries are prefix-only, avoiding noisy matches on every single letter.
  if (queryToken.length <= 2) return words.some(word => word.startsWith(queryToken)) ? 4.8 * weight : 0;
  if (fieldText.includes(queryToken)) return 8.5 * weight;

  let best = 0;
  for (const word of words) {
    if (word.startsWith(queryToken)) {
      best = Math.max(best, 7.6 * weight);
      continue;
    }
    if (queryToken.length < 3 || word.length < 3) continue;
    // Permit one typo for short/medium words and two for longer ones/transpositions.
    const maxDistance = queryToken.length >= 7 ? 2 : 1;
    if (Math.abs(word.length - queryToken.length) > maxDistance) continue;
    const distance = fuzzyDistance(queryToken, word);
    if (distance <= maxDistance) {
      const similarity = 1 - distance / Math.max(queryToken.length, word.length);
      best = Math.max(best, (5.7 + similarity * 1.2) * weight);
    }
  }
  return best;
}

function scoreProduct(product, normalizedQuery) {
  if (!normalizedQuery) return 0;
  const queryTokens = normalizedQuery.split(/\s+/).filter(Boolean);
  let fields = productSearchFields(product);
  // At one or two characters, prefer product/category words over tags and descriptions.
  if (normalizedQuery.length <= 2) fields = fields.slice(0, 2);
  let total = 0;
  for (const token of queryTokens) {
    let tokenBest = 0;
    for (const field of fields) tokenBest = Math.max(tokenBest, scoreTokenAgainstField(token, field.text, field.weight));
    if (!tokenBest) return 0; // Every search word must match somewhere, exact or fuzzy.
    total += tokenBest;
  }
  // Slight bonus for the complete phrase in the product name.
  const name = normalizeSearchText(product.name);
  if (name.includes(normalizedQuery)) total += 8;
  return total / queryTokens.length;
}

function sortProducts(products) {
  if (state.sort === 'price-low') return products.sort((a, b) => a.price - b.price);
  if (state.sort === 'price-high') return products.sort((a, b) => b.price - a.price);
  if (state.sort === 'name') return products.sort((a, b) => a.name.localeCompare(b.name));
  return products.sort((a, b) => Number(b.featured) - Number(a.featured) || a.id.localeCompare(b.id));
}

function filteredProducts() {
  let products = activeProducts();
  if (state.activeCategory !== 'all') products = products.filter(product => product.category === state.activeCategory);
  const query = normalizeSearchText(state.query);
  if (query) {
    products = products
      .map(product => ({ product, score: scoreProduct(product, query) }))
      .filter(result => result.score > 0)
      .sort((a, b) => b.score - a.score)
      .map(result => result.product);
    // Keep fuzzy relevance first; user's price/name sort applies within equally relevant matches.
    if (state.sort !== 'featured') {
      const scored = products.map(product => ({ product, score: scoreProduct(product, query) }));
      const grouped = new Map();
      for (const item of scored) {
        const key = Math.round(item.score * 10) / 10;
        if (!grouped.has(key)) grouped.set(key, []);
        grouped.get(key).push(item.product);
      }
      products = [...grouped.entries()].sort((a, b) => b[0] - a[0]).flatMap(([, group]) => sortProducts(group));
    }
    return products;
  }
  return sortProducts(products);
}

function renderProducts() {
  const products = filteredProducts();
  const grid = el('#productGrid');
  el('#resultCount').textContent = state.query.trim() ? `${products.length} ${products.length === 1 ? 'match' : 'matches'}` : `${products.length} ${products.length === 1 ? 'little find' : 'little finds'}`;
  el('#emptyState').classList.toggle('hidden', products.length > 0);
  grid.classList.toggle('hidden', products.length === 0);
  if (!products.length) { grid.innerHTML = ''; return; }
  grid.innerHTML = products.map(product => productCard(product)).join('');
  grid.setAttribute('aria-busy', 'false');
}

function productCard(product) {
  const wished = state.wishlist.has(product.id);
  const qty = Math.max(1, Number(state.cardQty[product.id]) || 1);
  const src = product.images?.[0] || './assets/brand/logo.svg';
  return `<article class="product-card" data-product-card="${escapeHtml(product.id)}">
    <div class="product-visual" data-action="details" data-id="${escapeHtml(product.id)}" tabindex="0" role="button" aria-label="View details for ${escapeHtml(product.name)}">
      <img src="${escapeHtml(src)}" alt="Product photo for ${escapeHtml(product.name)}" loading="lazy" decoding="async" onerror="this.onerror=null;this.src='./assets/brand/logo.svg'">
      <span class="product-badge">${escapeHtml(product.badge || 'A little find')}</span>
      <div class="product-quick-actions">
        <button class="round-action${wished ? ' is-active' : ''}" type="button" data-action="wishlist" data-id="${escapeHtml(product.id)}" aria-label="${wished ? 'Remove from' : 'Save to'} wishlist" aria-pressed="${wished}">${wished ? '♥' : '♡'}</button>
        <button class="round-action" type="button" data-action="add-bag" data-id="${escapeHtml(product.id)}" aria-label="Add ${escapeHtml(product.name)} to bag" title="Add to bag">＋</button>
      </div>
    </div>
    <div class="product-info">
      <p class="product-category">${escapeHtml(product.categoryLabel || 'Aangan Finds')}</p>
      <h3 class="product-name" data-action="details" data-id="${escapeHtml(product.id)}" tabindex="0">${escapeHtml(product.name)}</h3>
      <p class="product-description-short">${escapeHtml(product.shortDescription || '')}</p>
      <div class="price-row"><span class="product-price">${money(product.price)}</span><span class="price-note">per item</span></div>
      <div class="quantity-line"><span class="quantity-label">Choose quantity</span><div class="qty-stepper" aria-label="Quantity for ${escapeHtml(product.name)}"><button type="button" data-action="card-qty" data-id="${escapeHtml(product.id)}" data-delta="-1" aria-label="Decrease quantity">−</button><output data-qty-value="${escapeHtml(product.id)}">${qty}</output><button type="button" data-action="card-qty" data-id="${escapeHtml(product.id)}" data-delta="1" aria-label="Increase quantity">+</button></div></div>
      <div class="product-actions"><button type="button" class="product-order" data-action="order" data-id="${escapeHtml(product.id)}">↗ Order</button><button type="button" class="product-enquire" data-action="enquire" data-id="${escapeHtml(product.id)}">Ask us</button></div>
      <div class="product-bottom-line"><button type="button" class="detail-link" data-action="details" data-id="${escapeHtml(product.id)}">Details & specs ↗</button><button type="button" class="add-bag-link" data-action="add-bag" data-id="${escapeHtml(product.id)}">+ Add to bag</button></div>
    </div>
  </article>`;
}

function updateCounts() {
  const total = cartCount();
  el('#cartCount').textContent = total ? total : '';
  el('#savedCount').textContent = state.wishlist.size ? state.wishlist.size : '';
  el('#mobileCartCount').textContent = total ? total : '';
  el('#mobileSavedCount').textContent = state.wishlist.size ? state.wishlist.size : '';
  el('#mobileCartCount').classList.toggle('hidden', !total);
  el('#mobileSavedCount').classList.toggle('hidden', !state.wishlist.size);
}

function selectCategory(id) {
  state.activeCategory = id;
  renderCategories(); renderProducts();
}
function toggleWishlist(id) {
  if (state.wishlist.has(id)) { state.wishlist.delete(id); showToast('Removed from your saved finds.'); }
  else { state.wishlist.add(id); showToast('Saved for later ♡'); }
  persistWishlist(); renderProducts();
  if (!el('#drawerOverlay').classList.contains('hidden') && state.drawerMode === 'saved') renderDrawer('saved');
}
function addToCart(id, qty = 1) {
  const product = getProduct(id);
  if (!product) return;
  const safeQty = Math.max(1, Math.min(99, Number(qty) || 1));
  state.cart[id] = Math.min(99, (Number(state.cart[id]) || 0) + safeQty);
  persistCart();
  showToast(`${product.name} added to your bag.`);
}
function setCartQty(id, qty) {
  const safeQty = Math.max(0, Math.min(99, Number(qty) || 0));
  if (safeQty === 0) delete state.cart[id]; else state.cart[id] = safeQty;
  persistCart(); renderDrawer(state.drawerMode);
}
function removeFromCart(id) { delete state.cart[id]; persistCart(); renderDrawer('cart'); showToast('Removed from your bag.'); }
function showToast(message) {
  const toast = el('#toast'); toast.textContent = message; toast.classList.add('visible');
  clearTimeout(state.toastTimer); state.toastTimer = setTimeout(() => toast.classList.remove('visible'), 2400);
}

function waLink(message) { return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`; }
function openWhatsApp(message) {
  const url = waLink(message);
  const newWindow = window.open(url, '_blank');
  if (newWindow) newWindow.opener = null;
  else window.location.href = url;
}
function orderMessage(items) {
  const lines = items.map(({ product, qty }) => `• ${product.name} (ID: ${product.id})\n  Qty: ${qty} × ${money(product.price)} = ${money(product.price * qty)}`);
  const total = items.reduce((sum, item) => sum + item.product.price * item.qty, 0);
  return `Namaste! I would like to place an order from Aangan Finds.\n\n${lines.join('\n\n')}\n\nSubtotal: ${money(total)}\nPlease confirm availability, delivery charges, and the final payable amount before confirming my order. Thank you!`;
}
function orderSingle(id, qty) {
  const product = getProduct(id); if (!product) return;
  openWhatsApp(orderMessage([{ product, qty: Math.max(1, Number(qty) || 1) }]));
}
function enquiryMessage(product) {
  return `Namaste! I would like to enquire about this product on Aangan Finds.\n\nProduct: ${product.name}\nProduct ID: ${product.id}\nDisplayed price: ${money(product.price)}\n\nCould you please share more details and confirm current availability? Thank you!`;
}
function enquireSingle(id) { const product = getProduct(id); if (product) openWhatsApp(enquiryMessage(product)); }
function orderCart() {
  const items = Object.entries(state.cart).map(([id, qty]) => ({ product: getProduct(id), qty: Number(qty) })).filter(item => item.product && item.qty > 0);
  if (!items.length) { showToast('Your bag is empty for now.'); return; }
  openWhatsApp(orderMessage(items));
}

function openDrawer(mode) {
  state.drawerMode = mode;
  renderDrawer(mode);
  el('#drawerOverlay').classList.remove('hidden');
  el('#drawerOverlay').setAttribute('aria-hidden', 'false');
  document.body.classList.add('no-scroll');
  el('#closeDrawer').focus();
}
function closeDrawer() {
  el('#drawerOverlay').classList.add('hidden');
  el('#drawerOverlay').setAttribute('aria-hidden', 'true');
  document.body.classList.remove('no-scroll');
}
function renderDrawer(mode) {
  state.drawerMode = mode;
  const isSaved = mode === 'saved';
  el('#drawerEyebrow').textContent = isSaved ? 'THE THINGS YOU LOVED' : 'YOUR LITTLE COLLECTION';
  el('#drawerTitle').textContent = isSaved ? 'Saved finds' : 'Your bag';
  const content = el('#drawerContent');
  if (isSaved) {
    const products = [...state.wishlist].map(getProduct).filter(Boolean);
    if (!products.length) {
      content.innerHTML = `<div class="drawer-empty"><div class="empty-illustration">♡</div><h3>Save a little something.</h3><p>Tap the heart on anything you love. It will be waiting here when you come back on this browser.</p><button class="button button-primary" type="button" data-action="close-drawer-shop">Back to browsing ↗</button></div>`;
      return;
    }
    content.innerHTML = `<div class="saved-list">${products.map(product => drawerItem(product, 1, true)).join('')}</div><div style="padding-top:18px"><button class="drawer-secondary" type="button" data-action="close-drawer-shop">Keep browsing</button></div>`;
    return;
  }
  const items = Object.entries(state.cart).map(([id, qty]) => ({ product: getProduct(id), qty: Number(qty) })).filter(item => item.product && item.qty > 0);
  if (!items.length) {
    content.innerHTML = `<div class="drawer-empty"><div class="empty-illustration">✦</div><h3>Your bag feels a little light.</h3><p>When something catches your eye, add it here. You can adjust quantities before sending your order on WhatsApp.</p><button class="button button-primary" type="button" data-action="close-drawer-shop">Explore the finds ↗</button></div>`;
    return;
  }
  const subtotal = items.reduce((sum, item) => sum + item.product.price * item.qty, 0);
  content.innerHTML = `<div class="cart-item-list">${items.map(item => drawerItem(item.product, item.qty, false)).join('')}</div><div class="drawer-footer"><div class="drawer-total"><span>Estimated subtotal</span><strong>${money(subtotal)}</strong></div><p class="drawer-small-note">Delivery charges and availability are confirmed over WhatsApp. This is not a payment or confirmed order yet.</p><button class="drawer-checkout" type="button" data-action="order-cart">↗ Continue on WhatsApp</button><button class="drawer-secondary" type="button" data-action="close-drawer-shop">Keep browsing</button></div>`;
}
function drawerItem(product, qty, saved) {
  const image = product.images?.[0] || './assets/brand/logo.svg';
  return `<div class="drawer-item" data-drawer-id="${escapeHtml(product.id)}"><img src="${escapeHtml(image)}" alt="" loading="lazy"><div><p class="product-category">${escapeHtml(product.categoryLabel || '')}</p><h3>${escapeHtml(product.name)}</h3><div class="drawer-item-price">${money(product.price)}${saved ? '' : ` <span style="font-weight:400;color:#a58f84">each</span>`}</div>${saved ? `<div class="drawer-item-controls"><button class="remove-text" type="button" data-action="unsave" data-id="${escapeHtml(product.id)}">Remove saved</button><button class="remove-text" type="button" data-action="details" data-id="${escapeHtml(product.id)}">Details</button></div>` : `<div class="drawer-item-controls"><div class="qty-stepper"><button type="button" data-action="cart-qty" data-id="${escapeHtml(product.id)}" data-delta="-1" aria-label="Decrease quantity">−</button><output>${qty}</output><button type="button" data-action="cart-qty" data-id="${escapeHtml(product.id)}" data-delta="1" aria-label="Increase quantity">+</button></div><button class="remove-text" type="button" data-action="remove-cart" data-id="${escapeHtml(product.id)}">Remove</button></div>`}</div><button class="remove-item" type="button" data-action="${saved ? 'unsave' : 'remove-cart'}" data-id="${escapeHtml(product.id)}" aria-label="${saved ? 'Remove saved item' : 'Remove from bag'}">×</button></div>`;
}

function openProductModal(id) {
  const product = getProduct(id); if (!product) return;
  state.modalQty = Math.max(1, Number(state.cardQty[id]) || 1);
  const images = Array.isArray(product.images) && product.images.length ? product.images : ['./assets/brand/logo.svg'];
  const image = images[0];
  const specs = Object.entries(product.specifications || {}).map(([key, value]) => `<div class="spec-row"><span>${escapeHtml(key)}</span><span>${escapeHtml(value)}</span></div>`).join('');
  const gallery = images.length > 1 ? `<div class="modal-gallery-thumbs" aria-label="More product photos">${images.map((src, index) => `<button type="button" class="modal-gallery-thumb${index === 0 ? ' active' : ''}" data-action="modal-image" data-id="${escapeHtml(product.id)}" data-index="${index}" aria-label="View photo ${index + 1}" aria-pressed="${index === 0}"><img src="${escapeHtml(src)}" alt="" loading="lazy"></button>`).join('')}</div>` : '';
  el('#productModalContent').innerHTML = `<div class="modal-product-layout"><div class="modal-gallery"><div class="modal-product-image"><img id="modalMainImage" src="${escapeHtml(image)}" alt="Product photo for ${escapeHtml(product.name)}" onerror="this.onerror=null;this.src='./assets/brand/logo.svg'"></div>${gallery}</div><div class="modal-product-info"><p class="product-category">${escapeHtml(product.categoryLabel || '')}</p><h2 id="modalProductName">${escapeHtml(product.name)}</h2><div class="modal-price">${money(product.price)}</div><p class="modal-description">${escapeHtml(product.description || '')}</p>${specs ? `<div class="spec-list">${specs}</div>` : ''}<div class="modal-quantity-row"><label for="modalQtyOutput">Choose quantity</label><div class="qty-stepper"><button type="button" data-action="modal-qty" data-delta="-1" aria-label="Decrease quantity">−</button><output id="modalQtyOutput">${state.modalQty}</output><button type="button" data-action="modal-qty" data-delta="1" aria-label="Increase quantity">+</button></div></div><div class="modal-actions"><button class="modal-order" type="button" data-action="modal-order" data-id="${escapeHtml(product.id)}">↗ Order on WhatsApp</button><button class="modal-add" type="button" data-action="modal-add" data-id="${escapeHtml(product.id)}">＋ Add quantity to bag</button><button class="modal-enquire" type="button" data-action="modal-enquire" data-id="${escapeHtml(product.id)}">Ask a question about this product</button></div></div></div>`;
  el('#productModalOverlay').classList.remove('hidden');
  el('#productModalOverlay').setAttribute('aria-hidden', 'false');
  document.body.classList.add('no-scroll');
  el('#closeProductModal').focus();
}
function closeProductModal() {
  el('#productModalOverlay').classList.add('hidden');
  el('#productModalOverlay').setAttribute('aria-hidden', 'true');
  document.body.classList.remove('no-scroll');
}
function updateCardQty(id, delta) {
  state.cardQty[id] = Math.max(1, Math.min(99, (Number(state.cardQty[id]) || 1) + delta));
  const output = el(`[data-qty-value="${CSS.escape(id)}"]`);
  if (output) output.textContent = state.cardQty[id];
}

function bindEvents() {
  el('#themeToggle').addEventListener('click', () => applyTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'));
  el('#searchForm').addEventListener('submit', event => { event.preventDefault(); state.query = el('#searchInput').value; renderProducts(); el('#catalogue').scrollIntoView({ behavior: 'smooth', block: 'start' }); });
  el('#searchInput').addEventListener('input', event => { state.query = event.target.value; renderProducts(); });
  el('#sortSelect').addEventListener('change', event => { state.sort = event.target.value; renderProducts(); });
  el('#categoryBar').addEventListener('click', event => { const button = event.target.closest('[data-category]'); if (button) selectCategory(button.dataset.category); });
  el('#resetFilters').addEventListener('click', () => { state.query = ''; state.activeCategory = 'all'; state.sort = 'featured'; el('#searchInput').value = ''; el('#sortSelect').value = 'featured'; renderCategories(); renderProducts(); });
  el('#productGrid').addEventListener('click', handleAction);
  el('#productGrid').addEventListener('keydown', event => { if ((event.key === 'Enter' || event.key === ' ') && event.target.matches('[data-action="details"][tabindex="0"]')) { event.preventDefault(); openProductModal(event.target.dataset.id); } });
  el('#savedButton').addEventListener('click', () => openDrawer('saved'));
  el('#cartButton').addEventListener('click', () => openDrawer('cart'));
  el('#mobileSavedButton').addEventListener('click', () => openDrawer('saved'));
  el('#mobileCartButton').addEventListener('click', () => openDrawer('cart'));
  el('#mobileSearchButton').addEventListener('click', () => { el('#searchInput').focus(); window.scrollTo({ top: 0, behavior: 'smooth' }); });
  el('#closeDrawer').addEventListener('click', closeDrawer);
  el('#drawerOverlay').addEventListener('click', event => { if (event.target === el('#drawerOverlay')) closeDrawer(); });
  el('#drawerContent').addEventListener('click', handleAction);
  el('#closeProductModal').addEventListener('click', closeProductModal);
  el('#productModalOverlay').addEventListener('click', event => { if (event.target === el('#productModalOverlay')) closeProductModal(); });
  el('#productModalContent').addEventListener('click', handleAction);
  document.addEventListener('keydown', event => { if (event.key === 'Escape') { closeDrawer(); closeProductModal(); } });
  el('#installButton').addEventListener('click', async () => {
    if (!state.installPrompt) { showToast('On your browser, use Menu → Add to Home Screen / Install app.'); return; }
    state.installPrompt.prompt(); await state.installPrompt.userChoice; state.installPrompt = null; el('#installButton').classList.add('hidden');
  });
  window.addEventListener('beforeinstallprompt', event => { event.preventDefault(); state.installPrompt = event; el('#installButton').classList.remove('hidden'); });
  window.addEventListener('appinstalled', () => { el('#installButton').classList.add('hidden'); showToast('Aangan Finds is ready on your home screen.'); });
}

function handleAction(event) {
  const target = event.target.closest('[data-action]'); if (!target) return;
  const { action, id } = target.dataset;
  if (action === 'wishlist') { event.stopPropagation(); toggleWishlist(id); }
  else if (action === 'add-bag') { event.stopPropagation(); addToCart(id, state.cardQty[id] || 1); }
  else if (action === 'order') { orderSingle(id, state.cardQty[id] || 1); }
  else if (action === 'enquire') { enquireSingle(id); }
  else if (action === 'details') { openProductModal(id); }
  else if (action === 'card-qty') { event.stopPropagation(); updateCardQty(id, Number(target.dataset.delta) || 0); }
  else if (action === 'cart-qty') { const current = Number(state.cart[id]) || 0; setCartQty(id, current + Number(target.dataset.delta || 0)); }
  else if (action === 'remove-cart') { removeFromCart(id); }
  else if (action === 'unsave') { state.wishlist.delete(id); persistWishlist(); renderProducts(); renderDrawer('saved'); showToast('Removed from saved finds.'); }
  else if (action === 'close-drawer-shop') { closeDrawer(); el('#catalogue').scrollIntoView({ behavior: 'smooth', block: 'start' }); }
  else if (action === 'order-cart') { orderCart(); }
  else if (action === 'modal-image') { const product = getProduct(id); const image = product?.images?.[Number(target.dataset.index)]; if (image) { const main = el('#modalMainImage'); if (main) { main.src = image; main.alt = `Product photo for ${product.name}`; } els('.modal-gallery-thumb', el('#productModalContent')).forEach(button => { const active = Number(button.dataset.index) === Number(target.dataset.index); button.classList.toggle('active', active); button.setAttribute('aria-pressed', String(active)); }); } }
  else if (action === 'modal-qty') { state.modalQty = Math.max(1, Math.min(99, state.modalQty + Number(target.dataset.delta || 0))); const output = el('#modalQtyOutput'); if (output) output.textContent = state.modalQty; }
  else if (action === 'modal-order') { orderSingle(id, state.modalQty); }
  else if (action === 'modal-add') { addToCart(id, state.modalQty); closeProductModal(); }
  else if (action === 'modal-enquire') { enquireSingle(id); }
}

async function registerServiceWorker() {
  if (!('serviceWorker' in navigator) || location.protocol === 'file:') return;
  try { await navigator.serviceWorker.register('./sw.js'); }
  catch (error) { console.warn('Service worker registration skipped:', error); }
}

init();
