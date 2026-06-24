<#
.SYNOPSIS
  Provisions the Solution Administration Console data model (prefix `pro`,
  publisher "Dynamics Pro") into a target Dataverse environment.

.DESCRIPTION
  Creates — idempotently — the publisher, a solution, and the four custom
  tables with all columns, choices and lookups the Code App needs:
    pro_workingsolution, pro_workbenchsettings, pro_mergerun, pro_releasenote
  Numeric choice values are pinned to the product's canonical values
  (867520000.. / 500870000.. / componenttype codes) regardless of the
  publisher's option-value prefix, so the app's constants stay stable.

  Re-runnable: existing publisher / solution / tables / columns / lookups are
  detected and skipped.

.EXAMPLE
  ./provision-model.ps1 -EnvironmentUrl https://operations-d365-schulz-int-11.crm4.dynamics.com
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory)][string]$EnvironmentUrl,
  [string]$TenantId,
  [string]$PublisherUniqueName  = 'DynamicsPro',
  [string]$PublisherFriendlyName= 'Dynamics Pro',
  [string]$Prefix               = 'pro',
  [int]$OptionValuePrefix       = 64100,
  [string]$SolutionUniqueName   = 'DynamicsProSolutionAdminConsole',
  [string]$SolutionFriendlyName = 'Solution Administration Console',
  [string]$SolutionVersion      = '1.0.0.0'
)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'lib/Dataverse.ps1')

$p = $Prefix
Connect-Dataverse -EnvironmentUrl $EnvironmentUrl -TenantId $TenantId | Out-Null

# ---- 1. Publisher ----------------------------------------------------------
$pub = (Invoke-Dv -Method GET -Path "publishers?`$select=publisherid,uniquename&`$filter=uniquename eq '$PublisherUniqueName'").value
if ($pub) {
  $publisherId = $pub[0].publisherid
  Write-Host "Publisher '$PublisherUniqueName' exists." -ForegroundColor DarkGray
} else {
  $r = Invoke-Dv -Method POST -Path 'publishers' -Body @{
    uniquename = $PublisherUniqueName
    friendlyname = $PublisherFriendlyName
    customizationprefix = $p
    customizationoptionvalueprefix = $OptionValuePrefix
  }
  $publisherId = $r.MetadataId
  Write-Host "Created publisher '$PublisherUniqueName' (prefix '$p')." -ForegroundColor Green
}

# ---- 2. Solution -----------------------------------------------------------
$sol = (Invoke-Dv -Method GET -Path "solutions?`$select=solutionid,uniquename&`$filter=uniquename eq '$SolutionUniqueName'").value
if ($sol) {
  Write-Host "Solution '$SolutionUniqueName' exists." -ForegroundColor DarkGray
} else {
  Invoke-Dv -Method POST -Path 'solutions' -Body @{
    uniquename = $SolutionUniqueName
    friendlyname = $SolutionFriendlyName
    version = $SolutionVersion
    'publisherid@odata.bind' = "/publishers($publisherId)"   # lowercase bind (gotcha #2)
  } | Out-Null
  Write-Host "Created solution '$SolutionUniqueName'." -ForegroundColor Green
}

