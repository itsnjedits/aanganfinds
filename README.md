# GharSansar — Version 2 (Aangan Finds catalogue)

**Brand:** GharSansar · **Tagline:** हर घर की पसंद  
**Stack:** HTML, CSS, JavaScript, Tailwind browser CDN, JSON catalogue, PWA/service worker  
**Catalogue:** 116 products · 181 mapped image filenames · 8 product categories (plus All Products)

## What's in V2

- Rebranded storefront inspired by the supplied GharSansar reference: wine/maroon, warm cream, gold accents, large logo, category cards and wide hero illustration.
- Mobile-first layout (two product columns on phones), horizontal category navigation and fixed bottom navigation on mobile.
- Light/dark theme with contrast-aware surface/text tokens; preference saved in localStorage.
- Live fuzzy search, category filtering, price/name sorting, wishlist, cart, detail modal, multiple-image gallery, quantity controls, separate Order and Ask us WhatsApp links.
- Ordinary WhatsApp destination configured as `917568443870` (India country code + 7568443870).
- `data/products.json` contains the 116 catalogue entries parsed from the supplied 181-page image index. P1 prices are the marked-up prices shown in that index; P2 prices are kept as listed. Four P1 entries have no visible price and show **Price on enquiry** instead of a guessed amount.
- `data/image-index.json` maps all 181 expected crop filenames to product IDs.

## IMPORTANT: product image folder is intentionally empty

`product_images/` contains only `.gitkeep`, as requested. Each product already points to its expected local file, such as:

```text
./product_images/AF-P1-001-1.jpg
./product_images/AF-P1-001-2.jpg
./product_images/AF-P2-001-1.jpg
```

When you add a matching JPG/PNG/WebP file to that folder and push it to GitHub, the product card, wishlist/cart thumbnail and product detail gallery will use it automatically. Until then, a styled GharSansar placeholder appears instead of a broken image. Keep filenames exactly as listed in `data/products.json`.

## Run locally on Windows

1. Extract this ZIP directly into your existing project folder/repository, or make a backup and replace the old project contents.
2. Open CMD in this folder and run:

   ```cmd
   py -m http.server 8000
   ```

3. Visit `http://localhost:8000` in Chrome. Do not double-click `index.html`; JSON is fetched over HTTP.
4. Search, filters, theme, wishlist/cart, quantity controls and WhatsApp message links can be tested without product images. Add photos later using the mapped names.

## Validate product data

```cmd
py tools/validate_catalogue.py
```

This confirms product IDs, category references, image ID uniqueness and JSON mapping. Because the image directory is intentionally empty, the default validator reports the missing photo files as expected. After you add images, run:

```cmd
py tools/validate_catalogue.py --require-images
```

## Push to GitHub Pages

From CMD in the repository folder:

```cmd
git add .
git commit -m "Launch GharSansar version 2"
git push
```

The repository name remains whatever you already created. If your repo is `itsnjedits/aanganfinds`, its Pages URL remains `https://itsnjedits.github.io/aanganfinds/`. In GitHub, select **Settings → Pages → Deploy from a branch → main → /(root)**.

## Add the crops you already have

The provided image-index PDF names the first product batch `AF-P1-...` and the second `AF-P2-...`. Use the cropped images in that naming scheme. If your earlier crop ZIP contains older `AF-JW-...` filenames, rename/map those according to the current `data/image-index.json`; do not simply copy them under the old names.

## Important behaviour

- No backend, online payment, customer account or cross-device wishlist sync. Wishlist/cart/theme use this browser's localStorage.
- Order and Ask us open ordinary WhatsApp chat with a prefilled message; the customer still taps Send.
- Products with no visible price are still listed; the message asks the customer to confirm price.
- The Tailwind browser CDN is included for the no-build workflow. For a production-optimised build, Tailwind can later be compiled locally.
- Only use product photos you are permitted to use on a public commercial store.
