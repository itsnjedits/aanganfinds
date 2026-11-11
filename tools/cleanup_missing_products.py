#!/usr/bin/env python3
"""Safely remove products whose product image set is incomplete.

Run from a GharSansar project root:
    py tools/cleanup_missing_products.py --apply

The script backs up catalogue files and removed photos before changing anything.
It removes a whole product if any mapped photo is missing or the image sequence
is not contiguous from -1. It also removes AF-P1-049 explicitly.
"""
from __future__ import annotations

import argparse
import csv
import datetime as dt
import json
import re
import sys
import zipfile
from collections import defaultdict
from pathlib import Path
from typing import Any

IMAGE_EXTS = {'.jpg', '.jpeg', '.png', '.webp'}
FORCE_REMOVE_IDS = {'AF-P1-049'}


def load_json(path: Path) -> Any:
    with path.open('r', encoding='utf-8-sig') as f:
        return json.load(f)


def save_json(path: Path, data: Any) -> None:
    tmp = path.with_suffix(path.suffix + '.tmp')
    with tmp.open('w', encoding='utf-8', newline='\n') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
        f.write('\n')
    tmp.replace(path)


def safe_project_path(root: Path, raw: str) -> Path:
    normalized = str(raw).replace('\\', '/').strip()
    while normalized.startswith('./'):
        normalized = normalized[2:]
    candidate = (root / normalized).resolve()
    if candidate != root and root not in candidate.parents:
        raise ValueError(f'Image path escapes project directory: {raw}')
    return candidate


def image_number(path: str, product_id: str) -> int | None:
    name = Path(path.replace('\\', '/')).name
    match = re.match(rf'^{re.escape(product_id)}-(\d+)\.(?:jpg|jpeg|png|webp)$', name, re.I)
    return int(match.group(1)) if match else None


def product_photo_files(photo_dir: Path) -> list[Path]:
    if not photo_dir.is_dir():
        return []
    return sorted(p for p in photo_dir.rglob('*') if p.is_file() and p.suffix.lower() in IMAGE_EXTS)


def read_csv_rows(path: Path) -> tuple[list[str], list[dict[str, str]]]:
    if not path.exists():
        return [], []
    with path.open('r', encoding='utf-8-sig', newline='') as f:
        reader = csv.DictReader(f)
        return list(reader.fieldnames or []), list(reader)