# ---- attribute payload builders -------------------------------------------
function Lbl($t) { New-DvLabel $t }
function StrAttr($schema,$max,$req,$display,$fmt='Text') {
  @{ '@odata.type'='Microsoft.Dynamics.CRM.StringAttributeMetadata'; AttributeType='String'
     AttributeTypeName=@{ Value='StringType' }; SchemaName=$schema; MaxLength=$max
     FormatName=@{ Value=$fmt }; RequiredLevel=(New-DvReq $req); DisplayName=(Lbl $display) }
}
function MemoAttr($schema,$max,$req,$display) {
  @{ '@odata.type'='Microsoft.Dynamics.CRM.MemoAttributeMetadata'; AttributeType='Memo'
     AttributeTypeName=@{ Value='MemoType' }; SchemaName=$schema; MaxLength=$max; Format='Text'
     RequiredLevel=(New-DvReq $req); DisplayName=(Lbl $display) }
}
function IntAttr($schema,$min,$max,$req,$display) {
  @{ '@odata.type'='Microsoft.Dynamics.CRM.IntegerAttributeMetadata'; AttributeType='Integer'
     AttributeTypeName=@{ Value='IntegerType' }; SchemaName=$schema; MinValue=$min; MaxValue=$max
     Format='None'; RequiredLevel=(New-DvReq $req); DisplayName=(Lbl $display) }
}
function BoolAttr($schema,$req,$display) {
  @{ '@odata.type'='Microsoft.Dynamics.CRM.BooleanAttributeMetadata'; AttributeType='Boolean'
     AttributeTypeName=@{ Value='BooleanType' }; SchemaName=$schema; RequiredLevel=(New-DvReq $req)
     DisplayName=(Lbl $display)
     OptionSet=@{ '@odata.type'='Microsoft.Dynamics.CRM.BooleanOptionSetMetadata'
       TrueOption=(New-DvOption 1 'Yes'); FalseOption=(New-DvOption 0 'No') } }
}
function DateAttr($schema,$behavior,$req,$display) {
  @{ '@odata.type'='Microsoft.Dynamics.CRM.DateTimeAttributeMetadata'; AttributeType='DateTime'
     AttributeTypeName=@{ Value='DateTimeType' }; SchemaName=$schema; Format='DateAndTime'
     DateTimeBehavior=@{ Value=$behavior }; RequiredLevel=(New-DvReq $req); DisplayName=(Lbl $display) }
}
function PickAttr($schema,$req,$display,$options) {
  @{ '@odata.type'='Microsoft.Dynamics.CRM.PicklistAttributeMetadata'; AttributeType='Picklist'
     AttributeTypeName=@{ Value='PicklistType' }; SchemaName=$schema; RequiredLevel=(New-DvReq $req)
     DisplayName=(Lbl $display)
     OptionSet=@{ '@odata.type'='Microsoft.Dynamics.CRM.OptionSetMetadata'; OptionSetType='Picklist'
       IsGlobal=$false; Options=$options } }
}
function MultiAttr($schema,$req,$display,$options) {
  @{ '@odata.type'='Microsoft.Dynamics.CRM.MultiSelectPicklistAttributeMetadata'; AttributeType='Virtual'
     AttributeTypeName=@{ Value='MultiSelectPicklistType' }; SchemaName=$schema; RequiredLevel=(New-DvReq $req)
     DisplayName=(Lbl $display)
     OptionSet=@{ '@odata.type'='Microsoft.Dynamics.CRM.OptionSetMetadata'; OptionSetType='Picklist'
       IsGlobal=$false; Options=$options } }
}

$deployStatusOpts = @(
  (New-DvOption 500870000 'None'), (New-DvOption 500870001 'To be deployed'),
  (New-DvOption 500870002 'Deployment in progress'), (New-DvOption 500870003 'Deployment completed'),
  (New-DvOption 867520001 'Merged into Deployment Solution'), (New-DvOption 867520002 'Merged into Core Solution'))
$typeOpts = @((New-DvOption 867520000 'Feature'), (New-DvOption 867520001 'Bug'), (New-DvOption 867520002 'Release'))
$mergeTypeDefs = @(
  @(1,'Table'),@(2,'Column'),@(9,'Choice'),@(20,'Security Role'),@(26,'View'),
  @(29,'Process (Flow/WF/BPF/Action)'),@(59,'Chart'),@(60,'Form'),@(61,'Web Resource'),
  @(70,'Field Security Profile'),@(80,'Model-driven App'),@(91,'Plugin Assembly'),
  @(92,'SDK Message Step'),@(95,'Service Endpoint'),@(300,'Canvas App'),@(10021,'Custom API'),
  @(10022,'Custom API Request Parameter'),@(10023,'Custom API Response Property'),
  @(10064,'Connection Reference'),@(380,'Environment Variable'),@(381,'Environment Variable Value'))
$mergeTypeOpts = $mergeTypeDefs | ForEach-Object { New-DvOption ([int]$_[0]) ([string]$_[1]) }

