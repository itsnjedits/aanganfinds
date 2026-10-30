# GharSansar — Version 3 (premium UI/UX overhaul)

**Brand:** GharSansar · हर घर की पसंद · **Repo / Pages path:** `aanganfinds`
**Stack:** plain HTML, CSS, JavaScript, JSON catalogue, local images, PWA. No build step, no backend, no trackers.
**Catalogue:** 116 products · 181 product photos · 8 categories (data files are unchanged from V2).

## What's new in V3
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

## WhatsApp
The number is set once, in `js/app.js` (`WHATSAPP_NUMBER = '917568443870'`): India code 91 + 7568443870. Buttons open WhatsApp with a pre-filled message; the customer sends it. Nothing is sent automatically.

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
git commit -m "GharSansar V3 premium UI/UX overhaul"
git push
```
GitHub → Settings → Pages → Deploy from a branch → main → /(root). Returning visitors pick up the new version automatically (cache name changed).

## Notes
- Fonts load from Google Fonts without blocking rendering; if unreachable, system fonts are used.
- Wishlist/cart/theme live in this browser's localStorage only — no accounts, no cross-device sync, no online payments.
- Only use product photos you have the right to publish.
