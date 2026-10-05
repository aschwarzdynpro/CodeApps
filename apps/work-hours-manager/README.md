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
| 1 Fundament | Scaffold, Domänentypen, `rules`/`resolve`/`timezones`/`holidays` mit Tests, Mock inkl. Server-Emulation der Actions | fertig, `npm test` grün |
| 2 Lesen | Shell, Ressourcenliste, Wochen-/Monatskalender mit Herkunft, Regel-Inspektor, Diagnose 5.1–5.5, Dataverse-Reads | in Arbeit |
| 3 Einzel-Edit | `intents.ts`, Editor mit Vorschau, Save/Delete | offen |
| 4 Massenlauf | `plan`/`undo`, Assistent, Verlauf, Rückgängig | offen |
| 5 Feiertage & Abschluss | Schließungen, Jahr aus Regelwerk, Hilfe, Doku | offen |

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
| Ränge | Rang 1 = Einzeltag (Arbeit/Nicht-Arbeit) und Abwesenheit, schlägt Rang 0 = wöchentliche Wiederholung; V2: schneidende Rang-0-Regeln — die zuletzt geänderte gewinnt nur im Schnitt, V1: ganz | ebd. („What happens if there are overlapping rules?“) |
| `msdyn_DeleteCalendar` | `EntityLogicalName`, `InnerCalendarId`, `CalendarId`, `IsVaried`, `UseV2`; Beispiel verpackt sie ebenfalls im String `CalendarEventInfo`; löscht alle inneren Regeln der Wiederholung | ebd. |
| `msdyn_LoadCalendars` | `LoadCalendarsInput` = `{StartDate, EndDate, CalendarIds[]}` → `CalendarEvents` = `{ "<calendarId>": [{CalendarId, InnerCalendarId, Start, End, Effort}] }` | ebd. |
| Zeitzonencodes | Tabelle der API-Doku (110 Berlin, 105 Paris, 95 Prag, 85 London, 92 UTC …) → `src/utils/timezones.ts`; `bookableresource.timezone` nutzt denselben Code-Raum | ebd., [bookableresource](https://learn.microsoft.com/en-us/dynamics365/developer/reference/entities/bookableresource) |
| Entitäten | `bookableresource`, `msdyn_resourcerequirement`, `msdyn_workhourtemplate`, `msdyn_project`; Vorlagen „können mit dieser API angelegt und aktualisiert werden“ — keine Apply-Template-Action dokumentiert | ebd. (FAQ) |
| `calendarrule` | Web API: nur Associate/Disassociate/Restore — „It is not possible to perform GET, POST, PATCH and DELETE operations with calendarrule“; lesbar nur über `calendars(...)?$expand=calendar_calendar_rules`. Spalten u. a. `pattern`, `starttime`, `duration`, `effort`, `timecode`, `subcode`, `rank`, `timezonecode`, `effectiveintervalstart/end`, `extentcode`, `offset` („Start offset for leaf nonrecurring rules“), `groupdesignator`, `isvaried`, `innercalendarid` | [calendarrule](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/reference/entities/calendarrule), [Calendar entities](https://learn.microsoft.com/en-us/dynamics365/customerengagement/on-premises/developer/calendar-entities) |
| TimeCode / SubCode | SDK-Enums: TimeCode 0 Available, 1 Busy, 2 Unavailable, 3 Filter; SubCode 0 Unspecified, 1 Schedulable, 2 Committed, 3 Uncommitted, 4 Break, 5 Holiday, 6 Vacation, 7 Appointment … | [TimeCode](https://learn.microsoft.com/en-us/dotnet/api/microsoft.crm.sdk.messages.timecode), [SubCode](https://learn.microsoft.com/en-us/dotnet/api/microsoft.crm.sdk.messages.subcode) |
| `msdyn_BusinessClosureSave` | Unbound, `Name`, `Start`, `End` (ISO); Kalender-ID ermittelt der Server („there's only one Business Closures calendar“). Kein Löschen beschrieben | [TrueNorth](https://truenorthit.co.uk/creating-business-closures-with-the-dynamics-365-api/) |
| `msdyn_workhourtemplate` | Entity-Set `msdyn_workhourtemplates`, `msdyn_calendarid` ist eine **Textspalte** (200), `msdyn_bookableresourceid` = Vorlagen-Ressource | [msdyn_workhourtemplate](https://learn.microsoft.com/en-us/dynamics365/field-service/developer/reference/entities/msdyn_workhourtemplate) |
| `msdyn_timeoffrequest` | `msdyn_starttime`, `msdyn_endtime`, `msdyn_resource`, `msdyn_approvedby`; nur statecode Aktiv/Inaktiv, kein eigenes Genehmigungsfeld dokumentiert | [msdyn_timeoffrequest](https://learn.microsoft.com/en-us/dynamics365/field-service/developer/reference/entities/msdyn_timeoffrequest) |

## Offen

**Entscheidungen nach Phase 0**

- **UseV2 ja/nein.** Default **an** (Konzept: einheitlich, mit Erklärung der
  Überlappungslogik in der Hilfe; umschaltbar in der Toolbar). Aus 01/02:
  akzeptiert die URS-Version in UAT den Parameter? Aus den Bäumen: liegen
  schon mehrere Rang-0-Regeln parallel (V2-Verhalten)? Gemischte Bäume meldet
  die Diagnose (v2-Befund 5.6).
- **Schließungen löschen.** Nicht dokumentiert. Reihenfolge: (1) zeigt 02 eine
  Custom API `msdyn_BusinessClosure*Delete`?; (2) Live-Versuch
  `msdyn_DeleteCalendar` mit `EntityLogicalName = calendar`, `CalendarId` =
  Org-Schließungskalender, `InnerCalendarId` = `calendarruleid` der
  Schließung (so ist es implementiert, `deleteClosure`); (3) sonst bleibt nur
  der Hinweis „im Admin-Center löschen“, die App zeigt ihn dann statt des
  Löschen-Buttons.

**Annahmen, die remote nicht verifizierbar sind** (Fixtures und Mock folgen
ihnen; der Phase-0-Export bestätigt oder korrigiert sie in `rules.ts`):

- Zeitfelder der Regeln (`starttime`, `effectiveintervalstart/end`) sind
  „UTC-naiv“: der Zeitanteil ist die Ortszeit der `timezonecode` — dieselbe
  Konvention wie `StartTime`/`EndTime` der API. `effectiveintervalend` gilt
  als letzter Tag (inklusiv); `9999-…` = offenes Ende.
- Blattregeln tragen ihren Typ in `timecode`/`subcode` nach den SDK-Enums:
  Arbeit 0/1, Pause 2/4, Schließung 2/5, Abwesenheit 2/6, Nicht-Arbeit 2/0
  (`classifyRule`). `offset` = Minuten ab Mitternacht; bei nicht
  wiederkehrenden Blättern evtl. Minuten ab Intervallbeginn.
- Die Teile einer „je Wochentag verschieden“-Wiederholung teilen einen
  `groupdesignator`; `IsVaried`-Delete entfernt alle Teile.
- Ein **bearbeiteter Einzeltag innerhalb einer Wiederholung** (Doku: Aufruf
  ohne `IsEdit`, mit `InnerCalendarId` der Wiederholung; die Antwort nennt
  dieselbe ID) — wo liegt er im Baum? Mock und Vorschau modellieren ihn als
  eigenen Rang-1-Block. Genau diesen Fall vorher im Formular anlegen und
  exportieren.
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

## Entwickeln

```bash
npm install
npm run dev      # http://localhost:3000 — ohne Host: Mock-Daten (14 fiktive Ressourcen, 4 Vorlagen, Schließungen)
npm run test     # Vitest: dates, timezones, rules, resolve, holidays, mockEngine
npm run build    # tsc -b && vite build
npm run lint
```

`power.config.json`, `src/generated/`, `.power/` und `.env` sind gitignored.
Der Dataverse-Konnektor wird per `import.meta.glob` geladen — der Build
bleibt auch ohne `src/generated/` grün, „Einrichtung“ zeigt dann, was fehlt.
Keine Kundendaten im Repo: Mock und Fixtures sind erfunden (`src/services/mockData.ts`,
`src/fixtures/calendars.ts`).