def write_csv(path: Path, fields: list[str], rows: list[dict[str, Any]]) -> None:
    if not fields:
        fields = ['productId', 'productName', 'imageId', 'imagePath', 'imageOrder']
    tmp = path.with_suffix(path.suffix + '.tmp')
    with tmp.open('w', encoding='utf-8-sig', newline='') as f:
        writer = csv.DictWriter(f, fieldnames=fields, extrasaction='ignore')
        writer.writeheader()
        writer.writerows(rows)
    tmp.replace(path)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', type=Path, default=Path(__file__).resolve().parents[1],
                        help='GharSansar project root (defaults to parent of tools/).')
    parser.add_argument('--apply', action='store_true', help='Apply cleanup after interactive confirmation.')
    args = parser.parse_args()
    root = args.root.resolve()

    products_path = root / 'data' / 'products.json'
    index_path = root / 'data' / 'image-index.json'
    csv_path = root / 'data' / 'image-index.csv'
    release_path = root / 'data' / 'release.json'
    photo_dir = root / 'product_images'

    for required in (products_path, index_path):
        if not required.is_file():
            print(f'ERROR: Required file not found: {required}')
            return 2
    actual_photos = product_photo_files(photo_dir)
    if not actual_photos:
        print('SAFETY STOP: product_images/ contains no JPG/JPEG/PNG/WEBP files.')
        print('Extract/restore the images first. No catalogue files were changed.')
        return 3

    try:
        products = load_json(products_path)
        index = load_json(index_path)
        if not isinstance(products, list) or not isinstance(index, dict) or not isinstance(index.get('images'), list):
            raise ValueError('Unexpected products.json or image-index.json structure.')
    except Exception as exc:
        print(f'ERROR: Could not read catalogue JSON: {exc}')
        return 2

    # Duplicate IDs are not silently reconciled when their records conflict.
    by_id: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for product in products:
        if isinstance(product, dict) and product.get('id'):
            by_id[str(product['id'])].append(product)
    conflicts = [pid for pid, rows in by_id.items() if len(rows) > 1 and any(row != rows[0] for row in rows[1:])]
    if conflicts:
        print('SAFETY STOP: Conflicting duplicate product IDs found: ' + ', '.join(conflicts))
        print('No files were changed. Resolve these duplicate-ID records manually first.')
        return 4

    # Collapse only byte-for-byte-equivalent duplicate product records.
    deduped_products: list[dict[str, Any]] = []
    seen_ids: set[str] = set()
    exact_duplicate_rows = 0
    for product in products:
        pid = str(product.get('id', '')) if isinstance(product, dict) else ''
        if pid and pid in seen_ids:
            exact_duplicate_rows += 1
            continue
        if pid:
            seen_ids.add(pid)
        deduped_products.append(product)

    # A file cannot belong to two different products.
    file_owners: dict[str, str] = {}
    for product in deduped_products:
        if not isinstance(product, dict):
            print('SAFETY STOP: products.json contains a non-object product row.')
            return 4
        pid = str(product.get('id', ''))
        for raw in product.get('images') or []:
            key = str(raw).replace('\\', '/').casefold()
            if key in file_owners and file_owners[key] != pid:
                print(f'SAFETY STOP: Image path is assigned to both {file_owners[key]} and {pid}: {raw}')
                return 4
            file_owners[key] = pid

    remove_reasons: dict[str, list[str]] = {}
    for product in deduped_products:
        pid = str(product.get('id', ''))
        reasons: list[str] = []
        if pid in FORCE_REMOVE_IDS:
            reasons.append('explicitly requested removal')
        mapped = product.get('images') or []
        image_ids = product.get('imageIds') or []
        if not mapped:
            reasons.append('no image paths are mapped')
        if image_ids and len(image_ids) != len(mapped):
            reasons.append('imageIds count does not match images count')
        numbers: list[int] = []
        for i, raw in enumerate(mapped):
            raw = str(raw)
            disk_path = safe_project_path(root, raw)
            if not disk_path.is_file():
                reasons.append(f'missing image: {Path(raw.replace(chr(92), "/")).name}')
            n = image_number(raw, pid)
            if n is None:
                reasons.append(f'image filename does not follow {pid}-1.ext naming: {Path(raw).name}')
            else:
                numbers.append(n)
            if image_ids and i < len(image_ids) and str(image_ids[i]) != Path(raw).stem:
                reasons.append(f'imageIds mismatch for {Path(raw).name}')
        if mapped and numbers:
            expected = list(range(1, len(mapped) + 1))
            if numbers != expected:
                reasons.append(f'image numbering gap/order: found {numbers}, expected {expected}')
        if reasons:
            remove_reasons[pid] = sorted(set(reasons))

    # AF-P1-049 was already removed from the catalogue in this release.
    # Still sweep any of its leftover local photo files from product_images/.
    for forced_id in FORCE_REMOVE_IDS:
        remove_reasons.setdefault(forced_id, ['explicitly requested removal (catalogue row already removed)'])

    removed_ids = set(remove_reasons)
    current_product_ids = {str(p.get('id', '')) for p in deduped_products}
    removed_catalogue_ids = removed_ids & current_product_ids
    kept_products = [p for p in deduped_products if str(p.get('id', '')) not in removed_ids]
    kept_ids = {str(p.get('id', '')) for p in kept_products}

    # Build the exact set of images that must remain according to products.json.
    expected_images: list[dict[str, Any]] = []
    expected_by_id: dict[str, tuple[str, str, int, str]] = {}
    for product in kept_products:
        pid = str(product.get('id', ''))
        for order, raw in enumerate(product.get('images') or [], 1):
            raw = str(raw)
            iid = Path(raw.replace('\\', '/')).stem
            if iid in expected_by_id:
                print(f'SAFETY STOP: Duplicate image ID in products.json: {iid}')
                return 4
            expected_by_id[iid] = (pid, raw, order, str(product.get('name') or pid))

    old_index_images = index.get('images', [])
    old_by_image_id: dict[str, dict[str, Any]] = {}
    duplicate_index_ids: list[str] = []
    conflicting_index_ids: list[str] = []
    for row in old_index_images:
        iid = str(row.get('imageId') or '')
        if not iid:
            continue
        if iid in old_by_image_id:
            duplicate_index_ids.append(iid)
            previous = old_by_image_id[iid]
            if any(previous.get(k) != row.get(k) for k in ('productId', 'imagePath')):
                conflicting_index_ids.append(iid)
        else:
            old_by_image_id[iid] = row
    if conflicting_index_ids:
        print('SAFETY STOP: Conflicting image-index records found for: ' + ', '.join(sorted(set(conflicting_index_ids))))
        print('No files were changed. Resolve these records manually first.')
        return 4

    new_index_images: list[dict[str, Any]] = []
    for iid, (pid, raw, order, name) in expected_by_id.items():
        row = dict(old_by_image_id.get(iid, {}))
        row.update({'productId': pid, 'productName': row.get('productName') or name,
                    'imageId': iid, 'imagePath': raw, 'imageOrder': order})
        new_index_images.append(row)

    csv_fields, old_csv_rows = read_csv_rows(csv_path)
    old_csv_by_image_id: dict[str, dict[str, str]] = {}
    for row in old_csv_rows:
        iid = str(row.get('imageId') or '')
        if iid and iid not in old_csv_by_image_id:
            old_csv_by_image_id[iid] = row
    new_csv_rows: list[dict[str, Any]] = []
    for iid, (pid, raw, order, name) in expected_by_id.items():
        row: dict[str, Any] = dict(old_csv_by_image_id.get(iid, {}))
        row.update({'productId': pid, 'productName': row.get('productName') or name,
                    'imageId': iid, 'imagePath': raw, 'imageOrder': order})
        new_csv_rows.append(row)

    # Find all photos associated with products being removed, including unindexed sibling views.
    removed_photo_paths: set[Path] = set()
    for product in deduped_products:
        pid = str(product.get('id', ''))
        if pid not in removed_ids:
            continue
        for raw in product.get('images') or []:
            path = safe_project_path(root, str(raw))
            if path.is_file() and path.suffix.lower() in IMAGE_EXTS:
                removed_photo_paths.add(path)
    # Also sweep any sibling images for forced IDs whose JSON row was removed earlier.
    if photo_dir.is_dir():
        for pid in removed_ids:
            for path in photo_dir.rglob(f'{pid}-*'):
                if path.is_file() and path.suffix.lower() in IMAGE_EXTS:
                    removed_photo_paths.add(path)

    # Collect any image-index rows that are to be removed for reporting.
    removed_index_rows = [row for row in old_index_images if str(row.get('productId') or '') in removed_ids]

    print('\nGHARSANSAR IMAGE-INTEGRITY CLEANUP')
    print('Project root       :', root)
    print('Actual photos found:', len(actual_photos))
    print('Products before    :', len(products))
    print('Image mappings pre :', len(old_index_images))
    print('Exact duplicate rows:', exact_duplicate_rows)
    print('Catalogue rows removed:', len(removed_catalogue_ids))
    print('Product IDs to purge  :', ', '.join(sorted(removed_ids)) or '(none)')
    print('Photos to delete   :', len(removed_photo_paths))
    print('Products remaining :', len(kept_products))
    print('Mappings remaining :', len(expected_images) if expected_images else len(expected_by_id))
    if remove_reasons:
        print('\nREMOVAL DETAILS')
        for pid in sorted(remove_reasons):
            product = next((p for p in deduped_products if str(p.get('id')) == pid), {})
            print(f" - {pid} | {product.get('name', '')}")
            for reason in remove_reasons[pid]:
                print('      *', reason)
    else:
        print('\nNo incomplete product image sets found.')
    if duplicate_index_ids:
        print('Duplicate image-index IDs will be normalised:', ', '.join(sorted(set(duplicate_index_ids))))

    if not args.apply:
        print('\nDRY RUN ONLY. No files were changed. Re-run with --apply to commit cleanup.')
        return 0

    answer = input('\nType CLEAN to back up and apply these changes: ').strip()
    if answer != 'CLEAN':
        print('Cancelled. No files were changed.')
        return 20

    timestamp = dt.datetime.now().strftime('%Y%m%d_%H%M%S')
    backup_dir = root / '_cleanup_backups'
    backup_dir.mkdir(exist_ok=True)
    backup_zip = backup_dir / f'gharsansar_before_cleanup_{timestamp}.zip'
    backup_candidates = [products_path, index_path, csv_path, release_path]
    backup_candidates = [p for p in backup_candidates if p.is_file()]
    with zipfile.ZipFile(backup_zip, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=6) as zf:
        for p in backup_candidates:
            zf.write(p, p.relative_to(root).as_posix())
        for p in sorted(removed_photo_paths):
            zf.write(p, p.relative_to(root).as_posix())

    # Apply products and image-index updates.
    save_json(products_path, kept_products)
    index['images'] = new_index_images
    index['count'] = len(new_index_images)
    index['products'] = len(kept_products)
    save_json(index_path, index)
    write_csv(csv_path, csv_fields, new_csv_rows)

    # Update release counters without touching unrelated metadata.
    release_data: dict[str, Any] = {}
    if release_path.is_file():
        try:
            release_data = load_json(release_path)
        except Exception:
            release_data = {}
    release_data['release'] = f"p8-catalogue-cleanup-{dt.datetime.now().strftime('%Y%m%d')}"
    release_data['totalProducts'] = len(kept_products)
    release_data['totalImageMappings'] = len(new_index_images)
    release_data['cleanupRemovedProducts'] = len(removed_catalogue_ids)
    release_data['cleanupPurgedProductIds'] = sorted(removed_ids)
    release_data['cleanupRemovedPhotos'] = len(removed_photo_paths)
    release_data['features'] = list(dict.fromkeys(list(release_data.get('features', [])) + ['missing-product-image-cleanup', 'af-p1-049-removed']))
    release_data['notes'] = list(release_data.get('notes', [])) + [
        f'Cleanup run {timestamp}: removed {len(removed_ids)} incomplete/explicitly removed products and {len(removed_photo_paths)} associated photo files.'
    ]
    save_json(release_path, release_data)

    # Delete the remaining sibling photos for every removed product.
    deleted_after_backup: list[str] = []
    for p in sorted(removed_photo_paths):
        try:
            p.unlink()
            deleted_after_backup.append(p.relative_to(root).as_posix())
        except OSError as exc:
            print(f'WARNING: Could not delete {p}: {exc}')

    # Package only image files that remain referenced by surviving products.
    clean_zip_path = root / 'GHARSANSAR_PRODUCT_IMAGES_CLEANED.zip'
    temp_zip = clean_zip_path.with_suffix('.zip.tmp')
    missing_after = []
    with zipfile.ZipFile(temp_zip, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=6) as zf:
        for product in kept_products:
            for raw in product.get('images') or []:
                p = safe_project_path(root, str(raw))
                if not p.is_file():
                    missing_after.append(str(raw))
                else:
                    zf.write(p, p.relative_to(root).as_posix())
    if missing_after:
        temp_zip.unlink(missing_ok=True)
        print('ERROR: Some surviving product photos disappeared during packaging:')
        for raw in missing_after[:30]: print(' -', raw)
        return 5
    temp_zip.replace(clean_zip_path)

    # Report any remaining orphan image files without deleting them automatically.
    referenced_names = {Path(str(raw).replace('\\', '/')).name
                        for product in kept_products for raw in (product.get('images') or [])}
    remaining_photos = product_photo_files(photo_dir)
    orphan_names = [p.relative_to(root).as_posix() for p in remaining_photos if p.name not in referenced_names]

    report = {
        'timestamp': timestamp,
        'projectRoot': str(root),
        'productsBefore': len(products),
        'productsAfter': len(kept_products),
        'catalogueRowsRemovedThisRun': len(removed_catalogue_ids),
        'removedProducts': [
            {'productId': pid,
             'name': next((p.get('name') for p in deduped_products if str(p.get('id')) == pid), '(catalogue row already removed; sweeping leftover image files)'),
             'reasons': remove_reasons[pid]}
            for pid in sorted(remove_reasons)
        ],
        'photosDeleted': deleted_after_backup,
        'productsAfterCount': len(kept_products),
        'imageMappingsAfter': len(new_index_images),
        'remainingImageFiles': len(remaining_photos),
        'unreferencedImageFilesKeptOnDisk': orphan_names,
        'backupZip': str(backup_zip.relative_to(root)),
        'cleanedImagesZip': str(clean_zip_path.relative_to(root)),
        'duplicateProductRowsRemoved': exact_duplicate_rows,
        'duplicateImageIndexIdsNormalised': sorted(set(duplicate_index_ids)),
        'note': 'Same-name products with different product IDs were retained; they are not assumed duplicates.'
    }
    report_path = root / 'GHARSANSAR_CLEANUP_REPORT.json'
    save_json(report_path, report)

    print('\nCLEANUP APPLIED SUCCESSFULLY')
    print('Backup        :', backup_zip.relative_to(root))
    print('Cleaned photos:', clean_zip_path.name)
    print('Report        :', report_path.name)
    print('Products left :', len(kept_products))
    print('Images mapped :', len(new_index_images))
    if orphan_names:
        print(f'NOTE: {len(orphan_names)} unreferenced image file(s) remain on disk; they were not deleted automatically.')
    return 0


if __name__ == '__main__':
    try:
        raise SystemExit(main())
    except KeyboardInterrupt:
        print('\nCancelled by user.')
        raise SystemExit(130)
    except Exception as exc:
        print(f'FATAL ERROR: {exc}')
        raise SystemExit(10)
