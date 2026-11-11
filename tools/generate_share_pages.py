#!/usr/bin/env python3
'''Generate crawler-readable product AND category share pages for GharSansar.

Usage:
  py tools/generate_share_pages.py
  py tools/generate_share_pages.py --base-url https://itsnjedits.github.io/aanganfinds/

Pages are static HTML for social crawlers. Human visitors are redirected to the
main app using ?product=<ID> or ?category=<ID> deep links.
'''
from __future__ import annotations
import argparse, json, re, html, mimetypes, shutil
from pathlib import Path
from urllib.parse import quote
ROOT = Path(__file__).resolve().parents[1]
DEFAULT_BASE = 'https://itsnjedits.github.io/aanganfinds/'
def safe_slug(value: str) -> str:
    slug = re.sub(r'[^a-z0-9-]+', '-', str(value or '').strip().lower()).strip('-')
    return slug or 'collection'
def write_page(folder: Path, title: str, description: str, canonical: str, app_url: str, image_url: str, kind: str, button: str) -> None:
    esc = html.escape
    page = f'''<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>{esc(title)}</title><meta name="description" content="{esc(description)}">
<link rel="canonical" href="{esc(canonical)}"><meta name="theme-color" content="#3a0717">
<meta property="og:type" content="website"><meta property="og:locale" content="en_IN">
<meta property="og:site_name" content="GharSansar — Har Ghar ki Pasand">
<meta property="og:title" content="{esc(title)}"><meta property="og:description" content="{esc(description)}">
<meta property="og:url" content="{esc(canonical)}"><meta property="og:image" content="{esc(image_url)}">
<meta property="og:image:secure_url" content="{esc(image_url)}"><meta property="og:image:alt" content="{esc(title)} — GharSansar">
<meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="{esc(title)}">
<meta name="twitter:description" content="{esc(description)}"><meta name="twitter:image" content="{esc(image_url)}">
<style>*{{box-sizing:border-box}}body{{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px;background:#26050f;color:#fff4e5;font:16px/1.6 system-ui,sans-serif}}main{{width:min(520px,100%);padding:28px;border:1px solid rgba(230,190,112,.35);border-radius:22px;background:linear-gradient(145deg,#421020,#26050f);text-align:center;box-shadow:0 20px 60px #10030a66}}.mark{{color:#edc777;font-size:12px;font-weight:800;letter-spacing:.16em;text-transform:uppercase}}h1{{margin:10px 0 8px;font:600 clamp(24px,5vw,34px)/1.2 Georgia,serif}}p{{color:#e4cfc6;margin:0 0 22px}}a{{display:inline-flex;min-height:48px;align-items:center;justify-content:center;padding:0 22px;border-radius:999px;background:#e8bf70;color:#35101b;text-decoration:none;font-weight:800}}</style>
</head><body><main><div class="mark">GharSansar · Har Ghar ki Pasand</div><h1>{esc(title)}</h1><p>{esc(description)}</p><a href="{esc(app_url)}">{esc(button)}</a></main>
<script>window.location.replace({json.dumps(app_url)});</script></body></html>'''
    folder.mkdir(parents=True, exist_ok=True)
    (folder/'index.html').write_text(page, encoding='utf-8')
def main() -> int:
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--base-url', default=DEFAULT_BASE, help='Public root URL, including trailing slash.')
    args=parser.parse_args(); base=args.base_url.rstrip('/')+'/'
    products=json.loads((ROOT/'data/products.json').read_text(encoding='utf-8'))
    categories=json.loads((ROOT/'data/categories.json').read_text(encoding='utf-8'))
    if not isinstance(products,list) or not isinstance(categories,list): raise SystemExit('Product/category JSON must be arrays.')
    seen=set(); product_paths=[]
    for p in products:
        if not isinstance(p,dict) or not p.get('id'): continue
        pid=str(p['id']); slug=safe_slug(p.get('slug') or pid)
        if slug in seen: slug=f"{slug}-{re.sub(r'[^a-zA-Z0-9]+','',pid).lower()}"
        seen.add(slug)
        title=str(p.get('name') or pid); cat=str(p.get('categoryLabel') or 'Curated finds')
        price=p.get('price'); price_text=f"₹{int(round(float(price))):,}" if price is not None and str(price).strip() else 'Price on enquiry'
        desc=str(p.get('shortDescription') or p.get('description') or cat); desc=re.sub(r'\s+',' ',desc).strip()
        meta=f"{title} — {price_text}. {desc} Discover it at GharSansar — Har Ghar ki Pasand."
        image_path=str((p.get('images') or ['./assets/brand/gharsansar-logo.png'])[0]).removeprefix('./').lstrip('/')
        image_url=base+'/'.join(quote(part) for part in image_path.split('/'))
        canonical=base+'products/'+quote(slug)+'/'
        app_url=base+'?product='+quote(pid)
        write_page(ROOT/'products'/slug, f'{title} | GharSansar', meta, canonical, app_url, image_url, 'product', 'View product at GharSansar')
        product_paths.append('products/'+slug+'/')
    category_paths=[]
    for category in categories:
        if not isinstance(category,dict) or not category.get('id'): continue
        cid=str(category['id']); label=str(category.get('label') or 'GharSansar collection')
        members=[p for p in products if p.get('active',True) and (cid=='all' or p.get('category')==cid)]
        count=len(members); count_text=f'{count} curated '+('find' if count==1 else 'finds')
        desc=f"Explore {count_text} in {label} at GharSansar — Har Ghar ki Pasand. Discover thoughtful jewellery, home finds, gifts and more."
        first_image=(members[0].get('images') or ['./assets/banners/gharsansar-hero.webp'])[0] if members else './assets/banners/gharsansar-hero.webp'
        image_path=str(first_image).removeprefix('./').lstrip('/')
        image_url=base+'/'.join(quote(part) for part in image_path.split('/'))
        slug=safe_slug(cid)
        canonical=base+'categories/'+quote(slug)+'/'; app_url=base+'?category='+quote(cid)
        write_page(ROOT/'categories'/slug, f'{label} | GharSansar', desc, canonical, app_url, image_url, 'website', 'Explore this collection')
        category_paths.append('categories/'+slug+'/')
    # Remove orphaned generated pages (for example the legacy P7 duplicate folders).
    # Only directories containing an index.html are considered; the project index JSON is preserved.
    for parent, valid_paths in ((ROOT/'products', set(product_paths)), (ROOT/'categories', set(category_paths))):
        for child in parent.iterdir():
            if not child.is_dir() or not (child/'index.html').is_file():
                continue
            relative = child.relative_to(ROOT).as_posix().rstrip('/') + '/'
            if relative not in valid_paths:
                shutil.rmtree(child)
                print('Removed orphan share page:', relative)
    report={'baseUrl':base,'products':len(product_paths),'productPaths':product_paths,'categories':len(category_paths),'categoryPaths':category_paths}
    (ROOT/'products'/'share-pages-index.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(f"Generated {len(product_paths)} product pages and {len(category_paths)} category pages.")
    print('Base URL:',base)
    return 0
if __name__=='__main__': raise SystemExit(main())
