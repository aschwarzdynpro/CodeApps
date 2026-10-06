# Arbeitszeiten & Kalender (Work Hours & Calendar Manager)

Code App zum **Sehen, Pflegen und Diagnostizieren von Arbeitszeiten**,
Abwesenheiten, Pausen und Geschäftsschließungen in Field Service / Project
Operations (Universal Resource Scheduling). Konzept, Feature Map und
Leitplanken: [`docs/concepts/work-hours-manager.md`](../../docs/concepts/work-hours-manager.md)
(verbindlich). Zielumgebung zuerst **Schulz UAT**, danach der ASC-Playground
als Gegenprobe ohne Field-Service-Daten.

## Problem

Arbeitszeiten liegen in Dataverse im Kalendermodell (`calendar` →
`calendarrule` → innerer `calendar` → Blattregeln) — ein Baum mit Rängen,
Mustern und Zeitzonen, den niemand im Kopf hat. „Ressource fehlt auf dem
Board“ heißt meistens: keine Arbeitszeit im Zeitraum. Massenänderungen
(Schichtmodell für 40 Monteure, Betriebsferien) gibt es im Produkt nicht,
Feiertage sind eine Jahresliste ohne Länderlogik, und warum Dienstag 13 Uhr
frei ist (Pause, Abwesenheit, Ausnahme, Schließung, auslaufende Regel) zeigt
kein Formular. Diese App ist das Schreib- und Diagnosewerkzeug neben der
Serienplanung und dem Schedule Board Manager, die das Modell nur lesen.

**Zentrale Entscheidung:** Die App schreibt **ausschließlich über die Actions**
`msdyn_SaveCalendar`, `msdyn_DeleteCalendar` und `msdyn_BusinessClosureSave`,
nie über `calendarrule`-Zeilen. Sie liest die **Regeln** (Baum per `$expand`,
für Herkunft, Diff und Rückgängig) und die **aufgelösten Slots**
(`msdyn_LoadCalendars`, für Kalenderansicht und Diagnose) nebeneinander und
führt beides in pure functions zusammen (`resolveDay`).

## Stand

| Phase | Inhalt | Stand |
| --- | --- | --- |
| 0 Discovery | Metadaten der Actions, echte Regelbäume, Zählungen, Rechte (Schulz UAT) | **wartet auf den Nutzer** — Befehle unten; bis dahin synthetische Fixtures (`src/fixtures/calendars.ts`) |
| 1 Fundament | Scaffold, Domänentypen, `rules`/`resolve`/`timezones`/`holidays` mit Tests, Mock inkl. Server-Emulation der Actions | fertig |
| 2 Lesen | Shell, Ressourcenliste, Wochen-/Monatskalender mit Herkunft, Regel-Inspektor, Diagnose 5.1–5.5, Dataverse-Reads | fertig (Mock); live offen |
| 3 Einzel-Edit | `intents.ts`, Editor mit Vorschau, Save/Delete | fertig (Mock); live offen |
| 4 Massenlauf | `plan`/`undo`, Assistent, Verlauf, Rückgängig | fertig (Mock); live offen |
| 5 Feiertage & Abschluss | Schließungen, Jahr aus Regelwerk, Hilfe, Doku | fertig; Deployment nach Rücksprache |

`npm run build`, `lint` und `test` (89 Tests) sind grün; alle Bereiche sind
mit Playwright gegen den Mock durchgespielt (Lesen, Editor, Massenlauf mit
Rückgängig, Feiertage, Hilfe). **Nichts ist gegen echtes Dataverse
verifiziert** — siehe „Verifiziert (live)“ und „Offen“.

## Funktionen

