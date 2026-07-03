# Konzepte — Admin Console Suite (Code Apps)

Drei Konzepte als Erweiterung der Solution Admin Console. Kein Setup-Kram — der Repo-Rahmen existiert bereits.

---

## 1. Security Role Analyzer

**Problem:** Das Maker Portal bietet keine Diff-Sicht auf Rollen, keine effektive-Rechte-Analyse pro User und keine Antwort auf "Wer kann Tabelle X löschen?".

**Use Cases (priorisiert):**
1. **Rollen-Matrix** — Rolle × Tabelle × Privileg (Create/Read/Write/Delete/Append/AppendTo/Assign/Share) mit Depth (User/BU/Parent-Child/Org), farbcodiert wie im klassischen Role-Editor.
2. **Rollen-Diff** — zwei Rollen side-by-side, nur Deltas (fehlendes Privileg / abweichende Depth), Export als Markdown/CSV.
3. **Effektive Rechte pro User** — Aggregation aus direkten Rollen + Team-Rollen, mit Herkunftspfad ("prvDeleteAccount ← Rolle 'Vertrieb Süd' ← Team 'Sales DE'").
4. **Reverse Lookup** — "Wer kann X auf Tabelle Y?" → alle User/Teams mit Pfad.
5. **Hygiene-Report** — Rollen ohne Zuweisung, User mit >N Rollen, Standardrollen-Kopien mit Drift.

**Datenmodell:** `role` (Achtung: BU-Kopien, immer auf `parentrootroleid` aggregieren), `privilege`, `roleprivileges` (Intersect, `privilegedepthmask`: 1/2/4/8), `privilegeobjecttypecodes`, `systemuserroles`, `teamroles`, `teammembership`, `systemuser`, `team`, `businessunit`. Intersects via FetchXML, nicht als Data Source. Für effektive Rechte bevorzugt die Function `RetrieveUserPrivileges` statt clientseitigem Join (Herkunftspfad dann als Ergänzung).

**Leitplanken:** Privilegien-Metadaten selten änderlich → aggressiv cachen (staleTime ~15 min), Kreuzprodukt als `Map<roleId, Map<entityOtc, DepthMask>>`. Matrix virtualisieren (>500 Entities). Bitmasken-Decoder als pure functions mit Tests. v1 strikt read-only; Rollen-Editing (AddPrivilegesRole) erst v2.

**Akzeptanz:** Matrix stichprobenartig identisch mit klassischem Role-Editor; Diff zeigt nur echte Deltas; Team-Herkunft korrekt; Matrix-Load < 3 s nach Cache-Warmup.

---

## 2. Plugin Trace Explorer

**Problem:** `plugintracelog` ist im Maker Portal unbenutzbar: keine Volltextsuche im MessageBlock, keine Correlation-Gruppierung, keine Performance-Sicht.

**Use Cases:**
1. **Trace-Stream** — Polling-Liste (10–30 s) mit Filtern: Zeitraum, TypeName, MessageName, PrimaryEntity, Mode (sync/async), nur-Exceptions.
2. **Correlation-Timeline** — alle Traces einer `correlationid` als Timeline, Einrückung nach `depth` (Plugin-Kaskade), Balkenlänge ∝ Duration. Das Killer-Feature: eine Request-Kette auf einen Blick.
3. **Detail-Panel** — MessageBlock + ExceptionDetails monospace, Suche-im-Text, Copy, Collapse.
4. **Performance-Heatmap** — Duration-Aggregat nach TypeName × MessageName (count/avg/max, p95 approximiert) über wählbaren Zeitraum; Klick → vorgefilterter Stream.
5. **Trace-Level-Steuerung** — `organization.plugintracelogsetting` (0 Off / 1 Exception / 2 All) anzeigen und umschalten, mit Confirm + Warnung (All = Log-Wachstum).

**Datenmodell:** `plugintracelog` (`typename`, `messagename`, `primaryentity`, `mode`, `depth`, `correlationid`, `performanceexecutionstarttime`, `performanceexecutionduration`, `messageblock`, `exceptiondetails`, `operationtype`, `pluginstepid`), `organization`, optional `sdkmessageprocessingstep` zur Anreicherung (Stage, Rank).

