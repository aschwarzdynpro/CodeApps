# Account 360 — Generative Page (Playground)

Eine Seite in der **Accounts App** (`pro_AccountsApp`) des ASC SFA CS
Playground: links alle Accounts mit Suche und Aufgaben-Zählern, rechts der
gewählte Account mit Stammdaten, KPIs und Tabs für Aufgaben, Kontakte,
Custom Addresses und Elastic Demo. Aufgaben anlegen und abschließen sowie
Custom Addresses anlegen geht direkt auf der Seite.

Die Gen Page *ist* die App, deshalb liegen ihre Dateien direkt in
`apps/account-360/`.

## Zwei Modi

| Modus | Wann | Was die Seite zeigt |
| --- | --- | --- |
| Seite | aus der Sitemap (`pageInput` ist `null`) | Account-Liste links, Detail rechts |
| Formular | eingebettet im Account-Formular | nur KPIs und Tabs für den Datensatz des Formulars, Button „Aktualisieren"; kein Kopf, keine Stammdaten (die zeigt das Formular selbst) |

Erkannt wird der Formular-Modus synchron aus `props.pageInput`: Das Formular
übergibt `{ recordId, entityName: "account" }`, bei einem neuen, noch nicht
gespeicherten Datensatz nur `{ entityName: "account" }`. Dann zeigt die Seite
„Account 360 erscheint, sobald der Account gespeichert ist." Das generierte
`GeneratedComponentProps` kennt `pageInput` nicht; die Seite erweitert den
Typ lokal (`PageProps`).

Optionaler statischer Eingabewert `data.tab` (`tasks`, `contacts`,
`addresses`, `elastic`) wählt den ersten Tab. Der Formular-Designer erkennt
ihn aus dem Code und bietet ihn als „Static input data (JSON)" an
(`{ "tab": "" }`).

## Datenmodell

| Tabelle | Gelesene Spalten | Filter |
| --- | --- | --- |
| `account` (Liste) | `accountid`, `name`, `accountnumber`, `address1_city`, `address1_country`, `statecode`, `_ownerid_value` | alle, `name asc`, max. 1.000 |
| `task` (Zähler) | `activityid`, `_regardingobjectid_value`, `scheduledend`, `scheduledstart` | `statecode eq 0`, max. 2.000; Zuordnung zu Accounts im Client |
| `account` (Detail) | Name, Nummer, Telefon, E-Mail, Website, Adresse 1, `industrycode`, `revenue`, `numberofemployees`, `description`, `statecode`, `modifiedon`, `_primarycontactid_value`, `_parentaccountid_value`, `_ownerid_value` | `retrieveRow` |
| `task` (Detail) | `activityid`, `subject`, `scheduledstart`, `scheduledend`, `prioritycode`, `statecode`, `actualend`, `modifiedon`, `_ownerid_value` | `_regardingobjectid_value eq <account>` |
| `contact` | `contactid`, `fullname`, `firstname`, `lastname`, `jobtitle`, `emailaddress1`, `telephone1`, `mobilephone` | `_parentcustomerid_value eq <account> and statecode eq 0` |
| `pro_customaddress` | `pro_customaddressid`, `pro_name`, `statecode`, `createdon` | `_pro_account_value eq <account>` |
| `pro_elasticdemo` | `pro_elasticdemoid`, `pro_name`, `createdon` | `_pro_account_value eq <account>`, ohne `orderBy` (Elastic Table) |
| `usersettings` | `dateformatstring`, `dateseparator` | angemeldeter Benutzer |

**Schreiben**

| Aktion | Aufruf |
| --- | --- |
| Aufgabe anlegen | `createRow("task", { subject, prioritycode, scheduledend, _regardingobjectid_value: "/account(<id>)" })`, Fälligkeit als lokaler Mittag |
| Aufgabe erledigen | `updateRow("task", id, { statecode: 1, statuscode: 5 })` |
| Adresse anlegen | `createRow("pro_customaddress", { pro_name, _pro_account_value: "/account(<id>)" })` |

Die Liste lädt einmal, die Details pro Account (fünf Abfragen parallel, je
einzeln abgefangen) und werden pro Account im `window` gecacht. Nach jedem
Schreiben werden Liste und Details des Accounts ohne Spinner neu geladen;
„Aktualisieren" verwirft alle Caches.

## Was die Seite kann

- Account-Liste: Suche über Name, Nummer und Ort, Schalter „Nur meine"
  (Besitzer = angemeldeter Benutzer) und „Inaktive zeigen", Badges für
  offene und überfällige Aufgaben. Die Auswahl fällt auf den ersten
  sichtbaren Account zurück.
- Kopf mit „Im Formular öffnen", Stammdaten-Raster; Hauptkontakt öffnet das
  Kontaktformular, der übergeordnete Account wird in der Liste ausgewählt,
  wenn er dort sichtbar ist, sonst im Formular geöffnet.