| Bereich | Inhalt |
| --- | --- |
| **Ressourcen** | DataGrid mit Suche, Facetten (Org-Einheit, Kategorie, Gebiet), Inaktive, „nur mit Befunden“; Spalten Typ, Zeitzone, Stunden im Zeitraum, Regeln, Status, Befunde; Mehrfachauswahl als Eingang in die Massenaktion. Kalender als **Woche** (Ressource × Tag, 24-h-Balken: Arbeitszeit, Pause, Abwesenheit, Nicht-Arbeit, Schließung, Kapazität ≠ 1 schraffiert) oder **Monat** (fokussierte Ressource). Tages-Popover mit jedem Segment, Herkunft (Wiederholung/Einzeltag/Pause/Abwesenheit/Schließung) und Sprung in den Inspektor; Grund für Tage ohne Arbeitszeit (kein Arbeitstag, Regel ausgelaufen, beginnt später, keine Regel). |
| **Regel-Inspektor** | InlineDrawer mit Tree: Block (Wurzelregel) → innerer Kalender → Blattregeln; Gruppen „je Wochentag verschieden“; Rang, Art, Zeitzone (Abweichung markiert); Felder und Roh-JSON des gewählten Blocks; verwaiste innere Kalender und nicht interpretierbare Regeln. Aktionen: Arbeitszeit/Abwesenheit/Nicht-Arbeit anlegen, Bearbeiten, Einzeltag, Beenden, Löschen. |
| **Editor** | Dialog mit Eingabe- und Vorschau-Tab: Einmal / wöchentlich (Wochentage, Ende) / je Wochentag verschieden (Zeiten je Tag); Zeiten als Arbeit/Pause (Pausen dürfen in der Arbeitszeit liegen, werden ausgeschnitten), ganztägig über n Tage, Kapazität, Schließungen beachten, Zeitzone der Regel (Default Ressource); Abwesenheit/Nicht-Arbeit mit Grund; Bearbeiten ganz oder „dieser und folgende ab Datum“; Einzeltag einer Wiederholung; Beenden; Löschen mit Vorschau. Vorschau: betroffene Tage (4 Wochen) vorher/nachher aus der Server-Emulation plus die Aufrufe an die API. Validierung spiegelt die API-Grenzen. |
| **Vorlagen** | Liste der `msdyn_workhourtemplate` mit ihren Regeln; Inspektor und Editor wie bei Ressourcen (EntityLogicalName `msdyn_workhourtemplate`); „Auf Ressourcen anwenden“ startet den Massenlauf. |
| **Massenlauf** | OverlayDrawer-Assistent: Ressourcen (max. 50) → Aktion (Vorlage ab Stichtag, optional bestehende Wiederholungen am Vortag beenden und spätere löschen; oder Abwesenheit/Nicht-Arbeit mit Datum, Tagen, Grund) → Vorschau-Tabelle je Ressource (h/Woche vorher/nachher, Regeln, Status, Hinweis) → Ausführen sequentiell mit Fortschritt, abbrechbar, Stopp beim ersten Fehler. Jeder Lauf beginnt mit einem Snapshot der betroffenen Bäume. |
| **Läufe** | Verlauf lokal (letzte 20) mit Ergebnis je Ressource, JSON-Download, **Rückgängig** als normaler Lauf mit Vorschau: löscht angelegte Regeln, stellt Enden wieder her, legt gelöschte Regeln neu an (Baumvergleich bis auf IDs im Test). |
| **Feiertage** | Schließungen des Jahres (lokale Tage in der Anzeige-Zeitzone), anlegen (`msdyn_BusinessClosureSave`), löschen (Versuch, siehe Offen); Regelwerk DE bundesweit + 16 Länder, AT, CH mit Osterformel; Abgleich vorhanden/fehlt/anderer Name/nur teilweise, Schließungen außerhalb des Regelwerks, Dubletten; fehlende markieren und in einem Schritt anlegen. |
| **Diagnose** | Kacheln mit Zahl und Schwere, gefilterte Liste, „Im Kalender zeigen“: 5.1 ohne Arbeitszeit (28 Tage ab heute, eigene `msdyn_LoadCalendars`-Abfrage unabhängig von der angezeigten Woche), 5.2 Wiederholung endet in 90 Tagen / endete ohne Nachfolgerin, 5.3 Zeitzone Regel ≠ Ressource, 5.4 inaktiv mit Buchungen nach heute, 5.5 ohne Kalender / ohne Regeln / verwaiste innere Kalender. |
| **Einrichtung, Hilfe** | Einrichtungsseite (Konnektor, Org-URL, Ressourcen lesbar, Schließungskalender, `msdyn_LoadCalendars`); Hilfe-Panel mit Inhaltsverzeichnis und Suche (`src/help/helpContent.ts` — bei sichtbaren Änderungen nachziehen). |

Toolbar: Woche/Monat, Zeitraum, Anzeige-Zeitzone (umschaltbar, Sommerzeit
über `Intl`), `UseV2`-Schalter (lokal gespeichert), Neu laden, Modus-Badge
(Dataverse / Mock-Daten / Nur lesen nach einem Rechtefehler).

## Datenpfad

| Feature | Lesen | Schreiben |
| --- | --- | --- |
| Liste | `bookableresources` (Name, Typ, `timezone`, `_calendarid_value`, Org-Einheit, Status, `_userid_value`), `bookableresourcecategoryassns`, `msdyn_resourceterritories` — Konnektor `ListRecordsWithOrganization` mit Annotationen; danach im Hintergrund die **Wurzelregeln** je Kalender (`GetItemWithOrganization` `calendars(<id>)?$expand=calendar_calendar_rules`, 8 parallel) für Regelzahl und Befunde; Stunden aus den Slots | — |
| Kalender | `msdyn_LoadCalendars` (`LoadCalendarsInput`) je 50 Kalender für den sichtbaren Zeitraum (nur `TimeCode 0` zählt als Arbeitszeit); Org-Kalender per `organizations.businessclosurecalendarid` + Einzelabruf; `msdyn_timeoffrequests` im Zeitraum | — |
| Inspektor | voller Baum erst beim Öffnen: Kalender und seine inneren Kalender, je ein Einzelabruf (Sammelabfragen liefern die Regeln leer). Ebenso für Editor, Lauf-Ziele und Vorlagen | — |
| Editor | Baum aus dem Inspektor | `msdyn_SaveCalendar` (`CalendarEventInfo` als JSON-String: IsEdit/InnerCalendarId, IsVaried/Action, RecurrenceSplit, RecurrenceEndDate, ObserveClosure, TimeZoneCode, ResourceId, UseV2), `msdyn_DeleteCalendar` — `PerformUnboundActionWithOrganization` |
| Vorlage anwenden | Baum der Vorlage (`msdyn_workhourtemplates.msdyn_calendarid`) | je Ressource: optional `RecurrenceEndDate` auf bestehende Wiederholungen (IsEdit) bzw. Delete späterer, dann Save der Vorlagenregeln ab Stichtag |
| Rückgängig | Snapshot (lokal, JSON) + aktueller Baum | Delete der neu entstandenen `InnerCalendarIds`, Save mit altem `RecurrenceEndDate` (offen = `9999-12-30`), Save gelöschter Regeln neu |
| Schließungen | Org-Kalender per `$expand` | `msdyn_BusinessClosureSave` (`Name`, `Start`, `End`); Löschen: Versuch `msdyn_DeleteCalendar` mit `EntityLogicalName = calendar` |
| Diagnose | Liste + Bäume + Slots; `bookableresourcebookings` als FetchXML-Aggregat (Buchungen ab heute je inaktiver Ressource) | — |

