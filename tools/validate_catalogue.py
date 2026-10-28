#!/usr/bin/env python3
"""Check product catalogue IDs, categories, prices, and local image paths."""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PRODUCTS_FILE = ROOT / "data" / "products.json"
CATEGORIES_FILE = ROOT / "data" / "categories.json"


def main() -> int:
    try:
        products = json.loads(PRODUCTS_FILE.read_text(encoding="utf-8"))
        categories = json.loads(CATEGORIES_FILE.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        print(f"ERROR: Could not read catalogue JSON: {exc}")
        return 1

    category_ids = {item.get("id") for item in categories if isinstance(item, dict)}
    seen_ids: set[str] = set()
    seen_slugs: set[str] = set()
    errors: list[str] = []
    for index, item in enumerate(products, start=1):
        if not isinstance(item, dict):
            errors.append(f"Product row {index} is not an object")
            continue
        pid = str(item.get("id", ""))
        if not pid:
            errors.append(f"Product row {index} has no id")
        elif pid in seen_ids:
            errors.append(f"Duplicate product id: {pid}")
        seen_ids.add(pid)
        slug = str(item.get("slug", ""))
        if slug and slug in seen_slugs:
            errors.append(f"Duplicate slug: {slug}")
        if slug:
            seen_slugs.add(slug)
        if not isinstance(item.get("price"), (int, float)) or item.get("price", 0) < 0:
            errors.append(f"{pid or 'Row ' + str(index)} has invalid price")
        if item.get("category") not in category_ids - {"all"}:
            errors.append(f"{pid or 'Row ' + str(index)} references unknown category {item.get('category')!r}")
        images = item.get("images", [])
        if not isinstance(images, list) or not images:
            errors.append(f"{pid or 'Row ' + str(index)} has no images array")
            continue
        for image in images:
            if not isinstance(image, str) or not image.startswith("./"):
                errors.append(f"{pid or 'Row ' + str(index)} image path must start with './': {image!r}")
                continue
            image_path = (ROOT / image[2:]).resolve()
            if ROOT.resolve() not in image_path.parents and image_path != ROOT.resolve():
                errors.append(f"{pid} image path escapes project directory: {image}")
            elif not image_path.is_file():
                errors.append(f"{pid} image not found: {image}")

    if errors:
        print("CATALOGUE CHECK FAILED:")
        for error in errors:
            print(f" - {error}")
        return 1
    print(f"OK: {len(products)} products, {len(category_ids) - 1} non-All categories, no duplicate IDs, all image files found.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
