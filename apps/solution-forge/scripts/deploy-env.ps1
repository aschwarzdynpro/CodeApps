<#
  deploy-env.ps1 — Per-Environment-Direct-Push für die Solution Administration Console (Code App).

  EINE Quelle der Wahrheit ($Registry) für die relevanten Umgebungen. Das Skript:
    1. findet das passende pac-Profil (per Profil-Name, kein fixer Index),
    2. VERIFIZIERT vor dem Push, dass das aktive Org wirklich das Ziel ist (Guard
       gegen Fehl-Deploys — siehe den versehentlichen Waldmann-Push am 2026-06-25),
    3. generiert power.config.json + .env.local passend zur Umgebung,
    4. erzeugt Data Sources + Connector (cr ODER c — je Umgebung),
    5. baut und pusht direkt (unmanaged).

  Waldmann ist bewusst DEAKTIVIERT (Enabled=$false): die Umgebung bekommt die App
  als MANAGED Solution (Import), NICHT per Direct-Push.

  Beispiele:
    pwsh scripts/deploy-env.ps1 -Env playground
    pwsh scripts/deploy-env.ps1 -Env schulz
    pwsh scripts/deploy-env.ps1 -Env schulz -SkipBuild   # nur erneut pushen
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory)][ValidateSet('playground','schulz','waldmann')][string]$Env,
  [switch]$SkipBuild
)
$ErrorActionPreference = 'Stop'
$appDir = Split-Path $PSScriptRoot -Parent

# --- Registry: pro Umgebung App-/Env-IDs, pac-Profil, Connector, Compare-Ziele ---
$Registry = @{
  playground = [ordered]@{
    DisplayName = 'Solution Administration Console'
    ProfileName = 'DPRO'
    OrgUrl      = 'https://ascsfacs.crm4.dynamics.com'
    EnvId       = 'a5b19a39-a9ec-ec82-98b9-74f5cf513c52'
    AppId       = '0f71f8ea-1f93-4ac7-838f-63b5123d4ae9'
    Solution    = 'DynamicsProSolutionAdminConsole'
    Connector   = @{ Mode = 'cr'; Ref = 'pro_CR_SAC_Dataverse'; Solution = 'd64f1785-c86f-f111-ab0d-6045bda01a46' }
    Envs        = @(
      [ordered]@{ key = 'dev'; label = 'Current'; url = 'https://ascsfacs.crm4.dynamics.com'; environmentId = 'a5b19a39-a9ec-ec82-98b9-74f5cf513c52'; isCurrent = $true }
    )
    Enabled     = $true
  }
  schulz = [ordered]@{
    DisplayName = 'Solution Administration Console (Pro)'
    ProfileName = 'SchulzNEW'
    OrgUrl      = 'https://operations-d365-schulz-int-11.crm4.dynamics.com'
    EnvId       = '431783f6-367c-eb49-984b-4e70e4c0424d'
    AppId       = 'cade30e1-dd5c-4532-82eb-fd8520ba7b29'
    Solution    = 'DynamicsProSolutionAdminConsole'
    Connector   = @{ Mode = 'c'; ConnectionId = '73569138b7c4466d9ee6933ad6e66a3c' }
    Envs        = @(
      [ordered]@{ key = 'dev';  label = 'INT-11 - current'; url = 'https://operations-d365-schulz-int-11.crm4.dynamics.com'; environmentId = '431783f6-367c-eb49-984b-4e70e4c0424d'; isCurrent = $true }
      [ordered]@{ key = 'uat';  label = 'UAT';  url = 'https://operations-d365-schulz-uat-1-1.crm4.dynamics.com'; environmentId = '2eaa34de-dcf1-e949-86d9-82d9fd748045' }
      [ordered]@{ key = 'prod'; label = 'PROD'; url = 'https://operations-d365-schulz-prod.crm4.dynamics.com'; environmentId = '0cb8d3e7-faf3-eb34-a648-e3e309c3164d' }
    )
    Enabled     = $true
  }
  waldmann = [ordered]@{
    DisplayName    = 'Solution Administration Console'
    ProfileName    = 'Waldmann'
    OrgUrl         = 'https://waldmann-dev.crm4.dynamics.com'
    EnvId          = '33146d71-4fe8-e1d7-af2f-f80fe968fc47'
    AppId          = '901f3e7f-6b8a-4518-8636-17d3e52499e0'
    Enabled        = $false
    DisabledReason = 'Waldmann bekommt die App als MANAGED Solution (Import), NICHT per Direct-Push. Solution-Deployment verwenden.'
  }
}

