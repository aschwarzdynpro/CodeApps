# Serienplanung

Code App für **wiederkehrende Projekteinsätze**: wöchentlich, alle 2 Wochen,
monatlich, quartalsweise oder frei („alle n Wochen/Monate“). Jeder Termin wird
ein **Field-Service-Arbeitsauftrag am Projekt** plus **eine Buchung**. Über
den Arbeitsauftrag entstehen hinten raus die Zeiteinträge, die über die
Integration Field Service ↔ Project Operations ins Projekt laufen. Mit einer
reinen Projektbuchung passiert das nicht.

Anforderungen aus der Abstimmung mit dem Kunden (Schulz):

| Anforderung | Umsetzung |
| --- | --- |
| Projektbuchung mit Arbeitsauftrag | Je Termin `msdyn_workorder` (Projekt, optional Projektaufgabe, Dienstkonto, Typ) + `bookableresourcebooking` |
| Jede Woche dieselbe oder eine andere Ressource | Standard-Ressource je Abschnitt, je Termin überschreibbar |
| Festes Zeitfenster | Uhrzeit von–bis je Abschnitt, je Termin verschiebbar |
| Wöchentlich, monatlich, quartalsweise, alle 2 Wochen | Wochen- und Monatsregeln mit Intervall; Monat: Tag X oder „erster … letzter Wochentag“ |
| Feiertage/Abwesenheiten: Termin fällt aus, schon in der Planung sichtbar, ggf. anderer Tag | Vorschau prüft Feiertage (Geschäftsschließungen), Arbeitszeit/Abwesenheit und Konflikte; betroffene Termine fallen automatisch aus und lassen sich auf einen vorgeschlagenen freien Tag legen |
| Änderungen am einzelnen Termin und an der Serie, wie in Outlook | „Nur diesen Termin“, „Diesen und alle folgenden“, „Ganze Serie“ — jeweils mit Vorschau, was angelegt, geändert und abgesagt wird |

## Funktionen

| Bereich | Inhalt |
| --- | --- |
| **Serien** | Liste mit Suche (Name, Projekt, Ressource, Rhythmus). Detail mit Kalenderübersicht (Monate, Feiertage markiert), Terminliste mit Arbeitsauftrag (Link ins Formular), Status, Hinweisen und Aktionen je Termin |
| **Neue Serie** | Auftrag (Projekt → Dienstkonto aus dem Projektkunden, Projektaufgabe, Arbeitsauftragstyp, Vorfalltyp, Preisliste, Buchungsstatus, Anweisungen), Rhythmus, Zeitfenster, Beginn, Ende (Datum oder Anzahl), Ressource. Live-Vorschau mit Kalender und Prüfung jedes Termins; Termine an Feiertagen und in Abwesenheiten fallen automatisch aus, „…“ verschiebt sie (Vorschläge: nächste freie Tage), plant sie trotzdem ein, lässt sie aus oder vergibt eine andere Ressource |
| **Einzeltermin** | Verschieben (mit Vorschlägen), andere Ressource, absagen (mit Grund), wiederherstellen, jetzt anlegen/buchen. Auf dem Schedule Board geänderte Buchungen erscheinen als „abweichend“: an die Serie angleichen oder die Änderung in die Serie übernehmen |
| **Serie ändern** | „Ganze Serie“ und „Diesen und alle folgenden“ mit demselben Formular. Optionen: einzeln geänderte Termine beibehalten, auf dem Board geänderte Buchungen angleichen. Vorschau mit Zählern (neu, ändern, absagen, unverändert, abweichend) und Liste jeder Schreibaktion |
| **Abgleichen** | Bringt Arbeitsaufträge und Muster zusammen: fehlende Termine anlegen, Arbeitsaufträge ohne Buchung buchen, Termine außerhalb des Musters absagen. Holt auch nach, was bei einem Lauf fehlgeschlagen ist |
| **Serie beenden** | Letzter Termin am oder vor einem Datum; spätere werden abgesagt |
| **Einrichtung** | Prüft Org-URL, Tabelle, Spalten am Arbeitsauftrag, Projektfeld der Integration, Buchungsstatus und Feiertage |

### Fachregeln

