@echo off
setlocal EnableExtensions
cd /d "%~dp0"

 echo =============================================================
 echo GHARSANSAR - REMOVE PRODUCTS WITH MISSING / BROKEN IMAGE SETS
 echo =============================================================
 echo.

if not exist "data\products.json" (
  echo ERROR: data\products.json not found.
  echo Keep this BAT file in the GharSansar project root.
  pause
  exit /b 1
)
if not exist "data\image-index.json" (
  echo ERROR: data\image-index.json not found.
  pause
  exit /b 1
)
if not exist "product_images" (
  echo ERROR: product_images folder not found.
  echo Restore/extract your product images first.
  pause
  exit /b 1
)

where py >nul 2>nul
if errorlevel 1 (
  echo ERROR: Python launcher 'py' is not available.
  echo Install Python for Windows with the Python Launcher enabled.
  pause
  exit /b 1
)

if not exist "tools\cleanup_missing_products.py" (
  echo ERROR: tools\cleanup_missing_products.py not found.
  echo Keep the tools folder from the updated GharSansar ZIP.
  pause
  exit /b 1
)

 echo This tool will:
 echo   1. Remove AF-P1-049.
 echo   2. Remove a product if ANY mapped image is missing.
 echo   3. Remove a product if image numbering has a gap (for example -1 missing,
 echo      but -2 / -3 still exist).
 echo   4. Delete all remaining photos belonging to a removed product.
 echo   5. Update products.json, image-index.json and image-index.csv.
 echo   6. Rebuild product/category share pages and validate all image paths.
 echo   7. Create a backup ZIP and a cleaned product-images ZIP.
 echo.
 echo IMPORTANT: Run only AFTER all intended images are in product_images.
 echo.

py -3 "tools\cleanup_missing_products.py" --root "%CD%" --apply
if errorlevel 1 (
  echo.
  echo CLEANUP SCRIPT STOPPED OR FAILED. Check the message above.
  pause
  exit /b 1
)

 echo.
 echo Rebuilding product and category share pages...
py -3 "tools\generate_share_pages.py"
if errorlevel 1 (
  echo ERROR: Share-page generation failed.
  pause
  exit /b 1
)

 echo.
 echo Running strict catalogue + image validation...
py -3 "tools\validate_catalogue.py" --require-images
if errorlevel 1 (
  echo.
  echo VALIDATION FAILED. Do not push yet.
  echo Your pre-cleanup backup is available in _cleanup_backups.
  pause
  exit /b 1
)

 echo.
 echo =============================================================
 echo SUCCESS - GHARSANSAR CLEANUP COMPLETE
 echo =============================================================
 echo Updated JSON files:
 echo   data\products.json
 echo   data\image-index.json
 echo   data\image-index.csv
 echo.
 echo Cleaned image ZIP:
 echo   GHARSANSAR_PRODUCT_IMAGES_CLEANED.zip
 echo.
 echo Backup folder:
 echo   _cleanup_backups\
 echo.
 echo Review report:
 echo   GHARSANSAR_CLEANUP_REPORT.json
 echo.
 echo You can now review the changes and run your Git commands.
 echo No Git push was performed automatically.
 echo.
pause
