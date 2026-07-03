# Ideas v2 — Umsetzung & Einbindungs-Vorschläge

Stand: Juli 2026. Die drei Konzepte aus [`Ideas_v2.md`](Ideas_v2.md) sind als
**Operate-Gruppe** in der Solution Administration Console
(`apps/solution-forge`) umgesetzt — jede Idee mit eigenem Menüpunkt in der
Sidebar:

| Menüpunkt | Idee | Gating |
| --- | --- | --- |
| 🧵 **Plugin Traces** | Plugin Trace Explorer | offen; Trace-Level-Switch nur Deployment Manager |
| 📡 **Job Monitor** | Async Job / Flow Monitor | offen; Bulk-Cancel/Retry nur Deployment Manager |
| 🛡 **Role Analyzer** | Security Role Analyzer | komplett gated (Deployment Manager), read-only |

## Wie die Features eingebunden sind

### Navigation & UI

- Neue Sidebar-Gruppe **Operate** unterhalb von Manage/Validate (`App.tsx`,
  `NAV_GROUPS`). Die Gruppe ist bewusst getrennt: Manage/Validate arbeiten am
  Release-Zug, Operate ist die Betriebssicht auf die aktuelle Umgebung.
- Jeder Workspace nutzt die vorhandenen UI-Bausteine (Sub-Tabs `subtabs`,
  Cards, Chips, `state`-Banner) und bringt eigene, präfixierte Styles mit
  (`ops-*`, `trace-*`, `jobs-*`, `roles-*` in `App.css`).