- **Muster statt Kopien.** Der Serienplan speichert Regel, Zeitfenster,
  Ressource und Ende als JSON (`pro_definition_txt`). Arbeitsaufträge tragen
  den Serienplan (`pro_seriesplan_ref`) und das **ursprüngliche Musterdatum**
  (`pro_occurrence_dat`) als Schlüssel — wie Outlooks Serienmaster und
  RecurrenceId. Ein verschobener Termin behält seinen Schlüssel.
- **Abschnitte.** „Diesen und alle folgenden“ legt einen neuen Abschnitt ab
  diesem Datum an (eigene Regel, Uhrzeit, Ressource); frühere bleiben. „Ganze
  Serie“ ersetzt alle Abschnitte. Das Ende (Datum oder Anzahl) gilt für die
  ganze Serie; bei „Anzahl“ zählen ausgefallene Termine mit, wie in Outlook.
- **Wochenrhythmus** zählt ab der ISO-Woche des Beginns („alle 2 Wochen“
  springt von dort aus), **Monatsrhythmus** ab dem Startmonat. Tag 31 in
  kürzeren Monaten = letzter Tag des Monats. Quartalsweise = alle 3 Monate.
- **Ausnahmen** liegen im Muster: `overrides` (anderer Tag, andere Uhrzeit,
  andere Ressource) und `skips` (fällt aus, mit Grund).
- **Nie in die Vergangenheit.** Begonnene, laufende, erledigte und vergangene
  Termine ändert die App nie. Neue Termine in der Vergangenheit legt sie nicht an.
- **Handänderungen bleiben.** Weicht eine Buchung von dem ab, was die Serie
  vor der Änderung geplant hatte, wurde sie von Hand geändert (Schedule
  Board, Arbeitsauftrag). Serienänderungen lassen sie in Ruhe, außer
  „angleichen“ ist gewählt.
- **Nichts wird gelöscht.** Absagen setzt die Buchung auf einen Buchungsstatus
  mit `status = 3` (Abgebrochen) und den Arbeitsauftrag auf „Storniert“
  (`msdyn_systemstatus` 690970005). Ein so abgesagter Termin wird nicht neu
  angelegt, außer über „Wiederherstellen“. Dann entsteht ein neuer Arbeitsauftrag.
- **Verfügbarkeit.** Feiertage = Geschäftsschließungen der Organisation
  (Kalender `organization.businessclosurecalendarid`, mit Namen).
  Abwesenheiten und arbeitsfreie Zeit = keine Arbeitszeit im Kalender der
  Ressource (`msdyn_LoadCalendars`). Beides blockiert: Der Termin fällt in der
  Planung automatisch aus. Überschneidungen mit anderen Buchungen sind nur
  ein Hinweis, Doppelbuchungen sind erlaubt. Eigene Buchungen der Serie
  zählen nicht als Konflikt.
- **Ersatztag.** Vorschläge sind die nächsten Tage (±1, ±2 … bis eine Woche,
  nächste zuerst) mit demselben freien Zeitfenster, nie vor heute.
- **Reihenfolge beim Speichern.** Erst wird der Serienplan gespeichert, dann
  werden die Termine einzeln geschrieben. Ein Fehler stoppt die anderen nicht;
  „Abgleichen“ holt Fehlendes nach. Konfliktprüfung über `versionnumber`.

## Datenmodell

| Tabelle / Spalte | Inhalt |
| --- | --- |
| `pro_seriesplan` (Serienplan, benutzereigen) | `pro_name`, `pro_definition_txt` (Muster-JSON), `pro_instructions_txt` (Anweisungen für die Arbeitsaufträge), `pro_summary_str` (Rhythmus als Text, für Ansichten), `pro_start_dat`/`pro_end_dat` (erster/letzter Termin, Nur-Datum) |
| Lookups am Serienplan | `pro_project_ref` → `msdyn_project`, `pro_projecttask_ref` → `msdyn_projecttask`, `pro_serviceaccount_ref` → `account`, `pro_workordertype_ref` → `msdyn_workordertype`, `pro_incidenttype_ref` → `msdyn_incidenttype`, `pro_pricelist_ref` → `pricelevel`, `pro_bookingstatus_ref` → `bookingstatus`, `pro_resource_ref` → `bookableresource` (Standard-Ressource des ersten Abschnitts) |
| Am Arbeitsauftrag | `pro_seriesplan_ref` → `pro_seriesplan`, `pro_occurrence_dat` (Musterdatum, Nur-Datum) |
| Je Termin geschrieben | Arbeitsauftrag mit Projekt (Lookup der Integration, aus den Metadaten ermittelt), optional Projektaufgabe, Dienstkonto, Typ, Vorfalltyp, Preisliste, Anweisungen, Zusammenfassung, Zeitfenster (`msdyn_timefrompromised`/`…topromised`). Die von Field Service erzeugte Ressourcenanforderung bekommt Dauer und Zeitraum des Termins. Dazu eine Buchung (Ressource, Start/Ende, Dauer, Buchungsstatus, Arbeitsauftrag, Anforderung) |

