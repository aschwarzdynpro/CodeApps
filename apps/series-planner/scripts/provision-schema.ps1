<#
.SYNOPSIS
  Provisions the series planner data model (prefix `pro`, publisher
  "Dynamics Pro") into a target Dataverse environment.

.DESCRIPTION
  Creates — idempotently — publisher, solution and:
    - table pro_seriesplan (Serienplan): name, pattern JSON, instructions,
      summary, first/last date, lookups to project, project task, service
      account, work order type, incident type, price list, booking status and
      default resource;
    - on msdyn_workorder: lookup pro_seriesplan_ref (series) and the date
      column pro_occurrence_dat (original pattern date = occurrence key).
  The app references exactly these logical names and navigation properties.

  Prerequisites in the environment: Field Service, Project Operations and the
  Field Service ↔ Project Operations integration (project lookup on the work
  order). The script doesn't touch them.

  Re-runnable: existing publisher / solution / tables / columns / lookups are
  detected and skipped. Login: existing Az context, else device code.

.EXAMPLE
  pwsh scripts/provision-schema.ps1 -EnvironmentUrl https://operations-d365-schulz-uat-1-1.crm4.dynamics.com
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory)][string]$EnvironmentUrl,
  [string]$TenantId,
  [string]$PublisherUniqueName   = 'DynamicsPro',
  [string]$PublisherFriendlyName = 'Dynamics Pro',
  [string]$Prefix                = 'pro',
  [int]$OptionValuePrefix        = 64100,
  [string]$SolutionUniqueName    = 'DynamicsProSeriesPlanner',
  [string]$SolutionFriendlyName  = 'Serienplanung',
  [string]$SolutionVersion       = '1.0.0.0',
  [switch]$SkipPublish
)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'lib/Dataverse.ps1')

$p = $Prefix
if ($p -ne 'pro') { Write-Warning "The app expects the prefix 'pro' — other prefixes need code changes." }
Connect-Dataverse -EnvironmentUrl $EnvironmentUrl -TenantId $TenantId | Out-Null

# ---- 0. Prerequisites ------------------------------------------------------
foreach ($t in 'msdyn_workorder', 'msdyn_project', 'bookableresourcebooking') {
  if (-not (Test-DvExists "EntityDefinitions(LogicalName='$t')?`$select=LogicalName")) {
    throw "Table $t is missing — Field Service and Project Operations must be installed first."
  }
}

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
$sol = (Invoke-Dv -Method GET -Path "solutions?`$select=solutionid&`$filter=uniquename eq '$SolutionUniqueName'").value
if ($sol) {
  Write-Host "Solution '$SolutionUniqueName' exists." -ForegroundColor DarkGray
} else {
  Invoke-Dv -Method POST -Path 'solutions' -Body @{
    uniquename = $SolutionUniqueName
    friendlyname = $SolutionFriendlyName
    version = $SolutionVersion
    'publisherid@odata.bind' = "/publishers($publisherId)"
  } | Out-Null
  Write-Host "Created solution '$SolutionUniqueName'." -ForegroundColor Green
}

# ---- attribute payload builders -------------------------------------------
function Lbl($t) { New-DvLabel $t }
function StrAttr($schema, $max, $req, $display) {
  @{ '@odata.type'='Microsoft.Dynamics.CRM.StringAttributeMetadata'; AttributeType='String'
     AttributeTypeName=@{ Value='StringType' }; SchemaName=$schema; MaxLength=$max
     FormatName=@{ Value='Text' }; RequiredLevel=(New-DvReq $req); DisplayName=(Lbl $display) }
}
function MemoAttr($schema, $max, $display) {
  @{ '@odata.type'='Microsoft.Dynamics.CRM.MemoAttributeMetadata'; AttributeType='Memo'
     AttributeTypeName=@{ Value='MemoType' }; SchemaName=$schema; MaxLength=$max; Format='Text'
     RequiredLevel=(New-DvReq 'None'); DisplayName=(Lbl $display) }
}
function DateOnlyAttr($schema, $display) {
  @{ '@odata.type'='Microsoft.Dynamics.CRM.DateTimeAttributeMetadata'; AttributeType='DateTime'
     AttributeTypeName=@{ Value='DateTimeType' }; SchemaName=$schema; Format='DateOnly'
     DateTimeBehavior=@{ Value='DateOnly' }; RequiredLevel=(New-DvReq 'None'); DisplayName=(Lbl $display) }
}

# ---- 3. Table pro_seriesplan ----------------------------------------------
$table = "${p}_seriesplan"
if (Test-DvExists "EntityDefinitions(LogicalName='$table')?`$select=LogicalName") {
  Write-Host "Table $table exists." -ForegroundColor DarkGray
} else {
  $primary = StrAttr "${p}_name" 200 'ApplicationRequired' 'Name'
  $primary['IsPrimaryName'] = $true
  Invoke-Dv -Method POST -Path 'EntityDefinitions' -Solution $SolutionUniqueName -Body @{
    '@odata.type'='Microsoft.Dynamics.CRM.EntityMetadata'
    SchemaName="${p}_SeriesPlan"; DisplayName=(Lbl 'Serienplan'); DisplayCollectionName=(Lbl 'Serienpläne')
    Description=(Lbl 'Wiederkehrender Projekteinsatz: Muster, Standardwerte der Arbeitsaufträge, Ausnahmen.')
    OwnershipType='UserOwned'; EntitySetName="${p}_seriesplans"
    HasNotes=$false; HasActivities=$false; IsActivity=$false
    Attributes=@($primary)
  } | Out-Null
  Write-Host "Created table $table." -ForegroundColor Green
}

