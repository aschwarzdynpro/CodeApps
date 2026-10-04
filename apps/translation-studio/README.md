# Translation Studio

Code App, die **fehlende Übersetzungen von Dataverse-Beschriftungen** sichtbar
macht, inline füllen lässt und mit einem Klick zurückspielt. Abgedeckt sind
Tabellen- und Spaltennamen, Auswahlwerte, Formular- und Ansichtsnamen.
Konzept: [`docs/concepts/translation-studio.md`](../../docs/concepts/translation-studio.md).
Ausbau: [`Roadmap.md`](Roadmap.md). Die Bedienungsanleitung steckt in der App
(Hilfe, Inhalt in [`src/help/helpContent.ts`](src/help/helpContent.ts)) —
**bei jeder sichtbaren Änderung dort nachziehen.**

## Problem

Dataverse pflegt jede Beschriftung je installierter Sprache. Fehlt eine
Übersetzung, sehen französische Nutzer englische Feldnamen. Der Standardweg ist:

1. Übersetzungen exportieren (ergibt eine Zip-Datei).
2. Die Datei in Excel bearbeiten: SpreadsheetML mit tausenden Zeilen, ohne Filter auf „fehlt“.
3. Importieren.
4. Veröffentlichen.

Niemand sieht, *was* fehlt, und niemand pflegt das laufend. Waldmann betreibt
drei Sprachen (1033 en-US, 1031 de-DE, 1036 fr-FR); das Problem hat jeder
mehrsprachige Kunde. Im Spiel sind nur Metadaten, keine Kundendaten.

## Funktionen

| Bereich | Inhalt |
| --- | --- |
| **Scope** | Solution aus `solution` wählen: unmanaged bearbeitbar, managed nur lesen. „Default“ mit Größenwarnung. Danach Zielsprachen an- und abwählen. Die Komponententypen wirken als Filter, weil der Export immer die ganze Solution enthält. Beim Laden eine Fortschrittskarte: Schritte, Laufzeit, Balken gegen die letzte Exportdauer der Solution (lokal gespeichert), „Warten abbrechen“ |
| **Lückenmatrix** | Zeile = Beschriftung (Typ, Komponente, Spalte), dazu der Basistext (nur lesen) und je Zielsprache eine editierbare Zelle. Zustände: **fehlt** (rot), **vermutlich unübersetzt** (identisch mit Basistext, gelb; per ✓ als „korrekt so“ markierbar, lokal je Solution gespeichert), **geändert** (blau, ↶ nimmt zurück), ok. Eigene Fensterung mit festen Spalten, auch für zehntausende Zeilen |
| **Filter & KPI** | Zustand (Standard: Lücken und Bearbeitetes), Typ (Tabellen, Spalten, Auswahlwerte, Formulare, Ansichten, Sonstiges), Tabelle (aus Metadaten), Volltext. KPI-Leiste je Sprache: Abdeckung in %, fehlt, vermutlich unübersetzt, geändert |
| **Glossar** | Vorschlag, wenn derselbe Basistext anderswo übersetzt ist: einzeln, „×n“ für alle gleichen Basistexte, oder als Bulk für alle gefilterten Zeilen. **Konsistenz**: gleicher Basistext mit verschiedenen Übersetzungen, „vereinheitlichen“ |
| **CSV-Roundtrip** | Gefilterte Zeilen als CSV (Semikolon, UTF-8 mit BOM, stabiler `Schlüssel` je Zeile, Formel-Schutz). Ausgefüllte Datei einlesen, Diff-Vorschau, übernehmen. Leere Zellen = unverändert, Basissprache wird ignoriert |
| **Anwenden** | Diff-Vorschau (Zellen je Sprache, vorher/nachher). Ablauf: Prüfen, ob ein Import läuft → Datei bauen → `ImportTranslation` → Importjob pollen (pausiert bei `document.hidden`, Bearbeiten gesperrt) → `PublishAllXml` (Standard an, abschaltbar, „Jetzt veröffentlichen“ nachträglich mit Bestätigung) → Ergebnis mit Meldungen des Jobs und Protokoll-Download |
| **Verlauf** | Die letzten 25 Läufe lokal im Browser (v2: eigene Tabelle) |
| **Einrichtung** | Prüft Org-URL, Konnektor, native Aktionen, Lesbarkeit von Solutions, Basissprache und Importjobs. „Export testen“ zeigt Weg, Größe, Sprachen und Anzahl der Beschriftungen. Bei nur einer Sprache: Hinweis „keine weiteren Sprachen installiert“ |
| **Designer** | Standardansicht nach dem Laden (Umschalter „Designer \| Tabelle“ in der Befehlsleiste). **Explorer** links: Übersicht, Apps, Tabellen → Tabelle & Spalten, Formulare, Ansichten, Dashboards; Fortschrittsring und offene Beschriftungen je Eintrag, Suche (Strg+K). **Canvas** in der Mitte, so wie die Nutzer es sehen: Tabellen-Steckbrief (Namen, Formulare & Ansichten mit ihren offenen Beschriftungen, Spalten mit Suche/„Nur offene“, Auswahlwerte nach Spalte gruppiert), Formular (Kopfzeile, Registerkarten, Abschnitte, Felder), Ansicht (Name, Spaltenköpfe, verknüpfte Spalten), Model-driven App (App-Name, Navigation aus der Sitemap). **Details** (Inspektor) rechts: die Beschriftung in allen Zielsprachen mit Glossar-Vorschlag, „×n überall“, „korrekt so“, ↶. Explorer und Details ein-/ausblendbar und in der Breite ziehbar (gemerkt), in schmalen Fenstern liegen die Details über dem Canvas. **Navigationspfad** im Canvas-Kopf (Übersicht › Tabelle › Formular/Ansicht, letztes Glied wechselt zu Nachbarn derselben Tabelle), Alt+↑ eine Ebene höher. Bearbeiten direkt im Canvas: Klick → tippen, Enter übernimmt, **Tab springt zur nächsten Lücke**, Strg+Enter/✓ „korrekt so“ und weiter, F8/Umschalt+F8, Pfeiltasten in Registerkarten. Glühbirne an Lücken mit Vorschlag, „n Vorschläge übernehmen“ je Seite, Feier bei „alles übersetzt“. Merkt sich die Stelle über Ansichtswechsel, Sprachwechsel und Neuladen. Gleiche Änderungsliste wie die Tabelle |
| **Hilfe** | Drawer mit Suche, 12 Abschnitte |

