<#
.SYNOPSIS
  One-off data migration from the legacy ssid_/sst_ model to the new pro_ model
  on D365-SCHULZ-INT-11, so the new "Solution Administration Console (Pro)" app
  starts with the existing working solutions, merge history and release notes.

.DESCRIPTION
  Copies records table-by-table, remapping lookups (old GUID -> new GUID) and
  preserving the original createdon (via overriddencreatedon) so merge-history
  ordering and the incremental release-notes cutoff stay intact.
  Idempotent: records already present in the target (matched by a natural key)
  are reused, not duplicated. Numeric choice values are identical in both models,
  so they copy verbatim.

  Runs as a PLAN (dry run) by default. Pass -Execute to write.

.EXAMPLE
  ./migrate-int11.ps1                 # dry run – shows what would migrate
  ./migrate-int11.ps1 -Execute        # performs the migration
#>
[CmdletBinding()]
param(
  [string]$EnvironmentUrl = 'https://operations-d365-schulz-int-11.crm4.dynamics.com',
  [string]$TenantId       = '24686796-cf09-4d11-ac19-9ab3819f3491',
  [switch]$Execute
)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'lib/Dataverse.ps1')
$mode = if ($Execute) { 'EXECUTE' } else { 'DRY-RUN' }
Write-Host "=== INT-11 data migration ($mode) ===" -ForegroundColor Cyan
$null = Connect-Dataverse -EnvironmentUrl $EnvironmentUrl -TenantId $TenantId

function Get-All($set) {
  $rows = @(); $url = "$set"
  do {
    $r = Invoke-Dv -Method GET -Path $url
    $rows += $r.value
    $next = $r.'@odata.nextLink'
    $url = $next
  } while ($url)
  ,$rows
}
function Owner($old) {
  if (-not $old._ownerid_value) { return @{} }
  $lln = $old.'_ownerid_value@Microsoft.Dynamics.CRM.lookuplogicalname'
  $set = if ($lln -eq 'team') { 'teams' } else { 'systemusers' }
  @{ "ownerid@odata.bind" = "/$set($($old._ownerid_value))" }
}
function Put([hashtable]$h, $k, $v) { if ($null -ne $v) { $h[$k] = $v } }
# Create a record; if it fails and an owner bind was supplied, retry without it
# (team / disabled / app-user owners can reject the bind — don't abort the run).
function New-Rec($set, [hashtable]$body) {
  try { return (Invoke-Dv -Method POST -Path $set -Body $body).MetadataId }
  catch {
    if ($body.ContainsKey('ownerid@odata.bind')) {
      $body.Remove('ownerid@odata.bind')
      Write-Host "    (retry without owner)" -ForegroundColor DarkYellow
      return (Invoke-Dv -Method POST -Path $set -Body $body).MetadataId
    }
    throw
  }
}

# ---- 1. workbenchsettings (org-owned, parent of workingsolution) -----------
$oldWBS = Get-All 'ssid_workbenchsettingses'
$newWBS = Get-All ('pro_workbenchsettingses?$select=pro_workbenchsettingsid,pro_name')
$wbsMap = @{}   # old id -> new id
foreach ($o in $oldWBS) {
  $key = "$($o.ssid_name)"
  $existing = $newWBS | Where-Object { "$($_.pro_name)" -eq $key } | Select-Object -First 1
  if ($existing) { $wbsMap[$o.ssid_workbenchsettingsid] = $existing.pro_workbenchsettingsid; continue }
  $body = @{}
  Put $body 'pro_name' $o.ssid_name
  Put $body 'pro_mastersolutionuniquename' $o.ssid_mastersolutionuniquename
  Put $body 'pro_publisher_str' $o.ssid_publisher_str
  Put $body 'pro_publisherid' $o.ssid_publisherid
  Put $body 'pro_deploymentsolutionuniquename' $o.sst_deploymentsolutionuniquename
  if ($Execute) {
    $r = Invoke-Dv -Method POST -Path 'pro_workbenchsettingses' -Body $body
    $wbsMap[$o.ssid_workbenchsettingsid] = $r.MetadataId
  }
  Write-Host ("  workbenchsettings + '{0}'" -f $o.ssid_name) -ForegroundColor Green
}
Write-Host ("workbenchsettings: {0} old, {1} reused, {2} to create" -f $oldWBS.Count, $wbsMap.Count, ($oldWBS.Count - ($wbsMap.Keys | Where-Object { $newWBS.pro_workbenchsettingsid -contains $wbsMap[$_] }).Count))

