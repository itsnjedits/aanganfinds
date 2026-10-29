#!/usr/bin/env python3
"""Validate GharSansar V2 catalogue JSON, IDs, categories and image filename mapping."""
import argparse, json, sys
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
def load(path):
    with path.open('r',encoding='utf-8') as f: return json.load(f)

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--require-images',action='store_true',help='Fail if any mapped product image file is missing.')
    args=parser.parse_args()
    products=load(ROOT/'data/products.json'); cats=load(ROOT/'data/categories.json'); index=load(ROOT/'data/image-index.json')
    errors=[]; product_ids=[p.get('id') for p in products]; category_ids={c.get('id') for c in cats}
    if len(product_ids)!=len(set(product_ids)): errors.append('Duplicate product IDs found.')
    image_ids=[]; missing=[]
    for p in products:
        if p.get('category') not in category_ids: errors.append(f"{p.get('id')}: unknown category {p.get('category')}")
        if p.get('price') is not None and (not isinstance(p.get('price'),(int,float)) or p['price']<0): errors.append(f"{p.get('id')}: invalid price")
        if not p.get('images'): errors.append(f"{p.get('id')}: no image filename mapped")
        for path in p.get('images',[]):
            image_ids.append(Path(path).stem)
            disk=ROOT/path.removeprefix('./')
            if not disk.is_file(): missing.append(str(path))
    if len(image_ids)!=len(set(image_ids)): errors.append('Duplicate image IDs found.')
    if index.get('count') != len(index.get('images',[])): errors.append('image-index.json count does not match images array.')
    if len(index.get('images',[])) != len(image_ids): errors.append('Image index count does not match product image paths.')
    if args.require_images and missing: errors.append(f'{len(missing)} image file(s) missing.')
    if errors:
        print('VALIDATION FAILED:'); [print(' - '+e) for e in errors]; return 1
    print(f'VALIDATION PASSED: {len(products)} products, {len(image_ids)} mapped image filenames, {len(cats)-1} categories.')
    print(f'Photo folder currently contains {sum(1 for p in (ROOT/"product_images").iterdir() if p.is_file() and p.suffix.lower() in {".jpg", ".jpeg", ".png", ".webp"})} actual product photo(s).')
    if missing: print(f'{len(missing)} mapped photo files are not present yet; expected in this V2 package because product_images/ is intentionally empty.')
    else: print('All mapped image files exist.')
    print('Run with --require-images after adding photos to require all paths to exist.')
    return 0
if __name__=='__main__': raise SystemExit(main())
