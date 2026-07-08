# Démo PayBrain — prépare tout en une commande (Windows PowerShell).
# Usage :  powershell -ExecutionPolicy Bypass -File scripts\demo-setup.ps1
# Puis, dans deux terminaux :
#   npm run dev --workspace=@paybrain/api
#   npm run dev --workspace=@paybrain/checkout

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

Write-Host '== 1/5  Vérification de Docker ==' -ForegroundColor Cyan
docker info *> $null
if ($LASTEXITCODE -ne 0) {
  Write-Host 'Docker ne répond pas. Lancez Docker Desktop puis relancez ce script.' -ForegroundColor Red
  exit 1
}

Write-Host '== 2/5  Démarrage PostgreSQL + Redis ==' -ForegroundColor Cyan
docker compose up -d postgres redis

Write-Host '== 3/5  Fichier apps/api/.env (dev) ==' -ForegroundColor Cyan
$envPath = Join-Path $root 'apps\api\.env'
if (-not (Test-Path $envPath)) {
@'
NODE_ENV=development
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/paybrain
REDIS_URL=redis://localhost:6379
JWT_SECRET=dev-jwt-secret-please-change-abcdefghijklmnop
WALLET_JWT_SECRET=dev-wallet-secret-please-change-abcdefghij
QR_SIGNING_SECRET=dev-qr-secret-please-change-0123456789abcdef
API_KEY_PEPPER=dev-only-pepper-not-for-production-0000000000
'@ | Out-File -FilePath $envPath -Encoding utf8
  Write-Host "  Créé : $envPath"
} else {
  Write-Host "  Déjà présent : $envPath (inchangé)"
}

Write-Host '== 4/5  Attente de PostgreSQL ==' -ForegroundColor Cyan
$ready = $false
for ($i = 0; $i -lt 30; $i++) {
  docker compose exec -T postgres pg_isready -U postgres *> $null
  if ($LASTEXITCODE -eq 0) { $ready = $true; break }
  Start-Sleep -Seconds 2
}
if (-not $ready) { Write-Host 'PostgreSQL non prêt à temps.' -ForegroundColor Red; exit 1 }

Write-Host '== 5/5  Migrations + données de démo ==' -ForegroundColor Cyan
$env:DATABASE_URL = 'postgresql://postgres:postgres@localhost:5432/paybrain'
npm run db:migrate --workspace=@paybrain/database
npm run db:seed     --workspace=@paybrain/database

Write-Host ''
Write-Host 'Démo prête. Lancez maintenant, dans deux terminaux :' -ForegroundColor Green
Write-Host '  npm run dev --workspace=@paybrain/api'
Write-Host '  npm run dev --workspace=@paybrain/checkout'
Write-Host 'Puis ouvrez le lien de paiement affiché ci-dessus (payeur +242066000001 / PIN 1234).'
