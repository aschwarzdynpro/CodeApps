# Konzept — Work Hours & Calendar Manager (Arbeitszeiten & Kalender)

Stand 2026-10-05. Konzept aus [`../Ideas_v3.md`](../Ideas_v3.md) (Idee 7),
gedacht für eine eigenständige Claude-Session. Zielordner:
`apps/work-hours-manager/`. Der Kickoff-Prompt steht am Ende.

## Problem

Arbeitszeiten, Abwesenheiten, Pausen und Geschäftsschließungen liegen in
Dataverse im Kalendermodell (`calendar` → `calendarrule` → innerer
`calendar` → Blattregeln). Das Modell ist ein Baum mit Rängen, Mustern
und Zeitzonen, den niemand im Kopf hat. Folgen, die wir bei Schulz und
in der Microsoft-Fehlerbehebung sehen:

- **„Ressource fehlt auf dem Board"** – die häufigste Ursache sind
  fehlende Arbeitszeiten im Zeitraum, nicht Rechte oder Filter
  ([Resolve missing resources](https://learn.microsoft.com/en-us/troubleshoot/dynamics-365/field-service/scheduling/schedule-board-missing-resources)).
  Niemand sieht, welche von 80 Ressourcen ab nächstem Monat keine
  Arbeitszeit mehr hat (Vorlage lief aus, Regel mit Enddatum).
- **Massenänderung gibt es nicht.** Neues Schichtmodell für 40
  Monteure, Betriebsferien, Zeitzonenwechsel eines Standorts: alles
  Ressource für Ressource im Formular. Arbeitszeitvorlagen helfen nur beim
  Anlegen, nicht beim Nachziehen.
- **Feiertage** sind eine Organisationsliste („Geschäftsschließungen")
  ohne Länder- oder Bundeslandlogik; der Jahreswechsel wird vergessen, und
  die Serienplanung (`apps/series-planner/`) findet dann keine
  Feiertage mehr und plant auf den 3. Oktober.
- **Herkunft ist unsichtbar.** Warum ist Dienstag 13 Uhr frei? Pause,
  Abwesenheit, Ausnahme, Schließung oder auslaufende Regel? Das Formular
  zeigt Ereignisse, nicht die Auflösung.

Die Serienplanung und der Schedule Board Manager lesen dieses Modell
bereits; dieser Manager ist das fehlende Schreib- und Diagnosewerkzeug
daneben.

## Nutzer und Nutzen

- **Dispositionsleitung** (Schulz): sieht den effektiven Kalender jeder
  Ressource, findet Lücken, bevor das Board sie zeigt, und zieht
  Schichtmodelle in einem Lauf nach.
- **Field-Service-Admin**: pflegt Feiertage pro Jahr aus einer Liste,
  prüft Zeitzonen und Vorlagen, hat ein Protokoll und ein
  Rückgängig-Paket je Lauf.
- **Consultant** (wir): Diagnose beim Kunden in Minuten statt FetchXML
  und Formular-Klickerei; produktfähig für jeden Field-Service- und
  Project-Operations-Kunden, keine Kundendaten im Spiel.

## Was wir über das Modell und die APIs wissen (verifiziert 2026-10-05)

| Thema | Befund | Quelle |
| --- | --- | --- |
| `calendarrule` | Keine GET/POST/PATCH/DELETE auf die Tabelle; lesbar nur per `$expand=calendar_calendar_rules` vom `calendar` (so liest die Serienplanung die Schließungen); Erstellen über die Tabelle erzeugt defekte Regeln | [Calendar entities](https://learn.microsoft.com/en-us/dynamics365/customerengagement/on-premises/developer/calendar-entities), [calendarrule](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/reference/entities/calendarrule), [TrueNorth](https://truenorthit.co.uk/creating-business-closures-with-the-dynamics-365-api/) |
| Baum | Wurzelregel am Kalender der Ressource mit `innercalendarid` → innerer Kalender → Blattregeln (`pattern`, `starttime`, `duration`, `effort`, `timecode`, `subcode`, `rank`, `timezonecode`, `effectiveintervalstart/end`). Rang 0 = wöchentliche Wiederholung, Rang 1 = Einzeltag und Abwesenheit (schlägt Rang 0) | Calendar entities, Work hours API („What happens if there are overlapping rules?") |
| Schreiben | `msdyn_SaveCalendar` (ein String-Parameter `CalendarEventInfo` als JSON) und `msdyn_DeleteCalendar`; Entitäten `bookableresource`, `msdyn_workhourtemplate`, `msdyn_resourcerequirement`, `msdyn_project`. `WorkHourType` 0 Arbeit, 1 Pause, 2 Nicht-Arbeit, 3 Abwesenheit. Muster **nur** `FREQ=WEEKLY;INTERVAL=1;BYDAY=…`. Bearbeiten braucht `IsEdit` + `InnerCalendarId`; eigene Tage je Wochentag = `IsVaried` + `Action` 1–4; `ObserveClosure`, `Effort` (Kapazität), `TimeZoneCode` (110 = Berlin), `RecurrenceEndDate`, `RecurrenceSplit` („dieser und folgende"), `UseV2` (mehrere Wiederholungen parallel), `ResourceId` bei Benutzer-Ressourcen (Eigenkalender-Recht) | [Work hours calendar API](https://learn.microsoft.com/en-us/dynamics365/field-service/field-service-work-hours-calendar-api) |
| Grenzen der API | Ein Ereignis muss innerhalb eines Tages liegen (Nachtschicht = zwei Aufrufe); keine Abwesenheits- oder Nicht-Arbeits-Wiederholung; kein Löschen einer einzelnen Instanz aus einer Wiederholung; Pausen nie allein; keine Ganztags-Wiederholung | ebd. |
| Lesen aufgelöst | `msdyn_LoadCalendars` (`LoadCalendarsInput` = `{StartDate, EndDate, CalendarIds[]}`) liefert je Kalender Slots `{Start, End, Effort, InnerCalendarId}` — die effektive Arbeitszeit, bereits mit Abwesenheiten und Schließungen verrechnet. Die Serienplanung ruft sie über den Konnektor (noch unverifiziert, README „Offen") | ebd., `apps/series-planner/src/services/dataverseCalendar.ts` |
| Schließungen | Organisationskalender `organization.businessclosurecalendarid`; Anlegen über die undokumentierte Action `msdyn_BusinessClosureSave` (`Name`, `Start`, `End`), Kalender-ID wird serverseitig ermittelt. Nicht verwechseln mit `msdyn_businessclosure` aus Customer-Service-Kalendern | TrueNorth, Serienplanung `loadClosures` |
| Vorlagen | `msdyn_workhourtemplate` hat einen eigenen `calendarid`; per `msdyn_SaveCalendar` pflegbar. **Eine native „Vorlage anwenden"-Action ist nicht dokumentiert** – Anwenden heißt: Blattregeln der Vorlage lesen, als neue Regeln auf die Ressource schreiben | [msdyn_workhourtemplate](https://learn.microsoft.com/en-us/dynamics365/field-service/developer/reference/entities/msdyn_workhourtemplate), FAQ der API |
| Abwesenheitsanträge | `msdyn_timeoffrequest`; die Genehmigung erzeugt die Kalenderregel. v1 nur lesen und als Herkunft anzeigen | Field-Service-Doku |
| Code Apps 2026 | Dataverse-Actions in Code Apps in Preview; bis GA über den Dataverse-Konnektor (`PerformUnboundActionWithOrganization`) wie in der Serienplanung | Release Plan 2026 Wave 1 |

Daraus die **zentrale Entscheidung**: Die App schreibt **ausschließlich
über die Actions**, nie über `calendarrule`-Zeilen. Sie liest zwei Dinge
nebeneinander: die **Regeln** (Baum per `$expand`, für Herkunft, Diff
und Rückgängig) und die **aufgelösten Slots** (`msdyn_LoadCalendars`,
für Kalenderansicht und Diagnose). Beides in pure functions
zusammengeführt (`resolveDay(rules, slots, closures, date)`), damit die
Herkunft jeder Stunde erklärbar bleibt.

## Feature Map

Vier Bereiche, je Feature mit Version, Datenpfad und den Fluent-UI-v9-
Bausteinen. **v1** ist das Lieferziel der ersten Session, **v2** Backlog.

```
Work Hours & Calendar Manager
├── 1 Ressourcen & Kalender (lesen)
│   ├── 1.1 Ressourcenliste mit Facetten                       v1
│   ├── 1.2 Kalenderansicht Woche/Monat mit Herkunfts-Overlay  v1
│   ├── 1.3 Regel-Inspektor (Baum, Rang, Muster, Zeitzone)     v1
│   ├── 1.4 Vergleich zweier Ressourcen                        v2
│   └── 1.5 Kapazitätsspalte (Effort) in der Kalenderansicht   v1
├── 2 Bearbeiten (einzeln)
│   ├── 2.1 Arbeitszeit anlegen/ändern (Einmal, wöchentlich,   v1
│   │       je Wochentag verschieden, Pausen, Kapazität)
│   ├── 2.2 Abwesenheit mit Grund, Nicht-Arbeit, Ganztag       v1
│   ├── 2.3 „Dieser und folgende" / Wiederholung beenden       v1
│   ├── 2.4 Regel löschen (ganze Wiederholung) mit Vorschau    v1
│   ├── 2.5 Zeitzone der Ressource und ihrer Regeln ändern     v2
│   └── 2.6 Vorlage selbst bearbeiten (gleicher Editor)        v1
├── 3 Massenaktionen (Lauf mit Vorschau, Protokoll, Rückgängig)
│   ├── 3.1 Vorlage auf n Ressourcen anwenden                  v1
│   ├── 3.2 Abwesenheit/Betriebsferien für n Ressourcen        v1
│   ├── 3.3 Wiederholung für n Ressourcen beenden/verlängern   v2
│   ├── 3.4 Kapazität oder Schließungsbeachtung umstellen      v2
│   ├── 3.5 Läufe-Verlauf mit Rückgängig-Paket                 v1
│   └── 3.6 Export/Import eines Kalenders als JSON (Umgebung→Umgebung) v2
├── 4 Feiertage & Schließungen
│   ├── 4.1 Schließungen des Jahres sehen, anlegen, löschen    v1
│   ├── 4.2 Jahr erzeugen aus Regelwerk (DE Bund/Länder, AT, CH) v1
│   ├── 4.3 Abgleich: fehlt/abweichend/doppelt gegen Regelwerk v1
│   └── 4.4 Regionale Feiertage als Abwesenheit je Ressource   v2
└── 5 Diagnose
    ├── 5.1 Ressourcen ohne Arbeitszeit im Zeitraum            v1
    ├── 5.2 Regeln, die in < 90 Tagen enden / schon endeten    v1
    ├── 5.3 Zeitzone Ressource ≠ Zeitzone ihrer Regeln         v1
    ├── 5.4 Inaktive Ressourcen mit Buchungen nach Datum X     v1
    ├── 5.5 Ressourcen ohne Kalender / verwaiste innere Kalender v1
    ├── 5.6 Überlappende Rang-0-Regeln (V1/V2-Verhalten erklärt) v2
    └── 5.7 Abwesenheitsanträge genehmigt, aber ohne Regel     v2
```

### Datenpfad je Feature

| Feature | Lesen | Schreiben |
| --- | --- | --- |
| 1.1 Liste | `bookableresource` (Name, Typ, `timezone`, `_calendarid_value`, Org-Einheit, Status), `bookableresourcecategoryassn`, `msdyn_resourceterritory` | — |
| 1.2 Kalender | `msdyn_LoadCalendars` für sichtbare Ressourcen und Zeitraum; Schließungen aus dem Org-Kalender; `msdyn_timeoffrequest` (genehmigt) für Herkunft | — |
| 1.3 Inspektor | `calendars(id)?$expand=calendar_calendar_rules`, dann innere Kalender gebündelt (`calendarid in (…)`) | — |
| 2.x Editor | Regel aus 1.3 | `msdyn_SaveCalendar` (`IsEdit`/`InnerCalendarId`, `IsVaried`/`Action`, `RecurrenceSplit`), `msdyn_DeleteCalendar` |
| 3.1 Vorlage | `msdyn_workhourtemplate` + deren Kalenderbaum | je Ressource `msdyn_SaveCalendar` mit den Vorlagenregeln ab Stichtag, optional vorher bestehende Wiederholungen per `RecurrenceEndDate` beenden |
| 3.5 Rückgängig | Snapshot des Regelbaums vor dem Lauf (JSON, lokal + optional `pro_calendarrun`) | Wiederherstellen = Delete der neu entstandenen `InnerCalendarIds` + Save der alten Regeln |
| 4.x Schließungen | Org-Kalender per `$expand` | `msdyn_BusinessClosureSave`; Löschen über `msdyn_DeleteCalendar` mit `EntityLogicalName = calendar`? **live prüfen**, sonst Hinweis „im Admin-Center löschen" |
| 5.x Diagnose | 1.1 + 1.3 + `bookableresourcebooking` (für 5.4) | — |

### UI-Bausteine (Fluent UI v9, `@fluentui/react-components` ≥ 9.74)

| Bereich | Komponenten | Hinweise |
| --- | --- | --- |
| App-Shell | `Nav` (Sidebar: Ressourcen, Vorlagen, Feiertage, Diagnose, Läufe), `Toolbar` oben mit Zeitraum, Zeitzone, Umgebung; `Breadcrumb` im Detail; `Toaster`/`useToastController` für Ergebnisse | Dark Mode über `FluentProvider` mit `webLightTheme`/`webDarkTheme`, wie Schedule Board Manager |
| 1.1 Liste | `DataGrid` (sortierbar, `selectionMode="multiselect"`, `resizableColumns`), `SearchBox`, `TagPicker` für Kategorie/Gebiet/Org-Einheit, `Badge` für Status und Diagnose-Marker, `Skeleton` beim Laden | Auswahl in der Liste ist der Eingang in Massenaktionen |
| 1.2 Kalender | Eigenes CSS-Grid (Fluent hat keinen Scheduler): Wochenansicht Ressource × Tag mit Stundenbalken, Monatsansicht Tag-Kacheln; `Tooltip` je Slot, `Popover` mit Tagesauflösung und Herkunft (`Tag` je Quelle: Wiederholung, Ausnahme, Pause, Abwesenheit, Schließung), Farben nur aus `tokens` | Zeitzone des Betrachters umschaltbar; Sommerzeit über `Intl`, wie `series-planner/utils/dates.ts` |
| 1.3 Inspektor | `Tree`/`TreeItem` für Wurzel → innere Kalender → Blattregeln, `Table` für Felder, `InfoLabel` für Rang/Muster/Extent | Read-only, mit „Roh-JSON" `Textarea` |
| 2.x Editor | `Dialog` (modal) mit `Field`, `RadioGroup` (einmal/wöchentlich/je Wochentag), `Checkbox`-Gruppe Wochentage, `DatePicker` + `TimePicker` aus `@fluentui/react-datepicker-compat`/`react-timepicker-compat`, `SpinButton` für Kapazität, `Switch` für Schließungsbeachtung, `Combobox` Zeitzone, `Textarea` Grund, `MessageBar` für API-Grenzen („Nachtschicht wird in zwei Regeln gespeichert") | Vorschau-Tab im Dialog zeigt die betroffenen Tage vor dem Speichern |
| 3.x Massenlauf | `OverlayDrawer` als Assistent in drei Schritten (Auswahl → Vorlage/Aktion → Vorschau), `DataGrid` der Vorschau mit Spalten vorher/nachher je Ressource und `Badge` „ändert/übersprungen/Fehler", `ProgressBar` beim Ausführen, Ergebnis als `MessageBar` + `Accordion` je Ressource | Max. 50 Ressourcen je Lauf, sequentiell, abbrechbar |
| 4.x Feiertage | `DataGrid` des Jahres, `Dialog` neu/bearbeiten, `Dropdown` Regelwerk (Land/Bundesland), `Checkbox`-Liste der erzeugten Feiertage mit Abgleich-Markern | Regelwerk als pure function inkl. Osterformel; keine externe API |
| 5.x Diagnose | `Card`-Kacheln mit Zahl und `Badge`-Intent, Klick → vorgefilterte Liste; `Accordion` je Befund mit Direktaktion („Vorlage anwenden", „Regel verlängern") | Dasselbe Findings-Muster könnte später in andere Apps wandern |
| Hilfe | Hilfe-Panel als `InlineDrawer` rechts, Inhalt in `src/help/helpContent.ts` | wie Schedule Board Manager |

Nicht verwenden: `@fluentui/react` (v8), eigene Modal-Implementierungen
(die `Modal.tsx` der Serienplanung ist Altlast), Chart-Bibliotheken
(v1 hat keine Diagramme).

### Modernes React — was sich hier lohnt

- **React 19 + React Compiler-Regeln** (ESLint wie in den Schwester-
  Apps): keine manuellen `useMemo`/`useCallback`, kein `setState` im
  Effect; abgeleitete Daten als pure functions, Zustand so klein wie
  möglich.
- **`useTransition`** für Suche, Facetten und Zeitraumwechsel in der
  Kalenderansicht, damit die Liste beim Tippen nicht blockiert.
- **`useOptimistic`** für Schalter wie „beachtet Schließungen" und
  Kapazität, mit Rollback bei Fehler.
- **`useActionState`** für den Editor-Dialog und den Massenlauf
  (Pending-Zustand, Fehler je Feld, Ergebnis) statt eigener
  `loading`/`error`-Tripel.
- **`Suspense` + `use(promise)`** für Ressourcenliste und Kalenderdaten
  über einen kleinen Promise-Cache je Schlüssel (`resourceId + from +
  to`), damit Skeletons und Fehlergrenzen (`ErrorBoundary`) deklarativ
  bleiben; der bewährte `useLoad`-Hook bleibt Fallback.
- **Virtualisierung** der Kalenderzeilen ab ~100 Ressourcen über
  einfache Fensterung (wie Translation Studio), keine Grid-Bibliothek.
- Strings zentral (`src/strings.ts`, Deutsch), Datum/Zeit über `Intl`.

## Architektur (Repo-Muster)

```
apps/work-hours-manager/
├── src/
│   ├── PowerProvider.tsx            # Host-Erkennung (Kopie aus series-planner)
│   ├── config.ts                    # VITE_ORG_URL, Limits (max. Ressourcen je Lauf)
│   ├── strings.ts
│   ├── types/calendar.ts            # Resource, CalendarTree, LeafRule, Slot, Closure,
│   │                                # DayResolution, EditIntent, RunPlan, RunResult
│   ├── utils/
│   │   ├── rules.ts                 # Baum lesen: Wurzel/innere/Blatt, Rang, Muster → Modell
│   │   ├── resolve.ts               # resolveDay(rules, slots, closures, timeOff, date) → Herkunft je Stunde
│   │   ├── intents.ts               # EditIntent → CalendarEventInfo-JSON (Save/Delete), Nachtschicht-Split,
│   │   │                            # Mapping je Wochentag → IsVaried/Action
│   │   ├── plan.ts                  # Massenlauf: Vorlage + Ziel-Ressourcen → Schritte, Vorschau-Diff
│   │   ├── undo.ts                  # Snapshot → Wiederherstellschritte
│   │   ├── holidays.ts              # Regelwerke (DE Bund + 16 Länder, AT, CH), Osterformel, Abgleich
│   │   ├── diagnostics.ts           # Befunde 5.1–5.5 aus Ressourcen + Bäumen + Slots
│   │   ├── timezones.ts             # TimeZoneCode ↔ IANA (Tabelle aus der API-Doku)
│   │   └── dates.ts                 # aus series-planner übernommen
│   ├── services/
│   │   ├── calendarService.ts       # Interface + Auswahl Dataverse/Mock
│   │   ├── dataverseCalendarService.ts
│   │   ├── dataverseActions.ts      # SaveCalendar/DeleteCalendar/LoadCalendars/BusinessClosureSave
│   │   ├── runCalendarPlan.ts       # Lauf ausführen, sequentiell, Ergebnis je Schritt
│   │   ├── mockCalendarService.ts
│   │   └── mockData.ts              # fiktive Ressourcen (pro-Präfix), Vorlagen, Schließungen, Bäume
│   ├── hooks/                       # useResources, useCalendarRange (Suspense-Cache), useRuns
│   ├── components/
│   │   ├── shell/                   # AppNav, TopToolbar, HelpDrawer
│   │   ├── resources/               # ResourceGrid, ResourceFilters
│   │   ├── calendar/                # WeekGrid, MonthGrid, DayPopover, OriginTag
│   │   ├── rules/                   # RuleTree, RuleEditorDialog, RulePreview
│   │   ├── runs/                    # RunWizardDrawer, RunPreviewGrid, RunHistory
│   │   ├── holidays/                # HolidayYearGrid, HolidayRulesetPicker
│   │   └── diagnostics/             # FindingCards, FindingList
│   └── help/helpContent.ts
├── scripts/                         # provision-schema.ps1 für pro_calendarrun (optional, v1 lokal)
├── README.md, Roadmap.md, .env.example
```

- Alle `utils/*` sind pure functions mit Vitest; Fixtures sind
  anonymisierte Regelbäume (wöchentlich, je Wochentag verschieden,
  Pause, Abwesenheit, auslaufende Regel, Nachtschicht).
- Identität: **Benutzer-Connection** am Dataverse-Konnektor (wie
  Serienplanung); die Actions prüfen Eigenkalender-Rechte über
  `ResourceId`, und Dataverse-Audit zeigt den Handelnden. Sobald Actions
  nativ in Code Apps GA sind: Umstellung in `dataverseActions.ts`, Rest
  unverändert.
- Verlauf der Läufe v1 lokal im Browser (letzte 20, wie Schedule Board
  Manager), v2 Tabelle `pro_calendarrun` (Plan, Snapshot, Ergebnis).

## Leitplanken

- **Nie `calendarrule` schreiben**, nie Blattregeln direkt anfassen;
  nur `msdyn_SaveCalendar`/`msdyn_DeleteCalendar`/`msdyn_BusinessClosureSave`.
- **Vorschau ist Pflicht** vor jedem Schreiben: Einzel-Edit zeigt die
  betroffenen Tage, Massenlauf zeigt vorher/nachher je Ressource.
- Jeder Lauf beginnt mit einem **Snapshot** der betroffenen Bäume; ohne
  Snapshot kein Schreiben. Rückgängig ist ein normaler Lauf mit Vorschau.
- API-Grenzen in der UI erklären, nicht umgehen: Nachtschicht wird
  gesplittet, Abwesenheit hat keine Wiederholung (Assistent erzeugt
  Einzeltage), Einzeltag aus Wiederholung löschen geht nicht (stattdessen
  Nicht-Arbeit-Tag anlegen).
- `UseV2` einheitlich (Einstellung in der App, Default an, mit Erklärung
  der Überlappungslogik); gemischte V1/V2-Bäume als Befund melden.
- Massenlauf max. 50 Ressourcen, sequentiell, abbrechbar, Einzelergebnis;
  bei Fehler Stopp mit Hinweis, was schon geschrieben ist.
- Zeitzonen: Regel-Zeitzone ist Pflichtfeld im Editor, Default = Zeitzone
  der Ressource; Anzeige in der Zeitzone des Betrachters, umschaltbar.
- Rechte: Save-Fehler mit „privilege" → read-only-Modus mit Klartext.
- Keine Kundendaten in Mocks (Präfix `pro`, fiktive Namen).

## Akzeptanz (v1)

- Mock-Modus zeigt Liste, Wochen- und Monatskalender mit Herkunft,
  Regel-Inspektor, Editor mit Vorschau, Vorlagen-Lauf mit Vorschau,
  Protokoll und Rückgängig, Feiertagsjahr erzeugt und abgeglichen, alle
  fünf v1-Befunde.
- Schulz UAT: für eine Testressource eine wöchentliche Arbeitszeit mit
  Pause anlegen, bearbeiten („dieser und folgende"), löschen; Ergebnis im
  Formular der Ressource und auf dem Board identisch; `msdyn_LoadCalendars`
  liefert die geänderten Slots. Vorlage auf drei Testressourcen anwenden,
  Rückgängig stellt den Stand her (Baumvergleich bis auf IDs).
- Feiertage 2027 (Bayern) anlegen; die Serienplanung erkennt sie in der
  Vorschau.
- Befund 5.1 stimmt mit einer manuellen Prüfung auf dem Board überein.
- `npm run build`, `lint`, `test` grün; Vitest für `rules`, `resolve`,
  `intents`, `plan`, `undo`, `holidays`, `diagnostics`.

## Vorgehen

Sechs Phasen, jede mit einem vorzeigbaren Stand. Schreibpfade kommen
erst, wenn der Lesepfad live stimmt, und der Massenlauf erst, wenn der
Einzel-Edit live stimmt.

| Phase | Inhalt | Ergebnis / Entscheidung |
| --- | --- | --- |
| **0 Discovery** (½ Tag, Schulz UAT, pac per Device Code) | Metadaten der Actions prüfen (`msdyn_SaveCalendar`, `msdyn_DeleteCalendar`, `msdyn_LoadCalendars`, `msdyn_BusinessClosureSave`; gibt es eine Apply-Template-Action?); echte Regelbäume von 3 Ressourcen und einer Vorlage per `pac env fetch` exportieren (anonymisiert als Fixtures); Zählen: Ressourcen, mit/ohne Kalender, Vorlagen, Schließungen; Rechte des Testkontos | Fixtures und README-Abschnitt „Datenlage"; Entscheidung UseV2 ja/nein; Entscheidung, ob Schließungen löschbar sind |
| **1 Fundament** (1 Tag) | Scaffold nach `docs/SETUP.md`, Fluent v9, Vitest, ESLint; Domänentypen; `rules.ts`, `resolve.ts`, `timezones.ts`, `holidays.ts` mit Tests gegen die Fixtures; Mock-Service mit vollständigem Datensatz | `npm test` grün, noch keine UI |
| **2 Lesen** (1–2 Tage) | Shell, Ressourcenliste, Wochen-/Monatskalender mit Herkunft, Regel-Inspektor, Diagnose 5.1–5.5; Dataverse-Service für alle Reads; Live-Test im UAT | Erster Nutzen für die Disposition ohne jedes Schreibrisiko; Zwischenstand an den Nutzer |
| **3 Einzel-Edit** (1–2 Tage) | `intents.ts` mit Tests; Editor-Dialog mit Vorschau; Save/Delete über den Konnektor; Live-Test aller Fälle aus der API-Doku (einmal, wöchentlich, je Wochentag, Pause, Abwesenheit, Ganztag, „dieser und folgende", Löschen); Vorlagen bearbeiten | README „Verifiziert"-Tabelle je Fall; hier zeigt sich, ob der Konnektor die Actions sauber durchreicht |
| **4 Massenlauf** (1–2 Tage) | `plan.ts`, `undo.ts`; Assistent, Vorschau-Grid, Ausführung mit Fortschritt, Verlauf, Rückgängig; Betriebsferien-Lauf | Live: Vorlage auf 3 Testressourcen, Rückgängig; Zwischenstand |
| **5 Feiertage & Abschluss** (1 Tag) | Schließungen lesen/anlegen/abgleichen, Jahr aus Regelwerk; Hilfe-Panel, README, Roadmap, `apps/README.md`; Deployment-Befehle für Schulz UAT dokumentiert | Abnahme nach Akzeptanzliste; Push und Deployment nur nach Rückfrage |

Risiken, die das Vorgehen abfedern: (a) der Dataverse-Konnektor reicht
`CalendarEventInfo` nicht korrekt durch → Phase 3 fängt es früh, Ausweg
ist die native Dataverse-API (`pa app add dataverse-api`, wie Translation
Studio); (b) `msdyn_BusinessClosureSave` ist undokumentiert → Phase 0
prüft Metadaten, Fallback ist „nur lesen und abgleichen, anlegen im
Admin-Center"; (c) V1/V2-Überlappungslogik verfälscht Vorschauen →
`resolve.ts` nutzt die Slots von `msdyn_LoadCalendars` als Wahrheit und
die Regeln nur als Erklärung.

## v2-Backlog

Vergleich zweier Ressourcen, Zeitzonenwechsel mit Regelmigration,
Kalender-Export/-Import zwischen Umgebungen (Kern mit Schedule Board
Manager und Setup Transporter teilen), Abwesenheitsanträge ohne Regel,
regionale Feiertage je Ressource, Lauf-Tabelle `pro_calendarrun`,
Kapazitäts-Heatmap (dann Übergang zu Idee 6, Capacity & Skills Planner).

## Zielumgebungen

- Erst **Schulz UAT** (Serienplanung und Schedule Board Manager liegen
  dort; Env-URL, Konnektor-Connection und Profil siehe
  `apps/series-planner/README.md`, Abschnitt Einrichtung).
- Danach ASC-Playground als Gegenprobe ohne Field-Service-Daten
  (Diagnose muss „keine Ressourcen" sauber anzeigen).

## Kickoff-Prompt

```text
Lies zuerst AGENTS.md im Repo-Root, dann docs/concepts/work-hours-manager.md
(das Konzept, verbindlich) und zur Orientierung apps/series-planner/README.md
plus dessen src/services/dataverseCalendar.ts, src/utils/dates.ts und
src/PowerProvider.tsx, außerdem apps/schedule-board-manager/README.md
(Hilfe-Panel, Verlauf, Diff-Vorschau, Fluent-Konventionen in
src/components/ui.tsx). Für die Konnektor-Grenzen lies in
apps/solution-forge/CLAUDE.md die Gotchas #4 und #8.

Aufgabe: Lege die neue Code App apps/work-hours-manager/ („Arbeitszeiten &
Kalender") an und setze v1 aus dem Konzept in den dort beschriebenen Phasen
um. Vorgehen:
1. Phase 0 kannst du remote nicht ausführen: schreibe mir die konkreten
   pac-Befehle (Device Code) für Metadaten der vier Actions, den Export
   von drei Ressourcen-Kalenderbäumen und einer Vorlage sowie die Zählungen,
   und lege README „Offen" mit den Entscheidungen UseV2 und Schließungen
   löschen an. Bis meine Ergebnisse da sind, arbeitest du mit synthetischen
   Fixtures, die exakt dem Regelbaum-Modell der Doku folgen.
2. Verifiziere vor dem Code per WebFetch die Doku der Work-Hours-Calendar-
   API (Parameter, WorkHourType, Muster, Grenzen, Zeitzonencodes) und halte
   jede nicht verifizierbare Annahme in README „Offen" fest.
3. Phase 1 mock-first: Scaffold nach docs/SETUP.md (Vite-Template, React 19,
   Fluent UI v9 inkl. datepicker-/timepicker-compat, Vitest, ESLint mit
   React-Compiler-Regeln wie series-planner), Domänentypen, pure functions
   rules/resolve/timezones/holidays mit Tests, vollständiger Mock.
4. Phase 2 Lesen: Shell mit Nav/Toolbar, DataGrid-Ressourcenliste,
   Wochen-/Monatskalender mit Herkunft, Regel-Inspektor (Tree), Diagnose
   5.1–5.5; Dataverse-Reads über den Konnektor. Melde dich hier mit einem
   Zwischenstand, bevor du Schreibpfade baust.
5. Phase 3 Einzel-Edit (intents.ts mit Tests, Editor-Dialog mit Vorschau,
   Save/Delete), Phase 4 Massenlauf (plan/undo, Drawer-Assistent, Vorschau-
   Grid, Fortschritt, Verlauf, Rückgängig), Phase 5 Feiertage, Hilfe-Panel,
   README (Problem, Datenpfad, Verifiziert-Tabelle, Einrichtung mit pac-/
   power-apps-Befehlen für Schulz UAT, Deployment-Stand, Offen), Roadmap.md,
   Eintrag in apps/README.md.
Regeln: npm run build, lint und test müssen grün sein; Conventional Commits
mit Scope work-hours-manager auf Branch feature/work-hours-manager; kein
Push und kein Deployment ohne Rückfrage; pac/az-Logins nur per Device Code
und nur, wenn ich es anstoße — was du remote nicht prüfen kannst,
dokumentiere als konkrete Befehle für mich. Nie calendarrule-Zeilen
schreiben, nur die Actions. Keine Kundendaten in Mocks. UI-Sprache Deutsch,
Strings zentral.
```
