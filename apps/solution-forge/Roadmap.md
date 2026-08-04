# Roadmap — Solution Administration Console

Ideen-Katalog für den weiteren Ausbau (Stand 2026-07-06, mit dem Product
Owner durchgesehen — verworfene Ideen wurden gestrichen, die Historie steht
im Git-Log). Erledigtes wandert nach unten in „Umgesetzt". Die SP-Migration
hat ihre eigene Checkliste in [`TODO.md`](TODO.md).

## Qualität & Pre-Flight (vor Merge/Deployment)

- [x] ⭐ **Dependency-Check** (`RetrieveMissingDependencies`): Release-Solution
      gegen Ziel-Umgebung prüfen — Missing/Required Dependencies, optional
      „Add to Solution" je fehlender Komponente. *(Tab „Dependency Check")*
- [x] ⭐ **Analyze-Dashboard**: Solution-Analysis-Überblick je Release —
      Deployment Risk Score (Gauge + Risk-Band), Severity-Karten, Key-Issues-
      Tabelle, Komponenten-Übersicht, abgeleitete Recommendations und
      Environment-Readiness-Matrix; ein Durchlauf über alle vier Checks.
      *(Tab „Analyze", `AnalyzeDashboard` + `analysisModel.ts`)*

## Release-Zug & Deployment

- [x] ⭐ **Release-Notes-Generator**: Eigener Menüpunkt **Release Notes** —
      je Release-Solution aus der Merge-Historie generiert (enthaltene
      Solutions inkl. DevOps-`#`-Link, Komponenten nach Typ, App Elements als
      Counter), Umschalter Markdown | Raw + Copy. **Publish** speichert
      versionierte Snapshots (`pro_releasenote`, nur Deployment Manager),
      **History**-Tab zum Wiederabruf.
- [x] **Configuration Data Transfer Hub** (Menüpunkt „Data Transfer",
      Manage-Gruppe, gated): deklarative Transfer-Pakete für
      Konfigurationsdaten — Quell-Env → Tabelle → Filter/Spalten per
      System-View-Snapshot oder FetchXML (Validierung, Spalten-Picker,
      Preview), Record-Matching (GUID/Match-Spalten, max. 5), Orphan-Handling,
      Reihenfolge. **Ausführung durch mitinstallierte Cloud Flows** (Executor
      Parent+Child + Scheduler, `installer/deploy-executor-flow.ps1`) —
      Run now / Run later / **Dry run** (Simulation) / **wiederkehrender
      Zeitplan** je Paket (Daily/Weekly), Live-Log während der Ausführung,
      Konfigurationssperre bei aktivem Run. Contract in
      `docs/transfer-hub-contract.md`, Datenmodell
      `pro_transferpackage`/`pro_transferentry`/`pro_transferrun`.

### Transfer Hub — offene Ausbaustufen

- [ ] **Mehr als 5000 Zeilen je Entry**: aktuell hart begrenzt (Konnektor
      liefert je FetchXML-Read genau eine 5000er-Seite; die `paginationPolicy`
      wirkt dort **nicht** — empirisch widerlegt, und ein Akkumulator-Loop
      scheitert am Self-Reference-Verbot von `setVariable`). Der Executor
      bricht deshalb bei erreichtem Cap sicherheitshalber ab, statt
      abgeschnitten zu schreiben. Wege für später: OData-Read-Pfad (dort wirkt
      die Policy) statt FetchXML, oder ein Grandchild-Flow je Seite.

- [ ] **Delta-Transfers**: nur Zeilen mit `modifiedon` seit dem letzten
      erfolgreichen Run übertragen (Zeitstempel je Entry snapshotten, in den
      Fetch injizieren). Schließt sich mit Orphan-Handling gegenseitig aus
      (unvollständiges Quell-Set ⇒ False-Positive-Orphans) — im UI koppeln.
- [ ] **Benachrichtigung bei Failed/Partial**: Teams-/Mail-Action im
      Finish-Pfad des Executors oder ein Notification-Flow auf den
      `pro_transferrun`-Statuswechsel („Run lief nachts schief, niemand
      hat's gesehen").
- [ ] **Paket/Entry duplizieren**: ähnliche Pakete (gleiche Tabellen Richtung
      UAT vs. PROD) schnell aufsetzen.
- [ ] **Run-Housekeeping**: Runs akkumulieren unbegrenzt — „älter als N Tage
      löschen" als Bulk-Aktion oder im Scheduler.
- [ ] **Column-Plan-Transparenz im Entry-Dialog**: anzeigen, welche Spalten
      der Plan überspringt (Owner, polymorphe Lookups, read-only, statecode)
      statt sie still zu ignorieren.
- [ ] **Power-Platform-Pipelines-Integration**: Pipeline-Run aus der App
      starten, Run-Status nach `pro_deploymentstatus` zurückspiegeln.
- [x] **Solution Import History Viewer**: `importjob`-Historie je wählbarer
      Umgebung (Start, Status, Progress, Dauer, User, Kontext); Zeile
      aufklappen parst das Import-Log-XML lazy — **Missing-Dependency-Fehler
      werden präzise als Tabelle extrahiert** (fehlende Komponente mit Typ/
      Name/Herkunfts-Solution vs. abhängige Komponente mit Typ/Name/Parent),
      sonstige Failures/Warnings dedupliziert darunter. *(Menüpunkt „Import
      History", Validate-Gruppe, gated)*
- [x] **Release-Timeline**: Merge-Runs (`pro_mergerun`), veröffentlichte
      Release Notes (`pro_releasenote`) und Importe (`importjob`, je
      konfigurierter Umgebung, Match über Unique Name) als Zeitstrahl je
      Release — „was ging wann wohin" als reine Visualisierung vorhandener
      Daten, mit Event-Art-Filtern und Status-Badges. *(Menüpunkt „Timeline",
      Manage-Gruppe)*

## Drift & Governance

- [x] **Layer-Inspektor** (`msdyn_componentlayer`): Aktive unmanaged Layer
      über managed Komponenten in UAT/PROD aufdecken. *(Tab „Layer
      Inspector")*
- [x] **App-Sharing-Check**: Canvas Apps & Custom Pages einer Solution
      daraufhin prüfen, mit welchen Usern/Teams sie in UAT/PROD geteilt sind
      (`RetrieveSharedPrincipalsAndAccess`) — deployt-aber-nicht-geteilt
      aufdecken. *(Tab „App Sharing")*
- [ ] **Housekeeping-Cockpit**: Duplikate, Orphans, leere Solutions,
      „Work Item zu / Solution offen" als Aufräum-Seite mit Direkt-Aktionen.
- [x] **Compare: Inhalts-Drift** via Hash (`clientdata` / `xaml` / `content`)
      + Side-by-side-Diff. *(Compare → „Check content drift" + ⇄ diff)*
- [x] **EnvVar & Connection-Reference-Cockpit**: Environment Variables
      (`environmentvariabledefinition` + `environmentvariablevalue`) und
      Connection References (`connectionreference`) über alle konfigurierten
      Umgebungen (DEV/UAT/PROD) side-by-side; fehlende Werte / ungebundene
      Connection References / Transport-Lücken (in einem Env vorhanden, im
      anderen nicht) flaggen. Häufigster Import-Schmerz. Read-only über den
      Konnektor, Match über Schema-/Logical-Name. *(Menüpunkt „Env Config",
      Validate-Gruppe, gated)*
- [x] **Audit-Konfig-Analyzer**: welche Tabellen/Spalten Auditing aktiviert
      haben (`IsAuditEnabled` je Entity/Attribut) und die Org-Audit-/
      Retention-Einstellungen (`organization.isauditenabled`,
      `auditretentionperiodv2`) — Governance-Überblick mit Effektiv-Regel
      (org an + Tabelle an), Spalten-Drilldown. Synergie mit der
      Audit-Explorer-App im Monorepo. *(Menüpunkt „Audit Config",
      Validate-Gruppe, gated, wählbare Zielumgebung)*
- [x] **Dual-Write-Table-Map-Viewer**: die Custom (unmanaged) Dual-Write
      Table Maps der Current Environment (`msdyn_dualwriteentitymap`, gruppiert
      nach Name auf die aktuelle Version) mit Name/Version/Besitzer; Klick auf
      ein Mapping öffnet ein Overlay, das die `msdyn_mapping`-Definition
      aufbereitet (Legs Source ↔ Destination, Field-Mappings mit Sync-Richtung,
      Value-Maps, Lookups, System-Felder). Read-only, Parser Vitest-getestet.
      *(Menüpunkt „Dual-Write Maps", Validate-Gruppe, gated)*

## DevOps-Synergien (sobald der Service Principal steht, siehe TODO.md)

- [~] **Work-Item-Sync**: `pro_devopsworkitemstatus/-type`, Area/Iteration
      Path automatisch aktuell halten. „WI: Done, Solution: offen" wird bereits
      markiert (Badge „to be completed", liest den synchronisierten
      `pro_devopsworkitemstatus`), und der **„Sync with DevOps"-Button** stößt
      den Sync-Cloud-Flow on-demand an. Offen: automatischer/zeitgesteuerter
      Sync ohne Klick, Area/Iteration-Path, Typ-Sync (SP, siehe TODO.md).
- [ ] **Working Solution aus Work Item anlegen**: „Meine zugewiesenen Work
      Items" listen, Klick → Dialog vorbefüllt.
- [ ] **Branch/PR-Verknüpfung**: PRs zur Branch-Konvention `feature/<id>` am
      Eintrag zeigen (`pro_devopslink`).
- [ ] **DevOps-Panel reaktivieren** (`DEVOPS_PANEL_ENABLED`, siehe TODO.md).

## Performance & Bundle

- [x] **Chunk-Splitting**: react, übrige node_modules und der generierte
      Dataverse-Client liegen in eigenen Chunks (App-Chunk 984 → 620 kB).
      Bewusst **statisch** (`manualChunks`), weil der Code-Apps-Player nur
      Dateien ausliefert, die in `index.html` referenziert sind (gotcha #10)
      — `modulepreload`-Links erfüllen das, dynamische Imports nicht.
- [~] **Echtes Lazy-Loading der Workspaces** (React.lazy). **Die Machbarkeit
      ist am 2026-08-04 an INT-11 belegt**: der wiederangeschlossene **Role
      Analyzer** läuft als `React.lazy`-Workspace (eigener Chunk ~62 kB /
      18 kB gzip, in der `index.html` bewusst NICHT referenziert) — der Player
      liefert ihn aus, der Workspace lädt. Die alte Sorge „dynamische Chunks
      404en" ist damit widerlegt (Gotcha #10 präzisiert: betrifft Bilder, nicht
      JS-Chunks). `LazyWorkspace.tsx` (Suspense + Error Boundary) bleibt die
      Hülle für jeden Lazy-Workspace. **Offen: den Rest umstellen** — die
      dicken Brocken zuerst (OData Browser, Transfer Hub, Analyze/Detective,
      Comparer, User Settings), damit der ~624 kB-App-Chunk auf den Kern
      schrumpft.

## Team & Komfort

- [~] ⭐ **OData Browser** (Menüpunkt „OData Browser", Operate-Gruppe, gated):
      je Umgebung durch die Datenbank browsen. Läuft komplett über den
      vorhandenen Konnektor — keine neuen Data Sources. **v1 read-only**, die
      CRUD-Architektur (Interface, `WRITE_ENABLED`-Flag, Seams) ist mitgebaut.
      Plan + Entscheidungen: [`docs/odata-browser-plan.md`](docs/odata-browser-plan.md).
  - [x] **P1 Skelett** — Zielumgebungs-Picker, SP-Identitäts-Banner,
        Tabellen-Picker (Suche über Display-/Logical-/Set-Name, Systemtabellen
        zuschaltbar), Spalten-Picker aus Live-Metadaten (nicht selektierbare
        Spalten ausgegraut mit Grund, Lookups automatisch als `_x_value`),
        `$top` + Seitengröße, Run, dichtes Grid mit Sortierung, Formatted-
        values-Umschalter, Lookup-Chips, Load-more über den Paging-Cursor,
        Copy-URL, Fehler-Hints. Metadaten-Cache pro Org.
  - [x] **P2 Query-Core** — Filter-Builder mit typabhängigen Operatoren
        (inkl. `Microsoft.Dynamics.CRM.*`-Datums-/User-Funktionen), Choice-
        Labels aus `stringmap`, verschachtelte and/or-Gruppen;
        `$orderby`-Mehrfachsortierung (Shift-Klick); Count-Button über ein
        FetchXML-Aggregat; **editierbare Raw-Query-Zeile**, bidirektional
        gekoppelt — Raw gewinnt, unmodellierbare Ausdrücke bleiben wörtlich.
  - [x] **P3 IntelliSense** — pure Engine `utils/odataSuggest.ts` +
        `QueryInput` auf der Raw-Zeile: Entity-Sets (auch über Anzeigenamen —
        „Firma" findet `accounts`), Spalten je `$select`/`$orderby`/`$filter`
        (Lookups als `_x_value`), Sortierrichtung, typrichtige Operatoren,
        Choice-Werte mit Label, `Microsoft.Dynamics.CRM.*`-Funktionen inkl.
        Spalten-Completion im `PropertyName`, Nav-Properties für `$expand`;
        Signatur-Hinweis unter dem Feld, Strg+Space erzwingt Vorschläge.
        Dazu `validateQuery` als nicht-blockierende Prüf-Chips (unbekannte
        Spalte, Lookup ohne `_value`, nicht selektierbare Spalte, `$top`-Cap).
  - [x] **P4 Records** — Klick auf eine Zeile öffnet den **Datensatz** (alle
        Spalten, ohne `$select`), gruppiert in Identity/Data/References/System
        mit Formatted Values; **Lookups sind überall klickbar** (Grid-Chip und
        Panel-Zeile) und führen zum Zielsatz, mit Zurück-Pfad. Tab **Related**
        listet die 1:N-Beziehungen → „Browse" wechselt zur Kindtabelle,
        vorgefiltert auf den Elternsatz (normale Query, kein `$expand`, damit
        Paging/Filter/Sortierung erhalten bleiben). Tab **JSON** mit Copy.
        Dazu eine `$expand`-Auswahl im Builder (Chips + Dropdown der
        Navigation Properties; verschachteltes `$select` schreibt man in der
        Query-Zeile, dort hilft die IntelliSense).
  - [x] **P5 Komfort** — **Historie** (letzte 25 je Umgebung, Wiederholung
        rückt nach oben statt zu duplizieren) und **gespeicherte Queries** mit
        Namen, beides pro Umgebung im `localStorage`; **CSV-Export** (RFC 4180,
        UTF-8-BOM für Excel, respektiert den Formatted-values-Schalter) und
        **JSON-Export** (mit Annotationen); **FetchXML-Modus** als eigener
        Reiter (Tabelle aus `<entity name>`, eine Seite à max. 5000 Zeilen —
        der Konnektor pagt dort nicht); **Metadaten-Sets** (`EntityDefinitions`,
        `GlobalOptionSetDefinitions`, `RelationshipDefinitions`) im
        Tabellen-Picker, Grid-Spalten aus der Antwort abgeleitet.
  - [ ] **P6 Write** *(eigene Entscheidung)* — `WRITE_ENABLED` scharfschalten.
- [x] **Environment-Links (Referenz)**: eigener Menüpunkt mit den ständig
      gebrauchten URLs — **je Umgebung** (System-App, OData/Web API,
      Diagnostics, classic Advanced Settings/Rollen/Systemaufträge, Maker &
      Power Automate, PPAC Hub/Settings/Backup) plus **globalem** Block (Admin
      Center, Capacity, Release Planner, Service Health). Rein aus der
      Env-Konfiguration abgeleitet — kein Datenpfad, kein Connector, kein
      Gating; „open in new tab" + Copy-Button. *(Menüpunkt „Links",
      Reference-Gruppe; Builder `utils/envLinks.ts`, Vitest-getestet)*
- [x] **Merge-Historie als Tabelle** (statt nur „letzter Merge") — Grundlage
      für die Release Notes. *(Tabelle `pro_mergerun`, Detail-Panel der
      Release-Solution)*
- [x] **Self-Provisioning Wizard** (Reference › „Environment Setup"): geführtes
      Erst-Setup, das beim Start ohne Konfiguration hart blockierend vorblendet
      und die Steuer-Datensätze anlegt (`pro_workbenchsettings` + je Umgebung
      `pro_environmentconfig`). Bietet die per Konnektor erreichbaren
      Environments zur Auswahl (`GetOrganizations`), Publisher-/Rollen-Auswahl,
      Defaults; ADO/Flow-Definition optional. Idempotenter Upsert, lädt die
      Config live nach; derselbe Wizard im Edit-Modus zum Nachpflegen.
      *(Pure Utils `utils/provisioning.ts`, Vitest.)*
- [~] **Steuertabelle ausbauen** (`pro_workbenchsetting`): Umgebungs-URLs,
      Rollen-Name, ADO/Flow-Definition sind jetzt über den Self-Provisioning
      Wizard (Records statt `config.ts`) konfigurierbar. Offen: generische
      Feature-Flags.
- [x] **Rollen-Check um Team-Vererbung erweitern**: `hasRole` erkennt jetzt
      neben der direkten Zuweisung auch **team-vererbte** Rollen (Mitglied
      eines Teams, das die Rolle trägt) — zwei getrennte native `role`-Queries
      (direkt + nested Lambda `teamroles → teammembership`), damit die
      Team-Prüfung die direkte nie regressiert.

## Security / Role Analyzer

- [x] **Core Role Extractor**: custom (unmanaged) Rollen auf Privilegien-
      Überschneidungen analysieren; Privilegien, die in ≥ 2 Rollen vorkommen,
      als **Core-Rolle** (ggf. pro Bereich = pro geteiltem Rollen-Set)
      vorschlagen; Automatismus: Rollenname + Working Solution angeben →
      System legt die Rolle in der Solution an, fügt die konsolidierten
      Privilegien hinzu und entfernt optional die Duplikate aus den
      Quell-Rollen (die dann ebenfalls in die Solution kommen). *(Role
      Analyzer → Sub-Tab „Core roles"; nur Host-Env + Deployment Manager)*
- [ ] **Onboarding-Assistent („berechtigen wie …")**: neuen User wie einen
      Referenz-User ausstatten — Rollen, Team-Mitgliedschaften und
      FLS-Profile des Vorbilds anzeigen und per Klick übertragen (mit
      Diff-Preview und per-Step-Report). Nutzt den Security-Snapshot + die
      Schreib-Mechanik des Core Role Extractors.
- [x] ⭐ **Role Comparer cross-env** (Validate-Gruppe, Menüpunkt „Role
      Comparer", gated): dieselbe Sicherheitsrolle über alle konfigurierten
      Umgebungen als Matrix — je Zelle Privilegienzahl + **Fingerprint** des
      Privilegien-Sets (gleicher Fingerprint = identische Rechte).
      **Scope-Vorauswahl** wie im Process Comparer: Default nur
      **Custom-Rollen** (managed OOB-Rollen ausgeblendet, Checkbox holt sie
      zurück), optional auf die Rollen-Komponenten (Typ 20) einer gewählten
      Release-Solution eingeschränkt. Match über
      den **Namen** (die Rollen-GUID überlebt nur sauberen Solution-Transport,
      Gotcha #7); Name gleich + ID verschieden = **„rebuilt"**, also von Hand
      nachgebaut statt transportiert. Befunde als Filter-Chips: Privilege
      Drift, Missing/Target-only, Rebuilt, Managed State. Klick auf eine Rolle
      öffnet den Drilldown (Tabelle × Aktion × Umgebung mit Tiefe, „nur
      Unterschiede"-Schalter, dazu die Misc-Privilegien). Nicht lesbare
      Umgebungen zeigen „?" und fließen in **keinen** Befund ein (kein
      False-Green). **Read-only** — eine driftende Rolle wird transportiert,
      nicht im Ziel repariert (sonst entsteht genau der unmanaged Layer, den
      der Layer Inspector meldet). Kein eigener Datenpfad: orchestriert
      `roleAnalyzerService.loadModel` je Umgebung (Muster ALM Detective),
      Logik in der pure function `utils/roleCompare.ts` (Vitest).
- [ ] **Security-Baseline / eingefrorener Snapshot**: den Ist-Zustand als
      `pro_securitysnapshot` einfrieren und den Role Comparer statt gegen den
      Host gegen diese **Soll-Definition** prüfen (zweiter Drift-Modus, analog
      zum Definition-Schalter des Flow Comparers). Grundlage für das
      Security-Konzept-Dokument und den Snapshot-Diff („was hat sich seit dem
      letzten Audit geändert?").
- [ ] **Role DeDuplicator**: Prozess zum **Entflechten von
      Rollenzuordnungen, die Rechte doppelt vergeben** — pro User/Team
      aufdecken, welche Privilegien über mehrere zugewiesene Rollen mehrfach
      (ggf. in unterschiedlicher Tiefe) hereinkommen, und einen geführten
      Bereinigungs-Vorschlag machen (redundante Rollenzuweisung entfernen,
      sobald eine Core-Rolle dieselben Rechte trägt; Effektiv-Rechte bleiben
      unverändert). Baut auf dem Core Role Extractor + der Effektiv-Rechte-
      Analyse auf.
- [ ] **Cross-env-Write der Operate-Features (v2)**: Trace-Level-Switch und
      Job-Cancel/Retry auch gegen Nicht-Host-Umgebungen ermöglichen — via
      Konnektor (`PerformUnboundActionWithOrganization` / Update) statt der
      nativen Data Sources. Läuft dann als SP (verliert die Per-User-
      Durchsetzung) ⇒ eigene Gate-Rolle erwägen. Aktuell sind diese Writes
      bewusst Host-Env-only (native, als angemeldeter User).
- [x] **Field-Level Security Analyzer**: `fieldsecurityprofile` +
      `fieldpermission` auswerten — welche Spalten sind gesichert und wer
      (User/Team über `systemuserprofiles`/`teamprofiles`) darf sie
      Read/Create/Update/Unmasked. Profil- und spaltenzentrierte Sicht,
      Gap-Flags (Profil ohne Prinzipale, Spalte ohne Read-Grant). Ergänzt die
      Rollen-Matrix um die Spaltenebene. *(Role Analyzer → Sub-Tab „Field
      security")*
- [x] **Team- & BU-Map**: interaktives Org-Chart (Inline-SVG, Pan/Zoom,
      aufklappbar) der Business-Unit-Hierarchie (`businessunit.parentbusiness
      unitid`) mit den Rollen-vergebenden Teams (`teamroles`) je BU; Detail-
      Panel (Rollen/Mitglieder) und Trace-Modus (User → team-vererbte Rechte-
      Pfad). *(Role Analyzer → Sub-Tab „Team & BU map")*

## Umgesetzt

- [x] ⭐ **Operate-Gruppe** (Ideen aus `docs/Ideas_v2.md`, je eigener
      Menüpunkt). **Stand:** **Plugin Trace Explorer** und **Role Analyzer**
      sind in der App, der **Job Monitor** nicht. Beide letzteren waren am
      2026-07-29 abgeklemmt worden (lange ausgeblendete Previews, lagen aber
      weiter im Bundle; −120 kB App-Chunk); der **Role Analyzer ist am
      2026-08-04 zurückgekommen** — als Fundament der Security-Konzept-Ausbau-
      stufe und **lazy geladen**, sodass der Erststart unberührt bleibt
      (+3 kB App-Chunk statt +62 kB). Damit sind auch seine Unterfeatures
      (Core Role Extractor, Team & BU Map, Field-Level Security) wieder
      erreichbar. Der Job Monitor bleibt draußen; Wiederanschluss siehe
      Kommentar an der `Operate`-Gruppe in `App.tsx`.
      **Plugin Trace Explorer** (Stream + Correlation-Timeline +
      Performance-Aggregate + Trace-Level-Switch), **Async Job / Flow
      Monitor** (Health-Kacheln, asyncoperation-Explorer mit Bulk-
      Cancel/Retry, Flow-Runs mit Portal-Deep-Link, Watchdog-Board, Trends)
      und **Security Role Analyzer** (Matrix, Diff mit Export, effektive
      Rechte mit Herkunftspfad, Reverse Lookup, Hygiene-Report; read-only).
      Details/Offenes: `docs/Ideas_v2-Umsetzung.md`.

- [x] Darstellungs-Schicht `pro_workingsolution` (Join, Anlage, Nacherfassen,
      Re-Link, Typ-Pflege, Löschen mit Undo)
- [x] „Mark completed": offene Working Solution auf „Deployment completed"
      setzen, optional die unterliegende Solution löschen — mit 3s-Undo
      (Restore + Wieder-Öffnen)
- [x] Kollisions-Radar, Komponenten-Suche, Work-Item-Gruppierung
- [x] Merge mit Plan, Konflikt-Markierung und Status-Logging
- [x] Merge-Historie: jeder Merge schreibt eine `pro_mergerun`-Zeile (Counts +
      Quell-Solutions + hinzugefügte Komponenten als kompaktes JSON in einer
      Multiline-Spalte, keine Kind-Tabelle); im Detail der Release-Solution als
      ausklappbare Tabelle (pro Lauf die Komponenten nach Typ gruppiert)
- [x] Compare über INT-11 / UAT / PROD (Missing + Status drift; Gruppen
      collapsible; Picker release-gefiltert)
- [x] **Flow Comparer deckt alle wesentlichen Prozessarten ab**: nicht mehr nur
      Cloud Flows, sondern alle `workflow`-Kategorien (Cloud Flows, klassische
      Workflows, Business Rules, Actions, Business Process Flows) — gelesen über
      dieselbe `solutioncomponent`-Typ-29-Mitgliedschaft, per `category`
      unterschieden. Ergebnisliste **nach Prozessart gruppiert und zuklappbar**
      (Umschalter „Group by": Prozessart | Area | None); Turn-On/Off + Bulk +
      Definition/Area gelten weiter. *(Menüpunkt „Flow Comparer",
      `utils/processType.ts`)*
- [x] Layer Inspector: alle Komponenten-Typen, progressive Sektionen,
      DEV-vs-Ziel-Diff, Existenz/Missing für alle Typen (vom Compare hierher);
      Missing/Unmanaged-Filter-Chips; „↗ layers"-Absprung ins Maker-Portal des
      Ziel-Env (direkt auf die solution-layers-Seite bei Tabellen, Canvas Apps,
      Custom Pages, Cloud Flows, Workflows, Web Resources, Plugin Assemblies,
      Plugin Steps, Custom APIs; sonst auf die Solution; Remove active
      customizations bewusst dort, nicht in-app); EnvVars (380/381) +
      Connection References (10064) ausgeblendet
- [x] Navigation: Sidebar (Gruppen Manage/Validate) statt Tabs; geteilte
      Validate-Auswahl (Solution + Ziel-Env) über Compare/Dependencies/Layers/
      App Sharing (`ValidateWorkspace`)
- [x] Standard-Filter Open/Tracked/Mine, Rollen-Gating Merge & Compare
- [x] Layer Inspector: unmanaged Active-Layer über managed Komponenten in
      UAT/PROD (`msdyn_componentlayer`)
- [x] Compare-Inhalts-Drift: Hash der Definition + Side-by-side-Diff (⇄ diff)
- [x] App Sharing: Canvas-App-/Custom-Page-Sharing über DEV/UAT/PROD
      (POA via Konnektor-FetchXML; nur Releases, ohne Component Libraries)
- [x] In-App-Anleitungen: **How-To** (Onboarding-Walk-through Workbench →
      Anlegen → Merge → Validate) neben **Help** (Feature-Referenz), beide als
      Topbar-Icon (rechts) + Overlay
- [x] ALM Detective: phasenweiser Pre-Deployment-Audit (Dependency, Compare
      inkl. Content Drift, Layer, App Sharing) mit Severity-Report
- [x] Validate-Umbau in zwei Phasen: **Deployment Readiness** (= vorher;
      Dependency Check) und **Analyze** (= nachher). Analyze als Container:
      Toolbar (Solution + UAT/PROD + Post-Check-Auswahl + Analyze nebeneinander),
      Progress, dann Sub-Tabs Summary + Compare/Layers/App Sharing (Voll-
      Inhalte via `autoRun`, keep-alive). Summary: Risk-Counter als Filter,
      alle Issues nach Kritikalität gruppiert + ein/ausklappbar. Analyse-Lauf
      bleibt nach App gehoben (läuft im Hintergrund weiter, Info-Bar)
- [x] Analyze-Dashboard (Validate › Analyze): Risk Score + Gauge, Severity-
      Karten, Key Issues, Komponenten-Übersicht, Recommendations und
      Environment-Readiness — reine Ableitung über `analysisModel.ts` auf dem
      Detective-Orchestrator
- [x] App-Shell im Dynamics-365-Stil: durchgehende dunkle Topbar (Brand +
      Utility-Cluster mit Mode-Badge/How-To/Help), full-height-Sidebar,
      full-width-Content (`.app-topbar`/`.app-body`)