Identität: Benutzer-Connection am Dataverse-Konnektor; alles läuft mit den
Rechten des angemeldeten Nutzers, die Actions prüfen bei Benutzer-Ressourcen
das Eigenkalender-Recht über `ResourceId`. Nie `calendarrule`-Zeilen.

## Aufbau

```
src/
├── PowerProvider.tsx            # Host-Erkennung (Kopie aus series-planner)
├── config.ts                    # VITE_ORG_URL, Limits (50 je Lauf, 20 Läufe, 90/28 Tage), Defaults (TZ 110, UseV2)
├── strings.ts                   # alle UI-Texte (Deutsch)
├── types/calendar.ts            # Resource, Template, RawCalendar/Rule, CalendarTree/RuleBlock/LeafRule, Slot, Closure,
│                                # DayResolution, Finding, Work-Hours-API-Typen, RunRecord
├── fixtures/calendars.ts        # synthetische Bäume nach dem Modell (Builder makeBlock/makeClosure)
├── utils/
│   ├── dates.ts, timezones.ts   # Datum/Zeit, Intl-Zonen; Dataverse-Codes ↔ IANA
│   ├── rules.ts                 # Baum lesen (Wurzel/innere/Blatt, Rang, Muster, Gruppen), Beschreibung
│   ├── resolve.ts               # expandTree (Server-Nachbau: Rang, V2-Schnitt, Abwesenheit, Schließung), resolveDay
│   ├── engine.ts                # Server-Emulation von Save/Delete/BusinessClosureSave (Mock, Vorschau, Tests)
│   ├── intents.ts               # EditIntent → CalendarEventInfo; Validierung; Nachtschicht-Split; Pausen ausschneiden
│   ├── preview.ts               # Vorschau: Aufrufe auf Kopie des Baums, Tage vorher/nachher
│   ├── plan.ts, undo.ts         # Massenlauf-Plan, Rückgängig-Plan; runHistory.ts lokaler Verlauf
│   ├── holidays.ts              # Regelwerke DE/AT/CH, Osterformel, Abgleich
│   ├── diagnostics.ts           # Befunde 5.1–5.5
│   └── range.ts, format.ts, resourceFilter.ts, resourceResolution.ts, closures.ts, calendarStrings.ts
├── services/
│   ├── calendarService.ts       # Interface + Auswahl Dataverse/Mock, PrivilegeError
│   ├── dataverseApi.ts          # Konnektor über import.meta.glob (odata, fetchXml, unboundAction)
│   ├── dataverseCalendarService.ts
│   ├── runCalendarPlan.ts       # Lauf ausführen, sequentiell, Ergebnis je Schritt
│   ├── mockCalendarService.ts, mockData.ts
├── hooks/useLoad.ts, calendarData.ts
├── components/ shell/ resources/ calendar/ rules/ runs/ diagnostics/ views/ ui.tsx
└── help/helpContent.ts, HelpPanel.tsx
```

## Phase 0 — Discovery in Schulz UAT (für den Nutzer)

Remote nicht ausführbar (`pac auth` nur per Device Code und nur vom Nutzer
angestoßen). Alle FetchXML-Dateien liegen in `scripts/discovery/`, die
Ausgaben gehören nach `scripts/discovery/out/` (gitignored — Exporte können
Kundendaten enthalten; vor einer Übernahme als Fixture Namen anonymisieren,
nur die Struktur zählt).