- Der HelpPanel („?" oben rechts) hat je Feature einen eigenen Abschnitt.

### Service-Architektur (Muster der App beibehalten)

Je Feature ein Interface + zwei Implementierungen — UI hängt nur am
Interface, Mock macht alles offline demobar:

```
traceService.ts        → dataverseTraceService.ts        / mockTraceService.ts
jobMonitorService.ts   → dataverseJobMonitorService.ts   / mockJobMonitorService.ts
roleAnalyzerService.ts → dataverseRoleAnalyzerService.ts / mockRoleAnalyzerService.ts
```

**Datenzugriff — die zentrale Design-Entscheidung:**

- **Alle Reads laufen über den bereits eingebundenen Dataverse-Konnektor**
  als FetchXML-Passthrough gegen die aktuelle Umgebung
  (`src/services/currentEnvQuery.ts`: `fetchXmlQuery`, `fetchXmlAllPages`
  mit Paging, serverseitige Aggregate). Dadurch braucht **kein einziges
  Lese-Feature eine neue Data Source** — wichtig wegen des Generator-Gotchas
  (#1 in CLAUDE.md) und weil Intersect-Tabellen (`roleprivileges`,
  `systemuserroles`, `teamroles`, `teammembership`) ohnehin nur per FetchXML
  erreichbar sind. Die Intersects werden per **link-entity vom Parent aus**
  (privilege/systemuser/team) traversiert, sodass deren Entity-Set-Namen nie
  gebraucht werden.
- **Schreibpfade laufen nativ als angemeldeter User**: Trace-Level
  (`organization.plugintracelogsetting`) über `OrganizationsService.update`,
  Job-Cancel/Retry über `AsyncoperationsService.update`. So erzwingt
  Dataverse die Privilegien pro Person (der Konnektor-SP würde jedem
  App-Nutzer die Aktion erlauben) und der Audit zeigt, wer gehandelt hat.

### Leitplanken aus dem Konzept, wie umgesetzt

- `messageblock`/`exceptiondetails` **nie im Stream** — nur im
  Einzel-Retrieve beim Aufklappen; Exception-Flag über eine zweite id-only
  Query. Volltext nur als Opt-in mit Zeitfenster ≤ 24 h. Polling pausiert
  bei `document.hidden`. UI-Hinweis „Explorer, kein Archiv".
- `asyncoperation` immer mit Zeitfilter (Default 24 h) und Row-Cap;
  Aggregate serverseitig; Bulk-Aktionen max. 50/Batch, sequentiell mit
  Fortschritt und Einzel-Ergebnis-Report.
- Rollen **immer auf `parentrootroleid` aggregiert**; Privilegien-Snapshot
  ~15 min gecacht (`staleTime`), Kreuzprodukt als
  `Map<rootRoleId, Map<entity, Map<action, depth>>>`; v1 strikt read-only.
- Bitmasken-Decoder (`utils/privileges.ts`) und Watchdog-Regel
  (`utils/heartbeat.ts → evaluateHeartbeat`) sind **pure functions mit
  Vitest-Tests** (`npm test`, 13 Tests).

### Setup auf einem Environment

1. Zwei neue native Data Sources (nur für die Schreibpfade):
   ```powershell
   ./scripts/add-data-source.ps1 -a dataverse -t asyncoperation
   ./scripts/add-data-source.ps1 -a dataverse -t organization
   ```
2. Der **Konnektor-SP** („App-Reg D365-CE nonProd") braucht Leserechte auf
   `plugintracelog`, `asyncoperation`, `workflow`, `flowrun`, `role`,
   `privilege`, `systemuser`, `team` (+ Intersects) — bei System-
   administrator-SP bereits gegeben.
3. **Watchdog**: Die Tabellennamen des Heartbeat-Patterns stehen in
   `src/config.ts → WATCHDOG_TABLES` (Default `cust_heartbeatdefinition` /
   `cust_heartbeat`). Existieren die Tabellen nicht, zeigt das Board einen
   „not installed"-Hinweis — kein Fehler.

## Abweichungen vom Konzept (bewusst)

- **Effektive Rechte**: `RetrieveUserPrivileges` ist eine GET-*Function* und
  über den Konnektor nicht aufrufbar (CLAUDE.md Gotcha #8, keine
  GET-Function-Op). Die Aggregation läuft daher clientseitig aus direkten +
  Team-Rollen — was für den geforderten **Herkunftspfad** ohnehin nötig ist.
  Die UI kennzeichnet das als erklärbare Sicht, nicht als Audit-Beweis.
- **Flow-Runs** kommen aus der Dataverse-Tabelle **`flowrun`** statt über
  den Power-Automate-Management-Konnektor: kein zusätzlicher Konnektor, kein
  zusätzliches Consent, Deep-Link ins Portal funktioniert trotzdem
  (`workflowidunique` + Run-Name). Der Management-Konnektor bleibt eine
  v2-Option (siehe unten), falls Trigger-/Aktionsdetails je Run gebraucht
  werden.
- **p95** in der Performance-Sicht ist approximiert (FetchXML-Aggregate
  kennen keine Perzentile) und als „p95 ≈" gekennzeichnet.
- **Retry** setzt Jobs auf Ready/WaitingForResources zurück (Standard-
  Verhalten des klassischen UI); nicht jeder Job-Typ ist retry-fähig — das
  Einzel-Ergebnis-Reporting zeigt Ablehnungen sauber an.

## Vorschläge zur weiteren Einbindung (v2-Backlog)

**Querverbindungen zwischen den Features (größter Hebel, wenig Aufwand):**

1. **Analyze/ALM-Detective ↔ Operate**: Nach einem Deployment (Merge in
   Release abgeschlossen) einen „Post-Deployment-Check" anbieten, der
   automatisch den Trace-Stream (nur Exceptions, 1 h) und die Failed-Jobs-
   Kachel gegenprüft — als zusätzliche Phase im Analyze-Dashboard.
2. **Job Monitor → Trace Explorer**: Fehlgeschlagene System-Jobs vom Typ
   Plugin/Workflow direkt mit „⛓ Traces zu diesem Zeitpunkt öffnen"
   verlinken (Stream vorgefiltert auf Zeitfenster ± 5 min + Entity).
3. **Role Analyzer ↔ App Sharing**: Reverse-Lookup-Ergebnisse mit dem
   bestehenden App-Sharing-Check verschränken („App geteilt, aber Rolle
   fehlt" / „Rolle da, aber App nicht geteilt").

**Feature-Vertiefung:**

4. **Alerting**: Teams-/Mail-Benachrichtigung bei rotem Watchdog oder
   Failed-Spike — als Cloud Flow auf `cust_heartbeat`/`asyncoperation`
   (bewusst außerhalb der App, damit sie ohne offenen Browser feuert); die
   App verlinkt dann per Deep-Link zurück in den Job Monitor.
5. **Rollen-Editing (v2 des Role Analyzers)**: Depth-Zellen editierbar
   machen und über `AddPrivilegesRole`/`ReplacePrivilegesRole` schreiben —
   POST-Actions, daher konnektor-fähig; mit Diff-Preview + Confirm und
   eigener Rolle fürs Gating.
6. **Standardrollen-Drift**: Hygiene-Report um den Vergleich von Kopien
   der Standardrollen gegen das Original erweitern (Diff-Engine existiert
   bereits — nur die Paarbildung „Kopie von X" fehlt).
7. **Trace-Archivierung**: Optionaler Flow, der Exception-Traces vor dem
   Platform-Cleanup in eine eigene Tabelle/Blob kopiert; der Explorer
   bekäme einen „Archiv"-Sub-Tab mit derselben Detail-Ansicht.
8. **Power-Automate-Management-Konnektor** für Run-Details (Aktionsebene,
   Resubmit) — dann Flow-Resubmit direkt aus dem Run-Grid.
9. **Virtualisierte Rollen-Matrix**: Ab > 500 Tabellen die Matrix
   fenstern (aktuell: Filter + nur Tabellen mit Privilegien der Rolle).

**Betrieb/Verteilung:**

10. **Operate als eigene schlanke App**: Da die drei Features nur am
    Konnektor + zwei nativen Tabellen hängen, ließe sich die Operate-Gruppe
    mit wenig Aufwand als separate Code App („Ops Console") für Admins
    auskoppeln, falls die Zielgruppe (Betrieb) von der ALM-Zielgruppe
    abweicht. Empfehlung: erst in der Admin Console reifen lassen.
11. **Eigene Gating-Rolle** `INT | Ops Analyst` statt Deployment Manager
    für Role Analyzer/Bulk-Aktionen, wenn Betrieb und Deployment personell
    getrennt sind (`pro_workbenchsettings` um ein Feld erweitern — der
    Role-Check ist bereits konfigurierbar aufgebaut).