$cfg = $Registry[$Env]
if (-not $cfg.Enabled) {
  Write-Host ""
  Write-Host ">> '$Env' ist fuer Direct-Push DEAKTIVIERT." -ForegroundColor Yellow
  Write-Host "   $($cfg.DisabledReason)" -ForegroundColor Yellow
  exit 2
}

Set-Location $appDir

# 1) pac-Profil per Name finden + aktivieren (kein fixer Index — Indizes driften)
$list = pac auth list
$line = $list | Where-Object { $_ -match ("\b" + [regex]::Escape($cfg.ProfileName) + "\b") } | Select-Object -First 1
if (-not $line) {
  throw "Kein pac-Profil '$($cfg.ProfileName)' fuer $($cfg.OrgUrl) gefunden. Anlegen: pac auth create --deviceCode --environment $($cfg.OrgUrl)"
}
$idx = ([regex]'\[(\d+)\]').Match($line).Groups[1].Value
pac auth select --index $idx | Out-Null

# 2) GUARD: aktives Org MUSS das Ziel sein (sonst Abbruch)
$who = pac org who 2>&1 | Out-String
if ($who -notmatch [regex]::Escape($cfg.OrgUrl.TrimEnd('/'))) {
  throw "GUARD: aktives Org ist NICHT $($cfg.OrgUrl).`n$who"
}
Write-Host "GUARD ok: $($cfg.OrgUrl) aktiv" -ForegroundColor Green

# 3) power.config.json (Basis — Connector/Tabellen fuellt der Generator unten)
$pc = [ordered]@{
  version = '1.0'; appId = $cfg.AppId; appDisplayName = $cfg.DisplayName; region = 'prod'
  environmentId = $cfg.EnvId; description = ' '; buildPath = './dist'; buildEntryPoint = 'index.html'
  localAppUrl = 'http://localhost:3000'; logoPath = 'Default'
  connectionReferences = [ordered]@{}; databaseReferences = [ordered]@{}
}
($pc | ConvertTo-Json -Depth 6) | Set-Content power.config.json -NoNewline

# 4) .env.local — Build-Fallback fuer Compare/Dependency (Runtime liest pro_environmentconfig)
$envJson = $cfg.Envs | ForEach-Object { [pscustomobject]$_ } | ConvertTo-Json -Compress -AsArray
@("VITE_ENVIRONMENT_ID=$($cfg.EnvId)", "VITE_ENVIRONMENTS=$envJson") -join "`n" | Set-Content .env.local -NoNewline

# 5) Data Sources (immer gleiches pro_-Schema) + Connector (cr ODER c)
foreach ($t in 'solution', 'publisher', 'solutioncomponent', 'msdyn_solutioncomponentsummary', 'systemuser', 'role', 'pro_workingsolution', 'pro_workbenchsettings', 'pro_mergerun', 'pro_releasenote', 'pro_environmentconfig') {
  & .\scripts\add-data-source.ps1 -a dataverse -t $t 2>&1 | Select-Object -Last 1 | Out-Null
}
if ($cfg.Connector.Mode -eq 'cr') {
  & .\scripts\add-data-source.ps1 -a shared_commondataserviceforapps -cr $cfg.Connector.Ref -s $cfg.Connector.Solution 2>&1 | Select-Object -Last 1
}
else {
  & .\scripts\add-data-source.ps1 -a shared_commondataserviceforapps -c $cfg.Connector.ConnectionId 2>&1 | Select-Object -Last 1
}

# Snapshot zur Referenz (gitignored)
New-Item -ItemType Directory -Force (Join-Path $appDir 'deploy') | Out-Null
Copy-Item power.config.json (Join-Path $appDir "deploy\$Env.power.config.json") -Force

# 6) Build
if (-not $SkipBuild) {
  Write-Host "==== build ($Env) ====" -ForegroundColor Cyan
  npm run build 2>&1 | Select-Object -Last 1
}

# 7) GUARD re-check + Push
$who2 = pac org who 2>&1 | Out-String
if ($who2 -notmatch [regex]::Escape($cfg.OrgUrl.TrimEnd('/'))) { throw "GUARD (pre-push): aktives Org ist NICHT $($cfg.OrgUrl)." }
Write-Host "==== push -> $Env  app=$($cfg.AppId) ====" -ForegroundColor Cyan
pac code push --solutionName $cfg.Solution

Write-Host ""
Write-Host "Fertig ($Env). Play: https://apps.powerapps.com/play/e/$($cfg.EnvId)/app/$($cfg.AppId)" -ForegroundColor Green
