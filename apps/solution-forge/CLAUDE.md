# Solution Administration Console — Agent-Handbuch

Power Apps **Code App** (React 19 + TS + Vite + `@microsoft/power-apps`).
Verwaltet Dataverse-Solutions für Feature-/Bug-Entwicklung. Lies zuerst:
`Roadmap.md` (nächste Aufgaben), `TODO.md` (SP-Migration), `README.md`.

## Deployment-Kontext

| Was | Wert |
| --- | --- |
| Umgebung (Host) | **D365-SCHULZ-INT-11**, `431783f6-367c-eb49-984b-4e70e4c0424d`, https://operations-d365-schulz-int-11.crm4.dynamics.com |
| UAT / PROD | siehe `ENVIRONMENTS` in `src/config.ts` (Compare/Dependency-Check-Ziele) |
| App-ID | `459ee5cd-2138-4556-b472-058c676f72ef` (appDisplayName in power.config.json noch „Solution Forge") |
| Solution | `WorkbenchSchulz` (`67315e76-c155-ed11-bba2-0022489de585`) — App-Mitgliedschaft via Maker-Portal „Add existing → App → Code app" (`power-apps push -s` registriert sie NICHT) |
| DevOps | Org `SchulzD365`, Projekt `D365UO` — Panel deaktiviert (`DEVOPS_PANEL_ENABLED=false`), Reaktivierung siehe TODO.md |
| Rolle für die Validate-Gruppe (Compare/DependencyCheck/Layers/App Sharing) | `INT | Deployment Manager` (`DEPLOYMENT_MANAGER_ROLE` in config.ts) — Workbench + Merge sind NICHT gated |
| pac-Auth | Profil `EX-Andy.Schwarz@schulz.st`; ggf. `-env <INT-11-URL>` |

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

**Datenmodell:** `ssid_workingsolution` = Darstellungs-Schicht, verlinkt
über `ssid_uniquesolutionname` zur echten Solution. Typ-Kaskade:
`sst_type_opt` (867520000 F / …001 B / …002 R) → `sst_devopsworkitemtype`
(Bug→Bug, CR/Feature/Backlog→Feature) → Namenskonvention
(`feature_|bug_|deploy_`) → Other. Releases: keine DevOps-ID anzeigen,
Pflichtfeld bekommt `'N/A'`. Pflicht-Lookup `ssid_WorkbenchSetting` wird
aus erstem `ssid_workbenchsettings`-Datensatz aufgelöst. **Offen/Geschlossen
richtet sich allein nach dem `statecode` des Records** (0 = offen, 1 =
geschlossen), NICHT nach dem Deployment-Status (`isOpenStatus`); `listSolutions`
lädt daher auch inaktive Records (kein `statecode eq 0`-Filter mehr) und der
Open-Toggle blendet sie aus. „Mark completed" setzt nur das Status-Label
`ssid_deploymentstatus`, deaktiviert den Record (noch) nicht.

**Merge-Regeln je Release:** zwei Multi-Select-Choices auf
`ssid_workingsolution` — `sst_allowedmergetypes` (Allow) + `sst_excludedmergetypes`
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

**Merge-Historie:** Tabelle `sst_mergerun` (1 Zeile je Merge) — Counts
(`sst_added_int`/`sst_skipped_int`/`sst_errors_int`), Quell-Titel
(`sst_sources_txt`, `\n`-getrennt), Ziel via Lookup `sst_targetsolution_ref`
→ `ssid_workingsolution`. **Welche Komponenten** hinzugefügt wurden, liegen
bewusst denormalisiert als kompaktes JSON-Array (`[{t:Typ,n:Name}]`) in der
Multiline-Spalte `sst_addedcomponents_txt` — eine Spalte statt Kind-Tabelle,
defensiv geparst (`toMergeRun`). Schreiben in
`dataverseSolutionService.logMergeRun` (best-effort, scheitert nie den Merge);
Lesen via `listMergeRuns(targetRecordId)` (Filter
`_sst_targetsolution_ref_value eq <id>`). UI: Tabelle im `SolutionDetail`
(nur Release-Solutions, lädt sich selbst, Remount je Solution); Klick auf eine
Zeile öffnet ein **Overlay** (`MergeRunComponentsModal`) mit den hinzugefügten
Komponenten gruppiert nach Typ.

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
   Konnektor-Sources als Connection (`sst_CRDataverse` → SP „App-Reg
   D365-CE nonProd"). Current User ⇒ native `SystemusersService` mit
   Filter `Microsoft.Dynamics.CRM.EqualUserId(PropertyName='systemuserid')`.
   Rolle ⇒ native `RolesService` mit
   `systemuserroles_association/any(u:u/systemuserid eq <id>)` (nur
   direkte Zuweisung, keine Team-Vererbung).
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
    Hexagon mit Brand-Gradient + Wordmark „Solution Admin Console / ALM" in
    `App.tsx`, Styles `.brand-mark`/`.brand-text`) — gestochen scharf in jeder
    Größe, kein Asset-Serving nötig. Das gelieferte Raster-Lockup war klein
    unleserlich.
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

## Offen / Nächstes

Abarbeitung nach `Roadmap.md` (⭐: Kollisions-Auflösung,
Release-Notes-Generator, Drift-Report). Vorher prüfen, ob der
Dependency-Check-Fix (`2089b37`, WithOrganization-Umstellung) vom User
bestätigt wurde. SP-Migration & DevOps-Reaktivierung: `TODO.md`.