### Leitplanken (im Code durchgesetzt)

- **Nie die Basissprache schreiben.** Eine unveränderte Datei wird nie
  importiert; Prüfung in `applyEdits` und `runImport`.
- **Rückgabedatei = Export plus Änderungen.** Der Writer patcht nur die
  geänderten Zellen in den exportierten Text. Keine Zeile wird entfernt,
  nichts umsortiert, Styles und unbekannte Spalten bleiben, XML wird korrekt
  escaped. Ohne Änderungen ist die Serialisierung **byte-identisch** mit dem
  Export (Roundtrip-Test).
- Eine vorhandene Übersetzung wird **nie geleert**: Ob eine leere Zelle beim
  Import „löschen“ bedeutet, ist offen. Texte über 500 Zeichen werden
  abgelehnt (Importgrenze laut Microsoft Learn).
- **Ein Import zur Zeit:** vorher `importjob` auf laufende Jobs prüfen, und
  solange der Import läuft, ist die Matrix gesperrt.
- Managed Solution → nur lesen.
- Heuristik und Glossar schreiben nie selbst, sie markieren und schlagen vor.
- Fehlt das Importrecht → nur lesen mit Klartext; die Lücken lassen sich als
  CSV weitergeben.

## Datenpfad

Der Dataverse-Konnektor kann nur POST-Aktionen und Tabellen-Reads
(solution-forge `CLAUDE.md`, Gotchas #4/#8). Deshalb läuft alles über den
**nativen Übersetzungs-Export/-Import**, eine Aktion je Richtung:

| Schritt | Aufruf | Weg |
| --- | --- | --- |
| Solutions | FetchXML auf `solutions` (`isvisible = 1`, Publisher per Link) | Konnektor `ListRecordsWithOrganization` |
| Basissprache | `organizations?$select=languagecode` | Konnektor; sonst „Base Language Code“ im Informationsblatt, sonst erste Sprachspalte |
| Export | `ExportTranslation { SolutionName }` → `ExportTranslationFile` (Base64-Zip) | 1. native Aktion — die App trägt sie selbst in `dataSourcesInfo` ein (Pfad `/api/data/v9.2/solutions/Microsoft.Dynamics.CRM.ExportTranslation`), weil die CLI sie nicht generieren kann, siehe unten; 2. Konnektor „unbound action“ (Dataverse: `Resource not found for the segment`), 3. Konnektor mit Pfad `solutions/…` (läuft bei großen Solutions in den Konnektor-Timeout) — der erste funktionierende Weg wird gemerkt |
| Parsen | JSZip, eigener SpreadsheetML-Scanner mit Offsets | pure functions, Vitest |
| Namen auflösen | Tabelle steht in der Datei (`Entity name`). `EntityDefinitions` je 10 Tabellen mit `DisplayName` (Tabellenname im Explorer, wenn die Datei ihn nicht enthält) und `Attributes(MetadataId, LogicalName)`: Attribut-IDs = Spalten, übrige `DisplayName`/`Description`-IDs dieser Tabellen = Auswahlwerte. `name`/`description`-IDs per FetchXML `in` gegen `systemform` (→ Formular, `type`) und `savedquery` (→ Ansicht). Alles parallel (je 4 Anfragen, Blöcke von 10 Tabellen bzw. 50 IDs), jeder Block mit einer Wiederholung; ein fehlgeschlagener Block wird übersprungen, nicht der Rest. Spalten kommen zuerst an (Teilergebnis) | Konnektor, best effort |
| Formulare (Designer) | FetchXML auf `systemforms` (`formxml`, `name`, `objecttypecode`, `type`) für alle Formulare der gewählten Tabelle bzw. das gewählte Dashboard; Formulare, Ansichten und Auswahlwerte als getrennte Abfragen, je geladener Datei zwischengespeichert | Konnektor |
| Ansichten (Designer) | FetchXML auf `savedqueries` (`layoutxml`, `fetchxml`, `querytype`); Spalten verknüpfter Tabellen über die Aliase der `link-entity` | Konnektor |
| Apps (Designer) | `AppModule`-/`SiteMap`-Zeilen der Datei → FetchXML auf `appmodules` (`uniquename`) und `sitemaps` (`sitemapxml`). App ↔ Sitemap über `appmodulecomponent` (`componenttype` 62, `objectid` = `sitemapid`, `appmoduleidunique`) — die Namen weichen oft ab (Sales Hub: App `msdynce_saleshub`, Sitemap `SalesHubSitemap`); sonst über `sitemapnameunique` = `uniquename` ohne Groß-/Kleinschreibung. Sitemaps ohne App als eigene Einträge, Abfragen in Blöcken von 50 IDs | Konnektor |
| Auswahlwerte je Spalte (Designer) | `EntityDefinitions(LogicalName=…)/Attributes/Microsoft.Dynamics.CRM.{Picklist,MultiSelectPicklist,State,Status,Boolean}AttributeMetadata` mit `OptionSet` — als native GET-„APIs“ von der App selbst in `dataSourcesInfo` registriert (wie der Export); Zuordnung über die `MetadataId` der Option, sonst eindeutigen Basistext. Scheitert es, stehen die Werte ungruppiert | native Abfrage, best effort |
| Import | `ImportTranslation { TranslationFile, ImportJobId }`; Zip = Export-Zip mit ersetzter `CrmTranslations.xml` | native Aktion, sonst Konnektor |
| Fortschritt | FetchXML auf `importjobs` (`progress`, `startedon`, `completedon`, am Ende `data`) alle 2 s; Aufruf und Polling laufen parallel | Konnektor |
| Publish | `PublishAllXml` | native Aktion, sonst Konnektor |

**Wegwechsel nur ohne Risiko:** Beim Export probiert die App bei jedem
Fehler den nächsten Weg. Bei Import und Publish nur, wenn der vorige Weg
nachweislich nicht existiert („No HTTP resource“, 404). Ein Timeout kann
heißen, dass der Import auf dem Server schon läuft — ein zweiter Weg würde
doppelt importieren (`mayTryNextRoute` in `src/services/dataverseApi.ts`).

**Identität:** Benutzer-Connection (wie Serienplanung und Schedule Board
Manager), keine SP-Connection. Export und Import brauchen das Recht,
Anpassungen zu exportieren bzw. zu importieren (System Customizer).

**Kein Compile-Zwang auf `src/generated/`:** `src/services/dataverseApi.ts`
lädt die generierten Clients über `import.meta.glob`. Damit ist
`npm run build` auch auf einem frischen Clone grün, ohne Stubs. Was fehlt,
meldet die Einrichtungsseite.

### Format `CrmTranslations.xml`

Geprüft an echten Exporten aus Waldmann DEV (2026-10-03). Excel-2003-XML
(SpreadsheetML, UTF-8) in einer Zip-Datei mit `[Content_Types].xml`. Laut
Microsoft Learn muss der Import diese Zip-Datei „so wie exportiert“
bekommen. Drei Blätter:

- **Information** — `Organization ID:`, `Exported on:`, `Base language name:`,
  `Base language ID:`, `Solution Name:`.
- **Display Strings** — `Entity name`, `Display String Key`, je Sprache eine
  Spalte (Meldungstexte, Ribbon …).
- **Localized Labels** — `Entity name`, `Object ID` (GUID ohne Klammern),
  `Object Column Name`, je Sprache eine Spalte mit dem LCID als Überschrift.

`Entity name` ist der **logische Tabellenname** (`contact`, `wal_project`),
die Art der Beschriftung folgt aus `Object Column Name` — Groß-/Kleinschreibung
zählt:

| `Object Column Name` | `Object ID` | Art |
| --- | --- | --- |
| `LocalizedName`, `LocalizedCollectionName`, `Description` | MetadataId der Tabelle | Tabelle |
| `DisplayName`, `Description` | MetadataId der Spalte **oder** des Auswahlwerts | Spalte / Auswahlwert (nur über Metadaten unterscheidbar) |
| `displayname` | ID von Registerkarte, Abschnitt oder Feld im `formxml` | Formularbeschriftung |
| `name`, `description` | `formid` oder `savedqueryid` | Formular- bzw. Ansichtsname |
| `CustomLabel`, `button…` | — | Sonstiges |

Daneben stehen Zeilen, deren `Entity name` keine Tabelle ist: `Solution`,
`Publisher`, `RibbonCustomization`, `Workflow Categories`, `AppModule`,
`SiteMap`, `CustomAPI…`, `AppSetting` (→ Sonstiges) und Dashboards unter
ihrem Anzeigenamen („Dashboard GVL“, → Formular).

Der Parser ist generisch: Schlüsselspalten sind alle Spalten vor der ersten
LCID-Spalte, Überschriften werden ohne Groß-/Kleinschreibung erkannt. Er
versteht dünn besetzte Zeilen (`ss:Index`), `ss:MergeAcross`, Rich-Text in
`<Data>` und Präfixe (`ss:Cell`). Die Typ-Zuordnung steht in
`src/utils/languages.ts → componentKind`, die Verfeinerung (Auswahlwert,
Ansicht) in `resolveComponents`. Größenordnung: Waldmann Core = 1,7 MB Zip,
19 MB XML, 35.751 Zeilen, Parsen 0,2 s.

## Aufbau

Fluent UI v9, dieselben Konventionen wie `schedule-board-manager`
(`components/ui.tsx`, `Modal.tsx`, Hilfe-Drawer). Alle UI-Texte stehen in
`src/strings.ts`.

```
src/
├── PowerProvider.tsx            # Host-Erkennung (Power Apps vs. lokal → Mock)
├── config.ts                    # VITE_ORG_URL
├── strings.ts                   # alle UI-Texte (Deutsch)
├── types/translation.ts         # Datei, Zeilen, Zustände, Solutions, Importjob
├── utils/
│   ├── spreadsheetXml.ts        # SpreadsheetML-Scanner mit Offsets, XML-Escaping
│   ├── translationFile.ts       # parseTranslationFile, applyEdits, serializeTranslationFile
│   ├── gaps.ts                  # findGaps, Zustände, Zähler, filterRows
│   ├── glossary.ts              # suggestFromGlossary, consistencyReport
│   ├── csv.ts                   # exportCsv, parseCsv, csvToEdits
│   ├── translationZip.ts        # Zip lesen/neu bauen, Base64
│   ├── importLog.ts             # Status und Meldungen eines Importjobs
│   ├── languages.ts             # LCID-Namen, Typ-Zuordnung (componentKind)
│   ├── formXml.ts               # formxml → Registerkarten/Abschnitte/Felder
│   ├── viewXml.ts               # layoutxml + fetchxml → Spalten einer Ansicht
│   ├── sitemapXml.ts            # sitemapxml → Bereiche/Gruppen/Unterbereiche
│   ├── designerTree.ts          # Explorer: Apps, Tabellen mit Formularen/Ansichten, Dashboards
│   ├── labelIndex.ts            # Zeilen je ID+Spalte, Spalten und Namen je Tabelle, countLive
│   ├── derive.ts                # Zustände, Zähler, Vorschläge — inkrementell je Änderung
│   └── storage.ts / download.ts # Verlauf, „korrekt so“, Downloads
├── services/
│   ├── translationService.ts    # Interface + Auswahl Dataverse/Mock
│   ├── dataverseApi.ts          # generierte Clients per Glob, Aktionen mit Weg-Fallback
│   ├── dataverseTranslationService.ts
│   ├── runImport.ts             # Prüfen → Bauen → Import → Polling → Publish
│   ├── mockTranslationService.ts # In-Memory, simulierter Importjob („#fehler“ lässt ihn scheitern)
│   └── mockData.ts              # fiktives Fuhrpark-Szenario in en/de/fr (keine Kundendaten)
├── fixtures/CrmTranslations.sample.xml  # synthetische Test-Fixture, drei Sprachen
├── help/                        # HelpPanel, helpContent, helpContext
├── components/designer/         # Designer, Explorer, Inspector, LabelText, CanvasHeader, Splitter,
│                                # Home-/Table-/Form-/View-/AppCanvas, refs, nav, Breadcrumb/crumbs, designer.css,
│                                # context (Struktur-Kontext + Live-Store)
└── components/                  # StudioView, Matrix, LoadProgress, ApplyDialog,
                                 # CsvImportDialog, ConsistencyDialog, HistoryView, SetupView, ui, Modal
```

## Entwickeln

```bash
npm install
npm run dev      # http://localhost:3000 — ohne Host: Mock-Daten (Badge oben rechts)
npm run test     # Vitest: Scanner, Datei-Roundtrip, Lücken, Glossar, CSV, Zip, Importlog, runImport, Mock, Hilfe
npm run build    # tsc -b && vite build — auch ohne src/generated grün
npm run lint
```

Der Mock liefert vier Solutions: „Fuhrpark“, „Verträge & Teile“, „Basis“
(managed) und „Default“ mit ~2.350 Beschriftungen. Deutsch ist zu ~88 %
übersetzt, Französisch zu ~60 %, dazu ein paar Kopien des englischen Texts
und Varianten für den Konsistenz-Report. Ein Import ändert den Speicher; der
neue Stand erscheint danach in jedem Export.

## Einrichtung (Waldmann D365 DEV)

`power.config.json`, `src/generated/`, `.power/` und `.env` sind gitignored.
Die Schritte unten sind **remote nicht geprüft**. Logins nur per Device Code.
Für Code App und Connection dein **Benutzerkonto**
`AAD_ADM_HSO_Schwarz@waldmann.onmicrosoft.com` nehmen, nicht das SP-Profil
`Waldmann`.

1. **Benutzer-Connection** für Microsoft Dataverse anlegen: Maker-Portal →
   Umgebung Waldmann D365 DEV → Verbindungen → Neue Verbindung → Microsoft
   Dataverse, angemeldet als `AAD_ADM_HSO_Schwarz`. Die Connection-ID steht
   in der URL der Verbindung.
2. App initialisieren und Datenquellen hinzufügen:

   ```bash
   cd apps/translation-studio
   npm install
   pac auth create --deviceCode --environment https://waldmann-dev.crm4.dynamics.com --name WaldmannUser
   pac auth select --name WaldmannUser
   pac org who        # muss waldmann-dev.crm4.dynamics.com zeigen
   pac code init --environment 33146d71-4fe8-e1d7-af2f-f80fe968fc47 --displayName "Translation Studio" \
     --buildPath "./dist" --fileEntryPoint "index.html" --appUrl "http://localhost:3000"
   pac code add-data-source -a shared_commondataserviceforapps -c <connection-id>
   ```

3. **Native Aktionen** einbinden. Das geht nur mit der npm-CLI
   (`@microsoft/power-apps-cli`, geprüft mit 0.11.6), `pac code` kann es nicht.
   Die npm-CLI hat einen eigenen Login-Cache
   (`~/.powerapps-cli/cache/auth/msal_cache.json`) und bricht ab, wenn darin
   mehr als ein Konto liegt (solution-forge `CLAUDE.md`, „npm-CLI-Konto“).
   Im Waldmann-Tenant funktioniert **Device Code nicht** für die npm-CLI. Also
   `npx power-apps logout` und interaktiv anmelden, mit Kontoauswahl
   (`prompt: 'select_account'`): `scripts/login-npm-cli.mjs` aus
   solution-forge mit Authority `e75294b3-231c-459e-89ef-ad823a88d11f` und
   `acquireTokenInteractive` statt `acquireTokenByDeviceCode`. Den
   Browser-Login der CLI selbst nicht nehmen, der greift per SSO das falsche
   Konto. Wer die CLI sonst für Schulz nutzt, sichert den Cache vorher und
   stellt ihn danach wieder her.

   ```bash
   npx power-apps find-dataverse-api --search Translation   # zeigt Bindung und Parameter
   npx power-apps add-dataverse-api --api-name ImportTranslation --non-interactive
   npx power-apps add-dataverse-api --api-name PublishAllXml --non-interactive
   ```

   **`ExportTranslation` lässt sich nicht einbinden** (CLI 0.11.6, 2026-10-03):
   Die CLI hält die Collection-Bindung für einen Tabellennamen und scheitert
   mit 404 auf `EntityDefinitions(LogicalName='Collection(mscrm.solution)')`.
   Der Export läuft deshalb über die Konnektor-Wege 2 und 3 in `callAction`
   (siehe „Offen“). Weitere Tabellen-Datenquellen immer **vor** den Aktionen
   hinzufügen (Gotcha in `apps/audit-explorer/README.md`).
4. Org-URL setzen und bauen:

   ```bash
   cp .env.example .env   # VITE_ORG_URL=https://waldmann-dev.crm4.dynamics.com
   npm run build
   npm run dev            # „Local Play“-URL im selben Browser-Profil öffnen
   ```

5. In der App **Einrichtung**: alle Punkte grün? Dann „Export testen“ mit
   einer kleinen Solution. Erwartet: drei Sprachen (1033, 1031, 1036) und der
   Weg „native Aktion“.
6. **Akzeptanz:**
   1. Im Studio die Solution mit `wal_project` laden. Den Namen liefert
      `pac solution list`.
   2. Filter setzen: Typ „Spalten“, Tabelle `wal_project`, Zustand
      „Nur fehlende“, nur Französisch.
   3. Eine Lücke füllen, anwenden und veröffentlichen. Prüfen, dass das
      Label im Formular auf Französisch sichtbar ist.

   Zur Handprüfung der Lückenzahl im angemeldeten Browser
   (`https://waldmann-dev.crm4.dynamics.com`, F12 → Konsole) die fehlenden
   französischen Anzeigenamen zählen:

   ```js
   const r = await fetch("/api/data/v9.2/EntityDefinitions(LogicalName='wal_project')/Attributes?$select=LogicalName,DisplayName", { headers: { Accept: 'application/json' } }).then((x) => x.json())
   const has = (a, l) => a.DisplayName.LocalizedLabels.some((x) => x.LanguageCode === l && x.Label)
   r.value.filter((a) => has(a, 1033) && !has(a, 1036)).length
   ```

   Diese Zahl mit dem Studio vergleichen: Filter wie oben plus Volltext
   `DisplayName`.

**Push** (`pac code push`) nur nach Rücksprache. Profilwahl, Prüfung und Push
gehören in **einen** Aufruf (Root-`AGENTS.md`), zum Beispiel:

```bash
pac auth select --name WaldmannUser && pac org who | grep -q "waldmann-dev.crm4" \
  && grep -q 33146d71-4fe8-e1d7-af2f-f80fe968fc47 power.config.json && npm run build && pac code push
```

Danach die Gegenprobe im ASC-Playground (`ascsfacs.crm4`, nur 1033). Erwartet
wird eine grüne Einrichtungsseite, und „Export testen“ meldet „keine weiteren
Sprachen installiert“.

## Deployment-Stand

Erstes Deployment am 2026-10-03 nach Waldmann D365 DEV, noch nicht im
Browser gegen echtes Dataverse getestet (Einrichtung, „Export testen“ und
Akzeptanz stehen aus). Danach der ASC-Playground als Ein-Sprachen-Gegenprobe.

| Umgebung | Env-ID | App-ID | Stand |
| --- | --- | --- | --- |
| Waldmann D365 DEV | `33146d71-4fe8-e1d7-af2f-f80fe968fc47` | `0331862d-1088-41b5-9040-52a7dd85d00e` | gepusht 2026-10-03 |
| ASC SFA CS Playground | — | — | nicht deployt |

Waldmann D365 DEV im Detail:

- pac-Profil `WaldmannUser` (`AAD_ADM_HSO_Schwarz`, Device Code). Conditional
  Access lässt die Anmeldung nach 10 h ablaufen.
- Konnektor: Benutzer-Connection `253596d5064a48408195a7b73a844b9c`
  (Microsoft Dataverse, `AAD_ADM_HSO_Schwarz`). Die SP-Connection
  „D365 AppReg“ bewusst nicht.
- Native Aktionen: `ImportTranslation`, `PublishAllXml`. `ExportTranslation`
  fehlt (CLI-Fehler, siehe Einrichtung Schritt 3).
- Play: `https://apps.powerapps.com/play/e/33146d71-4fe8-e1d7-af2f-f80fe968fc47/app/0331862d-1088-41b5-9040-52a7dd85d00e?tenantId=e75294b3-231c-459e-89ef-ad823a88d11f`

## Offen

Per Microsoft Learn geprüft (Stand 2026-10-03):

- **Aktionen:**
  - `ExportTranslation` ist eine Aktion, gebunden an die
    `solution`-Collection. Parameter: `SolutionName` (Unique Name einer
    unmanaged Solution). Antwort: `ExportTranslationFile` (Edm.Binary).
  - `ImportTranslation` ist ungebunden, Parameter `TranslationFile`
    (Edm.Binary) und `ImportJobId` (Edm.Guid), ohne Rückgabe. Daneben gibt
    es `ImportTranslationAsync` (liefert `AsyncOperationId`).
  - `PublishAllXml` hat keine Parameter; daneben gibt es
    `PublishAllXmlAsync`.
- **Datei:** Die Zip-Datei muss `CrmTranslations.xml` und
  `[Content_Types].xml` im Root enthalten. Texte dürfen höchstens 500
  Zeichen haben. Der Export enthält alle Beschriftungen der Tabellen; wer
  Komponenten außerhalb der Solution ändert, macht sie zu Abhängigkeiten.
  Sitemap-Bereiche deckt der Export nicht ab.
- **Rechte:** `prvExportCustomization` / `prvImportCustomization` sind die
  Rechte „Export/Import Customizations“.

Offen, bis live geprüft — jeweils mit der Stelle im Code:

- **Weg für `ExportTranslation`.** Geprüft 2026-10-03 in Waldmann DEV: Die
  npm-CLI 0.11.6 kann die Aktion wegen der Collection-Bindung nicht
  generieren. Der Konnektor ungebunden liefert `Resource not found for the
  segment 'ExportTranslation'`, mit Pfad `solutions/…` läuft er bei Waldmann
  Core in „Invocation of API timed out“. Deshalb trägt die App die native
  Aktion selbst in `dataSourcesInfo` ein (`dataverseApi.ts`, gilt nur, wenn
  die App native Dataverse-APIs hat). **Ob das SDK den Aufruf so ausführt,
  ist live noch nicht bestätigt.**
- **Exportdauer gegen Timeout.** Direkt über die Web API gemessen: 4 Tabellen
  ≈ 48 s, Waldmann Core (154 Tabellen, 159 Formulare) **172 s**. Power Apps
  nennt 180 s als Grenze — große Solutions liegen knapp darunter. Ob der
  native Weg in der Code App dieselbe Grenze hat, ist offen. Ein
  asynchrones Gegenstück zu `ExportTranslation` gibt es nicht.
- **Antwortform der generierten Services** (`data` vs. `value`,
  `ExportTranslationFile` verschachtelt?). `pick()` sucht defensiv in drei
  Ebenen.
- **`SolutionName = "Default"`:** erlaubt? Microsoft nennt nur „unmanaged
  solution“. Taucht `Default` nicht in der Solution-Liste auf, fügt die App
  den Eintrag selbst hinzu.
- **Payload-Grenze.** Für Code Apps und den Konnektor ist keine
  Größengrenze dokumentiert, nur der Power-Apps-Timeout von 180 s. Bei
  Power Automate sind es 100 MB je Nachricht. Base64 macht die Datei um
  ein Drittel größer. Große Default-Exporte müssten ggf. verweigert werden.
- **Leere Zellen beim Import:** „unverändert“ oder „löschen“? Die App leert
  nie etwas, also ist das für v1 unkritisch. Entscheidet erst, ob man
  künftig nur geänderte Zeilen zurückschicken könnte.
- **`importjob`:**
  - Legt `ImportTranslation` die Zeile mit der übergebenen
    `ImportJobId` an?
  - Ist die Tabelle für den Benutzer lesbar (Microsoft: „For internal use
    only“)?
  - Welches Format hat `data` bei Übersetzungen? `parseImportLog` liest
    `result="failure|warning"` wie bei Solution-Importen.
- **Synchron oder asynchron?** Ob `ImportTranslation` erst nach dem Import
  zurückkehrt und dabei in den Timeout läuft, ist nicht dokumentiert. Die
  App pollt parallel zum Aufruf. Bleibt nach Ende des Aufrufs 60 s lang
  kein Job sichtbar, gilt der Import als nicht gestartet. Alternative:
  `ImportTranslationAsync` (Roadmap).
- **Blattstruktur und Typwerte:** geklärt am echten Export, siehe „Format“.
- **Namensauflösung.** `EntityDefinitions` mit `$filter` über zehn
  `LogicalName` und `$expand=Attributes` ist aus solution-forge bekannt,
  hier aber nicht live geprüft. Scheitert der Aufruf, bleiben Auswahlwerte
  unter „Spalten“ (sie werden nie geraten).
- **Designer-Abfragen.** Die nativen Metadaten-Abfragen für Auswahlwerte
  (selbst registriert wie der Export) und die Verknüpfung App ↔ Sitemap
  über `sitemapnameunique` = `appmodule.uniquename` sind live nicht
  geprüft. Eigene Sitemap-Titel stehen nicht im Übersetzungsexport; der
  Designer zeigt sie nur (rot gestrichelt, wenn die Zielsprache fehlt).
- **Formularelement-IDs.** Annahme: Die `Object ID` der `displayname`-Zeilen
  ist die `id` von Registerkarte, Abschnitt bzw. Feld im `formxml` (ohne
  Klammern, klein). Im Mock und in den Tests so, live noch nicht
  abgeglichen. Passt eine ID nicht, zeigt die Vorschau den Text aus dem
  `formxml` grau und nur lesend.
- **Rechte-Erkennung.** Der Fehlertext wird heuristisch geprüft
  (`privilege`, `prv…`, `0x80040220`). Welche Rechte genau die beiden
  Übersetzungsnachrichten verlangen, sagt die Doku nicht (die Seite
  „Privileges by message“ ist archiviert).
- `organization.languagecode` über den Konnektor (`organizations`) ist
  nicht geprüft; Fallback siehe Datenpfad.
