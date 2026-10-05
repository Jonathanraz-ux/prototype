# ============================================================
# start.ps1 — Lance l'agent local WiFi Zone (Windows).
# Charge agent/.env puis exécute node main.mjs.
#
# Usage :
#   .\agent\start.ps1            (mode configuré par .env)
#   .\agent\start.ps1 -Mock      (simulateur sans équipement)
#   .\agent\start.ps1 -Doctor    (contrôle pré-vol, puis QUITTE)
#
# Provisionnement du routeur (voir provision.mjs) :
#   .\agent\start.ps1 -Provision    pose la config, DÉSARMÉE
#   .\agent\start.ps1 -Verify       relit la config, n'écrit RIEN
#   .\agent\start.ps1 -Arm          arme la règle de blocage
#   .\agent\start.ps1 -Undo         ne retire que nos objets (wz:)
# ============================================================

param(
  [switch]$Mock,
  [switch]$Doctor,
  [switch]$Provision,
  [switch]$Verify,
  [switch]$Arm,
  [switch]$Undo,
  [string]$IpAgent = ""
)

$ErrorActionPreference = "Stop"
$AgentDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$EnvFile = Join-Path $AgentDir ".env"
$ScriptFile = Join-Path $AgentDir "main.mjs"
$ProvisionFile = Join-Path $AgentDir "provision.mjs"

if (-not (Test-Path -LiteralPath $ScriptFile)) {
  Write-Host "main.mjs introuvable dans $AgentDir" -ForegroundColor Red
  exit 1
}

# Le fichier .env n'est plus strictement nécessaire (l'agent le lit
# lui-même) : on n'interrompt que s'il est absent ET qu'aucune
# variable d'environnement ne fournit la configuration.
$hasEnvVars = $env:SUPABASE_URL -and $env:AGENT_TOKEN
if (-not (Test-Path -LiteralPath $EnvFile) -and -not $hasEnvVars) {
  Write-Host "Fichier de configuration introuvable : agent\.env" -ForegroundColor Yellow
  Write-Host "Copiez agent\.env.example.agent vers agent\.env puis complétez les valeurs." -ForegroundColor Yellow
  exit 1
}

# Charge les variables du fichier agent\.env dans l'environnement.
if (Test-Path -LiteralPath $EnvFile) {
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
}

$nodeArgs = @()
if ($Mock) {
  Write-Host "Mode MOCK (simulateur, aucun équipement requis)" -ForegroundColor Cyan
  $nodeArgs += "--mock"
}
if ($Doctor) {
  Write-Host "Contrôle pré-vol (doctor) : configuration, serveur, routeur" -ForegroundColor Cyan
  $nodeArgs += "--doctor"
}

if ($Doctor -and $Mock) {
  Write-Host "  (en mode mock, les droits routeur ne sont pas vérifiables)" -ForegroundColor DarkGray
}

# ---- Provisionnement du routeur --------------------------------
# Chemin séparé : ces modes ne démarrent PAS l'agent. Ils configurent
# ou contrôlent le routeur, puis quittent. Mélanger les deux ferait
# qu'une commande de repair se mette à piloter des sessions.
if ($Provision -or $Verify -or $Arm -or $Undo) {
  if (-not (Test-Path -LiteralPath $ProvisionFile)) {
    Write-Host "provision.mjs introuvable dans $AgentDir" -ForegroundColor Red
    exit 1
  }
  $provArgs = @()
  if ($Verify)  { $provArgs += "--verify" }
  if ($Arm)     { $provArgs += "--arm" }
  if ($Undo)    { $provArgs += "--undo" }
  if ($IpAgent -ne "") { $provArgs += @("--ip-agent", $IpAgent) }

  $title = if ($Undo) { "RETOUR ARRIERE" } elseif ($Verify) { "VERIFICATION (n'ecrit rien)" } elseif ($Arm) { "ARMEMENT" } else { "PROVISIONNEMENT" }
  Write-Host "== $title du routeur MikroTik ==" -ForegroundColor Cyan
  if ($Mock) {
    Write-Host "  -Mock ignore ici : le provisionnement ne se simule pas (une simulation" -ForegroundColor DarkYellow
    Write-Host "  validerait les dix etapes sans rien ecrire sur un equipment)." -ForegroundColor DarkYellow
  }
  if (-not $Arm -and -not $Undo) {
    Write-Host "  La regle de blocage est posee DESACTIVEE : Internet continue de fonctionner." -ForegroundColor DarkGray
    Write-Host "  Armer ensuite avec : .\agent\start.ps1 -Arm" -ForegroundColor DarkGray
  }
  node $ProvisionFile @provArgs
  exit $LASTEXITCODE
}

node $ScriptFile @nodeArgs
exit $LASTEXITCODE
