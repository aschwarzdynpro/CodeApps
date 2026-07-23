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
  [switch]$SkipBuild,
  # Set up the environment (config + data sources + build) but do NOT push. Used
  # when a follow-up step must own the push — e.g. the Schulz DevOps-Sync-Flow,
  # which needs 'power-apps add-flow' + 'power-apps push' instead of 'pac code push'.
  [switch]$NoPush
)
$ErrorActionPreference = 'Stop'
$appDir = Split-Path $PSScriptRoot -Parent
$dsInfoPath = Join-Path $appDir '.power\schemas\appschemas\dataSourcesInfo.ts'

# 'power-apps add-flow' regeneriert dataSourcesInfo.ts und droppt dabei den
# handgepflegten retrievemissingdependencies-Block (gotcha #1/#12; addsolution-
# component bleibt, daher greift das Re-Insert in add-data-source.ps1 hier NICHT).
# Template gespiegelt aus scripts/add-data-source.ps1 (dort die Quelle der Wahrheit).
function Restore-RetrieveMissingDependencies($dsInfo) {
  if (-not (Test-Path $dsInfo)) { return }
  if (Select-String -Path $dsInfo -Pattern '"retrievemissingdependencies"' -Quiet) { return }
  $block = @'
  "retrievemissingdependencies": {
    "tableId": "",
    "version": "",
    "primaryKey": "",
    "dataSourceType": "Dataverse",
    "apis": {
      "RetrieveMissingDependencies": {
        "path": "/api/data/v9.2/RetrieveMissingDependencies(SolutionUniqueName='{solutionUniqueName}')",
        "method": "GET",
        "parameters": [
          {
            "name": "solutionUniqueName",
            "in": "path",
            "required": true,
            "type": "string"
          }
        ],
        "responseInfo": {
          "200": {
            "type": "object"
          }
        }
      }
    }
  },
'@
  $content = Get-Content $dsInfo -Raw
  $anchor = "export const dataSourcesInfo = {"
  $content = $content.Replace($anchor, "$anchor`n$block")
  Set-Content -Path $dsInfo -Value $content -NoNewline
  Write-Host "Re-inserted retrievemissingdependencies block into dataSourcesInfo.ts (post add-flow)."
}

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
    # Schulz nutzt den DevOps-Sync-Cloud-Flow. Wenn gesetzt, deployt das Skript
    # ueber die npm-CLI (power-apps add-flow + power-apps push) statt 'pac code
    # push' — sonst fehlt die Flow-Registrierung und der "Sync with DevOps"-Button
    # wirft zur Laufzeit "Connection reference not found" (gotcha #12).
    Flow        = @{ Id = '6253ef0c-c0ef-2377-6ff4-24ebc724b680'; Name = 'PA | MANUAL | Working Solution | Sync DevOps Work Item Status' }
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
foreach ($t in 'solution', 'publisher', 'solutioncomponent', 'msdyn_solutioncomponentsummary', 'systemuser', 'role', 'pro_workingsolution', 'pro_workbenchsettings', 'pro_mergerun', 'pro_releasenote', 'pro_environmentconfig', 'pro_transferpackage', 'pro_transferentry', 'pro_transferrun', 'asyncoperation', 'organization') {
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

# 6) Flow-Registrierung (nur Umgebungen mit Cloud-Flow, z. B. Schulz DevOps-Sync).
#    MUSS vor dem Build laufen (add-flow regeneriert Flow-Service + dataSourcesInfo)
#    und wird bei -NoPush uebersprungen (dann uebernimmt ein separater Schritt).
if ($cfg.Flow -and -not $NoPush) {
  Write-Host "==== register flow '$($cfg.Flow.Name)' ($Env) ====" -ForegroundColor Cyan
  npx --no-install power-apps add-flow --flow-id $cfg.Flow.Id
  if ($LASTEXITCODE -ne 0) {
    throw "power-apps add-flow FAILED (flow $($cfg.Flow.Id)). Ist die npm-CLI im Ziel-Tenant angemeldet? (gotcha #12)"
  }
  Restore-RetrieveMissingDependencies $dsInfoPath
}

# 7) Build
if (-not $SkipBuild) {
  Write-Host "==== build ($Env) ====" -ForegroundColor Cyan
  npm run build
  if ($LASTEXITCODE -ne 0) {
    throw "BUILD FAILED (exit $LASTEXITCODE) — Push abgebrochen (sonst wuerde eine veraltete dist/ deployt). Fix: 'npm install' + 'npm run build' bis gruen, dann erneut."
  }
}

# 8) GUARD re-check + Push
$who2 = pac org who 2>&1 | Out-String
if ($who2 -notmatch [regex]::Escape($cfg.OrgUrl.TrimEnd('/'))) { throw "GUARD (pre-push): aktives Org ist NICHT $($cfg.OrgUrl)." }
if ($NoPush) {
  Write-Host "==== -NoPush: Setup fertig, KEIN Push ($Env) ====" -ForegroundColor Yellow
  Write-Host "power.config.json + Data Sources + Build stehen. Push separat ausfuehren." -ForegroundColor Yellow
  exit 0
}
if ($cfg.Flow) {
  # Mit registriertem Flow MUSS ueber die npm-CLI gepusht werden — 'pac code push'
  # bricht am von add-flow geschriebenen workflowDetails-Block ab (gotcha #12).
  Write-Host "==== power-apps push -> $Env  app=$($cfg.AppId) ====" -ForegroundColor Cyan
  npx --no-install power-apps push
  if ($LASTEXITCODE -ne 0) { throw "power-apps push FAILED (exit $LASTEXITCODE)." }
}
else {
  Write-Host "==== pac code push -> $Env  app=$($cfg.AppId) ====" -ForegroundColor Cyan
  pac code push --solutionName $cfg.Solution
}

Write-Host ""
Write-Host "Fertig ($Env). Play: https://apps.powerapps.com/play/e/$($cfg.EnvId)/app/$($cfg.AppId)" -ForegroundColor Green
