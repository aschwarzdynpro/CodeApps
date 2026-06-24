<#
.SYNOPSIS
  Interactive installer for the Solution Administration Console Code App into a
  Dataverse environment (new customer or new environment).

.DESCRIPTION
  Walks through:
    1. Prerequisite check (pac, power-apps npm CLI, node, Az.Accounts).
    2. Target environment + device-code sign-in.
    3. Data model provisioning (publisher "Dynamics Pro", prefix pro, 4 tables).
    4. Dataverse connection selection.
    5. Customer configuration (default publisher for new working solutions,
       core/deployment solution unique names, Compare target environments,
       optional Azure DevOps org/project, deployment-manager role name).
    6. Seed the mandatory pro_workbenchsettings bootstrap record.
    7. Write .env.local (data-driven runtime config) and push the Code App.
    8. Post-install checklist.

  The product schema is fixed (prefix `pro`), so the pushed app references the
  data model correctly with no per-customer code changes.

.EXAMPLE
  pwsh installer/install.ps1
  pwsh installer/install.ps1 -EnvironmentUrl https://contoso.crm4.dynamics.com -TenantId <guid>
#>
[CmdletBinding()]
param(
  [string]$EnvironmentUrl,
  [string]$TenantId,
  [string]$ConnectionId,
  [string]$AppDisplayName = 'Solution Administration Console',
  [switch]$UseConnectionReference,   # also wire a pro_CRDataverse connection reference (only needed for managed-solution distribution)
  [switch]$SkipProvision,
  [switch]$SkipPush
)
$ErrorActionPreference = 'Stop'
# The power-apps (npm) CLI reliably aborts on process exit with a libuv
# assertion (exit 9) AFTER doing its work — init/push still succeed. Don't let
# that native exit code throw (PS 7.4 would, under ErrorActionPreference=Stop);
# cmdlet errors still stop the script. We verify the actual results explicitly.
$PSNativeCommandUseErrorActionPreference = $false
$here    = $PSScriptRoot
$appRoot = Split-Path $here -Parent
. (Join-Path $here 'lib/Dataverse.ps1')

function Title($t) { Write-Host ""; Write-Host "== $t ==" -ForegroundColor Cyan }
function Ask($prompt, $default) {
  $suffix = if ($default) { " [$default]" } else { '' }
  $v = Read-Host ("{0}{1}" -f $prompt, $suffix)
  if ([string]::IsNullOrWhiteSpace($v)) { return $default }
  $v.Trim()
}
function AskYesNo($prompt, [bool]$default = $true) {
  $d = if ($default) { 'Y/n' } else { 'y/N' }
  $v = Read-Host "$prompt ($d)"
  if ([string]::IsNullOrWhiteSpace($v)) { return $default }
  return $v.Trim() -match '^(y|j)'
}
function Select-One($items, [scriptblock]$display, [string]$prompt) {
  if (-not $items -or $items.Count -eq 0) { return $null }
  for ($i = 0; $i -lt $items.Count; $i++) {
    Write-Host ("  [{0}] {1}" -f ($i + 1), (& $display $items[$i]))
  }
  while ($true) {
    $sel = Read-Host $prompt
    if ($sel -match '^\d+$' -and [int]$sel -ge 1 -and [int]$sel -le $items.Count) {
      return $items[[int]$sel - 1]
    }
    Write-Host "  Bitte eine Nummer aus der Liste wählen." -ForegroundColor Yellow
  }
}

Write-Host "Solution Administration Console — Installer" -ForegroundColor Green
Write-Host "(publisher 'Dynamics Pro', prefix 'pro')" -ForegroundColor DarkGray

# ---- 1. Prerequisites ------------------------------------------------------
Title 'Voraussetzungen'
foreach ($cmd in 'pac','power-apps','node') {
  $exe = Get-Command $cmd -ErrorAction SilentlyContinue
  if (-not $exe) { throw "Erforderliches Tool fehlt: '$cmd'. Bitte installieren und erneut starten." }
  Write-Host ("  ok  {0}" -f $cmd) -ForegroundColor DarkGray
}
if (-not (Get-Module -ListAvailable Az.Accounts)) {
  throw "Az.Accounts fehlt. Install-Module Az.Accounts -Scope CurrentUser"
}
Write-Host "  ok  Az.Accounts" -ForegroundColor DarkGray