**Leitplanken:** `messageblock`/`exceptiondetails` **nie** im Stream laden — nur im Einzel-Retrieve. Volltext nur als Opt-in mit Zeitraumzwang ≤ 24 h (`contains` ist teuer). Aggregate serverseitig via FetchXML `aggregate`. Polling pausiert bei `document.hidden`. Trace-Level-Button ohne Update-Privileg auf organization disabled. UI-Hinweis: Plattform räumt Traces auf — Explorer, kein Archiv.

**Akzeptanz:** Correlation-Kaskade (Depth ≥ 2) korrekt eingerückt; 100-KB-MessageBlock ohne Freeze; PerfPage findet das absichtlich langsame Test-Plugin; Trace-Level-Switch wirkt nachweislich.

---

## 3. Async Job / Flow Monitor

**Problem:** Keine gemeinsame Betriebssicht auf Dataverse System Jobs und Flow-Runs; das bestehende Heartbeat/Watchdog-Pattern hat kein Frontend. Ziel: "Ist die Async-Verarbeitung gesund?" in < 10 Sekunden.

**Use Cases:**
1. **Health-Dashboard** — Kacheln: Failed Jobs (24 h), Waiting-Backlog + älteste wartende Op, Flow-Fehlerquote (24 h), Heartbeat-Ampeln. Jede Kachel klickt in die Detailseite mit Filter.
2. **System-Job-Explorer** — `asyncoperation` mit Facetten-Filtern; Bulk-Cancel/Retry für hängende Jobs mit Confirm und Einzel-Ergebnis-Reporting.
3. **Flow-Run-Monitor** — Flows (Dataverse `workflow`, `category eq 5`) nach Fehlerquote sortiert; Runs pro Flow via Power Automate Management Connector; Deep-Link in den Portal-Run.
4. **Watchdog-Board** — `cust_heartbeatdefinition` (erwartetes Intervall + Grace) vs. letzte `cust_heartbeat`-Rows; Ampel = überfällig.
5. **Trends** — Failed-Jobs/Tag und Fehlerrate über 7/30 Tage (serverseitige Aggregate).

**Datenmodell:** `asyncoperation` (statecode/statuscode-Maps als Konstanten: 10 Waiting, 20 InProgress, 30 Succeeded, 31 Failed, 32 Canceled …), `workflow`, `cust_heartbeatdefinition` (`cust_flowid`, `cust_expectedintervalminutes`, `cust_graceminutes`, `cust_isactive`), `cust_heartbeat` (`cust_timestamp`, `cust_status`, `cust_message`), Flow-Runs via `shared_flowmanagement`-Connector.

**Leitplanken:** `asyncoperation` ist riesig → Zeitraumfilter erzwingen (Default 24 h), nie unpaginiert. Connector-Rate-Limits: Runs nur für den selektierten Flow laden; Health-Fehlerquote aus Top-20-aktivsten Flows als gekennzeichnetes Sample. Bulk-Cancel max. 50/Batch, sequentiell mit Fortschritt. Watchdog-Logik als pure function `evaluateHeartbeat(def, lastBeat, now)` mit Tests (nie gebeatet, Grace, inaktiv).

**Akzeptanz:** Kacheln decken sich mit manueller Advanced-Find-Prüfung; Bulk-Cancel meldet nicht-cancelbare Jobs sauber; Deep-Link trifft den richtigen Run; pausierter Heartbeat-Flow wird innerhalb Intervall+Grace rot; Trends < 3 s.

**v2-Backlog:** Teams-/Mail-Alerting bei rotem Watchdog (als Flow), App-Insights-Korrelation, Auto-Retry-Policies.

---

## Empfohlene Reihenfolge

Plugin Trace Explorer (kleinstes Modell, sofortiger Eigennutzen) → Async/Flow Monitor → Security Role Analyzer (komplexestes Datenmodell).
