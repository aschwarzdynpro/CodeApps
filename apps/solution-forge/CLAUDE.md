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
| Rolle für Merge/Compare/DependencyCheck | `INT | Deployment Manager` (`DEPLOYMENT_MANAGER_ROLE` in config.ts) |
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
`comparisonService.ts`; App-Sharing separat: `sharingService.ts`. Caches
(Komponenten, Suche-Index, Kollisionsradar, WorkItems) leben in `App.tsx`.

**Datenmodell:** `ssid_workingsolution` = Darstellungs-Schicht, verlinkt
über `ssid_uniquesolutionname` zur echten Solution. Typ-Kaskade:
`sst_type_opt` (867520000 F / …001 B / …002 R) → `sst_devopsworkitemtype`
(Bug→Bug, CR/Feature/Backlog→Feature) → Namenskonvention
(`feature_|bug_|deploy_`) → Other. Releases: keine DevOps-ID anzeigen,
Pflichtfeld bekommt `'N/A'`. Pflicht-Lookup `ssid_WorkbenchSetting` wird
aus erstem `ssid_workbenchsettings`-Datensatz aufgelöst. Status-Codes:
`CLOSED_STATUS_CODES` in types/solution.ts.

## ⚠️ Gotchas (alle hart erarbeitet — nicht erneut stolpern)

1. **Generator-Bug:** Jedes `pac code add-data-source` bricht an
   `AddSolutionComponent.Schema.json` ab UND wirft die handgepflegten
   Blöcke (`addsolutioncomponent`, `retrievemissingdependencies`) aus
   `dataSourcesInfo.ts`. ⇒ **IMMER `./scripts/add-data-source.ps1`**
   benutzen (macht Workaround + Re-Insert automatisch).
   `pac code delete-data-source` löscht zusätzlich handgepflegte Dateien
   in `src/generated/` (AddSolutionComponentService!) → wiederherstellen.
2. **`publisherid@odata.bind` lowercase** — das generierte Modell behauptet
   `PublisherId@odata.bind`, Dataverse lehnt das ab (0x80048d19).
3. Entity-Set der Webressourcen heißt **`webresourceset`** (nicht
   webresources).
4. Konnektor: **`ListRecords` (ohne Org) ist unzuverlässig** — immer
   `ListRecordsWithOrganization` mit expliziter URL (auch für die eigene
   Umgebung). Org-Parameter = Org-URL ohne Slash.
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
9. **DevOps-Konnektor:** kein PAT; EntraOAuth-Token kommt aus dem
   Heimat-Tenant des Kontos (HSO-Konto ⇒ TF400813 in Schulz-Org, Gast
   hilft nicht) ⇒ Lösung ist SP (TODO.md). EntraOAuth-Connections sind
   nicht teilbar, SP-Connections schon.
10. `.env` ist repo-weit gitignored ⇒ Konfig-Defaults gehören nach
    `src/config.ts`. UI-Sprache Englisch, Chat Deutsch.
11. Debugging: kein Zugriff auf die laufende App — Diagnostik via
    `console.warn('[solutions]/[compare]/[deps]'…)` + `pac env fetch
    --xmlFile <fetchxml>` (Read-only-Reproduktion als User). Lookup-Fehler
    im Dependency-Check erscheinen zusätzlich in der UI.

## Offen / Nächstes

Abarbeitung nach `Roadmap.md` (⭐: Kollisions-Auflösung,
Release-Notes-Generator, Drift-Report). Vorher prüfen, ob der
Dependency-Check-Fix (`2089b37`, WithOrganization-Umstellung) vom User
bestätigt wurde. SP-Migration & DevOps-Reaktivierung: `TODO.md`.