Musterformat (`version: 1`):

```json
{
  "version": 1,
  "timeZone": "Europe/Berlin",
  "end": { "kind": "count", "count": 14 },
  "segments": [
    { "from": "2026-10-12", "rule": { "kind": "weekly", "interval": 2, "weekdays": [1] },
      "startTime": "08:00", "durationMinutes": 240, "resourceId": "<bookableresourceid>" },
    { "from": "2026-11-23", "rule": { "kind": "weekly", "interval": 2, "weekdays": [1] },
      "startTime": "10:00", "durationMinutes": 240, "resourceId": "<bookableresourceid>" }
  ],
  "overrides": { "2026-10-12": { "date": "2026-10-07" }, "2026-10-26": { "resourceId": "<id>" } },
  "skips": { "2027-03-29": { "reason": "Feiertag: Ostermontag" } }
}
```

Monatsregel: `{ "kind": "monthly", "interval": 3, "monthly": { "mode": "weekday", "nth": 1, "weekday": 1 } }`
= quartalsweise am ersten Montag; `{ "mode": "day", "day": 15 }` = am 15.

## Aufbau

Oberfläche mit **Fluent UI v9**, dieselben Konventionen wie
`schedule-board-manager` (`components/ui.tsx`, `Modal.tsx`).

```
src/
├── PowerProvider.tsx         # Host-Erkennung (Power Apps vs. lokal → Mock)
├── config.ts                 # VITE_ORG_URL (Connector, Formular-Links)
├── types/series.ts           # Domänenmodell: Muster, Serien, Termine, Verfügbarkeit
├── utils/
│   ├── dates.ts              # Datums-/Zeitrechnung, Zeitzonen über Intl (Sommerzeit-fest)
│   ├── recurrence.ts         # Regeln → Termine (Abschnitte, Ende, Ausnahmen), Beschreibung
│   ├── definition.ts         # Muster lesen/prüfen; Outlook-Änderungen (ganze Serie, ab Termin, einzeln)
│   ├── planner.ts            # Abgleich Muster ↔ Arbeitsaufträge → anlegen/ändern/absagen/behalten
│   └── availability.ts       # Feiertage, Abwesenheiten, Konflikte, Ersatztage
├── services/
│   ├── seriesService.ts      # Interface + Auswahl Dataverse/Mock
│   ├── dataverseSeriesService.ts
│   ├── dataverseMetadata.ts  # Navigationseigenschaften aus EntityDefinitions (Connector)
│   ├── dataverseCalendar.ts  # msdyn_LoadCalendars, Geschäftsschließungen (Connector)
│   ├── applyPlan.ts          # Plan ausführen, Ergebnis je Termin
│   ├── mockSeriesService.ts
│   └── mockData.ts           # fiktive Projekte/Ressourcen, Feiertage für jedes Jahr, Abwesenheiten
├── hooks/                    # useLoad, Verfügbarkeit, Ressourcennamen
└── components/               # SeriesList, SeriesDetail, SeriesEditor, RecurrenceFields,
                              # CalendarOverview, ApplyDialog, LookupPicker, SetupPanel, parts (Status, Dialoge)
scripts/
├── provision-schema.ps1      # Tabelle, Spalten, Lookups anlegen (idempotent)
└── lib/Dataverse.ps1         # Token + Web-API-Wrapper (Kopie aus solution-forge/installer)
```

## Entwickeln

```bash
npm install
npm run dev      # http://localhost:3000 — ohne Host: Mock-Daten (Badge oben rechts)
npm run test     # Vitest: dates, recurrence, definition, planner, availability
npm run build    # tsc -b && vite build
npm run lint
```

Der Mock rechnet relativ zur aktuellen Woche (vergangene, laufende und
künftige Termine), kennt die bundesweiten Feiertage jedes Jahres, drei
Abwesenheiten und Buchungen anderer Aufträge für Konflikte.

## Einrichtung in einer Umgebung