# ---- 3. Entities -----------------------------------------------------------
# Each: SchemaName, primary attr (schema/max/req), ownership, set name, display
$entities = @(
  @{ schema="${p}_WorkingSolution";   logical="${p}_workingsolution";   set="${p}_workingsolutions"
     display='Working Solution'; coll='Working Solutions'; ownership='UserOwned'
     primary=@{ schema="${p}_name"; max=100; req='ApplicationRequired' } }
  @{ schema="${p}_WorkbenchSettings"; logical="${p}_workbenchsettings"; set="${p}_workbenchsettingses"
     display='Workbench Settings'; coll='Workbench Settings'; ownership='OrganizationOwned'
     primary=@{ schema="${p}_name"; max=100; req='None' } }
  @{ schema="${p}_MergeRun";          logical="${p}_mergerun";          set="${p}_mergeruns"
     display='Merge Run'; coll='Merge Runs'; ownership='UserOwned'
     primary=@{ schema="${p}_name_str"; max=850; req='ApplicationRequired' } }
  @{ schema="${p}_ReleaseNote";       logical="${p}_releasenote";       set="${p}_releasenotes"
     display='Release Note'; coll='Release Notes'; ownership='OrganizationOwned'
     primary=@{ schema="${p}_name"; max=850; req='ApplicationRequired' } }
  @{ schema="${p}_EnvironmentConfig"; logical="${p}_environmentconfig"; set="${p}_environmentconfigs"
     display='Environment Config'; coll='Environment Configs'; ownership='OrganizationOwned'
     primary=@{ schema="${p}_name"; max=200; req='ApplicationRequired' } }
)
foreach ($e in $entities) {
  if (Test-DvExists "EntityDefinitions(LogicalName='$($e.logical)')?`$select=LogicalName") {
    Write-Host "Table $($e.logical) exists." -ForegroundColor DarkGray; continue
  }
  $primaryAttr = StrAttr $e.primary.schema $e.primary.max $e.primary.req 'Name'
  $primaryAttr['IsPrimaryName'] = $true
  $body = @{
    '@odata.type'='Microsoft.Dynamics.CRM.EntityMetadata'
    SchemaName=$e.schema; DisplayName=(Lbl $e.display); DisplayCollectionName=(Lbl $e.coll)
    OwnershipType=$e.ownership; EntitySetName=$e.set
    HasNotes=$false; HasActivities=$false; IsActivity=$false
    Attributes=@($primaryAttr)
  }
  Invoke-Dv -Method POST -Path 'EntityDefinitions' -Body $body -Solution $SolutionUniqueName | Out-Null
  Write-Host "Created table $($e.logical)." -ForegroundColor Green
}

# ---- 4. Scalar columns -----------------------------------------------------
$columns = @{
  "${p}_workingsolution" = @(
    (PickAttr "${p}_deploymentstatus" 'None' 'Deployment Status' $deployStatusOpts),
    (StrAttr  "${p}_devopsid" 10 'ApplicationRequired' 'DevOps Id'),
    (StrAttr  "${p}_devopslink" 4000 'None' 'DevOps Link' 'Url'),
    (DateAttr "${p}_last_merge_into_core_dat" 'TimeZoneIndependent' 'None' 'Last merge into core'),
    (BoolAttr "${p}_merge_into_core_bit" 'None' 'Merge into core'),
    (StrAttr  "${p}_solutionlink" 200 'None' 'Solution Link' 'Url'),
    (StrAttr  "${p}_uniquesolutionname" 50 'None' 'Unique solution name'),
    (MultiAttr "${p}_allowedmergetypes" 'None' 'Allowed merge types' $mergeTypeOpts),
    (MultiAttr "${p}_excludedmergetypes" 'None' 'Excluded merge types' $mergeTypeOpts),
    (StrAttr  "${p}_devopsareapath" 1000 'None' 'DevOps area path'),
    (StrAttr  "${p}_devopsiterationpath" 1000 'None' 'DevOps iteration path'),
    (StrAttr  "${p}_devopsworkitemstatus" 500 'None' 'DevOps work item status'),
    (StrAttr  "${p}_devopsworkitemtype" 250 'None' 'DevOps work item type'),
    (DateAttr "${p}_lastmergeintodeploymentsolution" 'UserLocal' 'None' 'Last merge into deployment'),
    (BoolAttr "${p}_mergeintodeploymentsolution" 'None' 'Merge into deployment'),
    (PickAttr "${p}_type_opt" 'None' 'Type' $typeOpts)
  )
  "${p}_workbenchsettings" = @(
    (StrAttr "${p}_mastersolutionuniquename" 20 'Recommended' 'Master solution unique name'),
    (StrAttr "${p}_publisher_str" 100 'None' 'Publisher'),
    (StrAttr "${p}_publisherid" 40 'Recommended' 'Publisher Id'),
    (StrAttr "${p}_deploymentsolutionuniquename" 200 'Recommended' 'Deployment solution unique name'),
    (StrAttr "${p}_adoorgurl" 400 'None' 'Azure DevOps Org URL' 'Url'),
    (StrAttr "${p}_adoproject" 200 'None' 'Azure DevOps Project'),
    (StrAttr "${p}_deploymentmanagerrole" 200 'None' 'Deployment Manager role name')
  )
  "${p}_environmentconfig" = @(
    (StrAttr  "${p}_key" 50 'None' 'Key'),
    (StrAttr  "${p}_url" 400 'None' 'Environment URL' 'Url'),
    (StrAttr  "${p}_environmentid" 100 'None' 'Environment Id'),
    (BoolAttr "${p}_iscurrent" 'None' 'Is current'),
    (IntAttr  "${p}_order_int" 0 1000 'None' 'Order')
  )
  "${p}_mergerun" = @(
    (IntAttr  "${p}_added_int" 0 10000 'None' 'Added'),
    (MemoAttr "${p}_addedcomponents_txt" 100000 'None' 'Added components'),
    (IntAttr  "${p}_errors_int" 0 10000 'None' 'Errors'),
    (IntAttr  "${p}_skipped_int" 0 10000 'None' 'Skipped'),
    (MemoAttr "${p}_sources_txt" 4000 'None' 'Sources')
  )
  "${p}_releasenote" = @(
    (MemoAttr "${p}_markdown_txt" 200000 'None' 'Markdown'),
    (MemoAttr "${p}_plaintext_txt" 200000 'None' 'Plain text'),
    (StrAttr  "${p}_summary_txt" 200 'None' 'Summary'),
    (StrAttr  "${p}_version_txt" 50 'None' 'Version')
  )
}
foreach ($tbl in $columns.Keys) {
  foreach ($attr in $columns[$tbl]) {
    $ln = $attr.SchemaName.ToLower()
    if (Test-DvExists "EntityDefinitions(LogicalName='$tbl')/Attributes(LogicalName='$ln')?`$select=LogicalName") {
      Write-Host "  col $ln exists." -ForegroundColor DarkGray; continue
    }
    Invoke-Dv -Method POST -Path "EntityDefinitions(LogicalName='$tbl')/Attributes" -Body $attr -Solution $SolutionUniqueName | Out-Null
    Write-Host "  + $ln" -ForegroundColor Green
  }
}

