# Solution Administration Console — Agent-Handbuch

Power Apps **Code App** (React 19 + TS + Vite + `@microsoft/power-apps`).
Verwaltet Dataverse-Solutions für Feature-/Bug-Entwicklung. Lies zuerst:
`Roadmap.md` (nächste Aufgaben), `TODO.md` (SP-Migration), `README.md`.

## Deployment-Kontext

| Was | Wert |
| --- | --- |
| Umgebung (Host) | **D365-SCHULZ-INT-11**, `431783f6-367c-eb49-984b-4e70e4c0424d`, https://operations-d365-schulz-int-11.crm4.dynamics.com |
| UAT / PROD | siehe `ENVIRONMENTS` in `src/config.ts` (Compare/Dependency-Check-Ziele) |
| App-ID (NEU, `pro_`-Modell) | `cade30e1-dd5c-4532-82eb-fd8520ba7b29` — „Solution Administration Console (Pro)", läuft auf dem `pro_`-Datenmodell. **Das ist ab jetzt die aktive App.** |
| App-ID (ALT, `ssid_`/`sst_`-Modell) | `459ee5cd-2138-4556-b472-058c676f72ef` — „Solution Administration Console", läuft noch auf dem alten Modell. Bleibt zur Parallelnutzung bestehen, wird NICHT mehr deployed; nach Abnahme der Pro-App entfernbar. |
| Datenmodell-Solution | `DynamicsProSolutionAdminConsole` (`e1e38a6e-b06f-f111-ab0d-000d3ab526d3`), Publisher **Dynamics Pro** (`DynamicsPro`, Prefix `pro`). Erzeugt mit `installer/provision-model.ps1`. |
| App-Mitgliedschaft | via Maker-Portal „Add existing → App → Code app" (`power-apps push -s` registriert sie NICHT) |
| DevOps | Org `SchulzD365`, Projekt `D365UO` — Panel deaktiviert (`DEVOPS_PANEL_ENABLED=false`), Reaktivierung siehe TODO.md |
| Rolle für die Validate-Gruppe (Compare/DependencyCheck/Layers/App Sharing) | `INT | Deployment Manager` (`DEPLOYMENT_MANAGER_ROLE` in config.ts) — Workbench + Merge sind NICHT gated |
| pac-Auth | Profil `EX-Andy.Schwarz@schulz.st`; ggf. `-env <INT-11-URL>` |

## Frischer Checkout / Working Tree (WICHTIG)

`src/generated/`, `.power/` und `power.config.json` sind gitignored — nach
einem frischen Clone ODER nach einem Branch-Merge, dessen Code neue Data
Sources einführte, fehlen sie lokal und der Build bricht ab
(`Cannot find module '../generated/...'`). Bootstrap:

```
npm install                       # bringt auch Laufzeit-Deps wie `diff`
power-apps init --non-interactive -n "Solution Administration Console (Pro)" --cloud prod -e 431783f6-367c-eb49-984b-4e70e4c0424d -b ./dist -f index.html -a http://localhost:3000
# Tabellen (Wrapper-Skript, NICHT pac direkt):
./scripts/add-data-source.ps1 -a dataverse -t solution
./scripts/add-data-source.ps1 -a dataverse -t publisher
./scripts/add-data-source.ps1 -a dataverse -t solutioncomponent
./scripts/add-data-source.ps1 -a dataverse -t msdyn_solutioncomponentsummary
./scripts/add-data-source.ps1 -a dataverse -t systemuser
./scripts/add-data-source.ps1 -a dataverse -t role
./scripts/add-data-source.ps1 -a dataverse -t pro_workingsolution
./scripts/add-data-source.ps1 -a dataverse -t pro_workbenchsettings
./scripts/add-data-source.ps1 -a dataverse -t pro_mergerun
./scripts/add-data-source.ps1 -a dataverse -t pro_releasenote
./scripts/add-data-source.ps1 -a dataverse -t pro_environmentconfig
# Operate-Gruppe (nur Schreibpfade; alle Reads laufen über den Konnektor):
./scripts/add-data-source.ps1 -a dataverse -t asyncoperation
./scripts/add-data-source.ps1 -a dataverse -t organization
# Konnektor (Dataverse) — direkte Connection-Bindung per -c (Connection „App-Reg
# D365-CE nonProd", SP). Für den Installer/ALM stattdessen Connection-Reference
# `pro_CRDataverse` (muss vorab existieren, sonst „Failed to resolve connection ID"):
./scripts/add-data-source.ps1 -a shared_commondataserviceforapps -c 73569138b7c4466d9ee6933ad6e66a3c
# Cloud-Flow (npm-CLI, droppt danach den retrievemissingdependencies-Block
# aus dataSourcesInfo.ts → manuell wieder einsetzen, Vorlage im Wrapper-Skript):
# (Optional/derzeit weggelassen — DevOps deaktiviert; der Flow zielt noch aufs Altmodell.)
power-apps add-flow --flow-id e8d6ad6b-abd5-f011-8544-000d3ab3220a   # PA | MANUAL | Working Solution | Sync DevOps Work Item Status
```
**Datenmodell auf neuem Environment erzeugen** (statt Maker-Handarbeit):
`pwsh installer/provision-model.ps1 -EnvironmentUrl <url> [-TenantId <guid>]`
legt Publisher `DynamicsPro` (Prefix `pro`) + Solution + alle 4 `pro_`-Tabellen an.
Welche generated services der committete Code erwartet ⇔ Soll-Liste:
`grep -rho "generated/services/\w*" src` gegen `ls src/generated/services`.

## Arbeits-Zyklus (jede Änderung)

```
npm run build && npm run lint     # beides muss grün sein
git add … && git commit && git push origin main
power-apps push                   # veröffentlicht nach INT-11
```
Feature-Änderungen ⇒ `HelpPanel.tsx`, `README.md`, `Roadmap.md` nachziehen.
ESLint: React-Compiler-Regeln aktiv — kein setState synchron in Effects
(Pattern: `// eslint-disable-next-line react-hooks/set-state-in-effect`
nur direkt über der Zeile); `src/generated` ist lint-ignoriert.

## Per-Environment-Deploy (Direct-Push)

