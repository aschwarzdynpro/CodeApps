<#
.SYNOPSIS
  Wraps `pac code add-data-source` with the AddSolutionComponent workaround.

.DESCRIPTION
  Once the AddSolutionComponent custom API is part of the app, every
  `pac code add-data-source` run fails with "The JSON does not represent a
  valid data source" while reprocessing the action's schema file. This
  script moves the schema aside, runs the command with all passed
  arguments, restores the schema and re-inserts the `addsolutioncomponent`
  block that the generator drops from dataSourcesInfo.ts.

.EXAMPLE
  ./scripts/add-data-source.ps1 -a dataverse -t ssid_workingsolution
  ./scripts/add-data-source.ps1 -a shared_visualstudioteamservices -cr sst_CRDevOps -s <solution-id> -env <url>
#>
param(
  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]]$PacArgs
)

$appRoot = Split-Path $PSScriptRoot -Parent
$schema = Join-Path $appRoot ".power\schemas\dataverse\AddSolutionComponent.Schema.json"
$schemaBackup = Join-Path $env:TEMP "AddSolutionComponent.Schema.json"
$dsInfo = Join-Path $appRoot ".power\schemas\appschemas\dataSourcesInfo.ts"

$schemaMoved = $false
if (Test-Path $schema) {
  Move-Item $schema $schemaBackup -Force
  $schemaMoved = $true
}

try {
  Push-Location $appRoot
  pac code add-data-source @PacArgs
  $exit = $LASTEXITCODE
  Pop-Location
}
finally {
  if ($schemaMoved) { Move-Item $schemaBackup $schema -Force }
}

# Re-insert the hand-maintained blocks if the regeneration dropped them
# (the generator only knows schema files; these two are defined here).
if ((Test-Path $dsInfo) -and -not (Select-String -Path $dsInfo -Pattern '"addsolutioncomponent"' -Quiet)) {
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
  "addsolutioncomponent": {
    "tableId": "",
    "version": "",
    "primaryKey": "",
    "dataSourceType": "Dataverse",
    "apis": {
      "AddSolutionComponent": {
        "path": "/api/data/v9.2/AddSolutionComponent",
        "method": "POST",
        "parameters": [
          {
            "name": "ComponentId",
            "in": "body",
            "required": true,
            "type": "string"
          },
          {
            "name": "ComponentType",
            "in": "body",
            "required": true,
            "type": "number"
          },
          {
            "name": "SolutionUniqueName",
            "in": "body",
            "required": true,
            "type": "string"
          },
          {
            "name": "AddRequiredComponents",
            "in": "body",
            "required": true,
            "type": "boolean"
          },
          {
            "name": "DoNotIncludeSubcomponents",
            "in": "body",
            "required": false,
            "type": "boolean"
          },
          {
            "name": "IncludedComponentSettingsValues",
            "in": "body",
            "required": false,
            "type": "array"
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
  Write-Host "Re-inserted the addsolutioncomponent + retrievemissingdependencies blocks into dataSourcesInfo.ts."
}

exit $exit
