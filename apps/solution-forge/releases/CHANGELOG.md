# Release Notes — Solution Administration Console

Managed-Solution-Releases von `DynamicsProSolutionAdminConsole` (Export aus dem
Playground-Authoring-Env). Eine Sektion je Release, neueste oben. Import + Nach-
schritte: siehe [`README.md`](README.md).

---

## 1.0.0.16 — 2026-08-04

**Security-Ausbau: Role Comparer, eingefrorene Baselines und
Security-Konzept-Dokument. Neue Tabelle `pro_securitysnapshot` (9. Tabelle).**

- **Role Comparer** (Validate, gated, lazy): dieselbe Sicherheitsrolle über alle
  konfigurierten Umgebungen als Matrix — je Zelle Privilegienzahl,
  managed/unmanaged und wie viele Privilegien gegenüber der Baseline-Umgebung
  abweichen. **Match über den Rollen-NAMEN**, nicht die GUID (die überlebt nur
  sauberen Transport); Name gleich + ID verschieden ⇒ Badge „rebuilt".
  Scope-Vorauswahl: standardmäßig nur Custom-Rollen, optional auf die
  Rollen-Komponenten einer Release-Solution eingeschränkt. Read-only —
  eine driftende Rolle wird transportiert, nicht im Ziel repariert.
- **Baselines einfrieren** (`pro_securitysnapshot`): der Ist-Zustand als
  benannter Snapshot; „Compare against" prüft danach jede Umgebung gegen **ihr
  eigenes eingefrorenes Ich** („was hat sich seit dem Audit geändert?") mit den
  Verdikten changed / new / gone since freeze.
- **Security-Konzept-Dokument** (Sub-Tab „Document"): Baseline als lesbares
  Dokument — Umgebungen, je Rolle die Privilegien-Matrix, Abweichungen. Zweiter
  Baseline wählbar ⇒ Kapitel „Changes since …" mit jedem verschobenen Privileg.
  Umgebungen einzeln ab-/anwählbar; Markdown- und Text-Export.
- **Role Analyzer wieder in der App** (Operate) — lädt aber **erst auf Klick**
  („Analyze"), damit das Öffnen nicht die falsche Umgebung zieht. Damit sind
  auch Core Role Extractor, Team-&-BU-Map und Field-Level Security wieder
  erreichbar.
- **Solution Import History**: bei fehlenden Abhängigkeiten zeigt die Tabelle
  jetzt auch den **Parent der fehlenden Komponente** (welche Tabelle eine View
  oder ein Formular gehört) — vorher stand der Parent nur auf der
  abhängigen Seite.
- **Fix:** „Mark completed" schließt den Working-Solution-Record jetzt wirklich
  (`statecode`), vorher blieb der Eintrag trotz Status-Label unter „Open"
  stehen. Neue **Reopen**-Aktion (↺) macht das rückgängig.
- **UI:** Sidebar-Gruppen sind aufklappbar (21 Menüpunkte passten nicht mehr auf
  einen Notebook-Bildschirm), **Data Transfer** ist von Manage nach **Operate**
  gewandert, Erklärtexte liegen hinter einem ⓘ neben dem Seitentitel.
- **Bundle:** Role Analyzer und Role Comparer werden **bei Bedarf nachgeladen**
  (`React.lazy`) — im Player verifiziert, dass zur Laufzeit geholte Chunks
  ausgeliefert werden.

Datenmodell-Änderung: `installer/provision-model.ps1` legt zusätzlich
`pro_securitysnapshot` an (idempotent, bestehende Tabellen werden übersprungen).

## 1.0.0.14 — 2026-07-25

**Fix — Transfer-Executor-Flows sind beim Kunden aktivierbar und im Designer lesbar.**

In 1.0.0.13 hatten die drei Executor-Flows (Execute Package / Execute Cell /
Scheduler) die **Host-URL der Authoring-Umgebung fest im `organization`-Parameter
eingebacken**. Beim Import in eine ANDERE Umgebung zeigte der Wert auf eine
fremde, für die dortige Connection unerreichbare Org → Aktivierung (Maker
„Turn on" wie auch Managed-Import) scheiterte an
`GetMetadataForGetEntityWithOrganization … 401 … "The response is not in a JSON
format."`, und der Designer rendere die Flows nur teilweise (~14 von 35 Actions).

- **Host-Operationen nutzen jetzt `organization: "current"`** (löst gegen die
  eigene Umgebung der gebundenen Connection auf) → portabel über Umgebungen,
  Designer rendert vollständig, Turn-on validiert normal, Run-Only konfigurierbar.
- Die echten cross-env-Operationen des Child-Flows (Quelle lesen, Ziel schreiben)
  behalten die dynamische Ziel-URL als Runtime-Ausdruck — ein *non-foldable* Wert,
  der den Design-Zeit-Schema-Check überspringt.
- Verifiziert: Aktivierung + Dry-Run + echter Update-Write im Playground;
  Managed-Import + Aktivierung in einer Fremd-Umgebung bestätigt.
- Doku/Skripte nachgezogen (`activate-flows.ps1`, Release-README): der Maker-
  „Turn on"-Button ist nicht mehr als gesperrt beschrieben.

Sonst funktional identisch zu 1.0.0.13.

---

## 1.0.0.13 — 2026-07-24

Erster dokumentierter Release — **Gesamtstand, stark verkürzt.** Power Apps
**Code App** (React 19) zur Verwaltung von Dataverse-Solutions über den ALM-Zyklus,
mit dem `pro_`-Datenmodell (8 Tabellen), 3 Transfer-Executor-Flows und 1 Security Role.

**Neu in diesem Release**
- ⭐ **Self-Provisioning Wizard** (Reference › „Environment Setup"): geführtes
  Erst-Setup, blendet beim Start ohne Konfiguration hart blockierend vor und legt
  die Steuer-Datensätze an (`pro_workbenchsettings` + je Umgebung
  `pro_environmentconfig`). Bietet erreichbare Umgebungen zur Auswahl, liest
  Organization-/Environment-ID automatisch, schlägt Publisher/Rolle vor;
  freie Environment-Keys (DEV/TEST/UAT/QS/INT/PAR/PROD), idempotenter Upsert.

**Funktionsumfang (Überblick)**
- **Manage:** Workbench (Working Solutions anlegen/tracken/mergen), Merge (Plan,
  Konfliktmarkierung, Historie), Merge Rules, Release-Notes-Generator, Release
  Timeline, Configuration Data Transfer Hub (deklarative Transfer-Pakete mit
  Executor-Flows, Dry-Run, Zeitplan).
- **Validate:** Deployment Readiness (Dependency Check), Analyze-Dashboard (Risk
  Score), Env Config Cockpit (EnvVars/Connection References cross-env), Audit-
  Config-Analyzer, Dual-Write-Table-Maps, Import History, User Settings, Process
  Comparer, Plugin Comparer.
- **Operate:** Plugin Trace Explorer (Job Monitor / Role Analyzer als Preview).
- **Reference:** Environment Links, Environment Setup (Wizard).

**Technik:** Cross-Env-Reads über den Dataverse-Konnektor (Service Principal),
Writes nativ als angemeldeter User; Laufzeit-Konfiguration data-driven aus
`pro_workbenchsettings` / `pro_environmentconfig`.

**Import-Nachschritte:** Connection Reference der Executor-Flows binden + die 3
Flows aktivieren, `pro_*`-Rechte/Security-Role zuweisen, Code App ggf. zur
App-Liste hinzufügen (Details in [`README.md`](README.md)).
