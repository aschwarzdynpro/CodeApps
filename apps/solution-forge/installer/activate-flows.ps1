<#
.SYNOPSIS
  Binds the Dataverse connection reference and ACTIVATES the three Transfer Run
  cloud flows after a MANAGED solution import — without going through the Maker
  Portal "Turn on" button.

.DESCRIPTION
  The transfer executor flows are authored as raw clientdata (Web API) and use
  dynamic `*WithOrganization` connector operations (the entity and the target
  org URL are runtime expressions). The Maker Portal "Turn on" button — and the
  designer — resolve the connector schema at design time via
  `GetMetadataForGetEntityWithOrganization`; with a runtime-only `organization`
  that call goes out unresolved and fails with

    InvalidOpenApiFlow / DynamicOperationRequestClientFailure … 401 Unauthorized
    … "The response is not in a JSON format."

  so the flows cannot be turned on from the portal (and render only partially in
  the designer — this is cosmetic; the flows execute in full at runtime).

  Activating via a direct Dataverse `statecode` PATCH bypasses that design-time
  validation — which is exactly how the flows are activated on the dev/host env.
  This script does the same at a customer AFTER a managed import: it only sets
  the operational state (and, optionally, binds the connection reference); it
  never rewrites the flow definition, so no unmanaged layer is created over the
  managed components.

  Prerequisites in the target environment:
    - the managed solution imported (flows present as managed components)
    - a Dataverse connection whose service principal can read/write every
      configured source and target environment (pass its id with -ConnectionId,
      or bind the connection reference first in the Maker Portal)

.EXAMPLE
  # Bind the connection reference to a connection and activate, in one go:
  pwsh installer/activate-flows.ps1 -EnvironmentUrl https://<org>.crm4.dynamics.com -TenantId <guid> `
       -ConnectionReference pro_CR_SAC_Dataverse -ConnectionId <connection-guid>

.EXAMPLE
  # Connection reference already bound in the portal — just activate:
  pwsh installer/activate-flows.ps1 -EnvironmentUrl https://<org>.crm4.dynamics.com -TenantId <guid>
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory)][string]$EnvironmentUrl,
  [string]$TenantId,
  # Logical name of the Dataverse connection reference the flows bind to.
  # Playground export ships `pro_CR_SAC_Dataverse`; other installs use `pro_CRDataverse`.
  [string]$ConnectionReference = 'pro_CR_SAC_Dataverse',
  # Optional: bind the connection reference to this connection (GUID) before
  # activating. Omit if you already bound it in the Maker Portal.
  [string]$ConnectionId,
  # The three transfer flows to activate. Child first is not required for
  # activation, but the parent's webhook only makes sense once it is on.
  [string[]]$FlowNames = @(
    'PA | AUTO | Transfer Run | Execute Cell',
    'PA | AUTO | Transfer Run | Execute Package',
    'PA | AUTO | Transfer Run | Scheduler'
  )
)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'lib/Dataverse.ps1')

$hostUrl = $EnvironmentUrl.TrimEnd('/')
Connect-Dataverse -EnvironmentUrl $hostUrl -TenantId $TenantId | Out-Null

# --- 1. Connection reference: bind (optional) + sanity check -----------------
$cr = (Invoke-Dv -Method GET -Path "connectionreferences?`$select=connectionreferenceid,connectionid&`$filter=connectionreferencelogicalname eq '$ConnectionReference'").value
if (-not $cr) {
  throw "Connection reference '$ConnectionReference' not found — is the managed solution imported, and is the logical name correct? (playground export = pro_CR_SAC_Dataverse)"
}
$refId = $cr[0].connectionreferenceid
if ($ConnectionId) {
  Set-DvConnectionReferenceConnection -ReferenceId $refId -ConnectionId $ConnectionId | Out-Null
  Write-Host "Bound $ConnectionReference -> connection $ConnectionId." -ForegroundColor Green
} elseif (-not $cr[0].connectionid) {
  Write-Warning "$ConnectionReference is UNBOUND. The flows will activate but every run fails until you bind a connection (Maker Portal → Solutions → Connection references, or re-run with -ConnectionId)."
} else {
  Write-Host "$ConnectionReference already bound (connection $($cr[0].connectionid))." -ForegroundColor DarkGray
}

# --- 2. Activate each flow via a plain statecode PATCH -----------------------
foreach ($name in $FlowNames) {
  $safe = $name.Replace("'", "''")
  $wf = (Invoke-Dv -Method GET -Path "workflows?`$select=workflowid,statecode,statuscode&`$filter=name eq '$safe' and category eq 5").value
  if (-not $wf) {
    Write-Warning "Flow '$name' not found — skipping. (Check the solution imported and the flow name matches.)"
    continue
  }
  $id = $wf[0].workflowid
  if ($wf[0].statecode -eq 1) {
    Write-Host "Flow '$name' already active." -ForegroundColor DarkGray
    continue
  }
  try {
    Invoke-Dv -Method PATCH -Path "workflows($id)" -Body @{ statecode = 1; statuscode = 2 } | Out-Null
    Write-Host "Activated '$name'." -ForegroundColor Green
  } catch {
    Write-Warning "Could not activate '$name': $($_.Exception.Message)"
    Write-Warning "  If this is a metadata/401 error, the connection reference is not bound to a working connection — bind it and re-run."
  }
}

Write-Host ""
Write-Host "Done. Do NOT use the Maker Portal 'Turn on' button for these flows — it validates the dynamic connector schema at design time and fails with a 401; this statecode activation is the supported path." -ForegroundColor Cyan
