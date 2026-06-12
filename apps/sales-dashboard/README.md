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
- **Demo-Daten-Schalter** — im Header lässt sich jederzeit von Live- auf
  Demo-Daten umschalten (zum Testen); das Badge zeigt die aktive Quelle
  (Live / Demo-Daten / Live + Demo bei Teilausfällen)

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
│   ├── salesService.ts            # Service-Interface + Singleton
│   ├── dataverseSalesService.ts   # Live-Implementierung (Dataverse, FormattedValues)
│   ├── mockSalesService.ts        # Demo-Implementierung
│   └── mockData.ts                # deterministische Demo-Daten (Seed-PRNG)
├── generated/                # typed Dataverse-Clients (pac code add-data-source)
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

## Live-Datenanbindung (Stand: verdrahtet)

Die App ist gegen **Waldmann D365 DEV** initialisiert und live verdrahtet
(`dataverseSalesService`). Acht Dataverse-Datasources sind registriert:
die sechs Dashboard-Tabellen plus `systemuser` (Auflösung Entra-Object-ID →
Dataverse-Benutzer für die „Meine …"-Filter) und `account` (clientseitiger
Join für Kundennummer + Kunden-GVL/KAM der Angebote/Aufträge — die
Code-App-API unterstützt kein `$expand`).

Designentscheidungen:

- **Anzeige-Labels** (Optionsets, Lookups) kommen aus den
  FormattedValue-Annotations der Web API — keine handgepflegten Code→Label-Maps.
- **Filterlogik** hängt nie an Label-Schreibweisen, sondern an env-stabilen
  Roh-Codes (`statecode`, `statuscode`-Kategorien, `activitytypecode`).
- **Fallback**: außerhalb eines Power-Apps-Hosts oder bei Fehlern liefert der
  Service Demo-Daten; Teilausfälle einzelner Tabellen → Badge „Live + Demo".

Bekannte Annäherungen gegenüber der Legacy-Lösung (Grenzen des Daten-Clients):

- „Meine Aktivitäten" filtert auf Besitzer statt activityparty-Beteiligung
- Projekt-„GVL im Projektteam" nutzt `wal_areasalesmanager_id` statt der
  connection-Tabelle
- `statusChangedOn` ≈ `modifiedon`; „offene Projektaufgaben für mich" bleibt
  live leer, bis eine `task`-Datasource ergänzt ist

> **Generator-Hinweis:** `pac code add-data-source` (pac 2.8.1) registriert
> `lead` und `account` korrekt, emittiert für diese beiden Tabellen aber
> stillschweigend keine TypeScript-Dateien. `LeadsModel/-Service` und
> `AccountsModel/-Service` unter `src/generated/` sind deshalb handgeschrieben
> (aus den Schema-JSONs unter `.power/schemas/dataverse/`) und entsprechend
> kommentiert.

> **Nach frischem Clone:** Der Ordner `.power/` ist bewusst nicht versioniert
> (Repo-Konvention, wie audit-explorer). Vor dem ersten Build einmal die
> Datasources neu registrieren (`pac code add-data-source -a dataverse -t
> <tabelle>` für die acht Tabellen) — das erzeugt `.power/` neu; die
> versionierten Dateien unter `src/generated/` bleiben unverändert.

Veröffentlichen:

```bash
npm run build
pac code push
```

> Hinweis: `LegacySolution/` enthält den entpackten Export der ursprünglichen
> Dynamics-365-Lösung (Dashboard-FormXml, SavedQueries, Visualizations) und
> dient nur als fachliche Referenz — sie wird nicht gebaut oder deployt.