```bash
# Anmeldung (einmalig) und Guard — Profil ist flüchtig, deshalb alles in einer Sitzung
pac auth create --deviceCode --environment https://operations-d365-schulz-uat-1-1.crm4.dynamics.com --name SchulzNEW
pac auth select --name SchulzNEW
pac org who                               # muss operations-d365-schulz-uat-1-1.crm4 zeigen

cd apps/work-hours-manager && mkdir -p scripts/discovery/out
D=scripts/discovery; O=$D/out

# 1) Metadaten der vier Actions (plus: gibt es „Vorlage anwenden“ oder ein Löschen für Schließungen?)
pac env fetch --xmlFile $D/01-actions-sdkmessages.xml > $O/01-actions-sdkmessages.txt
pac env fetch --xmlFile $D/02-actions-customapis.xml  > $O/02-actions-customapis.txt

# 2) Drei Ressourcen auswählen: eine wöchentlich mit Pause, eine „je Wochentag verschieden“,
#    eine mit Abwesenheit oder bearbeitetem Einzeltag (vorher ggf. im Formular anlegen)
pac env fetch --xmlFile $D/03-resources.xml > $O/03-resources.txt
for R in a b c; do   # je Ressource: Kalender-ID aus 03 eintragen
  sed "s/CALENDAR_ID/<calendarid-$R>/" $D/04-calendar-tree.xml > $O/04-tree-$R.xml
  pac env fetch --xmlFile $O/04-tree-$R.xml > $O/04-tree-$R.txt
done
# innere Kalender: die innercalendarid-Werte aus 04 in 05 eintragen (mehrere <value>)
sed -e "s/INNER_CALENDAR_ID_1/<id1>/" -e "s/INNER_CALENDAR_ID_2/<id2>/" $D/05-inner-calendars.xml > $O/05-inner.xml
pac env fetch --xmlFile $O/05-inner.xml > $O/05-inner.txt

# 3) Eine Vorlage — Kalender-ID (msdyn_calendarid) wie eine Ressource mit 04/05 exportieren
pac env fetch --xmlFile $D/06-templates.xml > $O/06-templates.txt

# 4) Geschäftsschließungen
pac env fetch --xmlFile $D/07-organization.xml > $O/07-organization.txt
sed "s/BUSINESS_CLOSURE_CALENDAR_ID/<businessclosurecalendarid>/" $D/08-closures.xml > $O/08-closures.xml
pac env fetch --xmlFile $O/08-closures.xml > $O/08-closures.txt

# 5) Zählungen: Ressourcen je Typ/Status, ohne Kalender, Vorlagen, Abwesenheitsanträge, Buchungen inaktiver Ressourcen
pac env fetch --xmlFile $D/09-counts-resources.xml > $O/09-counts-resources.txt
pac env fetch --xmlFile $D/10-counts-nocalendar.xml > $O/10-counts-nocalendar.txt
pac env fetch --xmlFile $D/11-counts-templates-timeoff.xml > $O/11-counts-templates.txt
sed -e "s/msdyn_workhourtemplate/msdyn_timeoffrequest/" -e "s/msdyn_workhourtemplateid/msdyn_timeoffrequestid/" $D/11-counts-templates-timeoff.xml > $O/11-timeoff.xml
pac env fetch --xmlFile $O/11-timeoff.xml > $O/11-counts-timeoff.txt
sed "s/DATUM/$(date +%F)/" $D/12-counts-bookings-inactive.xml > $O/12-bookings.xml
pac env fetch --xmlFile $O/12-bookings.xml > $O/12-counts-bookings-inactive.txt

# 6) Rechte des Testkontos
pac env fetch --xmlFile $D/13-my-roles.xml > $O/13-my-roles.txt
```

Falls `pac env fetch` den Join auf `calendarrule` ablehnt (die Tabelle
erlaubt kein eigenes `RetrieveMultiple`), denselben Baum im Browser holen —
so dokumentiert es die API-FAQ:

```text
https://operations-d365-schulz-uat-1-1.crm4.dynamics.com/api/data/v9.2/calendars(<calendarid>)?$expand=calendar_calendar_rules
https://operations-d365-schulz-uat-1-1.crm4.dynamics.com/api/data/v9.2/calendars?$filter=calendarid eq <inner1> or calendarid eq <inner2>&$expand=calendar_calendar_rules
```

Was aus den Ergebnissen entschieden wird, steht unter „Offen“.

## Verifiziert (Doku, 2026-10-05)

