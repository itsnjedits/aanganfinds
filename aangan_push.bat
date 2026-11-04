
@echo off
title Aangan Finds - Git Push

cd /d "Y:\WEB DEVELOPMENT\aanganfinds"

echo.
echo ========================================
echo       AANGAN FINDS - GIT UPLOAD
echo ========================================
echo.

git add .
if errorlevel 1 goto error

git commit -m "-"
if errorlevel 1 goto error

git push origin main
if errorlevel 1 goto error

echo.
echo ========================================
echo       SUCCESS! PUSH COMPLETED
echo ========================================
echo.
pause
exit /b

:error
echo.
echo ========================================
echo       ERROR! PROCESS STOPPED
echo ========================================
echo.
pause