- KPIs: Kontakte, offene Aufgaben, überfällig, Adressen.
- Aufgaben-Grid (sortierbar): überfällig rot, Hoch als roter Badge,
  „Erledigte zeigen", Inline-Formular „Neue Aufgabe", Abschließen per Häkchen.
- Kontakte-Grid mit Hauptkontakt-Badge, `mailto:`/`tel:`-Links.
- Custom Addresses mit Inline-Anlage, Elastic-Demo-Liste.

UI-Texte deutsch (die Umgebung hat nur en-US). Priorität und Aufgabenstatus
sind OOB-Codes und bekommen deutsche Labels; alle übrigen Auswahlwerte (z. B.
Branche) kommen als FormattedValue vom Server und damit englisch.

## Bewusst nicht drin

- Serverseitige Suche: gesucht wird in den geladenen ersten 1.000 Accounts.
- Aufgaben bearbeiten oder löschen, Kontakte anlegen — dafür ist das Formular da.

## Deployment-Stand

| | |
| --- | --- |
| Umgebung | ASC SFA CS Playground — `https://ascsfacs.crm4.dynamics.com` (Env `a5b19a39-a9ec-ec82-98b9-74f5cf513c52`) |
| App | Accounts App (`pro_AccountsApp`), App ID `909c4288-1c93-ed11-aad1-6045bd8c5f83` |
| Page ID | `0aab2066-b628-4a4c-aea8-d68eb19671d8` (Sitemap: Area1 › Group1 › „Account 360") |

Die Seite landet in der Default-Solution (`upload` kennt kein `--solution`).

### Im Formular

Eingebettet im unverwalteten Account-Formular **Demo Form**
(`f70e87be-4db3-ef11-b8e8-002248832590`), Tab „Account 360"
(`tab_account360`, zweiter Tab nach Summary), Sektion `section_account360`
ohne Label. Im Form-XML ist das ein Custom Control
`MscrmControls.UxAgentControl` (classid `{F9A8A302-114E-466A-B582-6771B2AE0D92}`)
mit dem Parameter `RefId` = Page-ID, eingefügt über Formular-Designer ›
Components › Display › Generative page. Die Höhe wächst mit dem Inhalt
(`rootEmbedded`: `height: auto`), das Formular scrollt.

Die Accounts App führt für Account nur das Demo Form; alle anderen Tabellen
und alle Ansichten sind ungefiltert („Include all forms/views"). Das war vor
dem ersten Upload genauso, nur ohne festgelegtes Account-Formular.

### Achtung: jeder Upload verändert die App

`pac model genpage upload` registriert bei **jedem** Aufruf die
Datenquellen-Tabellen als App-Komponenten und trägt dabei je Tabelle **ein**
Formular und **eine** Ansicht ein. Für Account war das „Customer profile
cases" plus „My Active Accounts", für Task ein inaktives Formular. Folge: Die
App zeigt nur noch diese eine Ansicht, Accounts öffnen in einem fremden
Formular. Einen Schalter dagegen hat `upload` nicht.

Nach jedem Upload daher im App-Designer:

1. Accounts form: „Customer profile cases" entfernen (vorher die Vorschau
   über den Formularwähler auf Demo Form stellen, sonst greift „Remove"
   nicht).
2. Bei Accounts/Elastic Demos/Custom Addresses/Contact/Task Ansichten bzw.
   Formulare „Include all … in the app" einschalten.
3. Save and Publish. Der Publish-Dialog setzt eine KI-Beschreibung der App
   ein — mit „Undo" verwerfen.

Kontrolle per FetchXML auf `appmodulecomponent` (zeigt den veröffentlichten
Stand): erwartet sind 5 Tabellen, die Sitemap und als einziges Formular das
Demo Form.

### Demo-Daten (seit 2026-10-04)

Für Präsentationen liegt ein fiktives Demo-Set im Playground, erzeugt mit
[`demo-data/generate.py`](demo-data/generate.py) und eingespielt per
`pac data import` (Configuration-Migration-Format, Schema in
[`demo-data/data_schema.xml`](demo-data/data_schema.xml)):

- 9 Accounts mit vollständigen Stammdaten, darunter die Konzernstruktur
  „Nordlicht Energie AG" mit zwei Töchtern; Domains `*.example`
- 23 Kontakte (je Account ein Hauptkontakt), 27 Aufgaben (überfällig, heute,
  demnächst, ohne Datum, erledigt; Prioritäten gemischt), 9 Custom Addresses,
  6 Elastic-Demo-Einträge

Feste GUIDs (uuid5), ein Neuimport aktualisiert statt zu duplizieren.
Fälligkeiten hängen an `TODAY` im Skript — vor einer späteren Präsentation
anpassen und neu einspielen.

Zwei Eigenheiten des Playgrounds beim Anlegen von Accounts:

- Der Plugin-Step **„SetAutoNumber"** (Create von `account`) setzt jede
  Kontonummer auf „123". Deshalb nach dem ersten Import
  `python generate.py --account-numbers <dir>` + `pac data import` (Update).
- Ein Sales-Accelerator-Segment verbindet neue Accounts automatisch mit der
  Sequenz **„Demo Sequence"**, die sofort eine englische Aufgabe „Check
  upcoming renewal details" anlegt. Abhilfe: in der Sales Hub die Accounts
  markieren › … › Sequences › **Disconnect sequence** (Pfeil am Menüpunkt,
  nicht der Menüpunkt selbst — der öffnet „Connect"). Das Trennen setzt die
  Sequenzaufgaben selbst auf „Canceled".

Die alten Test-Accounts (Account 2, 4–8, demo, Demo Account2, Test02) sind
für die Präsentation **deaktiviert**; mit „Inaktive zeigen" bleiben sie
sichtbar.

### Datenlage beim Bau (2026-10-04)

10 Accounts (1 inaktiv: „Account 3"), 13 Kontakte, ~20 offene Aufgaben, davon
5 mit Bezug auf einen Account. `pro_customaddress` leer, `pro_elasticdemo` 1
Datensatz. Zum Testen der Schreibpfade liegen an „Demo Account2" zwei
erledigte Aufgaben „Account 360 Testaufgabe" und „Account 360 Testaufgabe
Hoch".

### Befehle

```bash
pac model genpage generate-types \
  --data-sources "account,contact,task,pro_customaddress,pro_elasticdemo,usersettings" \
  --output-file ./RuntimeTypes.ts

# Update der bestehenden Seite (ohne --page-id entsteht eine neue)
pac model genpage upload \
  --environment https://ascsfacs.crm4.dynamics.com/ \
  --app-id 909c4288-1c93-ed11-aad1-6045bd8c5f83 \
  --page-id 0aab2066-b628-4a4c-aea8-d68eb19671d8 \
  --code-file ./Account360.tsx \
  --name "Account 360" \
  --data-sources "account,contact,task,pro_customaddress,pro_elasticdemo,usersettings" \
  --prompt-file ./prompt.md
```

`RuntimeTypes.ts` ist generiert und umgebungsspezifisch — gitignored.

## Geprüft

- `tsc --noEmit` mit `strict` und `noUnusedLocals` gegen die echten
  `RuntimeTypes.ts` (Ambient-Stub für `TableRow`/`BaseUxAgentDataApi`) —
  fehlerfrei; `pac model genpage transpile` ebenso.
- Alle 22 Icon-Importe gegen `verified-icons.txt` des Plugins.
- Regel-Check: kein `100vh`/`100vw`, kein `FluentProvider`, kein `Dialog`,
  kein `borderWidth`, kein `dataApi` in Dependency-Arrays, alle Hooks vor dem
  `return`, Dropdown mit `mountNode`.
- Im Browser (2026-10-04): Liste mit Zählern, Accountwechsel, Suche,
  „Inaktive zeigen", Erledigte zeigen, Kontakte-Tab, Aufgabe anlegen
  (Bezug, Fälligkeit und Priorität per FetchXML geprüft), Aufgabe abschließen,
  übergeordneten Account im Formular öffnen und zurück, Aktualisieren.
  Nicht im Browser getestet: Adresse anlegen (gleiches `createRow`-Muster wie
  die Aufgabe), „Nur meine", Elastic-Demo-Tab mit Daten.
- Formular-Modus im Browser (2026-10-04): Demo Account2 und Account 5 im
  Demo Form (KPIs, Aufgaben, Kontakte-Tab, überfällige Aufgabe rot), neuer
  Account (Hinweis „sobald gespeichert"), Sitemap weiter im Seiten-Modus.
  `pageInput` per vorübergehender Diagnosezeile geprüft (siehe „Zwei Modi").

## Stolperstelle beim Bau

Die Abfrage für die Aufgaben-Zähler ist in den ersten beiden Builds im Host
fehlgeschlagen (erst mit Filter `regardingobjecttypecode eq 'account'`, dann
einmal mit `statecode eq 0`), danach mit unverändertem `statecode eq 0` in
vier Seitenaufrufen und einem „Aktualisieren" nicht mehr. Die Ursache ist offen: Die Datenaufrufe der
Seite laufen über den iframe-Host und tauchen weder in der Konsole noch in
den Netzwerk-Requests des Haupt-Tabs auf. Fällt die Abfrage aus, zeigt die
Seite eine Warnung und läuft ohne Zähler weiter.
