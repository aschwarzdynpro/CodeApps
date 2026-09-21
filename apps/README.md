# apps/

Jede Code App lebt in einem eigenen Unterordner (`apps/<app-name>/`) als
eigenständiges Vite + React + TypeScript Projekt mit eigener `package.json`
und `power.config.json`.

Eine neue App anlegen → siehe [`../docs/SETUP.md`](../docs/SETUP.md).

## Apps

| App | Beschreibung |
| --- | --- |
| [`approval-cockpit/`](approval-cockpit/) | Zentrales Inbox-Dashboard für Genehmigungen aus mehreren Systemen mit Filtern und Bulk-Approve/Reject. |
| [`audit-explorer/`](audit-explorer/) | Dashboard für die Dataverse Audit History mit Drill-Down von Aggregat-Charts bis zum Feld-Level-Diff. |
| [`mein-tag/`](mein-tag/) | **Generative Page** in Sales Hub — meine Aktivitäten nach Fälligkeit (Heute / Überfällig / Demnächst / Ohne Termin) plus Opportunities und Leads, die seit N Tagen still liegen. |
| [`sales-dashboard/`](sales-dashboard/) | Code-App-Fassung des model-driven Dashboards „Dashboard GVL“ aus `LegacySolution/` — sechs Kacheln plus KPI-Leiste. |
| [`solution-forge/`](solution-forge/) | **Solution Administration Console** — Working Solutions für Feature-/Bug-Entwicklung: anlegen (inkl. ADO-ID als Unique Name), Komponenten einsehen, in Deployment Solutions mergen. *(Ordner-Rename auf `solution-administration-console/` steht noch aus.)* |
