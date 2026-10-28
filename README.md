# Aangan Finds — First Real Catalogue (v1.2)

A mobile-first, front-end-only shopping catalogue. This build replaces the eight design placeholders with **34 products and 59 locally saved product images** cropped from the product screenshots supplied by the owner.

## What's included

- `index.html` — storefront, dark/light toggle, live fuzzy search, category filters, sorting, cart and saved-items UI.
- `css/styles.css` — mobile-first styling and touch-safe desktop hover effects.
- `js/app.js` — product rendering, real-time typo-tolerant search, saved list, quantity controls, bag, detail modal with image gallery, and WhatsApp order/enquiry messages.
- `data/products.json` — the 34 live catalogue entries. Every item includes its name, category, selling price and locally stored image paths.
- `data/categories.json` — categories generated for this batch.
- `data/image-index.json` — mapping of each product/image ID to its local filename.
- `product_images/` — 59 cropped JPGs, with names such as `AF-JW-002-1.jpg` and `AF-JW-002-2.jpg`.
- `assets/brand/` and `assets/banners/` — site logo, PWA icons and original festive artwork.
- `manifest.webmanifest` and `sw.js` — PWA setup and static caching.
- `tools/validate_catalogue.py` — checks product IDs, category references, prices and image paths.
- `tools/product-template.json` — example structure for a future product.

## Pricing used in this build

The displayed `price` for each product was calculated from the sale price visibly shown on its corresponding page in the supplied `products_combined.pdf`: **sale price × 1.40, rounded to the nearest whole rupee**. Examples: ₹190 → ₹266 and ₹298 → ₹417. The source prices are not displayed in the storefront. Please re-check live marketplace price, product variant, availability and your actual margin before taking an order; screenshot prices can change.

This PDF contains 34 product listing screenshots; the imported catalogue therefore has 34 products, with multiple full-visible image crops where available. Cropped images inherit the resolution and framing of the screenshots. Use only product photographs you are permitted to reuse commercially before publishing the site publicly.

## Run locally on Windows

1. Extract the project folder.
2. Open PowerShell in this folder.
3. Run:

   ```powershell
   py -m http.server 8000
   ```

4. Open `http://localhost:8000` in Chrome. Do not double-click `index.html`, because the catalogue is fetched as JSON.

## Publish on GitHub Pages

1. Create a GitHub repository (for example, `aangan-finds`).
2. Upload the **contents** of this folder to the repository root, including `index.html`, `product_images/`, `data/`, `assets/`, `css/`, `js/`, `sw.js` and `manifest.webmanifest`. Do not upload only the ZIP.
3. In **Settings → Pages**, choose **Deploy from a branch**, select `main` and `/(root)`, then save.
4. Open the Pages URL after deployment finishes. All data/image paths are relative, so a project subpath works.

## WhatsApp ordering

The configured number is `917568443870` (India country code 91 + 7568443870). Ordinary WhatsApp is sufficient. Each product has separate **Order** and **Ask us** actions. Order messages include the product name, ID, selected quantity, listed unit price and subtotal. The bag can send a combined message for multiple items. WhatsApp only opens a prefilled draft; the customer must press Send. The site does not take payments or confirm stock.

## Catalogue edits

Edit `data/products.json`. Keep `id` stable when updating a product. For a new product, add its image(s) under `product_images/` and use paths such as `./product_images/AF-JW-035-1.jpg`. Ensure its category matches an ID in `data/categories.json`. Run:

```powershell
py tools/validate_catalogue.py
```

Then commit/push the updated files to GitHub. When adding images, also add their paths to `sw.js`'s `APP_FILES` list if you want them pre-cached for offline use, and bump `CACHE_NAME` so browsers refresh their cached assets.

## Current limitations

- No backend, customer accounts, online payments or cross-device wishlist syncing. Wishlist/cart/theme are stored in the current browser via `localStorage`.
- Product details beyond names are intentionally minimal because the screenshots do not verify every specification.
- Tailwind's browser CDN is included to preserve the no-build-step starter workflow; for a production-optimised launch, compile Tailwind CSS locally.
- Product images are screenshot crops, not source-resolution originals.
