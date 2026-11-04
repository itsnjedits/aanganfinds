# GharSansar — Version 8 (Duplicate Product Cleanup)

**Brand:** GharSansar · हर घर की पसंद · **Repo / Pages path:** `aanganfinds`
**Stack:** plain HTML, CSS, JavaScript, JSON catalogue, local images, PWA. No build step, no backend, no trackers.
**Catalogue:** 196 unique products · 277 mapped product images · 9 categories (including Old Books). Product photos are kept in `product_images/` and can be added separately.


## What's new in V8
- Fixed duplicate product listings: the seven products previously appeared once under `AF-P6-001`–`AF-P6-007` and again under `AF-P7-001`–`AF-P7-007`.
- Kept the original `AF-P6` records as the canonical products because their image filenames and existing share URLs are already in use. Removed the duplicate `AF-P7` records, image-index entries and share-page folders.
- The catalogue now contains 196 unique product records and 277 image mappings. No existing canonical product IDs, prices, or image paths were changed.
- Regenerated 196 product share pages and 10 category share pages, updated category share counts, and bumped the service-worker cache version.
- Added a `product_images/.gitkeep` placeholder; keep your existing product photographs in this folder when replacing project files.

## What's new in V6
- Added 8 House of Avika bracelet designs under Artificial Jewellery, priced exactly as shown in the supplied catalogue (₹100 each).
- Added a new Old Books category with 11 pre-loved books, author details and the printed catalogue prices.
- Added front/back cover gallery images where supplied; front cover is the first image used for the product card and social preview.
- Added the Old Books category tile, navigation filter, icon and category artwork.
- Regenerated static share pages for all 189 products and bumped the service-worker cache version.

## What's new in V5
- Premium GharSansar mixed-script logo and product-led homepage hero artwork, matched to the deep maroon and gold brand palette. The translucent logo is placed on its matching burgundy header/footer background.
- Header-level Install App action, with browser-specific guidance when the native install prompt is unavailable.
- GharSansar Share Engine: product share buttons on cards and details, WhatsApp and Telegram links, copy link, native share, and share-photo support where the device allows it. Homepage-level Open Graph and Twitter metadata are included too.
- Static per-product share pages under `products/<slug>/index.html`, including Open Graph and Twitter metadata so social crawlers can render product name, price and image without JavaScript.
- Deep-link handling: opening a shared product URL redirects into the storefront and opens that exact product.

## What was already included in V3
- Warm ivory / maroon / muted-gold design system (CSS variables for colour, type, spacing, radii, shadows, motion).
- Mobile-first layout: 2-column phone grid, bottom navigation, bottom-sheet product view, 44px touch targets, safe-area aware.
- Desktop hover effects only inside `@media (hover: hover) and (pointer: fine)`; reduced-motion respected.
- Consistent SVG icon set (no emoji glyph icons); Playfair Display / DM Sans / Noto Sans Devanagari with system fallbacks.
- Light/dark audited component by component; saved theme or system preference, applied before first paint.
- Live typo-tolerant search with suggestion dropdown, keyboard support, clear button and a helpful no-results state.
- Cart: inline stepper on each card, quantity never below 1, explicit Remove, double-tap protection.
- Wishlist and cart survive corrupted / blocked localStorage; unknown product IDs are ignored safely.
- Accessible dialogs: focus trap, Escape, focus returns to the opener, background made inert.
- Service worker: network-first for app files and catalogue, stale-while-revalidate for photos; old caches are deleted.

## Files
| File | Purpose |
|---|---|
| `index.html` | Page structure, icon sprite, early theme script |
| `css/styles.css` | Design tokens and all components |
| `js/app.js` | Catalogue, search, wishlist, cart, WhatsApp, dialogs |
| `sw.js` | Offline/PWA caching — **bump `VERSION` on every release** |
| `data/*.json` | Products, categories, image map (unchanged) |
| `tools/validate_catalogue.py` | Catalogue + image validator |
| `tools/generate_share_pages.py` | Generates static social-preview and deep-link pages for every product |

## Share Engine
- Each static product page includes Open Graph, Twitter Card, canonical URL and product price metadata. Product photos must exist at the mapped public URL for social platforms to show the photo preview.
- Generate or refresh static product pages after adding products: `py tools/generate_share_pages.py`.
- The default canonical site URL is `https://itsnjedits.github.io/aanganfinds/`. For a different domain, pass `--base-url`.
- Each product share page uses the product's first mapped image for social previews. Product images must be uploaded to `product_images/` with the exact filenames in `data/products.json` for previews to show product photography.
- Product links use the stable `products/<slug>/` route. Visitors are redirected to `index.html?product=<ID>` and the app opens that product.
- WhatsApp, Telegram, copy-link, native device share and image+link share actions are available. Native photo sharing depends on browser/device support.

## WhatsApp
The number is set once, in `js/app.js` (`WHATSAPP_NUMBER = '917568443870'`): India code 91 + 7568443870. Buttons open WhatsApp with a pre-filled message; the customer sends it. Nothing is sent automatically.

## After adding or changing products
```cmd
py tools/validate_catalogue.py
py tools/generate_share_pages.py
```
Commit generated `products/` share pages along with the JSON and product images. The image folder in the website ZIP is intentionally empty until the separate new-images ZIP is extracted into it.

## Run locally
```cmd
py -m http.server 8000
```
Open `http://localhost:8000` (do not double-click `index.html`; JSON is fetched over HTTP).

## Validate data
```cmd
py tools/validate_catalogue.py --require-images
```

## Publish
```cmd
git add .
git commit -m "GharSansar V8 duplicate cleanup"
git push
```
GitHub → Settings → Pages → Deploy from a branch → main → /(root). Returning visitors pick up the new version automatically (cache name changed).

## Notes
- Fonts load from Google Fonts without blocking rendering; if unreachable, system fonts are used.
- Wishlist/cart/theme live in this browser's localStorage only — no accounts, no cross-device sync, no online payments.
- Only use product photos you have the right to publish.

## Product batch 06 and personal features

- 7 products added as `AF-P6-001` to `AF-P6-007` (12 image files).
- Existing 10 category IDs are reused; no new category was required.
- Category share links are generated under `categories/<category-id>/`.
- Product and category share pages are generated by `py tools/generate_share_pages.py`.
- Local recommendations use product views, category browsing, wishlist additions and cart additions. These signals stay in this browser's localStorage.
- Friendly greetings and new-release notices appear when the storefront is opened. Optional browser notifications can be enabled from the recommendations section; they are shown on a subsequent visit.
- True background push notifications while the site is closed require a push service/backend (for example, a server or managed push provider). GitHub Pages alone cannot send those pushes.
- Text selection and casual image long-press/context menus are discouraged in the UI; this is not DRM and cannot prevent screenshots, developer tools, or all browser-level saving.

After adding product photos, validate with:

```cmd
py tools/validate_catalogue.py --require-images
py tools/generate_share_pages.py
```

## Personalisation and notification limits
- Recommendations use product views, settled search queries, category visits, wishlist additions and cart additions stored only in this browser's localStorage. No server-side tracking or cross-device profile is used.
- Friendly visit greetings and new-release notices are shown when the storefront is opened. Browser notifications are optional and require the visitor's permission; this static site can show visit-time notifications, but cannot send true background push while the app is closed without a push service/backend.
- No random interruptive popups are scheduled.
