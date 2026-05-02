# Koken met Sjakie — Start Script (PowerShell)
$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "  Koken met Sjakie — Op weg naar sterrenniveau" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""

# Check Node.js
try {
    $nodeVersion = node --version 2>&1
    Write-Host "[1/4] Node.js gevonden: $nodeVersion" -ForegroundColor Green
} catch {
    Write-Host "[FOUT] Node.js niet gevonden!" -ForegroundColor Red
    Write-Host "Download: https://nodejs.org (versie 18+)" -ForegroundColor Yellow
    Read-Host "Druk Enter om af te sluiten"
    exit 1
}

# Install dependencies
Write-Host ""
Write-Host "[2/4] Dependencies installeren..." -ForegroundColor Yellow
npm install --no-audit --no-fund
if ($LASTEXITCODE -ne 0) {
    Write-Host "[FOUT] npm install mislukt" -ForegroundColor Red
    Read-Host "Druk Enter om af te sluiten"
    exit 1
}

# Setup database
Write-Host ""
Write-Host "[3/4] Database instellen..." -ForegroundColor Yellow
npx prisma generate
npx prisma db push --accept-data-loss

# Start server
Write-Host ""
Write-Host "[4/4] App starten..." -ForegroundColor Green
Write-Host ""
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "  Open: http://localhost:3000" -ForegroundColor Green
Write-Host "  Stoppen: Ctrl+C" -ForegroundColor Yellow
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""
npm run dev
