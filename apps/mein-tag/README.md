# Mein Tag — Generative Page

Eine Seite in **Sales Hub**, die drei Ansichten ersetzt: die eigenen offenen
Aktivitäten nach Fälligkeit gebuckelt, dazu die Opportunities und Leads, die seit
N Tagen still liegen. Gleiches Muster wie die inzwischen verworfene Gen Page
des Approval Cockpits (Git-Historie bis 9b405c4) — nur mit Tabellen, die im
Playground tatsächlich Daten haben.

Anders als beim Approval Cockpit gibt es hier keinen Code-App-Zwilling — die
Gen Page *ist* die App, deshalb liegen ihre Dateien direkt in `apps/mein-tag/`.

## Datenmodell

| Tabelle | Gelesene Spalten | Rolle |
| --- | --- | --- |
| `activitypointer` | `activityid`, `subject`, `activitytypecode`, `scheduledend`, `scheduledstart`, `prioritycode`, `_regardingobjectid_value` | meine offenen Aktivitäten, typübergreifend |
| `opportunity` | `opportunityid`, `name`, `estimatedvalue`, `estimatedclosedate`, `closeprobability`, `stepname`, `salesstage`, `_customerid_value`, `modifiedon` | Stillstand |
| `lead` | `leadid`, `firstname`, `lastname`, `companyname`, `subject`, `leadqualitycode`, `emailaddress1`, `modifiedon`, `createdon` | Stillstand |
| `usersettings` | `dateformatstring`, `dateseparator` | Datumsformat |

Alle drei Abfragen filtern `_ownerid_value eq <me> and statecode eq 0`. Die
Buckets (Heute / Überfällig / Demnächst / Ohne Termin) und der Stillstands-
Schwellwert werden im Client berechnet — ein Filterwechsel lädt nicht nach.

**`activitytypecode` ist der Schlüssel zum Öffnen.** Er enthält den logischen
Namen der konkreten Aktivitätstabelle (`task`, `email`, `phonecall`, …) und wird
direkt als `entityName` an `Xrm.Navigation.openForm` gegeben. Kein Mapping, kein
Raten.

**`fullname` gibt es im generierten Lead-Typ nicht** — der Name wird aus
`firstname` + `lastname` gebaut, Fallback `subject`.

## Was die Seite kann

- KPI-Leiste: Heute fällig, Überfällig, stille Opportunities, stille Leads
- Aktivitäten als Tabs mit Zähler, sortierbares DataGrid, Hoch-Priorität fett
  und als Badge, überfällige Termine rot
- Stillstand-Karten mit „N Tage still"-Badge, ab dem Doppelten des Schwellwerts rot
- Schwellwert 7 / 14 / 30 Tage im Header
- Öffnen jedes Datensatzes in seinem Formular, per Klick oder Tastatur
- Datumsformat aus den Dataverse-Benutzereinstellungen, Währung als
  FormattedValue vom Server
- De-dupe gegen den Double-Mount des Genpage-Hosts

## Bewusst nicht drin

Aktivitäten aus der Seite heraus abschließen. Das geht nicht über
`activitypointer`, sondern per `updateRow` auf der konkreten Tabelle mit den
Statuswerten des jeweiligen Typs (`task`: 1/5, `phonecall`: 1/2, …). Das ist ein
sauberer eigener Schritt, kein Nebenbei.

## Deployment-Stand

| | |
| --- | --- |
| Umgebung | ASC SFA CS Playground — `https://ascsfacs.crm4.dynamics.com` |
| App | Sales Hub, App ID `53fc8147-cb62-ed11-9562-000d3a24f3d4` |
| Page ID | `f74b6eee-f039-4919-a3c6-ce0eb34a7c2d` |

### Datenlage beim Deployment

Gezählt per `pac env fetch`, offene Datensätze, Owner = `aschwarz@dynamicspro.de`:

| Tabelle | gesamt | meine |
| --- | --- | --- |
| `activitypointer` | 28 | **26** |
| `lead` | 2 | **2** |
| `opportunity` | 1 | **0** — die einzige gehört „Test Testerich" |

Die Aktivitäten haben überwiegend Termine aus 2024 oder gar keinen: der Tab
„Überfällig" und „Ohne Termin" sind voll, „Heute" ist leer. Die
Opportunity-Karte bleibt leer, bis dir eine gehört.

### Befehle

```bash
pac model genpage generate-types \
  --data-sources "activitypointer,opportunity,lead,usersettings" \
  --output-file ./RuntimeTypes.ts

pac model genpage upload \
  --app-id 53fc8147-cb62-ed11-9562-000d3a24f3d4 \
  --code-file ./MeinTag.tsx \
  --name "Mein Tag" \
  --data-sources "activitypointer,opportunity,lead,usersettings" \
  --prompt-file ./prompt.md \
  --agent-message "Mein Tag: Aktivitäten nach Fälligkeit, stille Opportunities und Leads" \
  --add-to-sitemap
```

`RuntimeTypes.ts` ist generiert und umgebungsspezifisch — gitignored.

## Geprüft

- `tsc --noEmit` gegen die **echten** generierten `RuntimeTypes.ts` (mit
  Ambient-Stub für `TableRow`/`BaseUxAgentDataApi`) — fehlerfrei
- Alle 8 Icon-Importe gegen `verified-icons.txt` des Plugins
- Regel-Check: kein `100vh`/`100vw`, kein `FluentProvider`, kein `Dialog`, kein
  `dataApi` in Dependency-Arrays, alle Hooks vor dem `return`
- Spalten aus `generate-types`; `_ownerid_value`, `modifiedon`, `createdon`
  liegen wie beim Approval Cockpit auf der `TableRow`-Basis