| Thema | Befund | Quelle |
| --- | --- | --- |
| `msdyn_SaveCalendar` | Ein String-Parameter `CalendarEventInfo` (JSON): `EntityLogicalName`, `CalendarId`, `RulesAndRecurrences[]` (Pflicht); `IsVaried`, `IsEdit`, `TimeZoneCode`, `InnerCalendarDescription` (nur Abwesenheit), `ObserveClosure`, `RecurrenceEndDate`, `RecurrenceSplit`, `ResourceId`, `UseV2`. Je Eintrag `Rules[]` (`StartTime`, `EndTime`, `WorkHourType`, `Effort`), `RecurrencePattern`, `InnerCalendarId`, `Action` 1–4. Antwort `InnerCalendarIds` (JSON-Array als String) | [Work hours calendar API](https://learn.microsoft.com/en-us/dynamics365/field-service/field-service-work-hours-calendar-api) (ms.date 2026-07-31) |
| `WorkHourType` | 0 Working, 1 Break, 2 Nonworking, 3 Time Off | ebd. |
| Muster | nur `FREQ=WEEKLY;INTERVAL=1;BYDAY=…` (BYDAY kürzbar, keine Leerzeichen); die FAQ nennt einmal `FREQ=DAILY` — wir folgen Tabelle und allen Beispielen (`WEEKLY`) | ebd. |
| Grenzen | Ereignis innerhalb eines Tages (Nachtschicht = zwei Aufrufe); Ganztag max. 5 Jahre, keine Ganztags-Wiederholung; keine Wiederholung für Nicht-Arbeit/Abwesenheit; Pausen nur zwischen Arbeitszeiten, nie allein löschbar; kein Löschen einer Einzelinstanz aus einer Wiederholung; `RecurrenceEndDate` mit Zeit ≤ 08:00:00 ⇒ Vortag | ebd. |
| Ränge | Doku: Rang 1 = Einzeltag (Arbeit/Nicht-Arbeit) und Abwesenheit, schlägt Rang 0 = wöchentliche Wiederholung; V2: schneidende Wiederholungen — die zuletzt geänderte gewinnt nur im Schnitt, V1: ganz. **Gespeichert wird es anders** (siehe „Verifiziert (live)“): die App entscheidet über das Muster, nicht über den Rang | ebd. („What happens if there are overlapping rules?“) |
| `msdyn_DeleteCalendar` | `EntityLogicalName`, `InnerCalendarId`, `CalendarId`, `IsVaried`, `UseV2`; Beispiel verpackt sie ebenfalls im String `CalendarEventInfo`; löscht alle inneren Regeln der Wiederholung | ebd. |
| `msdyn_LoadCalendars` | `LoadCalendarsInput` = `{StartDate, EndDate, CalendarIds[]}` → `CalendarEvents` = `{ "<calendarId>": [{CalendarId, InnerCalendarId, Start, End, Effort}] }` | ebd. |
| Zeitzonencodes | Tabelle der API-Doku (110 Berlin, 105 Paris, 95 Prag, 85 London, 92 UTC …) → `src/utils/timezones.ts`; `bookableresource.timezone` nutzt denselben Code-Raum | ebd., [bookableresource](https://learn.microsoft.com/en-us/dynamics365/developer/reference/entities/bookableresource) |
| Entitäten | `bookableresource`, `msdyn_resourcerequirement`, `msdyn_workhourtemplate`, `msdyn_project`; Vorlagen „können mit dieser API angelegt und aktualisiert werden“ — keine Apply-Template-Action dokumentiert | ebd. (FAQ) |
| `calendarrule` | Web API: nur Associate/Disassociate/Restore — „It is not possible to perform GET, POST, PATCH and DELETE operations with calendarrule“; lesbar nur über `calendars(...)?$expand=calendar_calendar_rules`. Spalten u. a. `pattern`, `starttime`, `duration`, `effort`, `timecode`, `subcode`, `rank`, `timezonecode`, `effectiveintervalstart/end`, `extentcode`, `offset` („Start offset for leaf nonrecurring rules“), `groupdesignator`, `isvaried`, `innercalendarid` | [calendarrule](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/reference/entities/calendarrule), [Calendar entities](https://learn.microsoft.com/en-us/dynamics365/customerengagement/on-premises/developer/calendar-entities) |
| TimeCode / SubCode | SDK-Enums: TimeCode 0 Available, 1 Busy, 2 Unavailable, 3 Filter; SubCode 0 Unspecified, 1 Schedulable, 2 Committed, 3 Uncommitted, 4 Break, 5 Holiday, 6 Vacation, 7 Appointment … | [TimeCode](https://learn.microsoft.com/en-us/dotnet/api/microsoft.crm.sdk.messages.timecode), [SubCode](https://learn.microsoft.com/en-us/dotnet/api/microsoft.crm.sdk.messages.subcode) |
| `msdyn_BusinessClosureSave` | Unbound, `Name`, `Start`, `End` (ISO); Kalender-ID ermittelt der Server („there's only one Business Closures calendar“). Kein Löschen beschrieben | [TrueNorth](https://truenorthit.co.uk/creating-business-closures-with-the-dynamics-365-api/) |
| `msdyn_workhourtemplate` | Entity-Set `msdyn_workhourtemplates`, `msdyn_calendarid` ist eine **Textspalte** (200), `msdyn_bookableresourceid` = Vorlagen-Ressource | [msdyn_workhourtemplate](https://learn.microsoft.com/en-us/dynamics365/field-service/developer/reference/entities/msdyn_workhourtemplate) |
| `msdyn_timeoffrequest` | `msdyn_starttime`, `msdyn_endtime`, `msdyn_resource`, `msdyn_approvedby`; nur statecode Aktiv/Inaktiv, kein eigenes Genehmigungsfeld dokumentiert | [msdyn_timeoffrequest](https://learn.microsoft.com/en-us/dynamics365/field-service/developer/reference/entities/msdyn_timeoffrequest) |

## Verifiziert (live, Schulz UAT)

**Lesen (2026-10-06)** — Stichprobe 120 aktive Ressourcenkalender, 244 innere
Kalender, Web API und `msdyn_LoadCalendars` direkt; anonymisiert als Fixture
`live` (`src/fixtures/calendars.ts`) und Test (`src/utils/live.test.ts`).

| Thema | Befund |
| --- | --- |
| Regeln lesen | `calendars?$filter=…&$expand=calendar_calendar_rules` liefert die Regeln **leer** (nur `@odata.nextLink`); `calendars(<id>)?$expand=…` liefert sie. Verschachteltes `$expand` auf die inneren Kalender lehnt Dataverse ab („Only many-to-one relationships are supported for nested expansion“) ⇒ ein Abruf je Kalender. `calendarrule` per FetchXML: „RetrieveMultiple … does not support entities of type 'calendarrule'“ |
| Mengen | 850 aktive Ressourcen, ~2,4 Wurzelregeln und ~2 innere Kalender je Ressource; insgesamt > 50.000 Kalender (Aggregat-Limit). Web API direkt: 120 Kalender in 3 s, 244 innere in 4,5 s bei 8 parallel |
| Formen | nur fünf: `WEEKLY` + BYDAY Rang 2 (offen oder beendet), `DAILY;COUNT=1` Rang 0 extentcode 1 (Einzeltag), `YEARLY` Rang 1 extentcode 2 (Feiertagsliste, offen oder beendet). Innere Blätter der Wochen-/Tagesregeln: `offset` + `duration`, ohne `starttime`, TimeCode 0/SubCode 1 (Arbeit), vereinzelt 3/10 (Kapazitätsfilter) |
| Vorrang | per `msdyn_LoadCalendars` belegt: **Einzeltag (0) schlägt Feiertag (1) schlägt Woche (2)** — der kleinere Rang gewinnt. Arbeitstag am Feiertag 31.10. ⇒ Slot 07–15; ohne Einzeltag ⇒ nur Feiertags-Slot |
| Intervallende | `effectiveintervalend` ist die **exklusive** nächste Mitternacht (Regel endet `2025-09-10T00:00:00Z`, Nachfolgerin beginnt am 10.09.); offen = `9999-12-30T00:00:00Z`; `effectiveintervalstart` leer, Start = `starttime` (`T00:00:00Z`) |
| `groupdesignator` | alle 168 Wochenregeln tragen dieselbe feste ID `FC5769FC-4DE9-445D-8F4E-6E9869E60857`, `isvaried` false — **keine** „je Wochentag verschieden“-Gruppe. Gruppe nur bei `isvaried` true |
| Feiertagslisten | inneres Blatt je Feiertag: `FREQ=DAILY;INTERVAL=1;COUNT=1`, TimeCode 2/SubCode 5, `starttime` als echter UTC-Zeitpunkt der lokalen Mitternacht — aber aus verschiedenen Offsets geschrieben (21:00Z–23:00Z) ⇒ die App rundet auf die nächste lokale Mitternacht |
| `msdyn_LoadCalendars` | `CalendarEvents` ist ein JSON-String; `Start`/`End` im WCF-Format `/Date(1791176400000)/`; Slots enthalten auch Nicht-Arbeit (`TimeCode` 2, `SubCode` 5 Feiertag) |

**Schreiben (2026-10-06, NAAF-Backup)** — über die App (Editor, Konnektor,
Benutzer-Connection, `UseV2` an) an „Max Mustermann“ (Berlin) und zwei
Test-Benutzern (UTC), jeder Fall danach per Web API (Rohbaum) und
`msdyn_LoadCalendars` geprüft. Ausgangsstand wiederhergestellt bzw. als
Testdaten belassen (KW 45–52/2026).

| Fall | Ergebnis (gespeicherte Form) | Status |
| --- | --- | --- |
| Arbeitszeit einmal | `DAILY;COUNT=1`, Rang 0, extentcode 1, Ende = nächste Mitternacht, Blatt `offset`/`duration`; Slot 08–12 | ✅ |
| Wöchentlich mit Pause | **ein** Arbeitsblatt über die ganze Spanne (08–17) + Pausenblatt darüber; `msdyn_LoadCalendars` liefert Arbeit **ungeschnitten** und die Pause als eigenes Ereignis (TimeCode 2/SubCode 4) ⇒ App schneidet (Fix) | ✅ nach Fix |
| `ObserveClosure` | erzeugt eine Wurzel `YEARLY` Rang 1 extentcode 2, deren innerer Kalender **der Org-Schließungskalender selbst** ist (kein Schnappschuss — neue Schließungen wirken sofort); je Speichern mit Beachten eine weitere Wurzel | ✅ |
| Abwesenheit mit Grund | `DAILY;COUNT=1`, Rang 0, extentcode 2, Wurzel-Beschreibung „Time Off Rule“; der Grund (`InnerCalendarDescription`) landet im **`name` des inneren Kalenders** (Fix: App las `description`) | ✅ nach Fix |
| Nicht-Arbeit mit Uhrzeit | `DAILY;COUNT=1`, Rang 0, extentcode 2, „Not Working“; schneidet nur 13–15 heraus, 07–13 bleibt (Fix: App nahm den ganzen Tag) | ✅ nach Fix |
| Bearbeiten ganze Wiederholung | `IsEdit` + `InnerCalendarId`: ID bleibt, Zeiten geändert, Pause bleibt | ✅ |
| „Dieser und folgende“ | `RecurrenceSplit`: alte Regel endet exklusiv am Split-Tag, neue Regel mit neuer ID | ✅ |
| Einzeltag aus Wiederholung | **mit** `InnerCalendarId` (ohne `IsEdit`) ersetzt der Server die **ganze Wiederholung** durch diesen Tag — Wochenregel weg (aufgetreten, repariert). Richtig: neuer Einzeltag **ohne** `InnerCalendarId`, Rang 0 schlägt die Woche (Fix) | ✅ nach Fix |
| Wiederholung beenden | `RecurrenceEndDate` `T23:59:59Z` wird so gespeichert (inklusiv), letzter Tag stimmt | ✅ |
| Löschen | `msdyn_DeleteCalendar` (String `CalendarEventInfo`, `UseV2`) entfernt Wurzel + inneren Kalender | ✅ |
| Je Wochentag verschieden | Teile mit `isvaried` true, aber derselben festen Wochen-ID — **keine Gruppe**; `IsVaried`-Delete löscht nur den einen Teil | ✅ (Modell angepasst) |
| `UseV2` / Überschneidung | Parameter akzeptiert. Neue Wiederholung über bestehender: alte endet am Vortag, ihre **übrigen Wochentage** laufen als neue Regel weiter; an gemeinsamen Wochentagen gelten nur die neuen Zeiten (keine Mischung) — Vorschau angepasst | ✅ nach Fix |
| Vorlage auf 3 Ressourcen | Lauf: 3 Wiederholungen bzw. je 1 enden am Vortag, Vorlage ab Stichtag in der Zeitzone der Ressource; Rückgängig: Vorlagenregel gelöscht, Enden wiederhergestellt (offen über `9999-12-30T23:59:59Z` angenommen) | ✅ |
| Schließung anlegen | `msdyn_BusinessClosureSave`: Wurzelregel im Org-Kalender, Zeitzone -1, `starttime` = UTC der lokalen Mitternacht | ✅ |
| Schließung löschen | `msdyn_DeleteCalendar` lehnt ab („not enabled for given entity logical name“); **`msdyn_BusinessClosureDelete`** mit `Ids` = `calendarruleid` (String, kein JSON-Array) löscht (Fix) | ✅ nach Fix |
| Nachtschicht | nicht getestet (zwei Einzeltage wie oben) | offen |
| Rechtefehler | braucht ein Konto ohne Kalenderrecht | offen |
| Abgleich mit dem Schedule Board | UAT (nur lesend) und NAAF: Board-Arbeitszeit = `msdyn_LoadCalendars` = App bei allen Stichproben (07–15, 07–15:45 mit Regel in Berlin bei UTC-Ressource, 24/7, Wochenende 09–13 bis zum Regelende). Befund 5.3: dieselben 31 Ressourcen wie unabhängig nachgerechnet; das Board zeigt aber die Zeiten der **Regel**, die Ressourcen-Zeitzone verschiebt dort nichts — Text korrigiert (Risiko: neue Regeln entstehen in der Ressourcen-Zeitzone). Befund 5.1 rechnete mit den Slots der angezeigten Woche (Zurückblättern ⇒ alle „ohne Arbeitszeit“) — jetzt eigene Abfrage ab heute, Fenster 28 Tage | ✅ nach Fix |

Weitere Funde beim Test: Einrichtungsprüfung `msdyn_LoadCalendars` schickte
eine leere ID-Liste (Server lehnt ab, Fix); Suche verlor Tastendrücke
(Transition auf kontrolliertem Feld, Fix); nach jedem Speichern wurden alle
Wurzelregeln neu geladen (jetzt nur die geänderten Kalender). Der
Power-Apps-Player liefert nach einem Push oft noch die alte Version —
„Einrichtung“ zeigt deshalb die Build-Zeit.

## Einrichtung (Schulz UAT)

Voraussetzung: Field Service / URS in der Umgebung, Konto mit Lese- und
Schreibrecht auf Kalender, Ressourcen, Vorlagen und dem Eigenkalender-Recht
(„Service Management“). Die App braucht **nur den Dataverse-Konnektor** mit
einer **Benutzer-Connection** (keine SP-Connection — sonst schreibt jeder
Nutzer mit den Rechten des SP) und die Org-URL. Profilwahl, Prüfung und
schreibende Aktion gehören in **einen** Aufruf (Root-`AGENTS.md`); alle
Logins per Device Code und nur, wenn der Nutzer sie anstößt.

```bash
cd apps/work-hours-manager && npm install
pac auth select --name SchulzNEW && pac org who         # muss operations-d365-schulz-uat-1-1.crm4 zeigen
pac code init --environment 2eaa34de-dcf1-e949-86d9-82d9fd748045 \
  --displayName "Arbeitszeiten & Kalender" --buildPath "./dist" \
  --fileEntryPoint "index.html" --appUrl "http://localhost:3000"
pac code add-data-source -a shared_commondataserviceforapps -c <connection-id>   # Benutzer-Connection (UAT: 4a9f0463…)
cp .env.example .env   # VITE_ORG_URL=https://operations-d365-schulz-uat-1-1.crm4.dynamics.com
npm run build && npm run dev                              # „Local Play“ im Host, Bereich „Einrichtung“: alles grün?
```

`power-apps init` / `power-apps push` (npm-CLI) sind gleichwertig; das Ziel
bestimmt allein die `environmentId` in `power.config.json`. Vor dem Push
prüfen, dass dort `2eaa34de-…` steht. Push und Deployment nur nach
Rücksprache; dann Live-Test nach der Tabelle oben, Ergebnisse eintragen.

Gegenprobe ASC-Playground (ohne Field Service): Ressourcenliste leer ⇒ die
App zeigt den Hinweis „Keine Ressourcen sichtbar …“, Diagnose ohne Befunde.

## Deployment-Stand

| Umgebung | Env-ID | App-ID | Stand |
| --- | --- | --- | --- |
| Schulz UAT (`operations-d365-schulz-uat-1-1.crm4`) | `2eaa34de-dcf1-e949-86d9-82d9fd748045` | `31f2b956-b6d4-439f-ae01-d3186ae9208e` | gepusht 2026-10-06 15:23 (Stand nach Schreibtests und Board-Abgleich; der Build von 14:25 war auf „Einrichtung“ geprüft, alle Prüfungen grün), Connector an Benutzer-Connection `4a9f0463…` (EX-Andy.Schwarz). In UAT selbst nur gelesen |
| Schulz NAAF-Backup (`naafbackup.crm4`) — **Schreibtests** | `d9dd9afb-2514-e7ee-b5a6-9da89a5d9352` | `d4c81e52-50b9-4d41-bb98-1e4c8179b134` | gepusht 2026-10-06 15:23 (pac-Profil `NaafBackup`), Connector an Benutzer-Connection `311edd70…` (EX-Andy.Schwarz). 840 aktive Ressourcen; Schreibtests siehe „Verifiziert (live)“, Testregeln an „Max Mustermann“ in KW 45–52/2026 |

Zwei Umgebungen, eine `power.config.json`: die jeweils aktive liegt im
App-Ordner, beide Stände gesichert unter `.power/envs/<schulz-uat|naaf-backup>/`
(`power.config.json` + `.env`, gitignored). Umschalten = beide Dateien
zurückkopieren, dann `npm run build` (die Org-URL wird eingebaut) und Push mit
Profil + Guard in **einem** Aufruf. Aktiv ist derzeit **Schulz UAT**.

Danach ASC-Playground als Gegenprobe. Push nur nach Rücksprache. Weiterer
Ausbau: [`Roadmap.md`](Roadmap.md).

## Offen

**Entscheidungen nach Phase 0**

- **UseV2 ja/nein.** Default **an**; der Server nimmt den Parameter an
  (NAAF-Backup). Wie sich Überschneidungen **ohne** V2 verhalten, ist nicht
  getestet.
- **Schließungen löschen.** Gelöst: `msdyn_BusinessClosureDelete` (`Ids`).

**Annahmen, die remote nicht verifizierbar sind** (Fixtures und Mock folgen
ihnen; der Phase-0-Export bestätigt oder korrigiert sie in `rules.ts`):

- Zeitfelder der Wurzelregeln sind Datumswerte (`T00:00:00Z`, live belegt);
  `effectiveintervalend` ist exklusiv (live belegt, `lastDayOf`). Offen: Ob
  Pausen, Abwesenheiten und Nicht-Arbeit (in der Stichprobe nicht vorhanden)
  dieselbe Form haben.
- Blattregeln tragen ihren Typ in `timecode`/`subcode` nach den SDK-Enums:
  Arbeit 0/1 und Feiertag 2/5 live belegt; Pause 2/4, Abwesenheit 2/6,
  Nicht-Arbeit 2/0 nach Doku (`classifyRule`). `offset` = Minuten ab
  Mitternacht (live belegt für Arbeit).
- Die Teile einer „je Wochentag verschieden“-Wiederholung teilen einen
  `groupdesignator` **mit `isvaried` true** (in der Stichprobe nicht
  vorhanden); `IsVaried`-Delete entfernt alle Teile. Die feste Wochen-ID ist
  keine Gruppe (live belegt).
- ~~Bearbeiteter Einzeltag innerhalb einer Wiederholung~~ — geklärt: als
  eigener Einzeltag **ohne** `InnerCalendarId` (siehe „Verifiziert (live)“).
- Serialisierung: `UseV2: true` (Doku-Typ „Flag“), `IsEdit: true` als Boolean
  (die Beispiele zeigen `"true"` als String), Delete im String
  `CalendarEventInfo` wie im Beispiel. Lehnt der Server eine Form ab, wird
  einmal die andere versucht und gemerkt (Phase 3).
- `RecurrenceEndDate` senden wir als `<Datum>T23:59:59Z`, damit das gewählte
  Datum der letzte Tag bleibt (≤ 08:00 wäre der Vortag).
- `ResourceId` bei Benutzer-Ressourcen: Doku sagt „SystemUserId or
  ResourceId“ — wir senden die `systemuserid`; bei Ablehnung die
  `bookableresourceid`.
- Der Dataverse-Konnektor reicht `CalendarEventInfo` als String durch
  (Risiko (a) des Konzepts; Ausweg native Dataverse-API wie Translation
  Studio). `msdyn_LoadCalendars` über den Konnektor ist auch in der
  Serienplanung noch unverifiziert.
- Geschäftsschließungen: Zeitraum = `starttime` + `duration` (so liest es die
  Serienplanung); `ObserveClosure` je Regel ist im Baum nicht erkennbar — die
  Slots sind die Wahrheit, die Vorschau nimmt „beachtet“ an.
- Die IANA-Zuordnung je Zeitzonencode (`timezones.ts`) ist unsere, die Codes
  und Labels stammen aus der Doku.
- Regionale Feiertage: Regelwerke aus eigenem Wissen (Stand 2026), ohne
  kantonale Sonderfälle der Schweiz und ohne Augsburger Friedensfest.
- ~~Offenes Ende per `RecurrenceEndDate = 9999-12-30T23:59:59Z`~~ — geklärt:
  angenommen (Rückgängig in NAAF-Backup).
- Beim Bearbeiten einer Wiederholung senden wir `StartTime` mit dem
  ursprünglichen Startdatum (wie das Doku-Beispiel), beim Split mit dem
  Teilungsdatum. Für Teile einer Gruppe (`IsVaried`) wählen wir `Action 3`,
  wenn nur Zeiten/Kapazität sich ändern, sonst `4`; die Doku beschreibt nicht,
  was passiert, wenn man sich vertut.
- Der Massenlauf interpretiert die Zeiten der Vorlage in der **Zeitzone der
  Ressource** (`TimeZoneCode` = `bookableresource.timezone`), nicht in der
  Zeitzone der Vorlagenregeln.
- `msdyn_LoadCalendars` über den Konnektor liefert `CalendarEvents` als
  String mit WCF-Datumswerten (live belegt) — die App akzeptiert String und
  Objekt, ISO und `/Date(…)/`.
- Schließungen werden ganztägig in der **Anzeige-Zeitzone** angelegt; die
  Organisation könnte eine andere Zeitzone erwarten.
- Verlauf und Snapshot liegen nur im Browser (`localStorage`, letzte 20);
  ein großer Lauf kann das Speicherlimit erreichen — dann bleibt der
  JSON-Download.

## Entwickeln

```bash
npm install
npm run dev      # http://localhost:3000 — ohne Host: Mock-Daten (14 fiktive Ressourcen, 4 Vorlagen, Schließungen; Save/Delete emuliert)
npm run test     # Vitest: dates, timezones, rules, resolve, engine, intents (+preview), plan (+undo, runPlan), holidays, diagnostics, help
npm run build    # tsc -b && vite build
npm run lint
```

`power.config.json`, `src/generated/`, `.power/` und `.env` sind gitignored.
Der Dataverse-Konnektor wird per `import.meta.glob` geladen — der Build
bleibt auch ohne `src/generated/` grün, „Einrichtung“ zeigt dann, was fehlt.
Keine Kundendaten im Repo: Mock und Fixtures sind erfunden (`src/services/mockData.ts`,
`src/fixtures/calendars.ts`).
