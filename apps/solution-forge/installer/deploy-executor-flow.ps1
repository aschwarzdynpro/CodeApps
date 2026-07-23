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
  [string]$FlowName = 'PA | AUTO | Transfer Run | Execute Package',
  [string]$ChildFlowName = 'PA | AUTO | Transfer Run | Execute Cell',
  [string]$SchedulerFlowName = 'PA | AUTO | Transfer Run | Scheduler',
  # Dataverse connection reference the flows bind to — differs per install
  # (Schulz: pro_CRDataverse, Playground: pro_CR_SAC_Dataverse).
  [string]$ConnectionReference = 'pro_CRDataverse'
)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'lib/Dataverse.ps1')

$hostUrl = $EnvironmentUrl.TrimEnd('/')
Connect-Dataverse -EnvironmentUrl $hostUrl -TenantId $TenantId | Out-Null

# Sanity: the connection reference must exist (and ideally be bound).
$cr = (Invoke-Dv -Method GET -Path "connectionreferences?`$select=connectionreferenceid,connectionid&`$filter=connectionreferencelogicalname eq '$ConnectionReference'").value
if (-not $cr) { throw "Connection reference '$ConnectionReference' not found — run the app installer first." }
if (-not $cr[0].connectionid) { Write-Warning "$ConnectionReference is UNBOUND — bind a connection before the flows can run." }

# Create-or-update + activate one flow from a clientdata template file.
# Returns the workflowid (needed to wire the parent's child-flow reference).
function Deploy-Flow($name, $templateFile, $description, $extraReplace = @{}) {
  $clientData = Get-Content (Join-Path $PSScriptRoot $templateFile) -Raw
  $clientData = $clientData.Replace('__HOST_URL__', $hostUrl).Replace('__CONNREF__', $ConnectionReference)
  foreach ($k in $extraReplace.Keys) { $clientData = $clientData.Replace($k, $extraReplace[$k]) }
  $existing = (Invoke-Dv -Method GET -Path "workflows?`$select=workflowid,statecode&`$filter=name eq '$($name.Replace("'","''"))' and category eq 5").value
  if ($existing) {
    $id = $existing[0].workflowid
    Write-Host "Flow '$name' exists ($id) — updating." -ForegroundColor DarkGray
    if ($existing[0].statecode -eq 1) {
      Invoke-Dv -Method PATCH -Path "workflows($id)" -Body @{ statecode = 0; statuscode = 1 } | Out-Null
      Write-Host "  deactivated." -ForegroundColor DarkGray
    }
    Invoke-Dv -Method PATCH -Path "workflows($id)" -Body @{ clientdata = $clientData } -Solution $SolutionUniqueName | Out-Null
    Write-Host "  clientdata updated." -ForegroundColor Green
  } else {
    $r = Invoke-Dv -Method POST -Path 'workflows' -Body @{
      name          = $name
      category      = 5
      type          = 1
      primaryentity = 'none'
      description   = $description
      clientdata    = $clientData
    } -Solution $SolutionUniqueName
    $id = $r.MetadataId
    Write-Host "Created flow '$name' ($id)." -ForegroundColor Green
  }
  Invoke-Dv -Method PATCH -Path "workflows($id)" -Body @{ statecode = 1; statuscode = 2 } | Out-Null
  Write-Host "  activated." -ForegroundColor Green
  return $id
}

# The child (per-cell worker with top-level parallel loops) must exist and be
# active BEFORE the parent that references it via the Workflow action.
$childId = Deploy-Flow $ChildFlowName 'executor-child-flow.clientdata.json' 'Executes ONE entry x target cell of a Transfer Run with parallel row loops - called by the Execute Package flow (see docs/transfer-hub-contract.md). Deployed by installer/deploy-executor-flow.ps1 - do not edit in the designer; changes belong in executor-child-flow.clientdata.json.'
Deploy-Flow $FlowName 'executor-flow.clientdata.json' 'Executes queued Transfer Runs of the Configuration Data Transfer Hub (see docs/transfer-hub-contract.md). Deployed by installer/deploy-executor-flow.ps1 - do not edit in the designer; changes belong in executor-flow.clientdata.json.' @{ '__CHILD_ID__' = $childId } | Out-Null
Deploy-Flow $SchedulerFlowName 'scheduler-flow.clientdata.json' 'Promotes due Scheduled Transfer Runs (pro_scheduledfor_dat <= now) to Queued every 5 minutes so the executor picks them up. Deployed by installer/deploy-executor-flow.ps1 - do not edit in the designer; changes belong in scheduler-flow.clientdata.json.' | Out-Null

Write-Host ""
Write-Host "Executor + scheduler flows ready — queued runs execute immediately, scheduled runs once due." -ForegroundColor Green
