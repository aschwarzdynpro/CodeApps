# Sales Dashboard (GVL)

Eine Power Apps **Code App**, die das model-driven Dashboard **„Dashboard GVL"**
aus [`LegacySolution/`](LegacySolution/) inhaltlich abbildet — als moderne
React-Web-App mit dynamischen Funktionen, die das Legacy-Dashboard nicht hatte.

Gebaut auf dem offiziellen Power Apps Vite-Template (React 19 + TypeScript +
Vite + `@microsoft/power-apps`), nach denselben Konventionen wie
`apps/audit-explorer`.

## Abbildung Legacy → Code App

Das Legacy-Dashboard besteht aus sechs Chart+Grid-Zellen. Jede wird zu einer
Kachel mit identischer Datenlogik:

| Kachel | Legacy-Ansichten (SavedQueries) | Legacy-Diagramme (Visualizations) |
| --- | --- | --- |
| **Aktivitäten** | Meine Aktivitäten / Meine Termine — dieser & letzter Monat | Anzahl nach Status (Donut) · Anzahl nach Woche und Status (gestapelt) |
| **Leads** | Meine Leads im Status offen / in Bearbeitung | Anzahl Leads nach Ursprung und Status (gestapelt) |
| **Verkaufschancen** | Offen, ich GVL, Entscheidung in ≤ 2 Monaten | Summe Potential nach Prognosekategorie (Donut) |
| **Projekte** | 6 Ansichten: offen · Nachfass diesen Monat · Entscheidung diesen Monat · gewonnen · offene Aufgaben für mich · verloren/zurückgestellt | 5 Diagramme: Potential nach Prognose (Säulen + Funnel) · Anzahl nach Statusgrund · Umsatz/Potential nach Projektbezeichnung |
| **Angebote** | Neue / beauftragte / abgesagte Angebote diesen Monat — ich GVL | Angebotswert nach Angebotsart |
| **Aufträge** | Meine Aufträge / Projektaufträge / alle — diesen Monat | Auftragswert nach Auftragsart · nach GVL |

Die Grid-Spalten entsprechen den `layoutxml`-Zellen der Legacy-Views,
„ich" entspricht dem `eq-userid`-Filter der FetchXML.

## Dynamische Funktionen (neu gegenüber Legacy)

- **KPI-Leiste** — Kernzahlen aller sechs Entitäten auf einen Blick; Angebots-
  und Auftragswerte mit Trend zum Vormonat
- **Cross-Filter** — Klick auf ein Diagrammsegment filtert die Liste der
  Kachel; erneuter Klick oder ✕ hebt den Filter auf
- **Ansichts- & Diagrammwechsler** pro Kachel (wie ViewPicker/ChartPicker,
  aber ohne Seiten-Reload)
- **Schnellsuche** in jeder Kachel (Legacy: nur Angebote/Aufträge)
- **Sortierbare Spalten**, responsives Raster (3 → 1 Spalten), Dark Mode
- **Demo-Perspektive** — im Demo-Modus lässt sich das „ich" der
  „Meine …"-Ansichten auf jeden GVL umschalten

## Projektstruktur

```
src/
├── main.tsx                  # mountet die App im <PowerProvider>
├── PowerProvider.tsx         # Power-Apps-Host-Erkennung (Live vs. Demo)
├── App.tsx                   # Shell: Header, KPI-Leiste, 6 Kacheln
├── types/sales.ts            # Domänenmodell der 6 Entitäten
├── dashboard/
│   ├── types.ts              # Kachel-Framework (ViewDef/ChartDef/ColumnDef)
│   └── tiles.ts              # Die 6 Kacheln — Übersetzung der Legacy-Solution
├── services/
│   ├── salesService.ts       # Service-Interface + Singleton (Go-live-Seam)
│   ├── mockSalesService.ts   # Demo-Implementierung
│   └── mockData.ts           # deterministische Demo-Daten (Seed-PRNG)
├── hooks/useSalesData.ts     # Laden + Refresh
├── components/               # Header, KpiBar, DashboardTile, DataGrid, Charts
└── utils/                    # Formatierung (de-DE/EUR), Chart-Aggregation
```

## Lokal entwickeln

```bash
npm install
npm run dev        # http://localhost:5173 — läuft standalone mit Demo-Daten
npm run build      # tsc -b && vite build
npm run lint
```

Außerhalb eines Power-Apps-Hosts zeigt die App das Badge **Demo-Daten** und
arbeitet mit dem deterministischen Demo-Datensatz. Die Datumsfenster der
Ansichten („dieser Monat" usw.) werden relativ zu „heute" erzeugt und sind
daher immer gefüllt.

## Veröffentlichen & Daten anbinden (Go-live)

1. App initialisieren (erzeugt `power.config.json`):
   ```bash
   power-apps init --display-name "Sales Dashboard GVL" --environment-id <ENV-ID>
   ```
2. Dataverse-Datenquellen generieren:
   ```bash
   pac code add-data-source -a dataverse -t activitypointer
   pac code add-data-source -a dataverse -t lead
   pac code add-data-source -a dataverse -t opportunity
   pac code add-data-source -a dataverse -t wal_project
   pac code add-data-source -a dataverse -t quote
   pac code add-data-source -a dataverse -t salesorder
   ```
3. `dataverseSalesService` implementieren, der die generierten Modelle auf
   `types/sales.ts` mappt (Optionset-Codes → deutsche Labels an einer Stelle),
   auf `powerModeReady` wartet und außerhalb des Hosts auf Mock zurückfällt —
   Vorlage: `apps/audit-explorer/src/services/dataverseAuditService.ts`.
   Danach in `services/salesService.ts` den Singleton umhängen.
4. Veröffentlichen:
   ```bash
   npm run build
   power-apps push
   ```

> Hinweis: `LegacySolution/` enthält den entpackten Export der ursprünglichen
> Dynamics-365-Lösung (Dashboard-FormXml, SavedQueries, Visualizations) und
> dient nur als fachliche Referenz — sie wird nicht gebaut oder deployt.
