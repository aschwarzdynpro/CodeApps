# Schedule Board Manager

Code App zum **Duplizieren, Bearbeiten, Vergleichen und Massen-Anpassen** von
Schedule-Board-Tabs (Universal Resource Scheduling, Tabelle
`msdyn_scheduleboardsetting`). Gedacht für Admins und Dispositionsleitungen in
Field-Service- und Project-Operations-Umgebungen.

Ausgangspunkt war das FastTrack-PCF *Schedule Board Settings Management*
([Learn](https://learn.microsoft.com/en-us/dynamics365/guidance/resources/field-service-schedule-board-settings-management),
[GitHub](https://github.com/microsoft/Dynamics-365-FastTrack-Implementation-Assets/tree/master/Customer%20Service/Field%20Service/Component%20Library/URS/ScheduleBoardSettingsManagement)).
Das kann lesen, kopieren, löschen und (de)aktivieren, aber nicht bearbeiten.
Diese App kann zusätzlich bearbeiten, vergleichen und Einstellungen auf mehrere
Boards übertragen. Außerdem korrigiert sie zwei Fehler der Vorlage (siehe unten).

## Funktionen

| Bereich | Inhalt |
| --- | --- |
| **Boards** | Liste mit Freigabeart, Status und Besitzer; Reihenfolge der Tabs ändern (`msdyn_ordernumber`); Kopieren (Name, Freigabe, Position, optional mit Datensatz-Freigaben); Aktivieren/Deaktivieren; Löschen; Export (Paket für den Import, siehe unten); Link zum Datensatz-Formular |
| **Filterlayout** | Felder des Ressourcenfilter-Bereichs bearbeiten (Konfiguration hinter `msdyn_filterlayout`): Beschriftung, Key, Tabelle/Spalte, Mehrfachauswahl, Reihenfolge, entfernen, neue Felder (Datensätze einer Tabelle / Auswahlwerte einer Spalte). Zeigt, welche Boards das Layout teilen, warnt bei Feldern, die die Ressourcenabfrage nicht auswertet, und kann eine Kopie nur für das aktuelle Board anlegen und zuweisen. XML-Reiter, Diff-Vorschau, Verlauf |
| **Besitzer & Freigaben** | Besitzer ändern (Benutzer oder Besitzer-Team, Live-Suche, Bestätigung mit Hinweisen; System-Boards ausgenommen). Für Boards mit „Bestimmte Personen“: wer das Board sieht (Benutzer und Teams, aus `principalobjectaccess`), Stufe „Lesen“ oder „Lesen & Bearbeiten“ ändern, entfernen, neue Benutzer/Teams per Live-Suche finden (ab 2 Zeichen, mehrere Wörter grenzen ein: „jör bus“ → Jörn Busch) und freigeben |
| **Bearbeiten** | Formular nach dem MS-[Field-Mapping](https://learn.microsoft.com/en-us/dynamics365/guidance/resources/field-service-schedule-board-settings-field-mapping): Board-Ansicht, Farben, Schedule Assistant, Karte, Sonstiges (inkl. der 3 Konfigurations-Lookups), eigene Web-Ressource, Schedule-Typen (`SlotMetadataCollection`), Anforderungsbereiche (`UnscheduledTabs`, hinzufügen/sortieren/entfernen). Nicht gesetzte Felder zeigen den Wert des Default-Boards an. Roh-JSON-Editor als Fallback |
| **Speichern** | Vorschau aller geänderten Felder (Diff bis auf die einzelnen JSON-Werte), es werden nur geänderte Spalten geschrieben; Konfliktprüfung über `versionnumber`; der vorherige Stand landet im Verlauf (lokal im Browser, die letzten 10) und lässt sich als Entwurf zurückladen |
| **Vergleichen** | Zwei Boards Feld für Feld, filterbar nach Bereich; „Von A nach B übertragen“ springt mit vorausgewählten Feldern in den Bulk |
| **Mehrere anpassen** | Vorlage-Board + Auswahl (Konfigurationen, Settings-Schlüssel der obersten Ebene, Filterwerte, Spalten) + Ziel-Boards → Vorschau pro Board → Anwenden mit Ergebnis pro Board. Modus „Besitzer ändern“: Boards wählen + neuer Besitzer → Tabelle bisher/neu (System-Boards und Boards, die schon dem neuen Besitzer gehören, werden übersprungen) → Anwenden |
| **Importieren** | Export-Datei eines Boards einlesen (auch aus einer anderen Umgebung), jede Ansicht, Konfiguration, jeden Schedule-Typ, die Zeitzone und gespeicherte Filterwerte der Zielumgebung zuordnen (ID, dann Name; jede Zeile änderbar), Konfigurationen verwenden/neu anlegen/überschreiben/leer lassen → als neues Board anlegen oder ein bestehendes ersetzen (mit Diff) |

### Fachregeln

- **Kopieren übernimmt die drei `msdyn_configuration`-Lookups** (Filterlayout,
  Ressourcenzellen-Vorlage, Ressourcenabfrage). Das FastTrack-Control kopiert
  nur Schlüssel, die mit `msdyn_` beginnen, und verliert dadurch die
  `_msdyn_*_value`-Lookups. In Schulz UAT hängen genau dort die
  kundeneigenen Configs.
- Eine Kopie ist nie ein System-Board: aus `System` wird `Jeder`, sonst wird
  die Freigabe übernommen oder im Dialog gewählt. Datensatz-Freigaben werden
  nicht kopiert, Besitzer ist der Kopierende.
- **Schutz:** Boards mit Freigabe `System` (192350003) oder einer der festen
  URS-IDs (Default, Ressourcennutzung, Buchungen verwalten) können weder
  gelöscht noch deaktiviert noch umbenannt werden. Die „Initial public view“
  hat eine umgebungsspezifische ID und die Freigabe „Nur ich“ und wird daher
  über ihren Namen (de/en/fr) erkannt; sie ist vor dem Löschen geschützt.
  FastTrack prüft nur über Namen.
- **Besitzer ändern** ist ein PATCH auf `ownerid@odata.bind`
  (`/systemusers(id)` bzw. `/teams(id)`), die Web-API-Form von `Assign`.
  Läuft über die native Datenquelle mit den Rechten des Nutzers, braucht also
  „Zuweisen“ auf Schedule Board Settings. Zugriffsteams (`teamtype` 1)
  können nichts besitzen und tauchen in der Besitzer-Suche nicht auf. Die
  verknüpften `msdyn_configuration`-Zeilen und die Datensatz-Freigaben
  bleiben unverändert. Bei „Nur ich“ wandert das Board damit in die Liste des
  neuen Besitzers.
- `msdyn_settings` wird **nie neu aufgebaut**. Der Editor ändert genau den
  jeweiligen Pfad, unbekannte Schlüssel bleiben unverändert erhalten. Davon
  gibt es reichlich: `GroupResourcesBy`, `hideLegend`, die
  Schedule-Assistant-Kopien in `SlotMetadataCollection` …
- Schalter, die es nur als vorhandenen Schlüssel gibt (`hideCancelled`,
  `applyFilterTerritory`, `showTravelTime` → `1`,
  `showBookingsProportionally` → `true`), werden beim Ausschalten entfernt
  und nicht auf 0 gesetzt. So macht es das Board auch.
- `ScheduleAssistantFilterLayout(Id)` und
  `ScheduleAssistantResourceCellTemplate(Id)` in den Schedule-Typen sind
  Inline-Kopien von Konfigurationszeilen. Das Formular fasst sie nicht an;
  Änderungen nur über den JSON-Reiter.

## Datenmodell (Kurzform)

| Ort | Inhalt |
| --- | --- |
| Spalten | Name, Freigabe, Reihenfolge, Farben (Hex **ohne** `#`), Ansichts-IDs als String, SA-Icons, Seitengröße … — Liste in [`src/types/board.ts`](src/types/board.ts) |
| Lookups → `msdyn_configuration` | `msdyn_filterlayout` (Typ 192350000), `msdyn_resourcecelltemplate` (192350001), `msdyn_retrieveresourcesquery` (192350002); schreiben über `msdyn_FilterLayout@odata.bind` usw. |
| `msdyn_settings` (JSON-String) | Zeitskala, Arbeitszeit/-tage, Zeilenhöhen, Zeitzone (`timezonedefinition`), `SlotMetadataCollection` (ein Eintrag je `msdyn_bookingsetupmetadata`, in Project-Operations-Umgebungen 4 statt 3), `UnscheduledTabs` |
| `msdyn_filtervalues` (JSON-String) | gespeicherte Ressourcenfilter („Als Standard speichern“) |

Freigabe: 192350000 Jeder · 192350001 Nur ich · 192350002 Bestimmte Personen · 192350003 System.

## Aufbau

Oberfläche mit **Fluent UI v9** (`@fluentui/react-components`) — derselben
Bibliothek, auf der die Modern Controls von Power Apps aufbauen.
`components/ui.tsx` kapselt die App-Konventionen: `Btn` (Varianten
default/primary/danger/ghost), `Select` (Dropdown über eine Wert/Label-Liste,
`''` = „nicht gesetzt“), `SuggestInput` (Freitext mit Vorschlägen, z. B.
Tabellen), `FilePicker` (Drop-Zone). Layout und Farben bleiben in `App.css`.
`FluentProvider` kopiert seine Klasse auf Popup-Portale — Root-Styles deshalb
nur über `.fluent-root:not([data-portal-node])`, sonst überdeckt ein leeres
Portal die Seite.

```
src/
├── PowerProvider.tsx        # Host-Erkennung (Power Apps vs. lokal → Mock)
├── config.ts                # VITE_ORG_URL für Formular-Links
├── types/board.ts           # Domänenmodell: Spalten, Lookups, Share Types
├── utils/
│   ├── settingsModel.ts     # JSON lesen/ändern/flatten, Präsenz-Flags
│   ├── settingsFields.ts    # Editor-Definitionen nach MS-Field-Mapping
│   ├── boardRules.ts        # Schutz, Kopieren, Diff, Bulk-Auswahl
│   ├── filterLayout.ts      # Filterlayout-XML: parsen, Felder ändern, Diff, Abfrage-Abgleich
│   ├── queryAnalysis.ts     # Ressourcenabfrage: welcher $input-Key filtert wo und wie
│   ├── principalSearch.ts   # Benutzer-/Team-Suche: Wörter, Abgleich, Sortierung
│   ├── boardTransfer.ts     # Export-Paket, ID-Zuordnung, Inhalt umschreiben
│   └── snapshots.ts         # lokaler Verlauf + JSON-Download
├── services/
│   ├── boardService.ts      # Interface + Auswahl Dataverse/Mock
│   ├── dataverseBoardService.ts
│   ├── mockBoardService.ts  # In-Memory, für `npm run dev` ohne Host
│   ├── mockData.ts          # fiktive Boards (keine Kundendaten)
│   ├── dataverseSharing.ts  # Freigaben über den Dataverse-Connector
│   ├── dataverseMetadata.ts # Tabellen/Spalten aus EntityDefinitions, Datensätze suchen (Connector)
│   └── transferService.ts   # Export sammeln, Import vorbereiten/ausführen
└── components/              # BoardList, BoardDetail, BoardEditor, SlotTypesEditor,
                             # PanelsEditor, RawJsonEditor, DiffTable, CompareView,
                             # BulkView, BulkOwnerView, SharingPanel, OwnerDialog,
                             # PrincipalPicker, FilterLayoutPanel, FilterFieldPickers, ImportView,
                             # ui (Fluent-Wrapper), Modal (Fluent Dialog)
```

### Filterlayout

Das Filterlayout ist **eine eigene Konfigurationszeile**, kein Teil des Boards
(`msdyn_configuration.msdyn_value`, XML `<filter><controls><control …/>`).
In Schulz UAT teilen sich SST, OST, Jörn und SST-Agrar „Custom Filter Layout
Schulz for Project Operations“. Speichern wirkt also auf alle; deshalb gibt es
„Als Kopie nur für dieses Board“ (neue Konfiguration anlegen und am Board
setzen).

- Bearbeitet werden nur die Controls der obersten Ebene. Unbekannte Attribute
  und Kind-Elemente (`<data>`, `<order>`, eingebettetes `<fetch>`,
  verschachtelte `<controls>` von `fieldset`/`twocolumn`) bleiben unverändert;
  Container nur über den XML-Reiter. Diff und Vergleich laufen über den
  Control-`key`, reine Formatierung zählt nicht als Änderung.
- Ein Feld filtert erst, wenn die **Ressourcenabfrage** (`msdyn_retrieveresourcesquery`,
  UFX-FetchXML) seinen Key als `$input/<Key>` auswertet. Die App liest die
  Abfrage des Boards (oder die geerbte des Default-Boards) und markiert Felder
  ohne Gegenstück. Die Abfrage selbst ist nur lesbar.
- **Feld hinzufügen mit Vorschlägen:** Die App analysiert die
  Ressourcenabfrage (`src/utils/queryAnalysis.ts`, kleiner Tag-Scanner, weil
  UFX das Präfix `ufx:` oft nicht deklariert) und listet jeden `$input`-Key,
  der im Layout noch fehlt, mit seiner Wirkung, z. B. `MustChooseFromResources`
  → „zeigt nur die gewählten Ressourcen“ oder `Site` →
  `bookableresource.sst_site_ref ist einer von`. „Übernehmen“ füllt Art,
  Tabelle, Spalte und Beschriftung vor: bekannte URS-Keys aus einer Vorlage,
  eigene Keys über die Metadaten (Primärschlüssel → Datensätze der Tabelle,
  Lookup → Datensätze der Zieltabelle über `ManyToOneRelationships`,
  Auswahlspalte → deren Werte).
- **Tabellen- und Spaltenauswahl:** Tabellen kommen aus `EntityDefinitions`
  (`IsValidForAdvancedFind`), Auswahlspalten (inkl. Mehrfachauswahl) aus den
  Attributen der Tabelle, beides über den Dataverse-Connector
  (`src/services/dataverseMetadata.ts`, pro Sitzung gecacht). Ohne Metadaten
  bleiben die Felder Freitext.
- Ressourcen-Schlüssel als Beschriftung (`ScheduleAssistant.West.Roles`)
  zeigen ihren Anzeigetext darunter („Rollen“).
- Ändert man einen Key, passen die gespeicherten Filterwerte
  (`msdyn_filtervalues`) der Boards nicht mehr zu diesem Feld. Sie stehen
  unter dem alten Key.

### Boards zwischen Umgebungen übertragen (Export/Import)

Ein Board besteht fast nur aus IDs, und nur ein Teil davon ist in jeder
Umgebung gleich (Ansichten aus Solutions, URS-Standardkonfigurationen,
Zeitzonen). Der **Export** schreibt deshalb ein Paket
(`format: schedule-board-manager.board`, Datei `<Board>.board.json`):

- das Board selbst: alle Spalten, `msdyn_settings`, `msdyn_filtervalues`,
  die drei Konfigurations-Lookups;
- jede referenzierte **Konfiguration mit Inhalt** (Filterlayout-XML,
  Zellvorlage, Ressourcenabfrage, dazu die Schedule-Assistant-Konfigurationen,
  auf die `SlotMetadataCollection[].ScheduleAssistant*Id` zeigt);
- **Name und Tabelle** jeder Ansicht (Spalten, Schedule-Typen,
  Anforderungsbereiche), Tabelle jedes Schedule-Typs, Name der Zeitzone,
  Tabelle und Primärname jedes Datensatzes in den gespeicherten Filterwerten
  (`@ufx-id`/`@ufx-logicalname`).

Nicht im Paket: Datensatz-Freigaben, Besitzer, Verlauf.

Der **Import** (Reiter „Importieren“) ordnet jede ID der Zielumgebung zu —
erst über die ID, dann über den Namen (Ansicht: Name + Tabelle,
Schedule-Typ: Tabelle, Konfiguration: Name + Typ, Datensatz: Primärname;
nur eindeutige Treffer). Jede Zeile lässt sich ändern. Was kein Gegenstück
hat, fällt weg: ein Ansichtsfeld wird geleert, ein Anforderungsbereich ohne
Ansicht und ein Schedule-Typ ohne Booking Setup fallen ganz aus den
Settings, Filter-Datensätze werden aus dem gespeicherten Filter entfernt.
IDs, deren Bedeutung die App nicht kennt, bleiben unverändert und werden
angezeigt. Konfigurationen: vorhandene verwenden (mit Inhaltsvergleich),
neu anlegen, vorhandene mit dem Datei-Inhalt überschreiben (Warnung, welche
Boards sie noch nutzen; vorheriger Stand im Konfigurations-Verlauf) oder leer
lassen. Ziel ist ein neues Board (Name, Freigabe; System wird zu Jeder) oder
ein bestehendes (Name, Reihenfolge, Freigabe, Besitzer bleiben; Diff-Vorschau,
vorheriger Stand im Verlauf). Dateien des alten Exports (bloßes Board-JSON)
lassen sich lesen, aber nur über IDs zuordnen.

Die Datensätze der Filterwerte werden über den Dataverse-Connector gesucht
(`EntityDefinitions` → `EntitySetName`/`PrimaryIdAttribute`/
`PrimaryNameAttribute`, dann `ListRecordsWithOrganization`). Fehlt die
Tabelle in der Zielumgebung, gelten alle als „fehlt“; scheitert die Abfrage
(Rechte), bleiben sie ungeprüft unverändert.

Für einen Transfer nach PROD muss die App dort laufen (eigenes Deployment
mit `power.config.json`/`.env` für PROD — nicht ohne Rückfrage).

### Freigaben über den Dataverse-Connector

Freigaben laufen über den Connector `shared_commondataserviceforapps`
(`src/services/dataverseSharing.ts`), gebunden an eine **Benutzer-Connection**
(in UAT `4a9f0463…`, EX-Andy.Schwarz). Jeder App-Nutzer legt beim ersten Start
seine eigene Connection an. `GrantAccess`/`ModifyAccess`/`RevokeAccess` laufen
deshalb mit den Rechten des angemeldeten Nutzers. Bewusst **keine**
SP-Connection wie „App-Reg D365-CE nonProd“: dann könnte jeder App-Nutzer mit
den Rechten des SP beliebige Boards teilen.

- Lesen: FetchXML auf `principalobjectaccess` (nur direkte Freigaben,
  `accessrightsmask > 0`) per `ListRecordsWithOrganization`; die Namen kommen
  aus den nativen Tabellen `systemuser`/`team`.
- Schreiben: `PerformUnboundActionWithOrganization`. Entity-Parameter
  (`Target`, `Revokee`) gehen als `entityset(id)`-String, `PrincipalAccess`
  als Objekt mit `Principal` inkl. `@odata.type` (Format wie in der Power-
  Automate-Aktion „Perform an unbound action“). Lehnt der Connector die
  String-Form ab, wird einmal die Objektform versucht und die
  funktionierende Form gemerkt.
- Neue Freigabe = `GrantAccess` (fügt nur Rechte hinzu), Stufe ändern =
  `ModifyAccess` (ersetzt die Maske), Entfernen = `RevokeAccess`.
- Org-URL für den Connector: `VITE_ORG_URL` (Build-Zeit). Fehlt sie, zeigt
  der Reiter „Freigaben“ einen Hinweis statt Fehlern.

Anders als bei den reinen Lese-Apps im Repo gibt es **keinen** stillen
Rückfall auf den Mock bei Fehlern. Im Power-Apps-Host laufen Fehler bis in die
Oberfläche durch, damit ein Schreibvorgang nie scheinbar gelingt.

## Entwickeln

```bash
npm install
npm run dev      # http://localhost:3000 — ohne Host: Mock-Daten (Badge oben rechts)
npm run test     # Vitest: settingsModel, boardRules, filterLayout (jsdom), queryAnalysis, principalSearch
npm run build    # tsc -b && vite build
npm run lint
```

`power.config.json`, `src/generated/`, `.power/` und `.env` sind gitignored.
Wiederherstellen (Schulz UAT, Profil `SchulzNEW`):

```bash
pac auth select --name SchulzNEW
pac code init --environment 2eaa34de-dcf1-e949-86d9-82d9fd748045 \
  --displayName "Schedule Board Manager" --buildPath "./dist" \
  --fileEntryPoint "index.html" --appUrl "http://localhost:3000"
for t in msdyn_scheduleboardsetting msdyn_configuration msdyn_bookingsetupmetadata \
         savedquery userquery systemuser team timezonedefinition; do
  pac code add-data-source -a dataverse -t $t
done
cp .env.example .env   # VITE_ORG_URL=https://operations-d365-schulz-uat-1-1.crm4.dynamics.com
```

## Deployment-Stand

| Umgebung | Env-ID | App-ID | Stand |
| --- | --- | --- | --- |
| Schulz UAT (`operations-d365-schulz-uat-1-1.crm4`) | `2eaa34de-dcf1-e949-86d9-82d9fd748045` | `bd2c2082-e858-4386-a4f7-a5e4d6f0e3bd` | gepusht 2026-10-01 (`pac code push`), Connector an Benutzer-Connection `4a9f0463…` |

Push nur nach Rücksprache. Profilwahl, Prüfung und Push gehören in **einen**
Aufruf (siehe Root-`AGENTS.md`). Das Ziel bestimmt allein die
`environmentId` in `power.config.json`; `--environment` an `pac code push`
lenkt den Push nicht um (Gotcha aus `audit-explorer`). Vor dem Push also
prüfen, dass dort `2eaa34de-…` steht.

Datenlage UAT (2026-10-01): 8 Boards (3 System, „Erste öffentliche Ansicht“,
4 eigene), URS über Project Operations, eigene Configs „Custom Filter Layout …“
und „Custom Retrieve Resources Query …“.

## Offen

- Gegen echtes Dataverse noch nicht verifiziert: Lookup leeren per
  `…@odata.bind: null`, FormattedValue des Besitzers, `returnedtypecode`-Filter
  auf `savedquery` über das SDK, Parameterform von `GrantAccess`/`RevokeAccess`
  über den Connector, Lesezugriff auf `principalobjectaccess` für Nicht-Admins,
  `EntityDefinitions` mit doppeltem `$expand` (Attribute + ManyToOneRelationships)
  über den Connector, Besitzerwechsel per `ownerid@odata.bind` über die
  native Datenquelle, Datensatzsuche für Filterwerte über den Connector
  (`EntitySetName` + `$filter`), `savedquery`/`userquery` nach ID.
- Import nach PROD: App dort noch nicht deployt.