# ---- 5. Lookups (one-to-many relationships) --------------------------------
function New-Lookup($relSchema,$referenced,$referencedId,$referencing,$navProp,$lookupSchema,$req,$display) {
  if (Test-DvExists "RelationshipDefinitions(SchemaName='$relSchema')?`$select=SchemaName") {
    Write-Host "  rel $relSchema exists." -ForegroundColor DarkGray; return
  }
  $body = @{
    '@odata.type'='Microsoft.Dynamics.CRM.OneToManyRelationshipMetadata'
    SchemaName=$relSchema; ReferencedEntity=$referenced; ReferencedAttribute=$referencedId
    ReferencingEntity=$referencing; ReferencingEntityNavigationPropertyName=$navProp
    CascadeConfiguration=@{ Assign='NoCascade'; Delete='RemoveLink'; Merge='NoCascade'
      Reparent='NoCascade'; Share='NoCascade'; Unshare='NoCascade'; RollupView='NoCascade' }
    Lookup=@{ '@odata.type'='Microsoft.Dynamics.CRM.LookupAttributeMetadata'; AttributeType='Lookup'
      AttributeTypeName=@{ Value='LookupType' }; SchemaName=$lookupSchema
      RequiredLevel=(New-DvReq $req); DisplayName=(Lbl $display) }
  }
  Invoke-Dv -Method POST -Path 'RelationshipDefinitions' -Body $body -Solution $SolutionUniqueName | Out-Null
  Write-Host "  + lookup $lookupSchema ($referencing -> $referenced)" -ForegroundColor Green
}
New-Lookup "${p}_workingsolution_workbenchsetting"  "${p}_workbenchsettings" "${p}_workbenchsettingsid" "${p}_workingsolution" "${p}_WorkbenchSetting"     "${p}_WorkbenchSetting"     'ApplicationRequired' 'Workbench Setting'
New-Lookup "${p}_workingsolution_deploymentsolution" "${p}_workingsolution"  "${p}_workingsolutionid"  "${p}_workingsolution" "${p}_DeploymentSolution_id" "${p}_DeploymentSolution_id" 'None'               'Deployment Solution'
New-Lookup "${p}_mergerun_targetsolution"            "${p}_workingsolution"  "${p}_workingsolutionid"  "${p}_mergerun"        "${p}_targetsolution_ref"   "${p}_targetsolution_ref"   'None'               'Target Solution'
New-Lookup "${p}_releasenote_releasesolution"        "${p}_workingsolution"  "${p}_workingsolutionid"  "${p}_releasenote"     "${p}_releasesolution_ref"  "${p}_releasesolution_ref"  'ApplicationRequired' 'Release Solution'

Write-Host ""
Write-Host "Data model provisioning complete (publisher '$PublisherUniqueName', prefix '$p', solution '$SolutionUniqueName')." -ForegroundColor Green
