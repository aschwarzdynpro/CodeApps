<#
  Dataverse.ps1 — shared helpers for the Solution Administration Console installer.

  Token acquisition prefers an existing Az context for the target tenant (no
  re-login); otherwise it falls back to an Az device-code sign-in (per the
  user's standing preference: always device code for Entra logins).

  Dot-source this file, then:
    $dv = Connect-Dataverse -EnvironmentUrl https://org.crm4.dynamics.com [-TenantId <guid>]
    Invoke-Dv -Method GET  -Path 'WhoAmI'
    Invoke-Dv -Method POST -Path 'EntityDefinitions' -Body $obj -Solution 'MySolution'
#>

$script:Dv = $null

function Get-DataverseToken {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory)][string]$EnvironmentUrl,
    [string]$TenantId
  )
  if (-not (Get-Module -ListAvailable Az.Accounts)) {
    throw "Az.Accounts module is required. Install-Module Az.Accounts -Scope CurrentUser"
  }
  Import-Module Az.Accounts -ErrorAction Stop | Out-Null
  $resource = $EnvironmentUrl.TrimEnd('/')

  $ctx = $null
  if ($TenantId) {
    $ctx = Get-AzContext -ListAvailable | Where-Object { $_.Tenant.Id -eq $TenantId } | Select-Object -First 1
  } else {
    $ctx = Get-AzContext
  }

  $getToken = {
    param($context)
    $t = Get-AzAccessToken -ResourceUrl $resource -DefaultProfile $context -WarningAction SilentlyContinue
    if ($t.Token -is [System.Security.SecureString]) {
      (New-Object System.Net.NetworkCredential('', $t.Token)).Password
    } else { $t.Token }
  }

  if ($ctx) {
    try { return (& $getToken $ctx) } catch { Write-Verbose "Cached context token failed: $($_.Exception.Message)" }
  }

  Write-Host ""
  Write-Host ">> Anmeldung am Tenant erforderlich (Device-Code-Flow)." -ForegroundColor Yellow
  Write-Host "   Folge der angezeigten URL + Code im Browser." -ForegroundColor Yellow
  $connectArgs = @{ UseDeviceAuthentication = $true }
  if ($TenantId) { $connectArgs.Tenant = $TenantId }
  $acct = Connect-AzAccount @connectArgs -ErrorAction Stop
  return (& $getToken $acct.Context)
}

function Connect-Dataverse {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory)][string]$EnvironmentUrl,
    [string]$TenantId
  )
  $base = $EnvironmentUrl.TrimEnd('/')
  $token = Get-DataverseToken -EnvironmentUrl $base -TenantId $TenantId
  $script:Dv = [pscustomobject]@{
    Base    = $base
    ApiBase = "$base/api/data/v9.2"
    Token   = $token
  }
  $who = Invoke-Dv -Method GET -Path 'WhoAmI'
  Write-Host ("Connected to {0}  (user {1})" -f $base, $who.UserId) -ForegroundColor Green
  return $script:Dv
}