# ---- 4. Columns ------------------------------------------------------------
$columns = @{
  $table = @(
    (MemoAttr "${p}_definition_txt" 100000 'Muster (JSON)'),
    (MemoAttr "${p}_instructions_txt" 4000 'Anweisungen'),
    (StrAttr  "${p}_summary_str" 400 'None' 'Rhythmus'),
    (DateOnlyAttr "${p}_start_dat" 'Erster Termin'),
    (DateOnlyAttr "${p}_end_dat" 'Letzter Termin')
  )
  'msdyn_workorder' = @(
    (DateOnlyAttr "${p}_occurrence_dat" 'Serientermin')
  )
}
foreach ($tbl in $columns.Keys) {
  foreach ($attr in $columns[$tbl]) {
    $ln = $attr.SchemaName.ToLower()
    if (Test-DvExists "EntityDefinitions(LogicalName='$tbl')/Attributes(LogicalName='$ln')?`$select=LogicalName") {
      Write-Host "  col $tbl.$ln exists." -ForegroundColor DarkGray; continue
    }
    Invoke-Dv -Method POST -Path "EntityDefinitions(LogicalName='$tbl')/Attributes" -Body $attr -Solution $SolutionUniqueName | Out-Null
    Write-Host "  + $tbl.$ln" -ForegroundColor Green
  }
}

# ---- 5. Lookups --------------------------------------------------------------
function New-Lookup($relSchema, $referenced, $referencedId, $referencing, $lookupSchema, $display) {
  if (Test-DvExists "RelationshipDefinitions(SchemaName='$relSchema')?`$select=SchemaName") {
    Write-Host "  rel $relSchema exists." -ForegroundColor DarkGray; return
  }
  Invoke-Dv -Method POST -Path 'RelationshipDefinitions' -Solution $SolutionUniqueName -Body @{
    '@odata.type'='Microsoft.Dynamics.CRM.OneToManyRelationshipMetadata'
    SchemaName=$relSchema; ReferencedEntity=$referenced; ReferencedAttribute=$referencedId
    ReferencingEntity=$referencing; ReferencingEntityNavigationPropertyName=$lookupSchema
    # Deleting a series or a referenced record never deletes work orders or series.
    CascadeConfiguration=@{ Assign='NoCascade'; Delete='RemoveLink'; Merge='NoCascade'
      Reparent='NoCascade'; Share='NoCascade'; Unshare='NoCascade'; RollupView='NoCascade' }
    Lookup=@{ '@odata.type'='Microsoft.Dynamics.CRM.LookupAttributeMetadata'; AttributeType='Lookup'
      AttributeTypeName=@{ Value='LookupType' }; SchemaName=$lookupSchema
      RequiredLevel=(New-DvReq 'None'); DisplayName=(Lbl $display) }
  } | Out-Null
  Write-Host "  + lookup $referencing.$lookupSchema -> $referenced" -ForegroundColor Green
}

New-Lookup "${p}_seriesplan_project"       'msdyn_project'       'msdyn_projectid'       $table "${p}_project_ref"       'Projekt'
New-Lookup "${p}_seriesplan_projecttask"   'msdyn_projecttask'   'msdyn_projecttaskid'   $table "${p}_projecttask_ref"   'Projektaufgabe'
New-Lookup "${p}_seriesplan_serviceaccount" 'account'            'accountid'             $table "${p}_serviceaccount_ref" 'Dienstkonto'
New-Lookup "${p}_seriesplan_workordertype" 'msdyn_workordertype' 'msdyn_workordertypeid' $table "${p}_workordertype_ref" 'Arbeitsauftragstyp'
New-Lookup "${p}_seriesplan_incidenttype"  'msdyn_incidenttype'  'msdyn_incidenttypeid'  $table "${p}_incidenttype_ref"  'Vorfalltyp'
New-Lookup "${p}_seriesplan_pricelist"     'pricelevel'          'pricelevelid'          $table "${p}_pricelist_ref"     'Preisliste'
New-Lookup "${p}_seriesplan_bookingstatus" 'bookingstatus'       'bookingstatusid'       $table "${p}_bookingstatus_ref" 'Buchungsstatus'
New-Lookup "${p}_seriesplan_resource"      'bookableresource'    'bookableresourceid'    $table "${p}_resource_ref"      'Ressource'
New-Lookup "${p}_workorder_seriesplan"     $table                "${p}_seriesplanid"     'msdyn_workorder' "${p}_seriesplan_ref" 'Serienplan'

# ---- 6. Publish ------------------------------------------------------------
if (-not $SkipPublish) {
  Invoke-Dv -Method POST -Path 'PublishAllXml' | Out-Null
  Write-Host 'Published customizations.' -ForegroundColor Green
}

Write-Host ''
Write-Host "Series planner schema ready (publisher '$PublisherUniqueName', solution '$SolutionUniqueName')." -ForegroundColor Green
Write-Host 'Next: grant users privileges on pro_seriesplan (create/read/write/append/append to) and add the data sources (README).'