Voraussetzung: Field Service, Project Operations und die **Integration Field
Service ↔ Project Operations** (Projektfeld am Arbeitsauftrag).

1. Datenmodell anlegen (Az-Anmeldung per Device Code, wie im Repo üblich):

   ```powershell
   pwsh scripts/provision-schema.ps1 -EnvironmentUrl https://operations-d365-schulz-uat-1-1.crm4.dynamics.com
   ```

2. Rechte: Disponenten brauchen Erstellen/Lesen/Schreiben/Anfügen/Anfügen an
   auf `pro_seriesplan` sowie die üblichen Rechte auf Arbeitsauftrag,
   Buchung und Ressourcenanforderung.
3. App initialisieren und Datenquellen hinzufügen (`power.config.json`,
   `src/generated/` und `.env` sind gitignored). Profilwahl, Prüfung und
   Push in **einem** Aufruf (Root-`AGENTS.md`):

   ```bash
   pac auth select --name SchulzNEW
   pac code init --environment <env-id> --displayName "Serienplanung" --buildPath "./dist" \
     --fileEntryPoint "index.html" --appUrl "http://localhost:3000"
   for t in pro_seriesplan msdyn_workorder bookableresourcebooking msdyn_resourcerequirement \
            bookableresource bookingstatus msdyn_project msdyn_projecttask account \
            msdyn_workordertype msdyn_incidenttype pricelevel; do
     pac code add-data-source -a dataverse -t $t
   done
   pac code add-data-source -a shared_commondataserviceforapps -c <connection-id>   # Benutzer-Connection
   cp .env.example .env   # VITE_ORG_URL=https://operations-d365-schulz-uat-1-1.crm4.dynamics.com
   ```

   Der Connector liest Metadaten, Arbeitszeiten und Feiertage — mit den
   Rechten des angemeldeten Nutzers (Benutzer-Connection, keine SP-Connection).
4. In der App „Einrichtung“ öffnen: alle Punkte grün?

Die generierten Klassennamen folgen dem Entity-Set-Namen
(`Msdyn_workordersService`, `Pro_seriesplansService` …). Weicht einer ab,
bricht `npm run build` mit dem Namen — dann den Import in
`dataverseSeriesService.ts` anpassen.

## Deployment-Stand

Noch nicht deployt. Ziel: Schulz UAT (`operations-d365-schulz-uat-1-1.crm4`,
Env-ID `2eaa34de-dcf1-e949-86d9-82d9fd748045`). Push nur nach Rücksprache.
Aktueller Stand und nächste Schritte: [STATUS.md](STATUS.md).

## Offen

- **Gegen echtes Dataverse noch nicht verifiziert:** alles Schreibende
  (Arbeitsauftrag mit `@odata.bind` auf Projekt/Konto/Typ über die native
  Datenquelle, Buchung mit Ressource/Status/Auftrag/Anforderung,
  Statuswechsel beim Absagen), die automatisch erzeugte Ressourcenanforderung
  und das Anpassen ihrer Dauer, `msdyn_LoadCalendars` über den Connector
  (Parameter `LoadCalendarsInput`, Antwort `CalendarEvents`), der Kalender
  der Geschäftsschließungen mit `$expand=calendar_calendar_rules`,
  `top`/`orderBy` der generierten Clients, `@odata.bind: null` zum Leeren
  eines Lookups am Serienplan.
- **Projektaufgabe:** Laut Microsoft darf nur der in der Aufgabe zugewiesene
  Nutzer sie am Arbeitsauftrag setzen, und Aufgabentermine überschreiben
  das zugesagte Zeitfenster des Auftrags (die Buchung bleibt). Im UAT prüfen,
  ob die Aufgabe für Serien sinnvoll ist oder nur das Projekt.
- **Zeiteinträge:** Entstehen sie bei Schulz automatisch aus der Buchung
  (Field-Service-Einstellung) oder per Hand? Die App setzt nur Auftrag und
  Buchung.
- **Feiertage regional:** Geschäftsschließungen gelten für die ganze
  Organisation. Regionale Feiertage einzelner Standorte nur, wenn sie im
  Kalender der Ressource als arbeitsfrei gepflegt sind.
- Kein offenes Ende: jede Serie braucht ein Enddatum oder eine Anzahl
  (höchstens 260 Termine bzw. drei Jahre). Verlängern über „Serie bearbeiten“.
