# Roadmap — Solution Administration Console

Ideen-Katalog für den weiteren Ausbau (Stand 2026-06-12). Erledigtes wandert
nach unten in „Umgesetzt". Die SP-Migration hat ihre eigene Checkliste in
[`TODO.md`](TODO.md).

## Qualität & Pre-Flight (vor Merge/Deployment)

- [ ] ⭐ **Kollisions-Auflösung**: Aus dem Kollisions-Radar heraus Komponenten
      per Klick aus einer Working Solution entfernen
      (`RemoveSolutionComponent`) oder in die andere verschieben.
- [x] ⭐ **Dependency-Check** (`RetrieveMissingDependencies`): Release-Solution
      gegen Ziel-Umgebung prüfen — Missing/Required Dependencies, optional
      „Add to Solution" je fehlender Komponente. *(Tab „Dependency Check")*
- [x] ⭐ **Analyze-Dashboard**: Solution-Analysis-Überblick je Release —
      Deployment Risk Score (Gauge + Risk-Band), Severity-Karten, Key-Issues-
      Tabelle, Komponenten-Übersicht, abgeleitete Recommendations und
      Environment-Readiness-Matrix; ein Durchlauf über alle vier Checks.
      *(Tab „Analyze", `AnalyzeDashboard` + `analysisModel.ts`)*
- [ ] **Solution-Checker-Anbindung**: Critical/High-Findings des Microsoft
      Solution Checkers als Badge pro Working Solution.
- [ ] **Pre-Merge-Diff**: Zwei Solutions gegenüberstellen — „was würde der
      Merge dem Release hinzufügen?"

## Release-Zug & Deployment

- [x] ⭐ **Release-Notes-Generator**: Eigener Menüpunkt **Release Notes** —
      je Release-Solution aus der Merge-Historie generiert (enthaltene
      Solutions inkl. DevOps-`#`-Link, Komponenten nach Typ, App Elements als
      Counter), Umschalter Markdown | Raw + Copy. **Publish** speichert
      versionierte Snapshots (`pro_releasenote`, nur Deployment Manager),
      **History**-Tab zum Wiederabruf.
- [ ] **Deployment-Kanban**: `pro_deploymentstatus` als Board mit
      Drag & Drop (None → To be deployed → In progress → Completed).
- [ ] **Power-Platform-Pipelines-Integration**: Pipeline-Run aus der App
      starten, Run-Status nach `pro_deploymentstatus` zurückspiegeln.
- [ ] **Version-Bump & Export**: Versionsnummer der Release-Solution
      hochzählen und Export anstoßen.

## Drift & Governance

- [ ] ⭐ **Drift-Report über alles**: Compare über alle getrackten Solutions
      aggregiert (X missing in PROD, Y Status-Drift) mit CSV-Export.
- [x] **Layer-Inspektor** (`msdyn_componentlayer`): Aktive unmanaged Layer
      über managed Komponenten in UAT/PROD aufdecken. *(Tab „Layer
      Inspector")*
- [x] **App-Sharing-Check**: Canvas Apps & Custom Pages einer Solution
      daraufhin prüfen, mit welchen Usern/Teams sie in UAT/PROD geteilt sind
      (`RetrieveSharedPrincipalsAndAccess`) — deployt-aber-nicht-geteilt
      aufdecken. *(Tab „App Sharing")*
- [ ] **Präfix-Wächter**: Komponenten mit fremdem Publisher-Präfix in einer
      Working Solution flaggen.
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

## Team & Komfort

- [x] **Merge-Historie als Tabelle** (statt nur „letzter Merge") — Grundlage
      für die Release Notes. *(Tabelle `pro_mergerun`, Detail-Panel der
      Release-Solution)*
- [ ] **Teams-Benachrichtigungen**: neuer Konflikt im Radar / Merge fertig →
      Post in den Dev-Channel.
- [ ] **Notizen am Eintrag** (Annotations im Detail-Panel).
- [ ] **Steuertabelle ausbauen** (`pro_workbenchsetting`): Umgebungs-URLs,
      Rollen-Name, Feature-Flags konfigurierbar statt hart in `config.ts`.
- [ ] **Rollen-Check um Team-Vererbung erweitern** (aktuell nur direkte
      Zuweisung von „INT | Deployment Manager").

## Security / Role Analyzer

- [x] **Core Role Extractor**: custom (unmanaged) Rollen auf Privilegien-
      Überschneidungen analysieren; Privilegien, die in ≥ 2 Rollen vorkommen,
      als **Core-Rolle** (ggf. pro Bereich = pro geteiltem Rollen-Set)
      vorschlagen; Automatismus: Rollenname + Working Solution angeben →
      System legt die Rolle in der Solution an, fügt die konsolidierten
      Privilegien hinzu und entfernt optional die Duplikate aus den
      Quell-Rollen (die dann ebenfalls in die Solution kommen). *(Role
      Analyzer → Sub-Tab „Core roles"; nur Host-Env + Deployment Manager)*
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
      Menüpunkt): **Plugin Trace Explorer** (Stream + Correlation-Timeline +
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
      (Restore + Wieder-Öffnen); erster Baustein Richtung Deployment-Kanban
- [x] Kollisions-Radar, Komponenten-Suche, Work-Item-Gruppierung
- [x] Merge mit Plan, Konflikt-Markierung und Status-Logging
- [x] Merge-Historie: jeder Merge schreibt eine `pro_mergerun`-Zeile (Counts +
      Quell-Solutions + hinzugefügte Komponenten als kompaktes JSON in einer
      Multiline-Spalte, keine Kind-Tabelle); im Detail der Release-Solution als
      ausklappbare Tabelle (pro Lauf die Komponenten nach Typ gruppiert)
- [x] Compare über INT-11 / UAT / PROD (Missing + Status drift; Gruppen
      collapsible; Picker release-gefiltert)
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