# ---- 2. Target environment + sign-in --------------------------------------
Title 'Ziel-Environment'
if (-not $EnvironmentUrl) {
  $EnvironmentUrl = Ask 'Dataverse Environment-URL (https://<org>.crm*.dynamics.com)'
}
if (-not $EnvironmentUrl) { throw "Keine Environment-URL angegeben." }
if (-not $TenantId) { $TenantId = Ask 'Tenant-ID (optional, Enter = automatisch)' '' }
$null = Connect-Dataverse -EnvironmentUrl $EnvironmentUrl -TenantId $TenantId

# Power Platform environment id (NOT the Dataverse organizationid) — needed for
# maker deep links and `power-apps init`. Try to resolve from pac, else ask.
$envId = $null
try {
  $list = pac env list --json 2>$null | ConvertFrom-Json
  $match = $list | Where-Object { $_.EnvironmentUrl -and ($_.EnvironmentUrl.TrimEnd('/') -eq $EnvironmentUrl.TrimEnd('/')) } | Select-Object -First 1
  if ($match) { $envId = $match.EnvironmentId }
} catch {}
if (-not $envId) { $envId = Ask 'Power Platform Environment-ID (aus Maker-URL .../environments/<ID>/...)' '' }
if (-not $envId) { throw "Environment-ID erforderlich (für Maker-Links und power-apps init)." }
Write-Host ("  Environment-ID: {0}" -f $envId) -ForegroundColor DarkGray

# ---- 3. Provision data model ----------------------------------------------
Title 'Datenmodell'
if ($SkipProvision) {
  Write-Host "  übersprungen (-SkipProvision)" -ForegroundColor DarkGray
} else {
  $provArgs = @{ EnvironmentUrl = $EnvironmentUrl }
  if ($TenantId) { $provArgs.TenantId = $TenantId }
  & (Join-Path $here 'provision-model.ps1') @provArgs
}
$solutionId = (Invoke-Dv -Method GET -Path "solutions?`$select=solutionid&`$filter=uniquename eq 'DynamicsProSolutionAdminConsole'").value[0].solutionid

# ---- 4. Dataverse connection ----------------------------------------------
# The connector is bound directly to a connection (its GUID is baked into
# power.config at push). We discover it via `pac connection list` (uses the pac
# auth profile — no npm-CLI hang). -UseConnectionReference additionally wires a
# pro_CRDataverse connection reference (only worthwhile for managed-solution
# distribution; for power-apps push it makes no runtime difference).
Title 'Dataverse-Connection'
$connectorId = '/providers/Microsoft.PowerApps/apis/shared_commondataserviceforapps'
$connectionId = $ConnectionId
if (-not $connectionId) {
  $rows = @(pac connection list 2>$null) | Where-Object { $_ -match 'shared_commondataserviceforapps' -and $_ -match 'Connected' }
  $parsed = @()
  foreach ($r in $rows) {
    if ($r -match '^\s*(\S+)\s+(.*?)\s+/providers/') { $parsed += [pscustomobject]@{ id = $Matches[1]; name = $Matches[2].Trim() } }
  }
  if ($parsed.Count -eq 1) { $connectionId = $parsed[0].id; Write-Host ("  Connection gefunden: {0}" -f $parsed[0].name) -ForegroundColor DarkGray }
  elseif ($parsed.Count -gt 1) { $pick = Select-One $parsed { param($c) "{0}  ({1})" -f $c.name, $c.id } 'Connection-Nummer wählen'; if ($pick) { $connectionId = $pick.id } }
}
if (-not $connectionId) {
  Write-Host "Keine Dataverse-Connection im Ziel-Environment gefunden." -ForegroundColor Yellow
  Write-Host "Lege EINMALIG eine an (Maker -> Connections -> Microsoft Dataverse) und" -ForegroundColor Yellow
  Write-Host "starte erneut, oder gib sie direkt mit: install.ps1 ... -ConnectionId <id>" -ForegroundColor Yellow
  $connectionId = Ask 'Connection-ID (leer = abbrechen)' ''
  if (-not $connectionId) { throw "Ohne Dataverse-Connection kann der Connector nicht gebunden werden." }
}
Write-Host ("  Connection: {0}" -f $connectionId) -ForegroundColor DarkGray