# ---- 2. workingsolution (user-owned; WorkbenchSetting + self lookup) -------
$oldWS = Get-All 'ssid_workingsolutions'
$newWS = Get-All ('pro_workingsolutions?$select=pro_workingsolutionid,pro_uniquesolutionname,pro_devopsid,pro_name')
$wsMap = @{}    # old id -> new id
function WsKey($uniq,$devops,$name) { if ($uniq) { "U:$uniq" } else { "N:$name|$devops" } }
$newWsIndex = @{}
foreach ($n in $newWS) { $newWsIndex[(WsKey $n.pro_uniquesolutionname $n.pro_devopsid $n.pro_name)] = $n.pro_workingsolutionid }

$deferredSelfLookup = @()   # @{ newId; oldDeploymentSolutionOldId }
foreach ($o in $oldWS) {
  $k = WsKey $o.ssid_uniquesolutionname $o.ssid_devopsid $o.ssid_name
  if ($newWsIndex.ContainsKey($k)) { $wsMap[$o.ssid_workingsolutionid] = $newWsIndex[$k]; continue }
  $body = Owner $o
  Put $body 'pro_name' $o.ssid_name
  Put $body 'pro_devopsid' $o.ssid_devopsid
  Put $body 'pro_uniquesolutionname' $o.ssid_uniquesolutionname
  Put $body 'pro_deploymentstatus' $o.ssid_deploymentstatus
  Put $body 'pro_devopslink' $o.ssid_devopslink
  Put $body 'pro_last_merge_into_core_dat' $o.ssid_last_merge_into_core_dat
  Put $body 'pro_merge_into_core_bit' $o.ssid_merge_into_core_bit
  Put $body 'pro_solutionlink' $o.ssid_solutionlink
  Put $body 'pro_type_opt' $o.sst_type_opt
  Put $body 'pro_devopsworkitemtype' $o.sst_devopsworkitemtype
  Put $body 'pro_devopsworkitemstatus' $o.sst_devopsworkitemstatus
  Put $body 'pro_devopsareapath' $o.sst_devopsareapath
  Put $body 'pro_devopsiterationpath' $o.sst_devopsiterationpath
  Put $body 'pro_allowedmergetypes' $o.sst_allowedmergetypes
  Put $body 'pro_excludedmergetypes' $o.sst_excludedmergetypes
  Put $body 'pro_mergeintodeploymentsolution' $o.sst_mergeintodeploymentsolution
  Put $body 'pro_lastmergeintodeploymentsolution' $o.sst_lastmergeintodeploymentsolution
  Put $body 'overriddencreatedon' ($o.overriddencreatedon ?? $o.createdon)
  if ($o._ssid_workbenchsetting_value -and $wbsMap.ContainsKey($o._ssid_workbenchsetting_value)) {
    $body['pro_WorkbenchSetting@odata.bind'] = "/pro_workbenchsettingses($($wbsMap[$o._ssid_workbenchsetting_value]))"
  }
  if ($Execute) {
    $newId = New-Rec 'pro_workingsolutions' $body
    $wsMap[$o.ssid_workingsolutionid] = $newId
    if ($o.statecode -eq 1) { Invoke-Dv -Method PATCH -Path "pro_workingsolutions($newId)" -Body @{ statecode=1; statuscode=($o.statuscode ?? 2) } | Out-Null }
    if ($o._sst_deploymentsolution_id_value) { $deferredSelfLookup += @{ newId=$newId; oldDep=$o._sst_deploymentsolution_id_value } }
  }
  Write-Host ("  workingsolution + '{0}' ({1})" -f $o.ssid_name, $o.ssid_uniquesolutionname) -ForegroundColor Green
}
# second pass: self lookup (deployment solution) now that all ids exist
foreach ($d in $deferredSelfLookup) {
  if ($wsMap.ContainsKey($d.oldDep)) {
    Invoke-Dv -Method PATCH -Path "pro_workingsolutions($($d.newId))" -Body @{ 'pro_DeploymentSolution_id@odata.bind' = "/pro_workingsolutions($($wsMap[$d.oldDep]))" } | Out-Null
  }
}
Write-Host ("workingsolution: {0} old, {1} mapped" -f $oldWS.Count, $wsMap.Count)

