# Handover: Power Apps Code Apps – Audit Explorer

Ich arbeite an einem Monorepo für Power Apps **Code Apps** und möchte die
**Audit Explorer** App fertig an eine echte Dataverse-Umgebung anbinden.

## Repo & Branch
- Repo: `aschwarzdynpro/CodeApps`
- Aktiver Branch: `claude/code-apps-repo-setup-WDnJQ` (bitte hier weiterarbeiten,
  committen, pushen – keinen PR ohne Aufforderung)
- Struktur: `apps/<app-name>/`, gemeinsame Doku in `docs/`. Vorhandene Apps:
  `approval-cockpit/` und `audit-explorer/` (Fokus).

## Tech-Stack (pro App)
React 19 + TypeScript + Vite + `@microsoft/power-apps`, gescaffoldet aus dem
offiziellen Template `github:microsoft/PowerAppsCodeApps/templates/vite`.
Befehle in `apps/audit-explorer/`: `npm install`, `npm run dev`,
`npm run build` (= `tsc -b && vite build`), `npm run lint`.
ESLint (React 19, react-hooks) muss grün bleiben – setState nur in
Event-Handlern, nicht synchron in Effects.

## Was die Audit Explorer App kann
Dashboard über die Dataverse Audit History mit:
- Overview: KPIs, gestapelte Timeline pro Tag, Charts „Events by table" /
  „Most active users", Recent activity
- **Audited-tables Slicer** (links): Liste aller Tabellen mit aktiviertem
  Auditing; Klick filtert alle Tiles/Charts in-place (Filter-Banner + Clear)
- **Drill-down**: Overview → Balken-Klick (Tabelle/User) → Event-Liste →
  Event-Klick → Feld-Level-Diff (old → new)
- Globale Filter (Zeitraum 7/30/alle, Operation per KPI-Klick, Suche)

## Architektur (wichtig)
Die UI hängt nur am Interface `AuditService` in
`apps/audit-explorer/src/services/auditService.ts`:
- `list()` – Events für Aggregate/Liste (Dataverse `audit`-Tabelle)
- `getChanges(auditId)` – lazy Feld-Diff (Dataverse `RetrieveAuditDetails`)
- `listAuditedTables()` – Tabellen mit Auditing (Metadaten `EntityDefinitions`,
  `IsAuditEnabled`)

Implementierungen:
- `dataverseAuditService.ts` – echte Impl, **fällt automatisch auf Mock zurück**,
  solange `src/generated/services` fehlt (dynamischer Import + try/catch).
- `mockAuditService.ts` + `mockData.ts` – seeded Sample-Daten (Fallback).

`list()` ist bereits gemappt (operation-Codes, formatted values für
Tabelle/User/Record). Drei Stellen sind als `// TODO` markiert und müssen mit
echten Aufrufen verdrahtet werden.

## Meine Aufgabe an dich
Binde die App an meine Dataverse-Umgebung an. Ich habe lokal: Node LTS, Git,
PAC CLI ≥ 1.46, `@microsoft/power-apps` global. Meine Umgebung hat Code Apps
aktiviert und Auditing eingeschaltet.

Schritte:
1. In `apps/audit-explorer/`:
   - `pac auth create --environment <ENV-ID>`
   - `power-apps init --display-name "Audit Explorer" --environment-id <ENV-ID>`
   - `pac code add-data-source -a dataverse -t audit`
     (erzeugt `src/generated/services/AuditService.ts` + Model)
   - Für den Diff: `power-apps find-dataverse-api` → passende
     `RetrieveAuditDetails`-Funktion via `add-dataverse-api` hinzufügen
2. In `dataverseAuditService.ts` die drei TODO-Stellen verdrahten:
   - `loadAuditTable()`: dynamischen Import durch den generierten **statischen**
     Import ersetzen (`import { AuditService } from '../generated/services/AuditService'`),
     `list()`-Mapping an die generierten Property-Namen anpassen
   - `getChanges()`: `RetrieveAuditDetails`-Response (OldValue/NewValue je
     Attribut-Logical-Name) auf `AttributeChange[]` mappen; Attribut-Display-
     Namen ggf. aus Metadaten auflösen
   - `listAuditedTables()`: `EntityDefinitions?$select=LogicalName,DisplayName
     &$filter=IsAuditEnabled/Value eq true` abfragen und auf `AuditedTable[]`
     mappen
3. Lokal testen: `npm run dev` → „Local Play"-URL im selben Browser-Profil wie
   der Tenant öffnen (Badge oben rechts sollte auf „Power Platform" wechseln).
   Echte Audit-Daten sollten in KPIs/Charts/Slicer und im Diff erscheinen.
4. `npm run build` und `npm run lint` müssen grün bleiben. Dann
   `power-apps push` zum Veröffentlichen.

## Konventionen
- UI/Hooks nicht ändern – nur die Service-Impl gegen echte Daten austauschen.
- Englische Bezeichner/Kommentare im Code; deutsche Erklärungen im Chat sind ok.
- `node_modules`, `dist`, `src/generated` nicht committen, falls in `.gitignore`
  – prüfe das `.gitignore` der App.
- Beginne mit: lies `apps/audit-explorer/README.md` (enthält die exakten Schritte
  und die Doku der Datenschicht), dann `src/services/*` und `src/App.tsx`.

Bitte zuerst die generierten Typen nach `add-data-source` ansehen und dann das
`list()`-Mapping typsicher festziehen, bevor du `getChanges`/`listAuditedTables`
verdrahtest.
