# My Day — Generative Page (Waldmann)

Eine Seite in **Sales Hub** der Waldmann-Umgebung D365 DEV, die sieben
Ansichten ersetzt: die eigenen offenen Termine, Aufgaben und Projektaufgaben
nach Fälligkeit gebuckelt, dazu die eigenen offenen Leads, Projekte,
Projektanfragen und Workorders mit einem Stillstands-Badge.

Vorläufer war „Mein Tag" im ASC-Playground (activitypointer + Opportunities +
Leads, nur Deutsch; Code in der Git-Historie bis Commit 49e7dec). Die Gen Page
*ist* die App, deshalb liegen ihre Dateien direkt in `apps/my-day/`.

## Datenmodell

| Tabelle | Gelesene Spalten | „Meine" = | Offen = |
| --- | --- | --- | --- |
| `appointment` | `activityid`, `subject`, `scheduledstart`, `scheduledend`, `prioritycode`, `location`, `_regardingobjectid_value` | Besitzer | `statecode` 0 oder 3 (Scheduled) |
| `task` | `activityid`, `subject`, `scheduledstart`, `scheduledend`, `prioritycode`, `_regardingobjectid_value` | Besitzer | `statecode` 0 |
| `wal_projecttask` | wie `task` plus `wal_category_opt` | Besitzer | `statecode` 0 oder 3 |
| `lead` | `leadid`, `firstname`, `lastname`, `companyname`, `subject`, `leadqualitycode`, `statuscode`, `modifiedon` | Besitzer | `statecode` 0 |
| `wal_project` | `wal_projectid`, `wal_projectsnumber_int`, `wal_projectdesignation_txt`, `wal_city_txt`, `wal_projectpotential_cur`, `wal_followupdate_dat`, `wal_decisiondate_dat`, `statuscode`, `modifiedon`, `_ownerid_value`, `_wal_endcustomer_id_value`, `_wal_areasalesmanager_id_value`, `_wal_keyaccountmanager_id_value`, `_wal_projectmanager_id_value` | Besitzer **oder** GVL, KAM, Projektleiter | `statecode` 0 |
| `wal_projectinquiry` | `wal_projectinquiryid`, `wal_topic_txt`, `wal_city_txt`, `wal_projectpotential_cur`, `wal_deadline_dat`, `wal_resubmissiondate_dat`, `wal_decisiondate_dat`, `statuscode`, `modifiedon`, Rollen-Lookups wie Projekt plus `_wal_responsibleperson_id_value`, `_wal_customer_id_value`, `_wal_endcustomer_id_value` | wie Projekt plus Verantwortlicher | `statecode` 0 |
| `msdyn_workorder` | `msdyn_workorderid`, `msdyn_name`, `msdyn_workordersummary`, `msdyn_systemstatus`, `wal_projectdesignation_fx`, `wal_startdatebooking_dat`, `wal_installationpreferreddate_dat`, `modifiedon`, `_ownerid_value`, `_msdyn_serviceaccount_value`, `_msdyn_substatus_value`, `_wal_project_id_value`, `_wal_projectmanager_id_value` | Besitzer oder Projektleiter | `statecode` 0 und `msdyn_systemstatus` nicht Completed (690970003) / Posted (690970004) / Canceled (690970005) |
| `usersettings` | `dateformatstring`, `dateseparator` | — | — |

Die sieben Abfragen laufen parallel und werden **einzeln abgefangen**: fällt
eine Tabelle aus (typisch: fehlende Leserechte auf `msdyn_workorder`), zeigt
die Seite den Rest und nennt die fehlende Tabelle in einer Warnung. Buckets
(Heute / Überfällig / Demnächst / Ohne Termin), Typfilter, Stillstand und
„Nur stille" werden im Client berechnet — ein Filterwechsel lädt nicht nach.

**Termin vs. Aufgabe:** Ein Termin zählt an seinem Beginn (`scheduledstart`),
eine Aufgabe an ihrem Ende (`scheduledend`, Fallback `scheduledstart`).

**Rollen:** Bei Projekten, Anfragen und Workorders vergleicht die Seite die
Rollen-Lookups mit dem angemeldeten Benutzer und zeigt die Treffer als
Outline-Badges (GVL / KAM / PL / Besitzer / Verantwortlich). Die Legacy-
Ansicht „Meine Projekte" filtert nur auf GVL — hier bewusst breiter, weil es
ein Überblick ist.

**Primärfeld der Projektanfrage** ist `wal_topic_txt` — im generierten Typ
gibt es kein `wal_name`.

