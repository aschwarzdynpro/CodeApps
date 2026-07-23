<#
.SYNOPSIS
  Deploys (create-or-update) the Transfer Run executor cloud flow into a
  Dataverse environment — the queue-driven executor of the Configuration Data
  Transfer Hub (docs/transfer-hub-contract.md).

.DESCRIPTION
  The flow definition lives in executor-flow.clientdata.json next to this
  script (the __HOST_URL__ placeholder is replaced with the target
  environment's URL). The flow is created via the Web API (workflows table,
  category 5) inside the app solution, bound to the existing connection
  reference `pro_CRDataverse`, then activated. Re-runnable: an existing flow
  of the same name is deactivated, updated and reactivated.

  Prerequisites in the target environment:
    - the pro_ data model incl. pro_transferrun (installer/provision-model.ps1)
    - connection reference pro_CRDataverse bound to a Dataverse SP connection
      with read/write access to every configured source/target environment

.EXAMPLE
  pwsh installer/deploy-executor-flow.ps1 -EnvironmentUrl https://operations-d365-schulz-int-11.crm4.dynamics.com -TenantId <guid>
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory)][string]$EnvironmentUrl,
  [string]$TenantId,
  [string]$SolutionUniqueName = 'DynamicsProSolutionAdminConsole',
  [string]$FlowName = 'PA | AUTO | Transfer Run | Execute Package'
)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'lib/Dataverse.ps1')

$hostUrl = $EnvironmentUrl.TrimEnd('/')
Connect-Dataverse -EnvironmentUrl $hostUrl -TenantId $TenantId | Out-Null

# Sanity: the connection reference must exist (and ideally be bound).
$cr = (Invoke-Dv -Method GET -Path "connectionreferences?`$select=connectionreferenceid,connectionid&`$filter=connectionreferencelogicalname eq 'pro_CRDataverse'").value
if (-not $cr) { throw "Connection reference 'pro_CRDataverse' not found — run the app installer first." }
if (-not $cr[0].connectionid) { Write-Warning "pro_CRDataverse is UNBOUND — bind a connection before the flow can run." }

$clientData = Get-Content (Join-Path $PSScriptRoot 'executor-flow.clientdata.json') -Raw
$clientData = $clientData.Replace('__HOST_URL__', $hostUrl)

$existing = (Invoke-Dv -Method GET -Path "workflows?`$select=workflowid,statecode&`$filter=name eq '$($FlowName.Replace("'","''"))' and category eq 5").value
if ($existing) {
  $id = $existing[0].workflowid
  Write-Host "Flow '$FlowName' exists ($id) — updating." -ForegroundColor DarkGray
  if ($existing[0].statecode -eq 1) {
    Invoke-Dv -Method PATCH -Path "workflows($id)" -Body @{ statecode = 0; statuscode = 1 } | Out-Null
    Write-Host "  deactivated." -ForegroundColor DarkGray
  }
  Invoke-Dv -Method PATCH -Path "workflows($id)" -Body @{ clientdata = $clientData } -Solution $SolutionUniqueName | Out-Null
  Write-Host "  clientdata updated." -ForegroundColor Green
} else {
  $r = Invoke-Dv -Method POST -Path 'workflows' -Body @{
    name          = $FlowName
    category      = 5
    type          = 1
    primaryentity = 'none'
    description   = 'Executes queued Transfer Runs of the Configuration Data Transfer Hub (see docs/transfer-hub-contract.md). Deployed by installer/deploy-executor-flow.ps1 — do not edit in the designer; changes belong in executor-flow.clientdata.json.'
    clientdata    = $clientData
  } -Solution $SolutionUniqueName
  $id = $r.MetadataId
  Write-Host "Created flow '$FlowName' ($id)." -ForegroundColor Green
}

Invoke-Dv -Method PATCH -Path "workflows($id)" -Body @{ statecode = 1; statuscode = 2 } | Out-Null
Write-Host "Activated." -ForegroundColor Green
Write-Host ""
Write-Host "Executor flow ready — queued pro_transferrun rows will now be executed." -ForegroundColor Green
