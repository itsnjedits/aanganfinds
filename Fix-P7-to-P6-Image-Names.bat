@echo off
setlocal EnableExtensions
cd /d "%~dp0"

echo ===============================================
echo GharSansar - Product Image Filename Correction
echo ===============================================
echo.

if not exist "data\products.json" (
  echo ERROR: data\products.json not found.
  echo Place this BAT file in the GharSansar project root.
  pause
  exit /b 1
)
if not exist "data\image-index.json" (
  echo ERROR: data\image-index.json not found.
  echo Place this BAT file in the GharSansar project root.
  pause
  exit /b 1
)
if not exist "product_images" (
  echo ERROR: product_images folder not found.
  pause
  exit /b 1
)

REM Ensure every expected P7 source exists and no P6 target exists.
for %%N in (
  001-1 001-2 002-1 003-1 004-1 005-1 005-2 006-1 006-2 006-3 007-1 007-2
) do (
  if not exist "product_images\AF-P7-%%N.jpg" (
    echo ERROR: Missing source image AF-P7-%%N.jpg
    echo No files have been renamed. Check that the P7 image ZIP was extracted.
    pause
    exit /b 1
  )
  if exist "product_images\AF-P6-%%N.jpg" (
    echo ERROR: Target already exists: AF-P6-%%N.jpg
    echo No files have been renamed to avoid overwriting anything.
    pause
    exit /b 1
  )
)

echo All 12 source images found. Renaming P7 filenames to the P6 IDs
 echo already used by your corrected products.json and image-index.json.
echo.

for %%N in (
  001-1 001-2 002-1 003-1 004-1 005-1 005-2 006-1 006-2 006-3 007-1 007-2
) do (
  move "product_images\AF-P7-%%N.jpg" "product_images\AF-P6-%%N.jpg" >nul
  if errorlevel 1 (
    echo ERROR while renaming AF-P7-%%N.jpg
    pause
    exit /b 1
  )
  echo Renamed: AF-P7-%%N.jpg  ^>  AF-P6-%%N.jpg
)

echo.
echo Done. The image contents were not changed; only filenames were corrected.
echo Now run:
echo   py tools\validate_catalogue.py --require-images
echo.
pause