**Nur-Datum-Spalten** (`*_dat`) kommen als `yyyy-MM-dd`; `parseDate` liest sie
als lokales Datum, sonst rutscht der Tag in westlichen Zeitzonen um eins.

## Was die Seite kann

- KPI-Leiste: Heute fällig, Überfällig, Leads, Projekte, Projektanfragen,
  Workorders
- Aktivitäten als Tabs mit Zähler plus Typfilter (Alle / Termine / Aufgaben /
  Projektaufgaben), sortierbares DataGrid, Hoch-Priorität fett und als Badge,
  überfällige Termine rot; bei Projektaufgaben die Kategorie, bei Terminen der
  Ort unter dem Typ
- Datensatz-Tabs Leads / Projekte / Anfragen / Workorders mit Karten:
  Statusgrund, Potential als FormattedValue, Nachfass-/Wiedervorlage-/Frist-/
  Einsatzdatum (überschrittene rot), Rollen-Badges
- „N Tage still"-Badge ab dem Schwellwert (7 / 14 / 30 Tage im Header), ab dem
  Doppelten rot; Schalter „Nur stille"
- Drei UI-Sprachen (en-US, de-DE, fr-FR) nach `userSettings.languageId`;
  Dataverse-Beschriftungen kommen als FormattedValue vom Server
- Öffnen jedes Datensatzes in seinem Formular, per Klick oder Tastatur
- Datumsformat aus den Dataverse-Benutzereinstellungen
- De-dupe gegen den Double-Mount des Genpage-Hosts

## Bewusst nicht drin

Aktivitäten aus der Seite heraus abschließen. Das geht per `updateRow` auf der
konkreten Tabelle mit den Statuswerten des jeweiligen Typs (`task`: 1/5,
`appointment`: 1/3, `wal_projecttask`: 1/2). Sauberer eigener Schritt.

## Deployment-Stand

| | |
| --- | --- |
| Umgebung | Waldmann D365 DEV — `https://waldmann-dev.crm4.dynamics.com` (Env `33146d71-4fe8-e1d7-af2f-f80fe968fc47`) |
| App | Sales Hub, App ID `1273fbf5-a1ff-ee11-9f89-000d3aad2055` |
| Page ID | _noch nicht hochgeladen_ |

### Datenlage beim Bau (2026-09-21)

Gezählt per `pac env fetch`, offene Datensätze gesamt / davon Besitzer
`AAD_ADM_HSO_Schwarz@waldmann.onmicrosoft.com` (Andy Schwarz):

| Tabelle | gesamt | meine |
| --- | --- | --- |
| `appointment` | 2 | 0 |
| `task` | 38 | **6** |
| `wal_projecttask` | 176 | **11** |
| `lead` | 44 | **10** |
| `wal_project` | 103 | **64** (16 als Besitzer, Rest als GVL/KAM/PL) |
| `wal_projectinquiry` | 9 | **4** |
| `msdyn_workorder` | 108 (davon 83 offen) | **2** |

Das pac-Profil `Waldmann` ist ein Application User — „meine" Datensätze lassen
sich nur im Browser mit dem eigenen Konto prüfen.

### Befehle

```bash
pac model genpage generate-types \
  --data-sources "appointment,task,wal_projecttask,lead,wal_project,wal_projectinquiry,msdyn_workorder,usersettings" \
  --output-file ./RuntimeTypes.ts

pac model genpage upload \
  --app-id 1273fbf5-a1ff-ee11-9f89-000d3aad2055 \
  --code-file ./MyDay.tsx \
  --name "My Day" \
  --data-sources "appointment,task,wal_projecttask,lead,wal_project,wal_projectinquiry,msdyn_workorder,usersettings" \
  --prompt-file ./prompt.md \
  --agent-message "My Day: my activities by due date plus my open leads, projects, inquiries and work orders" \
  --add-to-sitemap
```

`RuntimeTypes.ts` ist generiert und umgebungsspezifisch — gitignored.

## Geprüft

- `tsc --noEmit --noUnusedLocals` gegen die **echten** generierten
  `RuntimeTypes.ts` (Ambient-Stub für `TableRow`/`BaseUxAgentDataApi`) —
  fehlerfrei
- Alle 13 Icon-Importe gegen `verified-icons.txt` des Plugins
- Regel-Check: kein `100vh`/`100vw`, kein `FluentProvider`, kein `Dialog`,
  kein `borderWidth`, kein `dataApi` in Dependency-Arrays, alle Hooks vor dem
  `return`
- Spalten aus `generate-types`; `_ownerid_value`, `modifiedon` liegen auf der
  `TableRow`-Basis
- Kein `Promise.allSettled` (ES2020-lib im Host nicht garantiert) — eigener
  `settle`-Helper