# ---- 3. mergerun (user-owned; target -> workingsolution) -------------------
$oldMR = Get-All 'sst_mergeruns'
$newMR = Get-All ('pro_mergeruns?$select=pro_name_str')
$mrKeys = @($newMR | ForEach-Object { "$($_.pro_name_str)" })
$mrCreated = 0
foreach ($o in $oldMR) {
  if ($mrKeys -contains "$($o.sst_name_str)") { continue }
  $body = Owner $o
  Put $body 'pro_name_str' $o.sst_name_str
  Put $body 'pro_added_int' $o.sst_added_int
  Put $body 'pro_skipped_int' $o.sst_skipped_int
  Put $body 'pro_errors_int' $o.sst_errors_int
  Put $body 'pro_sources_txt' $o.sst_sources_txt
  Put $body 'pro_addedcomponents_txt' $o.sst_addedcomponents_txt
  Put $body 'overriddencreatedon' ($o.overriddencreatedon ?? $o.createdon)
  if ($o._sst_targetsolution_ref_value -and $wsMap.ContainsKey($o._sst_targetsolution_ref_value)) {
    $body['pro_targetsolution_ref@odata.bind'] = "/pro_workingsolutions($($wsMap[$o._sst_targetsolution_ref_value]))"
  }
  if ($Execute) { New-Rec 'pro_mergeruns' $body | Out-Null }
  $mrCreated++
}
Write-Host ("mergerun: {0} old, {1} to create" -f $oldMR.Count, $mrCreated)

# ---- 4. releasenote (org-owned; release -> workingsolution) ----------------
$oldRN = Get-All 'sst_releasenotes'
$newRN = Get-All ('pro_releasenotes?$select=pro_name')
$rnKeys = @($newRN | ForEach-Object { "$($_.pro_name)" })
$rnCreated = 0
foreach ($o in $oldRN) {
  if ($rnKeys -contains "$($o.sst_name)") { continue }
  $body = @{}
  Put $body 'pro_name' $o.sst_name
  Put $body 'pro_version_txt' $o.sst_version_txt
  Put $body 'pro_markdown_txt' $o.sst_markdown_txt
  Put $body 'pro_plaintext_txt' $o.sst_plaintext_txt
  Put $body 'pro_summary_txt' $o.sst_summary_txt
  Put $body 'overriddencreatedon' ($o.overriddencreatedon ?? $o.createdon)
  if ($o._sst_releasesolution_ref_value -and $wsMap.ContainsKey($o._sst_releasesolution_ref_value)) {
    $body['pro_releasesolution_ref@odata.bind'] = "/pro_workingsolutions($($wsMap[$o._sst_releasesolution_ref_value]))"
  }
  if ($Execute) { Invoke-Dv -Method POST -Path 'pro_releasenotes' -Body $body | Out-Null }
  $rnCreated++
}
Write-Host ("releasenote: {0} old, {1} to create" -f $oldRN.Count, $rnCreated)
Write-Host ""
Write-Host ("Migration $mode complete." ) -ForegroundColor Green
if (-not $Execute) { Write-Host "Re-run with -Execute to write the records." -ForegroundColor Yellow }
