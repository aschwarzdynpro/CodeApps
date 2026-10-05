# apps/

Jede Code App lebt in einem eigenen Unterordner (`apps/<app-name>/`) als
eigenständiges Vite + React + TypeScript Projekt mit eigener `package.json`
und `power.config.json`.

Eine neue App anlegen → siehe [`../docs/SETUP.md`](../docs/SETUP.md).

## Apps

| App | Beschreibung |
| --- | --- |
| [`account-360/`](account-360/) | **Generative Page** in der Accounts App (ASC SFA CS Playground) — Account-Liste mit Suche und Aufgaben-Zählern, rechts Stammdaten, KPIs und Tabs für Aufgaben (anlegen, abschließen), Kontakte, Custom Addresses (anlegen) und Elastic Demo. Zusätzlich im Account-Formular „Demo Form" eingebettet (Formular-Modus über `pageInput.recordId`). |
| [`approval-cockpit/`](approval-cockpit/) | Zentrales Inbox-Dashboard für Genehmigungen aus mehreren Systemen mit Filtern und Bulk-Approve/Reject. |
| [`audit-explorer/`](audit-explorer/) | Dashboard für die Dataverse Audit History mit Drill-Down von Aggregat-Charts bis zum Feld-Level-Diff. |
| [`my-day/`](my-day/) | **Generative Page** in Sales Hub (Waldmann D365 DEV) — meine Termine, Aufgaben und Projektaufgaben nach Fälligkeit plus meine offenen Leads, Projekte, Projektanfragen und Workorders mit Stillstands-Badge; UI in de/en/fr. |
| [`schedule-board-manager/`](schedule-board-manager/) | URS-Schedule-Boards (`msdyn_scheduleboardsetting`) kopieren (inkl. Konfigurations-Lookups), im Formular bearbeiten, Darstellung mit Live-Vorschau gestalten (Buchungskachel, Ressourcenzelle, Tooltips, Farben, Buchungswarnung), vergleichen, Einstellungen auf mehrere Boards übertragen, Besitzer und Datensatz-Freigaben verwalten, zwischen Umgebungen exportieren/importieren (mit ID-Zuordnung) — mit Diff-Vorschau und Verlauf. Ziel: Schulz UAT. |
| [`series-planner/`](series-planner/) | **Serienplanung** für Projekteinsätze — wöchentlich, alle 2 Wochen, monatlich, quartalsweise; je Termin ein Arbeitsauftrag am Projekt plus Buchung. Feiertage, Abwesenheiten und Konflikte schon in der Planung, Ersatztag-Vorschläge, Änderungen wie in Outlook (einzelner Termin, dieser und alle folgenden, ganze Serie) mit Vorschau. Ziel: Schulz UAT. |
| [`work-hours-manager/`](work-hours-manager/) | **Arbeitszeiten & Kalender** — effektive Arbeitszeit jeder Ressource als Woche/Monat mit Herkunft je Stunde (Wiederholung, Einzeltag, Pause, Abwesenheit, Schließung), Regel-Inspektor über den Kalenderbaum, Diagnose (ohne Arbeitszeit, auslaufende Regeln, Zeitzonen, inaktive mit Buchungen, ohne Kalender); Arbeitszeiten und Abwesenheiten mit Vorschau bearbeiten, Vorlagen und Betriebsferien als Massenlauf mit Snapshot und Rückgängig, Feiertage aus Regelwerk (DE/AT/CH) gegen die Geschäftsschließungen abgleichen. Schreibt nur über `msdyn_SaveCalendar`/`msdyn_DeleteCalendar`/`msdyn_BusinessClosureSave`. Ziel: Schulz UAT (noch nicht deployt). |
| [`translation-studio/`](translation-studio/) | **Translation Studio** — fehlende Übersetzungen von Dataverse-Beschriftungen (Tabellen, Spalten, Auswahlwerte, Formulare, Ansichten) je Solution und Sprache sehen, inline oder per CSV füllen, mit Glossar-Vorschlägen und Konsistenz-Report; Import über den nativen Übersetzungs-Export/-Import mit Diff-Vorschau, Importjob-Fortschritt und Publish. Ziel: Waldmann D365 DEV (noch nicht deployt). |
| [`sales-dashboard/`](sales-dashboard/) | Code-App-Fassung des model-driven Dashboards „Dashboard GVL“ aus `LegacySolution/` — sechs Kacheln plus KPI-Leiste. |
| [`solution-forge/`](solution-forge/) | **Solution Administration Console** — Working Solutions für Feature-/Bug-Entwicklung: anlegen (inkl. ADO-ID als Unique Name), Komponenten einsehen, in Deployment Solutions mergen. *(Ordner-Rename auf `solution-administration-console/` steht noch aus.)* |
