#!/usr/bin/env python3
"""Generate crawler-readable static share pages for every GharSansar product.

Usage:
  py tools/generate_share_pages.py
  py tools/generate_share_pages.py --base-url https://itsnjedits.github.io/aanganfinds/

The pages are static HTML so WhatsApp/Telegram can read Open Graph metadata
without executing the storefront JavaScript. Human visitors are redirected to
index.html?product=<ID>, where the app opens that product's detail sheet.
"""
from __future__ import annotations
import argparse, json, re, html, mimetypes
from pathlib import Path
from urllib.parse import quote

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_BASE = 'https://itsnjedits.github.io/aanganfinds/'

def safe_slug(product: dict) -> str:
    slug = str(product.get('slug') or product.get('id') or 'product').strip().lower()
    slug = re.sub(r'[^a-z0-9-]+', '-', slug).strip('-')
    return slug or str(product.get('id', 'product')).lower()

def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--base-url', default=DEFAULT_BASE, help='Public root URL of the GitHub Pages site, including trailing slash.')
    args = parser.parse_args()
    base = args.base_url.rstrip('/') + '/'
    products_path = ROOT / 'data' / 'products.json'
    products = json.loads(products_path.read_text(encoding='utf-8'))
    if not isinstance(products, list):
        raise SystemExit('data/products.json must contain a JSON array.')
    out_root = ROOT / 'products'
    out_root.mkdir(exist_ok=True)
    seen = set(); created = 0; paths = []
    for product in products:
        if not isinstance(product, dict) or not product.get('id'):
            continue
        pid = str(product['id'])
        slug = safe_slug(product)
        if slug in seen:
            slug = f"{slug}-{re.sub(r'[^a-zA-Z0-9]+','',pid).lower()}"
        seen.add(slug)
        title = str(product.get('name') or pid)
        category = str(product.get('categoryLabel') or 'Curated finds')
        price = product.get('price')
        price_text = f"₹{int(round(float(price))):,}" if price is not None and str(price).strip() else 'Price on enquiry'
        description = str(product.get('shortDescription') or product.get('description') or category)
        description = re.sub(r'\s+', ' ', description).strip()
        meta_description = f"{title} — {price_text}. {description} Discover it at GharSansar — Har Ghar ki Pasand."
        image_path = (product.get('images') or ['./assets/brand/gharsansar-logo.png'])[0]
        image_path = str(image_path).removeprefix('./').lstrip('/')
        # Always point to the expected image filename. Once product photos are uploaded,
        # previews begin using them without any route changes.
        image_url = base + '/'.join(quote(part) for part in image_path.split('/'))
        image_mime = mimetypes.guess_type(image_path)[0] or 'image/jpeg'
        canonical = base + 'products/' + quote(slug) + '/'
        app_url = base + '?product=' + quote(pid)
        esc = html.escape
        page = f'''<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>{esc(title)} | GharSansar</title>
  <meta name="description" content="{esc(meta_description)}">
  <link rel="canonical" href="{esc(canonical)}">
  <meta name="theme-color" content="#3a0717">
  <meta property="og:type" content="product">
  <meta property="og:locale" content="en_IN">
  <meta property="og:site_name" content="GharSansar — Har Ghar ki Pasand">
  <meta property="og:title" content="{esc(title)} | GharSansar">
  <meta property="og:description" content="{esc(meta_description)}">
  <meta property="og:url" content="{esc(canonical)}">
  <meta property="og:image" content="{esc(image_url)}">
  <meta property="og:image:secure_url" content="{esc(image_url)}">
  <meta property="og:image:alt" content="{esc(title)} — GharSansar">
  <meta property="og:image:type" content="{esc(image_mime)}">
  <meta property="product:price:amount" content="{esc(str(price) if price is not None else '')}">
  <meta property="product:price:currency" content="INR">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="{esc(title)} | GharSansar">
  <meta name="twitter:description" content="{esc(meta_description)}">
  <meta name="twitter:image" content="{esc(image_url)}">
  <style>
    *{{box-sizing:border-box}}body{{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px;background:#26050f;color:#fff4e5;font:16px/1.6 system-ui,sans-serif}}
    main{{width:min(520px,100%);padding:28px;border:1px solid rgba(230,190,112,.35);border-radius:22px;background:linear-gradient(145deg,#421020,#26050f);text-align:center;box-shadow:0 20px 60px #10030a66}}
    .mark{{color:#edc777;font-size:12px;font-weight:800;letter-spacing:.16em;text-transform:uppercase}}h1{{margin:10px 0 8px;font:600 clamp(24px,5vw,34px)/1.2 Georgia,serif}}p{{color:#e4cfc6;margin:0 0 22px}}a{{display:inline-flex;min-height:48px;align-items:center;justify-content:center;padding:0 22px;border-radius:999px;background:#e8bf70;color:#35101b;text-decoration:none;font-weight:800}}
  </style>
</head>
<body>
  <main>
    <div class="mark">GharSansar · Har Ghar ki Pasand</div>
    <h1>{esc(title)}</h1>
    <p>{esc(price_text)} · {esc(category)}<br>View this product in the GharSansar store.</p>
    <a href="{esc(app_url)}">View product at GharSansar</a>
  </main>
  <script>window.location.replace({json.dumps(app_url)});</script>
</body>
</html>
'''
        folder = out_root / slug
        folder.mkdir(parents=True, exist_ok=True)
        (folder / 'index.html').write_text(page, encoding='utf-8')
        created += 1
        paths.append(f'products/{slug}/')
    report = {'baseUrl': base, 'count': created, 'paths': paths}
    (out_root / 'share-pages-index.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(f'Generated {created} crawler-readable product share pages under products/.')
    print(f'Base URL: {base}')
    return 0

if __name__ == '__main__':
    raise SystemExit(main())