`pwsh scripts/deploy-env.ps1 -Env <playground|schulz|waldmann>` pusht die App
direkt (unmanaged) in die jeweilige Umgebung. EINE Registry im Skript ist die
Quelle der Wahrheit (App-/Env-IDs, pac-Profil, Connector); pro Lauf: pac-Profil
per Name wählen → **Guard** (`pac org who` muss die Ziel-URL sein, sonst Abbruch)
→ `power.config.json` + `.env.local` schreiben → Data Sources + Connector (`-cr`
Playground / `-c` Schulz) → [Flow] → build → Push. `waldmann` ist bewusst
**deaktiviert** (managed Import statt Direct-Push). Details: `deploy/README.md`.
**Push-Weg je Umgebung:** `playground` → `pac code push`. `schulz` trägt ein
`Flow`-Feld (DevOps-Sync-Cloud-Flow `6253ef0c-…`) ⇒ das Skript registriert den
Flow automatisch (`power-apps add-flow`), setzt den gedroppten
`retrievemissingdependencies`-Block wieder ein (`Restore-RetrieveMissingDependencies`,
gotcha #1) und pusht über `power-apps push` (npm-CLI, Schulz-Tenant angemeldet;
`pac code push` bricht am `workflowDetails`-Block ab — Gotcha #12). `-NoPush`
richtet nur ein (Config + Data Sources + Build), ohne Flow/Push. **`pac code push`
für Schulz strippt die Flow-Registrierung → „Connection reference not found".**

## Architektur

UI hängt NUR am Interface `SolutionService`
(`src/services/solutionService.ts`); Implementierungen:
`dataverseSolutionService.ts` (echt, fällt via `powerModeReady` auf Mock
zurück) + `mockSolutionService.ts`/`mockData.ts` (offline voll demobar —
bei neuen Methoden IMMER Mock mitziehen). Compare separat:
`comparisonService.ts`; App-Sharing separat: `sharingService.ts`. Der
**ALM Detective** (`detectiveService.ts`) orchestriert nur diese Services
phasenweise zu einem Severity-Report — kein eigener Datenpfad, daher auch
ohne eigenen Mock (erbt die Mock-Fallbacks der genutzten Services). Caches
(Komponenten, Suche-Index, Kollisionsradar, WorkItems) leben in `App.tsx`.

**Operate-Gruppe** (Menü „Operate": Plugin Traces / Job Monitor / Role
Analyzer): je Feature ein eigenes Service-Paar nach demselben Muster —
`traceService`/`jobMonitorService`/`roleAnalyzerService` (+ `dataverse…`/
`mock…`). **Reads ausschließlich über den Konnektor** als FetchXML-
Passthrough gegen die aktuelle Umgebung (`currentEnvQuery.ts`: `fetchXmlQuery`,
`fetchXmlAllPages` mit page/count-Injection, Aggregate) ⇒ keine neuen nativen
Data Sources fürs Lesen; Intersects (`roleprivileges`, `systemuserroles`,
`teamroles`, `teammembership`) werden über **link-entity vom Parent aus**
traversiert (Entity-Set-Namen der Intersects werden so nie gebraucht).
Identität der Reads = Konnektor-SP (braucht Leserechte auf plugintracelog,
asyncoperation, role/privilege usw.). **Writes nativ als User**: Trace-Level
via `OrganizationsService.update` (organization), Bulk-Cancel/Retry via
`AsyncoperationsService.update` (asyncoperation) — bewusst getrennt, damit
Dataverse die Rechte pro Person erzwingt. UI-Gating: Role Analyzer als Tab
gated; Trace-Level-Switch + Bulk-Aktionen zusätzlich Deployment-Manager-
gated. Rollen IMMER auf `parentrootroleid` aggregieren (Modell-Snapshot
~15 min gecacht, modulweiter Cache im Service). Watchdog-Tabellennamen in
`config.ts → WATCHDOG_TABLES` (Default `cust_*`; Query-Fehler ⇒ „not
installed"-Hinweis statt Crash). Pure functions mit Vitest (`npm test`):
`utils/heartbeat.ts`, `utils/privileges.ts`.

**Zielumgebung wählbar (Operate):** Jedes der drei Features hat oben einen
`OperateEnvPicker`, der aus `ENVIRONMENTS` wählt (geteilter State
`operateEnvKey` in `App.tsx`, Default = Host via `currentEnvKey()`). Alle
Service-Methoden nehmen `envKey`; die Query-Helfer (`fetchXmlQuery`/
`fetchXmlAllPages`) bekommen die Ziel-`orgUrl` durchgereicht
(`config.ts → orgUrlForEnvKey`). **Reads cross-env** über den Konnektor;
**native Writes nur Host-Env** — `dataverseTraceService.setTraceLevel` und
`dataverseJobMonitorService.cancel/retryJobs` werfen bei
`!isCurrentEnvKey(envKey)` (UI deaktiviert zusätzlich, `canWrite =
canManage… && isCurrentEnvKey`). Role-Analyzer-Snapshot-Cache ist **pro
orgUrl** (`Map`), sonst würde eine Env die andere überschreiben. Job Monitor
+ Role Analyzer **remounten** bei Env-Wechsel (`key={operateEnvKey}` in
App.tsx) → sauberer State-Reset; Trace Explorer lädt in-place (behält
Filter). Flow-Run-Portal-Link nutzt die Ziel-`environmentId`
(`environmentIdForEnvKey`).

**Core Role Extractor** (Role Analyzer → Sub-Tab „Core roles", schreibend):
Analyse ist die **pure function** `utils/coreRoles.ts → analyzeCoreRoles(model)`
(Vitest) — clustert Privilegien, die ≥ 2 custom (`!isManaged`) Rollen teilen,
nach dem exakten Rollen-Set (= „pro Bereich"), konsolidierte Depth = tiefste.
UI rechnet das clientseitig aus dem geladenen `SecurityModel` (kein
Service-Call). **Apply** dagegen über `roleAnalyzerService.applyCoreRole`
(Dataverse + Mock): (1) Rolle an Root-BU anlegen, (2) in die Working Solution
aufnehmen (`AddSolutionComponent`, **Rollen-Komponententyp = 20**), (3)
`AddPrivilegesRole` mit Depth-Enum (1 Basic/2 Local/4 Deep/8 Global), (4)
optional `RemovePrivilegeRole` je Quell-Rolle + diese ebenfalls in die
Solution. **Writes laufen über den Konnektor** (`MicrosoftDataverseService.
CreateRecordWithOrganization` + `PerformUnboundActionWithOrganization` für die
Actions — Standard-SDK-Actions, per gotcha #8 konnektor-fähig) gegen die
**Host-Org** (SP-Identität; `applyCoreRole` wirft bei `!isCurrentEnvKey`).
privilegeId-Auflösung (`entity|action → privilegeId`) liegt im Snapshot-Cache
(`privilegeIdByKey`, in `buildSnapshot` gefüllt). UI: eigener Sub-Tab, nur
Host-Env + Deployment Manager, Working-Solution-Pflichtauswahl
(`SolutionSelect`), Remove-Duplicates als **Opt-in** (Default aus), Confirm
mit Warnung „Mitglieder verlieren Zugriff ohne die Core-Rolle", per-Step-
Result. **Achtung (noch nicht live verifiziert):** die exakten Action-Bodies
(`AddPrivilegesRole` Privileges-Collection mit `Depth`/`PrivilegeId`,
`RemovePrivilegeRole`, `AddSolutionComponent` Typ 20) sowie die Konnektor-
Op-Signaturen sind aus der Doku abgeleitet — beim ersten echten Lauf prüfen.

**Datenmodell:** `pro_workingsolution` = Darstellungs-Schicht, verlinkt
über `pro_uniquesolutionname` zur echten Solution. Typ-Kaskade:
`pro_type_opt` (867520000 F / …001 B / …002 R) → `pro_devopsworkitemtype`
(Bug→Bug, CR/Feature/Backlog→Feature) → Namenskonvention
(`feature_|bug_|deploy_`) → Other. Releases: keine DevOps-ID anzeigen,
Pflichtfeld bekommt `'N/A'`. Pflicht-Lookup `pro_WorkbenchSetting` wird
aus erstem `pro_workbenchsettings`-Datensatz aufgelöst. **Offen/Geschlossen
richtet sich allein nach dem `statecode` des Records** (0 = offen, 1 =
geschlossen), NICHT nach dem Deployment-Status (`isOpenStatus`); `listSolutions`
lädt daher auch inaktive Records (kein `statecode eq 0`-Filter mehr) und der
Open-Toggle blendet sie aus. „Mark completed" setzt nur das Status-Label
`pro_deploymentstatus`, deaktiviert den Record (noch) nicht.

**Merge-Regeln je Release:** zwei Multi-Select-Choices auf
`pro_workingsolution` — `pro_allowedmergetypes` (Allow) + `pro_excludedmergetypes`
(Exclude), **Optionswerte = die `componenttype`-Codes** (1, 2, 26, 61, …) → kein
Mapping nötig. Gelesen als `allowedMergeTypes`/`excludedMergeTypes` (`number[]`,
Comma-Values-Parse in `parseTypeCodes`), gesetzt via
`setMergeTypeRules(recordId, allowed, excluded)` (Comma-String, `null` =
leeren). Mergebar: `(allow leer || in allow) && !in exclude`.
`mergeIntoDeployment` filtert die Queue entsprechend (`result.excluded`); der
Plan graut Blockiertes aus.
Verwaltet im eigenen **Merge-Rules**-Tab (`MergeRules.tsx`, Deployment-Manager-
gated, `gated:true`); die Workbench-Detailansicht zeigt nur eine
Read-only-Übersicht (`AllowedTypesSummary`). **Kopplung:** das Konstanten-Array
`MERGEABLE_COMPONENT_TYPES` (types/solution.ts) muss die Choice-Optionen
spiegeln — neue Option in Dataverse ⇒ Eintrag dort ergänzen.

**Merge-Historie:** Tabelle `pro_mergerun` (1 Zeile je Merge) — Counts
(`pro_added_int`/`pro_skipped_int`/`pro_errors_int`), Quell-Titel
(`pro_sources_txt`, `\n`-getrennt), Ziel via Lookup `pro_targetsolution_ref`
→ `pro_workingsolution`. **Welche Komponenten** hinzugefügt wurden, liegen
bewusst denormalisiert als kompaktes JSON-Array (`[{t:Typ,n:Name}]`) in der
Multiline-Spalte `pro_addedcomponents_txt` — eine Spalte statt Kind-Tabelle,
defensiv geparst (`toMergeRun`). Schreiben in
`dataverseSolutionService.logMergeRun` (best-effort, scheitert nie den Merge);
Lesen via `listMergeRuns(targetRecordId)` (Filter
`_pro_targetsolution_ref_value eq <id>`). UI: Tabelle im `SolutionDetail`
(nur Release-Solutions, lädt sich selbst, Remount je Solution); Klick auf eine
Zeile öffnet ein **Overlay** (`MergeRunComponentsModal`) mit den hinzugefügten
Komponenten gruppiert nach Typ.

**Release Notes:** Tabelle `pro_releasenote` (1 Zeile = 1 veröffentlichter
Snapshot), Lookup `pro_releasesolution_ref` → `pro_workingsolution`. Spalten:
`pro_name`, `pro_version_txt`, `pro_markdown_txt`, `pro_plaintext_txt`,
`pro_summary_txt` (Audit createdon/by = veröffentlicht am/von). Reiner Builder
`buildReleaseNotes(release, runs, solutions, generatedAt)` (`services/release-
Notes.ts`) erzeugt aus den `MergeRun`s **Markdown + Rohtext + Summary** —
enthaltene Quell-Solutions (best-effort DevOps-`#`-Link via `devOpsWorkItemUrl`),
Komponenten nach Typ, App Elements per `COLLAPSED_COMPONENT_TYPE_LABELS`
zusammengefasst. Service: `listReleaseNotes`/`publishReleaseNotes`. UI
`ReleaseNotesWorkspace` (ungated Menü, Sub-Tabs Draft/History; **Publish nur
Deployment Manager**). **Inkrementell:** der Draft nutzt nur die `MergeRun`s mit
`createdOn > createdOn der letzten Note` (Cutoff `notes[0]`); erster Publish =
volle Historie, `buildReleaseNotes(..., sincePublishedOn)` setzt den „seit"-
Subtitle; kein Delta ⇒ Publish deaktiviert. Notes sind historisch (was gemergt
wurde), nicht der Live-Stand; Komponente↔Quelle ist nicht zuordenbar (Merge-Log
speichert kombinierte Liste).

**Env Config Cockpit** (Validate-Gruppe, Menüpunkt „Env Config", gated):
`EnvConfigWorkspace` + `envConfigService` (`dataverse…`/`mock…`). Liest je
konfigurierter Umgebung (`ENVIRONMENTS`) über den Konnektor
(`ListRecordsWithOrganization` + `$select`, SP-Identität) drei Tabellen:
`environmentvariabledefinitions` (+ `environmentvariablevalues`, gejoint über
`_environmentvariabledefinitionid_value`) und `connectionreferences`. Match
über den import-stabilen **Schema-** (EnvVar) bzw. **Logical-Name**
(ConnRef). Flags: EnvVar präsent aber ohne Wert **und** ohne Default
(`hasValue=false`), ConnRef ohne `connectionid` (unbound), und „present in
einem Env, absent im anderen" (Transport-Lücke). Secrets (`type` 100000005)
werden maskiert; Default-Fallback markiert. Read-only, keine neuen Data
Sources. Per-Env-Query-Fehler landen in `result.errors` (nicht geworfen).

**Audit Config Analyzer** (Validate-Gruppe, Menüpunkt „Audit Config", gated):
`AuditConfigWorkspace` + `auditConfigService` (`dataverse…`/`mock…`).
Zielumgebung per `OperateEnvPicker` (eigener Lift `auditEnvKey` in App.tsx,
Remount per `key`). Liest über den Konnektor (`odataQuery` in
`currentEnvQuery.ts` — `$select`/`$filter`/`$expand`): `organizations`
(`isauditenabled`, `auditretentionperiodv2`) und `EntityDefinitions`
(`LogicalName`, `DisplayName`, `IsAuditEnabled`). **`IsAuditEnabled` ist eine
BooleanManagedProperty** → `.Value` lesen (`managedBool`); `DisplayName` ist
ein Label → `.UserLocalizedLabel.Label` (`label()`). Spalten lazy je Tabelle:
`EntityDefinitions` gefiltert `LogicalName eq '…'` mit
`$expand=Attributes($select=LogicalName,DisplayName,IsAuditEnabled)` (Muster
aus `dataverseSolutionService.resolveAttributeNames`). **Effektiv-Regel** als
pure function `utils/auditConfig.ts → describeTableAudit(org, table)` (org an
+ Tabelle an = `effective`; Tabelle an, org aus = `configured-but-off`) +
`formatRetention` (−1 = Forever), beide Vitest-getestet. Read-only, keine
neuen Data Sources.

**Dual-Write Table Maps** (Validate-Gruppe, Menüpunkt „Dual-Write Maps",
gated): `DualWriteWorkspace` + `dualWriteService` (`dataverse…`/`mock…`).
Liest über den Konnektor (FetchXML, SP-Identität) die **Custom (unmanaged)**
Dual-Write-Table-Maps der Host-Env. **Entity `msdyn_dualwriteentitymap`**
(Entity-Set `msdyn_dualwriteentitymaps`) — empirisch am INT-11 verifiziert
(nicht `msdyn_dualwritetablemap`!). Felder: `msdyn_name` (z. B.
`sst_[uoms - Units]`), `msdyn_displayname`, `msdyn_version` (dotted, z. B.
`2.0.1.5`), `ismanaged`
(Filter `eq 0` = custom), `msdyn_mapping` (**die Mapping-JSON**, groß),
`msdyn_properties`, `modifiedon`. (Owner bewusst NICHT angezeigt — der
Konnektor liefert für `ownerid` keine Formatted-Value-Annotation und Owner ist
fachlich irrelevant.) **Jede gespeicherte Version ist ein eigener Record** ⇒
`listTableMaps` läuft **zweistufig**: (1) günstige Query ohne `msdyn_mapping`
(id/name/version/modifiedon), gruppiert nach `msdyn_name`, behält die höchste
Version (`compareMapVersions`, semver-numerisch) + Zähler älterer; (2) lädt
`msdyn_mapping` NUR für die aktuellen Versionen (`mappingsByIds`, `in`-Filter in
40er-Chunks — nicht alle ~300 Versions-Records) und zieht daraus je Map
**Quelltabelle/Zieltabelle/Richtung** (`overallDirection`: bidi wenn ein Feld 3
ist oder 1+2 gemischt, sonst die eine Richtung). Liste zeigt „Source → Target"
(mit Env-Chips AX/CRM + Richtungspfeil). Detail: `getMapping(id)` holt nur
`msdyn_mapping`; Parser = pure function `utils/dualWriteMapping.ts →
parseDualWriteMapping` (Vitest, wirft nie): `legs[]` mit
`sourceSchema`/`destinationSchema` (+ `sourceEnvironmentType`/`…Type` = AX/CRM)
und `fieldMappings[]` (`syncDirection` **kommt als Zahl ODER String** ⇒
coercen: 1 = source→dest, 2 = dest→source, 3 = bidirektional;
`destinationLookupFieldRelatedEntity`; `valueTransforms[].transformType ==
'ValueMap'` → `valueMap`-Paare; `isSystemGenerated`). UI: Overlay
(`DualWriteMappingModal`, `.modal-backdrop`-Muster) mit Leg-Tabellen,
Toggles „Hide system-generated"/„Show raw JSON". Session-Cache im Component.
Read-only, keine neuen Data Sources.

**Team & BU Map** (Role Analyzer → Sub-Tab „Team & BU map", read-only):
`TeamBuMap.tsx` — interaktives **Org-Chart als Inline-SVG** (kein Chart-Dep),
Pan (Pointer-Drag) / Zoom (Buttons + Wheel), aufklappbare Teilbäume. Daten aus
`roleAnalyzerService.getOrgStructure(envKey)` (`OrgStructure`): baut auf dem
vorhandenen Security-Snapshot auf, der dafür um `businessunit`-Hierarchie,
`team.businessunitid/teamtype/isdefault` und `systemuser.businessunitid`
erweitert wurde (`assembleOrgStructure`). **Layout = pure function**
`utils/orgTree.ts` (`buildForest` + `layoutTree`, Leaf-Slot-Zentrierung,
variable Level-Höhen, Vitest). Default nur **Rollen-vergebende Teams**
(`roleNames.length>0`), Toggle für alle (Default-/Access-Teams). **Trace-
Modus**: User wählen → seine BU + Member-Teams werden hervorgehoben, Rest
gedimmt; Panel listet die per Team gewonnenen Rollen. Membership wird im
Snapshot nur für Rollen-Teams geladen (Non-Role-Teams zeigen keine Member).

**Field-Level Security Analyzer** (Role Analyzer → Sub-Tab „Field security",
read-only): `FieldSecurityWorkspace` + `fieldSecurityService`
(`dataverse…`/`mock…`). Liest über den Konnektor: `fieldsecurityprofiles`
(odataQuery), `fieldpermissions` (fetchXml — je gesicherte Spalte
Read/Create/Update/ReadUnmasked; **Optionswerte 0 = Not allowed, 4 =
Allowed**, `=== 4` decodiert), und die Zuweisungs-Intersects
`systemuserprofiles`/`teamprofiles` (fetchXml link-entity `intersect="true"`,
alias `sup`/`tp` → `<alias>.fieldsecurityprofileid`). Zwei Sichten:
profilzentriert und **spaltenzentriert** (Pivot = pure function
`utils/fieldSecurity.ts → pivotSecuredColumns`, Vitest). Anzeige mit logischen
Namen (entity/attribute; Display-Namen bräuchten Metadaten je Attribut).
Flags: Profil ohne User+Team („assigned to nobody"), Spalte ohne Read-Grant
(nur Admins — die Field Security generell umgehen). Lookup auf fieldpermission
defensiv über `_fieldsecurityprofileid_value` **oder** `fieldsecurityprofileid`
gelesen. Keine neuen Data Sources. **Live-Verify-Punkt:** die
FieldPermissionType-Werte (0/4) beim ersten echten Lauf bestätigen.

**Solution Import History** (Validate-Gruppe, Menüpunkt „Import History",
gated): `ImportHistoryWorkspace` + `importHistoryService`
(`dataverse…`/`mock…`), Zielumgebung per `OperateEnvPicker` (eigener Lift
`importEnvKey`, Remount per `key`). Liste aus `importjob` via Konnektor-
FetchXML — **NIE die `data`-Spalte selektieren** (annotiertes Manifest-XML,
kann MB groß sein); Status-Heuristik `importJobStatusHeuristic` (progress ≥
100 → succeeded; completedon + progress < 100 → failed; sonst running).
Detail lazy je Zeile: `data` einzeln laden und mit
`utils/importLog.ts → parseImportLog` (pure, Vitest **mit
`@vitest-environment jsdom`** — DOMParser; jsdom ist devDependency) parsen:
Manifest-Verdict (direktes `<result>`-Kind des `<solutionManifest>`),
`<MissingDependencies><MissingDependency>` → Tabelle aus den
`<Required>`/`<Dependent>`-**Attributen** (type = componenttype-Code →
`componentTypeLabel`, schemaName, displayName, solution,
parentSchemaName/parentDisplayName), generische
`result[result="failure|warning"]`-Knoten dedupliziert. Parser wirft nie
(Garbage ⇒ status 'unknown').

**User Settings** (Validate-Gruppe, Menüpunkt „User Settings", gated):
`UserSettingsWorkspace` + `UserSettingsDetailDialog` + `userSettingsService`
(`dataverse…`/`mock…`), Zielumgebung per `OperateEnvPicker` (eigener Lift
`userSettingsEnvKey`, Remount per `key`). **`usersettings`** (1:1 zu `systemuser`,
**PK = `systemuserid`**) via Konnektor, Entity-Set per `EntityDefinitions`
aufgelöst (**`usersettingscollection`**, nicht +s). Match cross-env über
**`azureactivedirectoryobjectid`** (App-User haben `applicationid`).
**Kompakte Liste** (`list`): User/Login/Time Zone/Currency/UI Language — Currency
= `transactioncurrency.isocurrencycode` (join) sonst `currencysymbol`; Suche,
„Only real users", Sortieren, Refresh+Last-sync. **Klick → `UserSettingsDetailDialog`**
(wide modal, Sub-Tabs General/Formats/Email/Privacy/Languages) mit **Live-Preview**
je Format-Gruppe. **Editierbar + Save** (Deployment-Manager): `getDetail` lädt alle
Felder + Base-Language (`organization.languagecode`, read-only); `pickers` (cached)
= `timezonedefinition`/`transactioncurrency`/`languageChoices()`; `updateUserSettings`
schreibt **nur die geänderten Felder** (Diff) via `UpdateRecordWithOrganization(…,
'usersettingscollection', systemuserid, item)` als Konnektor-SP (currency via
`transactioncurrencyid@odata.bind`), Confirm (PROD-Danger). **Coded Fields** (negative
number/currency, currency format, email tracking, error notification) → Value→Label
in `utils/usersettingsOptions.ts`; **Format-Previews** (number/currency/time/date) in
`utils/usersettingsFormat.ts` (beide Vitest). Feldnamen gegen die MS `usersettings`-
Referenz verifiziert. **⚠ Write verify-on-first-use:** Schreiben fremder `usersettings`
braucht `prvWriteUserSettings` (SP=sysadmin bei Schulz); `dateformatstring` treibt die
Anzeige — Sibling `*code` bleibt, beim ersten echten Save prüfen, dass es nicht
zurückgesetzt wird. **Copy to users** (`UserSettingsCopyDialog`, aus dem Detail-
Dialog, Deployment-Manager): den angezeigten Quell-User als Vorlage → Setting-Gruppen
wählen (`utils/usersettingsGroups.ts → SETTINGS_GROUPS`, `pickGroupValues`) + Ziel-User
multi-select (aus der Env-Liste, ohne App-User/Quelle) → **seriell** je Ziel
`updateUserSettings` (Progressbar „Copying to …" + per-User-Result), Confirm (PROD-
Danger). Kopiert die on-screen-Werte (Draft) → innerhalb DERSELBEN Env (currencyId ist
per-Env, nur gleiche Env valide).

**Release Timeline** (Manage-Gruppe, Menüpunkt „Timeline", ungated):
`ReleaseTimelineWorkspace` — reine Visualisierung vorhandener Daten, KEIN
eigener Datenpfad/Mock: aggregiert `solutionService.listMergeRuns` +
`listReleaseNotes` (je Release-recordId) und `importHistoryService.
listImportJobs` je `ENVIRONMENTS`-Eintrag (Match: `importjob.solutionname`
=== Release-`uniqueName`, case-insensitive). Builder = pure function
`utils/releaseTimeline.ts → buildReleaseTimeline(merges, notes, imports)`
(Vitest; Events ohne Timestamp werden gedroppt, Sortierung neueste zuerst).
Per-Env-Import-Fehler landen in einem Hinweis-Banner statt zu werfen. Der
Import-History-Mock hat env-spezifische `deploy_sprint_12`-Jobs (UAT ok,
PROD failed), damit die Timeline offline demobar ist.

**Process Comparer / Plugin Comparer** (Validate-Gruppe, gated, Menüpunkte
„Process Comparer"/„Plugin Comparer"; Code-Namen bleiben `flow*`/`flowCompare`):
eine **schreibende** Cross-Env-Matrix. Release-
Solution wählen → deren **Prozesse** (`workflow`, **ALLE Kategorien** — Cloud
Flows 5, klassische Workflows 0, Business Rules 2, Actions 3, Business Process
Flows 4; nur `type=1`-Definitionen, **kein `category`-Filter** mehr) bzw.
Plugin-Steps (`sdkmessageprocessingstep`) im **Host** lesen (Solution-Membership
via `solutioncomponent`-Link-Entity, Typ 29 bzw. 92 — **alle Prozessarten teilen
componenttype 29** und dieselbe statecode-Aktivierung, daher deckt EIN Read +
EIN Turn-On/Off alle ab) → dieselben Items **je Ziel-Env über die import-stabile
objectId** (`workflowid`/`sdkmessageprocessingstepid`) nachschlagen → Matrix je
Umgebung (Status + Version), Ziel-Zellen mit Status ≠ Host **gehighlightet**.
Die `category` wird je Zeile gelesen → `processType`/`processCategory` auf
`ComparerRow` (`utils/processType.ts`, `processTypeLabel`/`processTypeIcon`/
`PROCESS_TYPE_ORDER`); jede Zeile trägt ein **Typ-Icon** (`.cmp-type-icon`, ☁️/⚙️/
📏/⚡/🧭), das der Prozessart-Gruppenheader spiegelt (`.cmp-group-icon`, nur wenn
`g.key === row.processType`);
**Deep-Link (`flowDetailsUrl`) nur für Cloud Flows** (category 5) — die anderen
Prozessarten haben keine Einzelsatz-Portal-URL, ihre Zellen tragen keinen ↗. **Geteilte Bausteine:** `types/comparer.ts`
(`ComparerResult`/`ComparerRow`/`ComparerEnvState` + `recomputeDrift`),
`components/ComparerMatrix.tsx` + `ComparerWorkspace.tsx` (parametrisiert;
`FlowComparerWorkspace`/`PluginComparerWorkspace` sind dünne Wrapper). Services:
`flowComparerService`/`pluginComparerService` (+ `dataverse…`/`mock…`). **Reads**
über `currentEnvQuery.fetchXmlQuery(entitySet, fetchXml, orgUrlForEnvKey(env))`.
Flows: kein `version` → „modified"-Zeit; Absprung `flowDetailsUrl(envId,
workflowidunique)`. Plugin-Steps: **Version = Assembly** (Step→plugintype→
pluginassembly, aliased `pa.version`/`pa.name`). **⚠ Status-Semantik invertiert:**
Flow an = `statecode 1/statuscode 2` (`statecode===1` aktiv); Plugin-Step an =
`statecode 0/statuscode 1` (`statecode===0` aktiv). **Turn On/Off** =
`MicrosoftDataverseService.UpdateRecordWithOrganization(…, orgUrlForEnvKey(env),
'workflows'|'sdkmessageprocessingsteps', id, { statecode, statuscode })` — läuft
als **Konnektor-SP** cross-env (die nativen Writes gehen nur Host!), **kein
`isCurrentEnvKey`-Guard**; UI gated auf Deployment-Manager + `window.confirm`
(PROD extra-stark), danach Zelle einzeln neu gelesen. **SP braucht Schreib-/
Aktivierungsrecht auf `workflow`/`sdkmessageprocessingstep` im Ziel** (UAT/PROD).
Mock-Parität: `mockFlowComparerService`/`mockPluginComparerService` seeden dev/
uat/prod inkl. Drift + fehlendem Item → offline demobar. **Highlight je Zelle**
(kein Row-Tint) + Item-`drift`-Marker. **Soll-Zustand (Flow Comparer) — voll konfigurierbar, KEINE `hso_`-Hartkodierung:**
Quelle kommt aus `pro_workbenchsettings` (`config.ts → flowDefinitionConfig()`,
`RuntimeConfig.flowDefinition`, hydriert in `getRuntimeConfig`): Spalten
`pro_flowdefinitiontable` (Tabelle), `pro_flowdefinitionstatus` (Boolean-Spalte),
`pro_flowdefinitionname` (Name-Match-Spalte), `pro_flowdefinitionunique`
(optional, `workflowidunique`-Match) und `pro_flowdefinitionarea` (optional, ein
**OptionSet-Feld** auf der Definitionstabelle → Gruppierungsebene „Area"). Sind
Tabelle/Status/Name nicht alle gesetzt → Feature **komplett aus** (keine Spalte,
Drift = vs Current), keine Abhängigkeit. Schulz-Werte: `hso_cloudflow`/
`hso_flowstate`/`hso_name`/`hso_flowuniqueid` (+ `pro_flowdefinitionarea` =
`hso_area`, ein OptionSet auf `hso_cloudflow` mit Labels wie „Project Quote
Calculation"/„Vendor Catalog Management"/„Sales" — an INT-11 verifiziert).
**Area-Gruppierung** (analog Plugin-Assembly): ⚠ der
Konnektor liefert für `hso_area` **KEINEN Formatted-Value** (anders als
vermutet — die Zelle kam als nackte Optionszahl `864640001`). Deshalb löst
`loadAreaLabels` die Labels zur Laufzeit aus **`stringmap`** auf
(`attributename eq <areaCol>` → `attributevalue`→`value`; `hso_area` liegt nur
auf Cloud Flow, daher reicht der attributename-Filter), Sprachwahl **Base-
Language des Orgs zuerst** (Schulz = 1031, „Sales" statt 1033 „General"), dann
1033, dann beliebig. Der Label landet als `row.subtitle`. **Gruppierung ist jetzt
mehrdimensional** (`ComparerWorkspace` nimmt `groupBys: ComparerGroupBy[]` statt
des alten `groupByLabel`-Strings): ein **„Group by"-Dropdown** bietet je
Dimension mit Daten eine Option + „None". Flow Comparer: **`process type`
(Default, `row.processType`, Reihenfolge `PROCESS_TYPE_ORDER`)** und **`area`
(`row.subtitle`, nur wenn Area-Daten da)**; Plugin Comparer: `assembly`
(`row.subtitle`). `ComparerMatrix` bekommt `groupOrder` (Gruppen mit Drift zuerst,
dann diese Reihenfolge, dann alpha) und zeigt `subtitle` als Zweitzeile **außer**
wenn subtitle = aktive Gruppendimension (bei Area-/Assembly-Gruppierung ist es
schon der Header; bei Typ-Gruppierung erscheint die Area weiter als Zeile).
`pro_flowdefinitionarea`
wird in `getRuntimeConfig` in **eigenem try/catch** gelesen — fehlt die (neuere)
Spalte, bleibt nur Area aus, das Definition-Feature NICHT.
`loadDefinitions(orgUrl, cfg)` liest host-seitig die konfigurierte Tabelle,
matcht **unique-first** (dann Name). ⚠ Die Status-Spalte ist ein **Zwei-Optionen-
Feld** → der Konnektor liefert **JS-Boolean** (`true`/`false`), NICHT 1/0;
`rowNum(true)===0` → alles „Off". Daher `stateOf` robust gegen
boolean/number/string/label (`Number`/Regex, NICHT `rowNum`). **Definition-
Schalter** (neben Compare, `definitionMode`, Default an, nur bei Daten) steuert
`driftMode`: **`definition`** = Ist ≠ Soll je Env inkl. Host (+ Spalte);
**`current`** = Ist ≠ Host (Spalte aus). Drift zentral in `types/comparer.ts →
cellHasDrift`/`rowHasDrift(row, hostKey, envKeys, mode)`. Read als Konnektor-SP
(Schulz: **D365-CE-nonProd = System Administrator**); Entity-Set-Name via
`EntityDefinitions`-Metadaten aufgelöst (nicht naiv pluralisiert). Die frühere
`hso_cloudflowbyenvironment`-Lesung (per-Env-Soll) ist **entfernt** (war die
nächste Hartkodierung; ggf. später als zweites konfigurierbares Set). Turn On/Off-
Confirm = modernes `ConfirmDialog` (PROD-Danger). Getoggelte Zelle **flasht grün**
(`cmp-cell--flash`) und fadet in die Ruhefarbe.

**Owner je System + Bulk (nur Flow Comparer, prop-gated):** Jede Flow-Zelle zeigt
den **Owner in dem Env** (`ComparerEnvState.ownerId/ownerName`). Read via
**`systemuser`-Outer-Link-Entity** (`alias="ow"` → `ow.fullname`/`ow.domainname`)
an jeder workflow-Query (`OWNER_LINK` in `FLOW_ATTRS`-Reads) — der Konnektor liefert
für `ownerid` **keinen** verlässlichen Formatted-Value, daher der Join.
**`setFlowOwner(env, id, userId)`** = `UpdateRecordWithOrganization(..., 'workflows',
id, { 'ownerid@odata.bind': '/systemusers(userId)' })` als Konnektor-SP cross-env
(braucht **Assign**-Recht auf `workflow` im Ziel; SP=sysadmin bei Schulz).
**`listUsers(env, query)`** = `systemuser`-FetchXML (`isdisabled eq false`,
`like`-Filter auf fullname/domainname, count 30) → `UserRef[]`. Owner + Bulk sind in
`ComparerWorkspace` über Props gated (`enableBulk`, `setOwner`, `listUsers`) → Plugin
Comparer unverändert. **Bulk:** Zeilen-Checkboxen (Matrix `selectable`/`selected`),
Bulk-Balken (`.cmp-bulkbar`) mit **Ziel-Env-Wahl** + Activate/Deactivate/Change
owner…; **seriell** über `selectedShown` (`runBulk`), pro Item Ergebnis
(`BulkResult`, skipped wenn im Ziel-Env nicht present), Fortschritt via
`sharing-progress`. Owner-Wechsel läuft über dieselbe Selektion (auch 1 Flow) — kein
Inline-Zell-Button. User-Picker = `UserPickerDialog` (debounced, `.link-result-list`).
⚠ Owner-Reassign eines **aktivierten** Cloud Flows kann fehlschlagen (Connections des
Ziel-Users) — Fehler landen per Item im Bulk-Result.

**Persistenz + globaler Progress (nur Flow Comparer):** Compare-Result + Bulk-Run
leben im **Modul-Singleton** `hooks/useFlowRun.ts` (subscribe/emit +
`useSyncExternalStore`, `ComparerRunApi` aus `types/comparer.ts`) — überleben so den
Tab-Wechsel (Ergebnisliste + Solution-Auswahl bleiben) und die **async Compare/Bulk
laufen im Store weiter**, wenn `ComparerWorkspace` unmountet. `ComparerWorkspace` ist
jetzt **controlled** über `run: ComparerRunApi` (View-State — Filter/Selektion/
Confirm/Flash — bleibt lokal); Flow injiziert `useFlowRun()`, Plugin ein
komponentenlokales `useLocalComparerRun(compareFn)` (kein Persist/Bulk → shared
Component bleibt einheitlich). `App.tsx` liest denselben Singleton und rendert einen
`ActivityBar` (wie Analyze/Readiness, `bars[]`) bei laufendem/fertigem Compare/Bulk,
außerhalb des flowCompare-Tabs, mit Jump-Back. **Bulk-Progressbar nennt den aktuellen
Schritt** (`bulk.label`: „Activating …"/„Deactivating …"/„Assigning owner of …"),
`done/total` = abgeschlossene Items. **Sync-Header** oben rechts (`.cmp-sync`): Last
sync (`formatRelative(loadedAt)`) + Refresh (re-run compare). ⚠ `set`-in-effect für
`flowBarHidden`-Reset via `// eslint-disable-next-line react-hooks/set-state-in-effect`.

## ⚠️ Gotchas (alle hart erarbeitet — nicht erneut stolpern)

0. **Merge muss über die rohe `solutioncomponent`-Mitgliedschaft laufen, NICHT
   über `msdyn_solutioncomponentsummary`.** Die Summary (Maker-„Objects"-Grid)
   klappt Sub-Komponenten unter ihrer Tabelle zusammen → ein Merge darüber
   kopiert nur die Tabellen-Hülle und verliert die in der Quelle enthaltenen
   Spalten/Formulare/Views. `listMergeComponents()` liest daher die rohe
   `solutioncomponent`-Tabelle (jede explizit enthaltene Zeile, Root + Sub),
   reichert Namen aus der Summary an, sortiert Entitäten (Typ 1) nach vorn
   (Tabelle vor ihren Spalten) und übernimmt je Zeile das
   `rootcomponentbehavior` (0 = alle Subkomponenten via
   `DoNotIncludeSubcomponents=false`; explizite Subs sind eigene Zeilen).
   `listComponents()` (Summary) bleibt nur für die Anzeige.

1. **Generator-Bug:** Jedes `pac code add-data-source` bricht an
   `AddSolutionComponent.Schema.json` ab UND wirft die handgepflegten
   Blöcke (`addsolutioncomponent`, `retrievemissingdependencies`) aus
   `dataSourcesInfo.ts`. ⇒ **IMMER `./scripts/add-data-source.ps1`**
   benutzen (macht Workaround + Re-Insert automatisch).
   `pac code delete-data-source` löscht zusätzlich handgepflegte Dateien
   in `src/generated/` (AddSolutionComponentService!) → wiederherstellen.
   **Auch `power-apps add-flow` (npm-CLI) regeneriert `dataSourcesInfo.ts`**
   und kann handgepflegte Blöcke droppen — beobachtet: `retrievemissingdepen-
   dencies` weg, `addsolutioncomponent` blieb (das Re-Insert im Script feuert
   nur, wenn `addsolutioncomponent` fehlt → hier NICHT, also manuell den
   `retrievemissingdependencies`-Block oben in `dataSourcesInfo.ts` wieder
   einsetzen, Vorlage steht im Script). Nach jedem add-flow prüfen:
   `grep '"retrievemissingdependencies"' .power/schemas/appschemas/dataSourcesInfo.ts`.
2. **`publisherid@odata.bind` lowercase** — das generierte Modell behauptet
   `PublisherId@odata.bind`, Dataverse lehnt das ab (0x80048d19).
3. Entity-Set der Webressourcen heißt **`webresourceset`** (nicht
   webresources).
4. Konnektor: **`ListRecords` (ohne Org) ist unzuverlässig** — immer
   `ListRecordsWithOrganization` mit expliziter URL (auch für die eigene
   Umgebung). Org-Parameter = Org-URL ohne Slash.
   **Batch-Delete schluckt Fehler:** Der native Client (`getClient`) bündelt
   Deletes in einem `$batch`; ein abgelehnter Sub-Request (z. B. Solution-Delete
   `429 / 0x80071151` „another import/uninstall running") kommt trotzdem in
   einer **HTTP-200-`$batch`-Hülle** zurück → das `await` wirft NICHT, die
   generierte `delete()` gibt `void` zurück. ⇒ Erfolg per **Re-Read prüfen**
   (`assertSolutionDeleted`: Solution nach dem Delete erneut lesen, existiert
   sie noch → werfen). Fehler-Banner in `App.tsx` (`actionError`, 5s-Fade,
   `describeError` zieht die innere OData-`message` aus dem Batch-Body).
5. **Identitäten:** Native Dataverse-Sources laufen als angemeldeter User;
   Konnektor-Sources als Connection (`pro_CRDataverse` → SP „App-Reg
   D365-CE nonProd"). Current User ⇒ native `SystemusersService` mit
   Filter `Microsoft.Dynamics.CRM.EqualUserId(PropertyName='systemuserid')`.
   Rolle ⇒ native `RolesService`, **zwei getrennte Queries** (`resolveHasRole`
   → `roleFilterMatches`, OR): direkt
   `systemuserroles_association/any(u:u/systemuserid eq <id>)` **und**
   team-vererbt (nested Lambda)
   `teamroles_association/any(t:t/teammembership_association/any(m:m/systemuserid eq <id>))`.
   Getrennt, damit die (nested-Lambda-)Team-Query die direkte Prüfung nie
   regressiert — schlägt die Team-Query fehl, greift nur direkt. Filter über
   Rollen-**Name** deckt die BU-Kopien ab. (AAD-Group-Teams mit noch nicht
   materialisierter Membership sind eine bekannte Lücke.)
6. **Komponenten-Namen** aus `msdyn_solutioncomponentsummary` (Quelle des
   Maker-Portals); `rootcomponentbehavior` nur aus `solutioncomponent`;
   rohe Typ-Schlüssel via `prettifyTypeName()` („Customization.Type_X").
7. **Cross-Env-Identität:** GUIDs sind nur bei sauberem Solution-Transport
   stabil. EnvVars/ConnRefs/WebResources/CanvasApps werden beim Import per
   **Name** gematcht (`matchField` in `DEPENDENCY_SPECS`) — IDs können je
   Umgebung divergieren (real passiert: `hso_EnvVarDataverseInstance`).
   `modifiedon` ist KEIN Drift-Signal (Import überschreibt es).
8. **Functions/Actions ohne Generator:** Muster = Block in
   `dataSourcesInfo.ts` + handgeschriebener Client außerhalb
   `src/generated/` (siehe `retrieveMissingDependenciesService.ts`;
   GET-Function mit Pfad-Param wie audit-explorer/RetrieveAuditDetails).
   **Konnektor-Grenze:** `PerformUnboundActionWithOrganization` macht POST
   und kann nur **Actions** cross-env aufrufen, KEINE GET-*Functions*
   (z. B. `RetrieveSharedPrincipalsAndAccess` ⇒ „No HTTP resource found").
   Es gibt keine GET-Function-Konnektor-Op. ⇒ Sharing-Daten cross-env
   stattdessen als **Tabellen-Read** holen: `sharingService.ts` liest
   `principalobjectaccess` (POA, Entity-Set `principalobjectaccessset`) per
   **FetchXML** (`ListRecordsWithOrganization`-fetchXml-Param, da POA nicht
   im Standard-Entity-Reference ist) gefiltert auf `objectid eq <recordId>`
   → `principalid` + `principaltypecode` (8 User/9 Team) + `accessrightsmask`
   (Bitmaske). Läuft als SP — POA-Leserecht im Ziel nötig. Canvas Apps
   cross-env per `canvasapp.name` matchen (IDs divergieren).
   **Layer entfernen (Remove active customizations):** Bewusst NICHT in-app —
   der Layer Inspector verlinkt stattdessen tief ins Maker-Portal des Ziel-Env
   auf die solution-layers-Seite der Komponente; Entfernen ist destruktiv und
   nicht umkehrbar. Maker-Deeplink-Route (`config.makerLayerPath`, aus echten
   URLs verifiziert): `…/solutions/{solId}/<path>/layers` mit `<path>` je Typ —
   Entity(1) `entities/{id}`; WebResource(61) `web%20resources/code/{id}`;
   PluginAssembly(91) `objects/plugin%20assemblies/{id}`; SdkStep(92)
   `objects/plugin%20steps/{id}`; CanvasApp(300) `objects/apps/{id}` bzw.
   Custom Page (canvasapptype 2) `objects/pages/{id}`; Process(29)
   `objects/cloudflows/{id}` (category 5) bzw. `objects/processes/{id}` (0/3/4);
   CustomAPI(10021) `objects/customapis/{id}`, RequestParameter(10022)
   `objects/customapirequestparameters/{id}`, ResponseProperty(10023)
   `objects/customapiresponseproperties/{id}`. **EnvVars (380/381) und
   Connection References (10064) werden im Layer Inspector komplett
   übersprungen** (`LAYER_IGNORED_TYPES`) — sie haben per Definition einen
   Active-Layer (Wert/Connection). Type-Codes aus `solutioncomponentdefinition`
   verifiziert (DE-Locale zeigt „10.021" = 10021). Entity-Sub-Komponenten brauchen die
   Tabellen-MetadataId: `objects/entities/{entityId}/{forms|views|fields|
   business%20rules}/{id}/layers` (noch nicht umgesetzt → Fallback auf
   Solution-Objektliste). `solId` = Ziel-Env-Solution-ID (per `uniquename`
   auflösen, `resolveSolutionIdInEnv`). Recherche-Stand zum in-app-Entfernen,
   falls je gewünscht:
   `RemoveActiveCustomizations` ist im Web API **gar nicht** erreichbar (weder
   GET noch POST → HTTP 404 / `0x8006088a`, nur SOAP). Die POST-Action
   `BulkRemoveActiveCustomizations` (`isprivate:true`, fehlt im `$metadata`,
   aber per `PerformUnboundActionWithOrganization` cross-env aufrufbar) ginge —
   Body `{ Parameters: { '@odata.type':
   '…BulkRemoveActiveCustomizationsParameters', SolutionComponentReferences:
   [{ '@odata.type': '…SolutionComponentReference', Id: <objectId>,
   LogicalName: <name> }] } }`. **Achtung:** liefert IMMER HTTP 200 leer — egal
   ob entfernt oder No-op; LogicalName wird auf HTTP-Ebene NICHT validiert. ⇒
   ohne Re-Query des Layer-Stacks kein Erfolgssignal; läuft als SP, braucht
   Customizing-Recht im Ziel.
9. **DevOps-Konnektor:** kein PAT; EntraOAuth-Token kommt aus dem
   Heimat-Tenant des Kontos (HSO-Konto ⇒ TF400813 in Schulz-Org, Gast
   hilft nicht) ⇒ Lösung ist SP (TODO.md). EntraOAuth-Connections sind
   nicht teilbar, SP-Connections schon.
10. `.env` ist repo-weit gitignored ⇒ Konfig-Defaults gehören nach
    `src/config.ts`. UI-Sprache Englisch, Chat Deutsch.
    **Statische Assets (Bilder):** Der Code-App-Player serviert nur die in
    `index.html` referenzierten Dateien (JS/CSS); ein nur aus JS referenziertes
    `/assets/*.png` wird NICHT ausgeliefert (404 → Broken Image). ⇒ Bilder als
    **Data-URI inlinen**: `import logo from './assets/x.png?inline'` (vorher auf
    sinnvolle Größe verkleinern, da es im JS-Bundle landet). **Das App-Logo ist
    bewusst KEIN Raster mehr**, sondern ein code-gerendertes Lockup (Inline-SVG-
    Hexagon mit Brand-Gradient + Wordmark „Solution Administration Console / ALM")
    — gestochen scharf in jeder Größe, kein Asset-Serving nötig. Das gelieferte
    Raster-Lockup war klein unleserlich. **Shell-Layout** (Dynamics-365-Stil):
    `App.tsx` rendert eine volle **dunkle Topbar** (`.app-topbar`: Brand-Lockup
    links — `.brand-mark`/`.topbar-title`/`.topbar-tag` —, rechts `.topbar-actions`
    mit Mode-Badge + How-To/Help-Icons) über `.app-body` (sticky `.sidebar`
    full-height + `.content`). Höhen/Breiten als CSS-Vars in `index.css`
    (`--topbar-h`, `--sidebar-w`, `--topbar-bg`).
    **UI-Konsistenz (Refurbish-Pass in App.css):** native `<select>`s in
    Toolbars/Pickern werden ZENTRAL gestylt (`.trace-toolbar/.subtabs/
    .compare-controls/.operate-env/.validate-toolbar select` — Radius,
    Border, Chevron-Data-URI, Fokus) ⇒ neue Workspaces brauchen kein eigenes
    Select-Styling, einfach eine dieser Container-Klassen nutzen. `.subtab`
    ist nowrap (die Leiste wrappt als Ganzes); rechte Zusatz-Controls einer
    Sub-Tab-Leiste gehören in `<span className="trace-level-control">`
    (nowrap, shrink-0 — Muster: Trace-Level, Role-Snapshot/Reload,
    Health-Refresh).
11. Debugging: kein Zugriff auf die laufende App — Diagnostik via
    `console.warn('[solutions]/[compare]/[deps]'…)` + `pac env fetch
    --xmlFile <fetchxml>` (Read-only-Reproduktion als User). Lookup-Fehler
    im Dependency-Check erscheinen zusätzlich in der UI.
12. **Cloud Flow aufrufen (Sync with DevOps):** Code Apps rufen Flows nur
    über die **npm-CLI** `power-apps add-flow` (NICHT `pac code`) auf — nur
    Flows mit **Power Apps (V2)-Trigger** + solution-aware (sonst nicht in
    `power-apps list-flows`). Generiert `src/generated/services/<Flow>Service`
    mit `Run(input)` und registriert den Flow in `power.config.json`
    (`shared_logicflows`, `workflowDetails`). **Achtung Auth:** die npm-CLI
    macht Silent-SSO über die Browser-Session und greift gern den FALSCHEN
    Tenant ab (404 „environment … not found in tenant …") — Browser vorher auf
    das Schulz-Konto bringen, dann `power-apps logout` + erneut. `src/generated`
    und `power.config.json` sind gitignored ⇒ Flow-Service + Registrierung
    leben nur lokal, beim Frischklon `add-flow` erneut laufen lassen (danach
    gotcha #1 beachten). Aufruf gekapselt in
    `dataverseSolutionService.syncDevOpsWorkItemStatus()`; danach `reload()` →
    `toBeCompleted`-Abgleich. Flow „PA | MANUAL | Working Solution | Sync
    DevOps Work Item Status" (workflowId `6253ef0c-…`).
    **Deploy ab jetzt nur noch `power-apps push`** (npm-CLI): `pac code push`
    bricht mit HTTP 400 ab („Could not find member 'workflowDetails' on object
    of type 'AppConnectionReference'") — die ältere pac-Push-API kennt den von
    add-flow geschriebenen `workflowDetails`-Block in `power.config.json` nicht.
    `power-apps push` braucht die npm-CLI im Schulz-Tenant angemeldet (s. o.).
13. **Deployment Readiness muss konservativ sein — `unknown` ≠ grün.**
    `checkDependencies` nutzt `RetrieveMissingDependencies` + Target-Presence je
    Typ (`DEPENDENCY_SPECS`). Typen OHNE Spec-Eintrag bleiben `unknown` (nicht
    verifizierbar). Die UI (`DependencyCheck.tsx`) darf `unknown` NIE als grün
    werten — sonst falsche Entwarnung: real bei WaldmannCore importierte der
    Import trotz „grün" nicht (fehlend: Spalte type **2**, PCF-Control type
    **66**, Connection Reference). Grün nur bei **0 missing UND 0 unknown**;
    `unknown` kommt in einen eigenen „could not verify"-Abschnitt (mit „Add to
    Solution"). Custom Control = `66`.
    **⚠ Connection Reference hat KEINEN festen componenttype — er ist der
    per-Environment vergebene Entity-Type-Code (ETC) der `connectionreference`-
    Tabelle.** Bei Schulz zufällig `10064`, bei Waldmann `10093` (dort ist
    `10064` = `appsetting`!). Live verifiziert via `solutioncomponentdefinition`
    (`primaryentityname` → `solutioncomponenttype`). Deshalb NIE hartkodieren:
    `connectionReferenceTypeCode()` (`services/componentTypeCodes.ts`) löst den
    Code je Host-Env auf und cacht ihn; `checkDependencies`, der Env-Config-
    Solution-Filter (`dataverseEnvConfigService`) und der Layer-Inspector-Ignore-
    Set nutzen ihn (statt `10064`). 372 war schon immer falsch. Symptom des alten
    Bugs bei Waldmann: 71 Connection References als „Type 10093" im „could not
    verify"-Topf; Env Config zeigte bei Solution-Filter 0 Connection References.
    **Metadaten-Typen ohne Spec werden jetzt per Namen echt geprüft**
    (`resolveMetadataDeps`): die import-stabile Identität wird im Current-Env
    aufgelöst (Column 2 → `entity.attribut`-LogicalName via `EntityDefinitions`
    mit nach `MetadataId` gefiltertem `Attributes`-Expand; Choice 9 → OptionSet-
    `Name`; Table 1 → `LogicalName`; Relationship 3/10 → `SchemaName`) und dann
    **im Ziel nach diesem Namen** gesucht (überlebt Transport, auch wenn die
    MetadataId je Env divergiert) → `present`/`missing` statt pauschal `unknown`.
    **Safety (kein False-Green):** `present` nur bei positivem Fund, `false` nur
    wenn das Ziel für genau diese Identität **erfolgreich** abgefragt wurde und
    sie fehlt; bei JEDER Lookup-Panne bleibt die id aus `presence` → `unknown`
    (per-Chunk `queried`-Set trackt, welche Entities/Namen das Ziel wirklich
    beantwortet hat). Klassifikation ist entkoppelt vom Spec: `targetPresence.has`
    entscheidet (nicht mehr `DEPENDENCY_SPECS[type] && …`). Die „required by"-Seite
    nutzt `listMergeComponents` (löst Sub-Komponenten-Namen wie Forms/Spalten).
    Alles best-effort in eigenem try/catch.

## Offen / Nächstes

Abarbeitung nach `Roadmap.md` (⭐: Kollisions-Auflösung,
Release-Notes-Generator, Drift-Report). Vorher prüfen, ob der
Dependency-Check-Fix (`2089b37`, WithOrganization-Umstellung) vom User
bestätigt wurde. SP-Migration & DevOps-Reaktivierung: `TODO.md`.
