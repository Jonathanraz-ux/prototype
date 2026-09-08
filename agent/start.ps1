# ============================================================
# start.ps1 — Lance l'agent local WiFi Zone (Windows).
# Charge agent/.env puis exécute node main.mjs.
#
# Usage :
#   .\agent\start.ps1            (mode configuré par .env)
#   .\agent\start.ps1 -Mock      (simulateur sans équipement)
# ============================================================

param(
  [switch]$Mock
)

$ErrorActionPreference = "Stop"
$AgentDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$EnvFile = Join-Path $AgentDir ".env"
$ScriptFile = Join-Path $AgentDir "main.mjs"

if (-not (Test-Path -LiteralPath $EnvFile)) {
  Write-Host "Fichier de configuration introuvable : agent\.env" -ForegroundColor Yellow
  Write-Host "Copiez agent\.env.example.agent vers agent\.env puis complétez les valeurs." -ForegroundColor Yellow
  exit 1
}

# Charge les variables du fichier agent\.env dans l'environnement.
Get-Content -LiteralPath $EnvFile | ForEach-Object {
  $line = $_.Trim()
  if ($line -and -not $line.StartsWith("#")) {
    if ($line -match "^([^=]+)=(.*)$") {
      $name = $Matches[1].Trim()
      $value = $Matches[2].Trim().Trim('"').Trim("'")
      [System.Environment]::SetEnvironmentVariable($name, $value, "Process")
    }
  }
}

$args = @()
if ($Mock) {
  Write-Host "Mode MOCK (simulateur, aucun équipement requis)" -ForegroundColor Cyan
  $args = @("--mock")
}

node $ScriptFile @args