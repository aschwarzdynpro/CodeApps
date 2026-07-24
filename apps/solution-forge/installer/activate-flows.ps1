<#
.SYNOPSIS
  Binds the Dataverse connection reference and activates the three Transfer Run
  cloud flows after a MANAGED solution import. Headless convenience — the Maker
  Portal "Turn on" button works too, once the connection reference is bound.

.DESCRIPTION
  The transfer executor flows are authored as raw clientdata (Web API). Their
  host-environment operations use the connector's `organization: "current"`
  (the connection's own env), so the Maker Portal designer renders them and the
  "Turn on" button validates cleanly once a connection is bound; only the
  child's genuine cross-environment operations pass the source/target org URL as
  a runtime expression.

  This script binds the connection reference (optional) and sets the flows'
  operational state via a Dataverse `statecode` PATCH — handy for CI / silent
  installs where you don't want to click through the portal. It never rewrites
  the flow definition, so no unmanaged layer is created over the managed
  components.

  NOTE (historical): earlier builds baked the *host* environment's URL into
  `organization` at export time; at a different customer that foreign URL was
  unreachable and every activation failed with
  `GetMetadataForGetEntityWithOrganization … 401 … "The response is not in a
  JSON format."`. The `organization: "current"` wiring fixes that — if you
  still see that 401, the flow definition predates the fix (re-export the
  managed solution) or the connection reference is unbound.

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
    Write-Warning "  A metadata/401 here means the connection reference is unbound, OR the flow predates the organization:'current' fix (re-export the managed solution and re-import)."
  }
}

Write-Host ""
Write-Host "Done. The Maker Portal 'Turn on' button works too once the connection reference is bound — this script is just the headless equivalent." -ForegroundColor Cyan
