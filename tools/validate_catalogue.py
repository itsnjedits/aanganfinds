#!/usr/bin/env python3
"""Validate GharSansar catalogue JSON, IDs, categories and exact image-index mapping."""
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
    errors=[]; warnings=[]; product_ids=[p.get('id') for p in products]; category_ids={c.get('id') for c in cats}
    if len(product_ids)!=len(set(product_ids)): errors.append('Duplicate product IDs found.')
    expected={}; missing=[]; image_ids=[]; referenced_paths=[]
    for p in products:
        if p.get('category') not in category_ids: errors.append(f"{p.get('id')}: unknown category {p.get('category')}")
        if p.get('price') is not None and (not isinstance(p.get('price'),(int,float)) or p['price']<0): errors.append(f"{p.get('id')}: invalid price")
        image_pending = p.get('imagePending') is True and p.get('active') is False
        if not p.get('images') and not image_pending: errors.append(f"{p.get('id')}: no image filename mapped")
        if image_pending and (p.get('images') or p.get('imageIds')): errors.append(f"{p.get('id')}: imagePending record must not contain image mappings")
        ids=p.get('imageIds') or []
        if ids and len(ids)!=len(p.get('images',[])): errors.append(f"{p.get('id')}: imageIds length differs from images length")
        for n,path in enumerate(p.get('images',[]),1):
            image_id=Path(path).stem; image_ids.append(image_id); referenced_paths.append(path)
            if ids and ids[n-1]!=image_id: errors.append(f"{p.get('id')}: image ID does not match filename {path}")
            if image_id in expected: errors.append(f"Duplicate image ID/path reference: {image_id}")
            expected[image_id]=(p.get('id'),path)
            disk=ROOT/path.removeprefix('./')
            if not disk.is_file(): missing.append(str(path))
    indexed={}
    for item in index.get('images',[]):
        iid=item.get('imageId')
        if not iid: errors.append('Image index contains a record without imageId.'); continue
        if iid in indexed: errors.append(f'Duplicate image-index imageId: {iid}')
        indexed[iid]=item
    if index.get('count') != len(index.get('images',[])): errors.append('image-index.json count does not match images array.')
    if index.get('products') != len(products): errors.append('image-index.json product count does not match products.json.')
    if set(indexed)!=set(expected):
        errors.append(f'Image-index ID set differs from products.json (missing={len(set(expected)-set(indexed))}, extra={len(set(indexed)-set(expected))}).')
    for iid,(pid,path) in expected.items():
        item=indexed.get(iid)
        if item and (item.get('productId')!=pid or item.get('imagePath')!=path):
            errors.append(f'{iid}: productId/imagePath mismatch between products.json and image-index.json.')
    if args.require_images and missing: errors.append(f'{len(missing)} image file(s) missing.')
    if errors:
        print('VALIDATION FAILED:'); [print(' - '+e) for e in errors]; return 1
    print(f'VALIDATION PASSED: {len(products)} products, {len(image_ids)} mapped image filenames, {len(category_ids)-1} categories.')
    photo_dir=ROOT/'product_images'
    photos=sum(1 for p in photo_dir.iterdir() if p.is_file() and p.suffix.lower() in {'.jpg','.jpeg','.png','.webp'}) if photo_dir.is_dir() else 0
    print(f'Photo folder currently contains {photos} actual product photo(s).')
    referenced={Path(path).name for path in referenced_paths}
    orphans=sorted(p.name for p in photo_dir.iterdir() if p.is_file() and p.suffix.lower() in {'.jpg','.jpeg','.png','.webp'} and p.name not in referenced) if photo_dir.is_dir() else []
    if orphans: warnings.append(f'{len(orphans)} photo file(s) are not referenced by any product: '+', '.join(orphans[:8]))
    if missing: warnings.append(f'{len(missing)} mapped photo file(s) are not present yet (they show the branded placeholder until added).')
    else: print('All mapped image files exist.')
    for warning in warnings: print('WARNING: '+warning)
    pending=sum(1 for p in products if p.get('imagePending') and p.get('active') is False)
    if pending: print(f'Unpublished image-pending products: {pending}. They are excluded from the storefront and public share pages.')
    print('Run with --require-images after adding the separate product-image ZIP to require every mapped path to exist.')
    return 0
if __name__=='__main__': raise SystemExit(main())