function Invoke-Dv {
  <# Thin Web API wrapper. Returns parsed JSON for GET; for writes returns a
     small object with StatusCode + EntityId/MetadataId pulled from headers. #>
  [CmdletBinding()]
  param(
    [ValidateSet('GET','POST','PATCH','DELETE','PUT')][string]$Method = 'GET',
    [Parameter(Mandatory)][string]$Path,
    [object]$Body,
    [string]$Solution,
    [switch]$Raw
  )
  if (-not $script:Dv) { throw "Call Connect-Dataverse first." }
  $uri = if ($Path -match '^https?://') { $Path } else { "$($script:Dv.ApiBase)/$($Path.TrimStart('/'))" }
  $headers = @{
    Authorization      = "Bearer $($script:Dv.Token)"
    'OData-MaxVersion' = '4.0'
    'OData-Version'    = '4.0'
    Accept             = 'application/json'
    'Content-Type'     = 'application/json; charset=utf-8'
  }
  if ($Solution) { $headers['MSCRM.SolutionUniqueName'] = $Solution }
  # NB: do NOT request return=representation — Dataverse then omits the
  # OData-EntityId response header, which is how we recover the new record id.

  $params = @{ Uri = $uri; Method = $Method; Headers = $headers; SkipHttpErrorCheck = $true }
  if ($PSBoundParameters.ContainsKey('Body') -and $null -ne $Body) {
    $params.Body = if ($Body -is [string]) { $Body } else { $Body | ConvertTo-Json -Depth 30 -Compress }
  }
  $resp = Invoke-WebRequest @params
  $code = [int]$resp.StatusCode
  if ($code -ge 400) {
    $msg = $resp.Content
    try { $msg = ($resp.Content | ConvertFrom-Json).error.message } catch {}
    throw "Dataverse $Method $Path -> HTTP $code : $msg"
  }
  if ($Raw) { return $resp }
  $entityId = $null
  if ($resp.Headers['OData-EntityId']) { $entityId = ($resp.Headers['OData-EntityId'] | Select-Object -First 1) }
  $metadataId = $null
  if ($entityId -and $entityId -match '\(([0-9a-fA-F-]{36})\)') { $metadataId = $Matches[1] }
  $content = $null
  if ($resp.Content) { try { $content = $resp.Content | ConvertFrom-Json } catch {} }
  if ($Method -eq 'GET') { return $content }
  return [pscustomobject]@{ StatusCode = $code; EntityId = $entityId; MetadataId = $metadataId; Content = $content }
}

function Test-DvExists {
  param([Parameter(Mandatory)][string]$Path)
  try { $null = Invoke-Dv -Method GET -Path $Path; return $true } catch { return $false }
}

# ---- Metadata label helpers -------------------------------------------------
function New-DvLabel {
  param([Parameter(Mandatory)][string]$Text, [int]$Lcid = 1033)
  @{ '@odata.type' = 'Microsoft.Dynamics.CRM.Label'
     LocalizedLabels = @(@{ '@odata.type' = 'Microsoft.Dynamics.CRM.LocalizedLabel'; Label = $Text; LanguageCode = $Lcid }) }
}
function New-DvOption {
  param([Parameter(Mandatory)][int]$Value, [Parameter(Mandatory)][string]$Label)
  @{ '@odata.type' = 'Microsoft.Dynamics.CRM.OptionMetadata'; Value = $Value; Label = (New-DvLabel $Label) }
}
function New-DvReq { param([string]$Level = 'None') @{ Value = $Level } }

# Ensure a connection reference record exists (bound to a connection), so that
# `pac code add-data-source -cr <logicalName>` can resolve the connection.
# Returns the connectionreferenceid. Idempotent.
function New-DvConnectionReference {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory)][string]$LogicalName,   # e.g. pro_CRDataverse (publisher-prefixed)
    [Parameter(Mandatory)][string]$ConnectorId,   # /providers/Microsoft.PowerApps/apis/shared_commondataserviceforapps
    [Parameter(Mandatory)][string]$ConnectionId,  # the connection's name GUID
    [string]$DisplayName,
    [string]$Solution
  )
  $existing = (Invoke-Dv -Method GET -Path "connectionreferences?`$select=connectionreferenceid&`$filter=connectionreferencelogicalname eq '$LogicalName'").value
  if ($existing -and $existing.Count) { return $existing[0].connectionreferenceid }
  $body = @{
    connectionreferencelogicalname = $LogicalName
    connectionreferencedisplayname = ($DisplayName ? $DisplayName : $LogicalName)
    connectorid  = $ConnectorId
    connectionid = $ConnectionId
  }
  (Invoke-Dv -Method POST -Path 'connectionreferences' -Body $body -Solution $Solution).MetadataId
}