# Optional connection reference (managed-solution distribution only).
$connRefName = $null
if ($UseConnectionReference) {
  $connRefName = 'pro_CRDataverse'
  $ref = New-DvConnectionReference -LogicalName $connRefName -ConnectorId $connectorId `
    -ConnectionId $connectionId -DisplayName 'Dynamics Pro — Dataverse' -Solution 'DynamicsProSolutionAdminConsole'
  if (-not $ref.ConnectionId) { Set-DvConnectionReferenceConnection -ReferenceId $ref.Id -ConnectionId $connectionId }
  Write-Host ("  Connection-Reference {0} gebunden." -f $connRefName) -ForegroundColor DarkGray
}

# ---- 5. Bootstrap rows (config itself is managed in Dataverse) ------------
# No config prompts: default publisher, Compare/Dependency targets, ADO
# org/project and the deployment-manager role are all maintained in the
# Dataverse config tables (pro_workbenchsettings / pro_environmentconfig), which
# the app reads at startup. The wizard only seeds the mandatory bootstrap rows;
# the admin fills in the values in the Maker afterwards.
Title 'Bootstrap-Records (Config wird in Dataverse gepflegt)'
$existing = (Invoke-Dv -Method GET -Path "pro_workbenchsettingses?`$select=pro_workbenchsettingsid&`$filter=statecode eq 0&`$top=1").value
if ($existing -and $existing.Count -gt 0) {
  Write-Host "  pro_workbenchsettings 'Default' existiert bereits — übersprungen." -ForegroundColor DarkGray
} else {
  Invoke-Dv -Method POST -Path 'pro_workbenchsettingses' -Body @{ pro_name = 'Default' } | Out-Null
  Write-Host "  + pro_workbenchsettings 'Default' (Publisher/ADO/Rolle im Maker setzen)" -ForegroundColor Green
}
$curEnv = (Invoke-Dv -Method GET -Path "pro_environmentconfigs?`$select=pro_environmentconfigid&`$filter=pro_iscurrent eq true&`$top=1").value
if ($curEnv -and $curEnv.Count -gt 0) {
  Write-Host "  pro_environmentconfig (aktuelle Env) existiert bereits — übersprungen." -ForegroundColor DarkGray
} else {
  Invoke-Dv -Method POST -Path 'pro_environmentconfigs' -Body @{
    pro_name = 'Current'; pro_key = 'dev'; pro_url = $EnvironmentUrl.TrimEnd('/')
    pro_environmentid = $envId; pro_iscurrent = $true; pro_order_int = 0
  } | Out-Null
  Write-Host "  + pro_environmentconfig 'Current' (UAT/PROD im Maker ergänzen)" -ForegroundColor Green
}

# ---- 6. Configure + push the Code App -------------------------------------
Title 'Code App konfigurieren & deployen'
Push-Location $appRoot
try {
  # .env.local carries only the deploy-time intrinsics: this environment's id +
  # URL. The current-env URL is needed for the very first read (before the
  # config tables load); everything else is data-driven from Dataverse.
  $curRow = [pscustomobject]@{ key='dev'; label='Current'; url=$EnvironmentUrl.TrimEnd('/'); environmentId=$envId; isCurrent=$true }
  $envJson = (,$curRow) | ConvertTo-Json -Compress -AsArray
  $envLines = @(
    "VITE_ENVIRONMENT_ID=$envId",
    "VITE_ENVIRONMENTS=$envJson"
  )
  Set-Content -Path (Join-Path $appRoot '.env.local') -Value ($envLines -join "`n") -NoNewline
  Write-Host "  .env.local geschrieben (nur Env-Id/-URL; restliche Config aus Dataverse)." -ForegroundColor DarkGray

  if ($SkipPush) {
    Write-Host "  Push übersprungen (-SkipPush). Manuelle Schritte siehe CLAUDE.md Bootstrap." -ForegroundColor Yellow
  } else {
    Write-Host "  pac auth: aktiviere ein Profil für dieses Environment …"
    $authList = @(pac auth list 2>&1)
    $line = $authList | Where-Object { $_ -match [regex]::Escape($EnvironmentUrl.TrimEnd('/')) } | Select-Object -First 1
    if ($line -and $line -match '^\s*\[(\d+)\]') {
      pac auth select --index $Matches[1] 2>&1 | Select-Object -Last 1
    } else {
      pac auth create --deviceCode --environment $EnvironmentUrl 2>&1 | Select-Object -Last 3
    }
    if (Test-Path 'power.config.json') { Remove-Item 'power.config.json' -Force }
    power-apps init --non-interactive -n "$AppDisplayName" --cloud prod -e $envId -b ./dist -f index.html -a http://localhost:3000 2>&1 | Select-Object -Last 2
    if (-not (Test-Path 'power.config.json')) { throw "power-apps init hat keine power.config.json erzeugt — Abbruch." }
    foreach ($t in 'solution','publisher','solutioncomponent','msdyn_solutioncomponentsummary','systemuser','role','pro_workingsolution','pro_workbenchsettings','pro_mergerun','pro_releasenote','pro_environmentconfig') {
      & .\scripts\add-data-source.ps1 -a dataverse -t $t 2>&1 | Select-Object -Last 1
    }
    if ($connRefName) {
      & .\scripts\add-data-source.ps1 -a shared_commondataserviceforapps -cr $connRefName -s $solutionId 2>&1 | Select-Object -Last 1
    } else {
      & .\scripts\add-data-source.ps1 -a shared_commondataserviceforapps -c $connectionId 2>&1 | Select-Object -Last 1
    }
    npm install 2>&1 | Select-Object -Last 1
    if ($LASTEXITCODE -ne 0) { throw "npm install fehlgeschlagen (Exit $LASTEXITCODE)." }
    npm run build 2>&1 | Select-Object -Last 3
    if ($LASTEXITCODE -ne 0) { throw "npm run build fehlgeschlagen (Exit $LASTEXITCODE)." }
    # power-apps push aborts on exit with a libuv assertion even on success, so
    # judge by the output, not the exit code.
    $pushOut = power-apps push 2>&1
    $pushOut | Select-Object -Last 4
    if ($pushOut -match 'pushed successfully' -or $pushOut -match '/play/') {
      Write-Host "  App erfolgreich deployed." -ForegroundColor Green
    } else {
      Write-Host "  WARN: Push-Ergebnis unklar — Ausgabe oben prüfen." -ForegroundColor Yellow
    }
  }
} finally { Pop-Location }

# ---- 7. Checklist ----------------------------------------------------------
Title 'Fertig — Nachbereitung'
$cfgUrl = "https://make.powerapps.com/environments/$envId/solutions/$solutionId/objects"
Write-Host @"
Config in Dataverse pflegen (die App liest sie beim Start):
  - pro_workbenchsettings 'Default': Default-Publisher (pro_publisher_str),
    ADO Org/Projekt, Deployment-Manager-Rollenname.
  - pro_environmentconfig: UAT/PROD als weitere Compare-/Dependency-Ziele anlegen.
  $cfgUrl

Weitere Schritte:
  1. Deployment-Manager-Security-Rolle den Managern zuweisen und allen Nutzern
     Lese-/Schreibrechte auf die pro_*-Tabellen geben.
  2. Connection '$connectionId' mit dem Team teilen (Can use).
  3. App im Maker einer Solution zuordnen: 'Add existing -> App -> Code app'.
  4. DevOps-Panel ist deaktiviert (config.ts DEVOPS_PANEL_ENABLED) — bei Bedarf
     nach SP-Setup aktivieren.
"@ -ForegroundColor Gray
Write-Host "Installation abgeschlossen." -ForegroundColor Green
