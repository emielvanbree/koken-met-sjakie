@echo off
title Prisma Fix - Koken met Sjakie
color 0A
echo.
echo  ==========================================
echo   Prisma Client opnieuw genereren...
echo  ==========================================
echo.

cd /d "%~dp0"

echo  Prisma client genereren (SavedRecipe toevoegen)...
call npx prisma generate --no-hints
echo.

echo  Database schema bijwerken...
call npx prisma db push --accept-data-loss --skip-generate
echo.

echo  ==========================================
echo   Klaar! Start nu de server opnieuw:
echo   npm run dev
echo  ==========================================
echo.
pause
