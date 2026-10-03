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
| **Scope** | Solution aus `solution` wählen: unmanaged bearbeitbar, managed nur lesen. „Default“ mit Größenwarnung. Danach Zielsprachen an- und abwählen. Die Komponententypen wirken als Filter, weil der Export immer die ganze Solution enthält |
| **Lückenmatrix** | Zeile = Beschriftung (Typ, Komponente, Spalte), dazu der Basistext (nur lesen) und je Zielsprache eine editierbare Zelle. Zustände: **fehlt** (rot), **vermutlich unübersetzt** (identisch mit Basistext, gelb; per ✓ als „korrekt so“ markierbar, lokal je Solution gespeichert), **geändert** (blau, ↶ nimmt zurück), ok. Eigene Fensterung mit festen Spalten, auch für zehntausende Zeilen |
| **Filter & KPI** | Zustand (Standard: Lücken und Bearbeitetes), Typ (Tabellen, Spalten, Auswahlwerte, Formulare, Ansichten, Sonstiges), Tabelle (aus Metadaten), Volltext. KPI-Leiste je Sprache: Abdeckung in %, fehlt, vermutlich unübersetzt, geändert |
| **Glossar** | Vorschlag, wenn derselbe Basistext anderswo übersetzt ist: einzeln, „×n“ für alle gleichen Basistexte, oder als Bulk für alle gefilterten Zeilen. **Konsistenz**: gleicher Basistext mit verschiedenen Übersetzungen, „vereinheitlichen“ |
| **CSV-Roundtrip** | Gefilterte Zeilen als CSV (Semikolon, UTF-8 mit BOM, stabiler `Schlüssel` je Zeile, Formel-Schutz). Ausgefüllte Datei einlesen, Diff-Vorschau, übernehmen. Leere Zellen = unverändert, Basissprache wird ignoriert |
| **Anwenden** | Diff-Vorschau (Zellen je Sprache, vorher/nachher). Ablauf: Prüfen, ob ein Import läuft → Datei bauen → `ImportTranslation` → Importjob pollen (pausiert bei `document.hidden`, Bearbeiten gesperrt) → `PublishAllXml` (Standard an, abschaltbar, „Jetzt veröffentlichen“ nachträglich mit Bestätigung) → Ergebnis mit Meldungen des Jobs und Protokoll-Download |
| **Verlauf** | Die letzten 25 Läufe lokal im Browser (v2: eigene Tabelle) |
| **Einrichtung** | Prüft Org-URL, Konnektor, native Aktionen, Lesbarkeit von Solutions, Basissprache und Importjobs. „Export testen“ zeigt Weg, Größe, Sprachen und Anzahl der Beschriftungen. Bei nur einer Sprache: Hinweis „keine weiteren Sprachen installiert“ |
| **Hilfe** | Drawer mit Suche, 11 Abschnitte |

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
| Export | `ExportTranslation { SolutionName }` → `ExportTranslationFile` (Base64-Zip) | 1. native Aktion, 2. Konnektor „unbound action“, 3. Konnektor mit Pfad `solutions/Microsoft.Dynamics.CRM.ExportTranslation` — der erste funktionierende Weg wird gemerkt |
| Parsen | JSZip, eigener SpreadsheetML-Scanner mit Offsets | pure functions, Vitest |
| Namen auflösen | `EntityDefinitions` (MetadataId → Tabelle; Attribute je 10 Tabellen), `systemform`/`savedquery` per FetchXML `in` | Konnektor, best effort |
| Import | `ImportTranslation { TranslationFile, ImportJobId }`; Zip = Export-Zip mit ersetzter `CrmTranslations.xml` | native Aktion, sonst Konnektor |
| Fortschritt | FetchXML auf `importjobs` (`progress`, `startedon`, `completedon`, am Ende `data`) alle 2 s; Aufruf und Polling laufen parallel | Konnektor |
| Publish | `PublishAllXml` | native Aktion, sonst Konnektor |

**Identität:** Benutzer-Connection (wie Serienplanung und Schedule Board
Manager), keine SP-Connection. Export und Import brauchen das Recht,
Anpassungen zu exportieren bzw. zu importieren (System Customizer).

**Kein Compile-Zwang auf `src/generated/`:** `src/services/dataverseApi.ts`
lädt die generierten Clients über `import.meta.glob`. Damit ist
`npm run build` auch auf einem frischen Clone grün, ohne Stubs. Was fehlt,
meldet die Einrichtungsseite.

### Format `CrmTranslations.xml`

Excel-2003-XML (SpreadsheetML) in einer Zip-Datei mit `[Content_Types].xml`.
Laut Microsoft Learn muss der Import diese Zip-Datei „so wie exportiert“
bekommen. Blätter: „Information“ (Organisation, Basissprache), „Display
Strings“ und „Localized Labels“. „Localized Labels“ hat die Spalten
`Entity Name`, `Object Id`, `Object Column Name` und je Sprache eine Spalte
mit dem LCID als Überschrift.

Der Parser ist generisch: Schlüsselspalten sind alle Spalten vor der ersten
LCID-Spalte. Er versteht dünn besetzte Zeilen (`ss:Index`), `ss:MergeAcross`,
Rich-Text in `<Data>` und Präfixe (`ss:Cell`). Die Typ-Zuordnung
(`Entity` → Tabellen, `Attribute` → Spalten, `…Picklist…`/`OptionSet` →
Auswahlwerte, `…Form…` → Formulare, `SavedQuery` → Ansichten) steht in
`src/utils/languages.ts → componentKind`. Siehe „Offen“.

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
│   ├── languages.ts             # LCID-Namen, Typ-Zuordnung
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
└── components/                  # StudioView, Matrix, ApplyDialog, CsvImportDialog,
                                 # ConsistencyDialog, HistoryView, SetupView, ui, Modal
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

3. **Native Aktionen** einbinden. `ExportTranslation` ist laut Microsoft an
   die `solution`-Collection gebunden; ob der Konnektor sie ungebunden
   erreicht, ist offen. Die npm-CLI heißt in der aktuellen Doku `pa`, ältere
   Versionen `power-apps`:

   ```bash
   pa app find-dataverse-api --search "Translation"     # zeigt Bindung und Parameter
   pa app add dataverse-api --api-name ExportTranslation
   pa app add dataverse-api --api-name ImportTranslation
   pa app add dataverse-api --api-name PublishAllXml
   ```

   Danach in `src/generated/services/` nachsehen, welche Signatur
   `ExportTranslationService.ExportTranslation` hat. Erwartet die App einen
   anderen ersten Parameter, `callAction` in `src/services/dataverseApi.ts`
   anpassen (siehe „Offen“).
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

Noch nicht deployt, nicht gegen echtes Dataverse getestet. Ziel zuerst:
Waldmann D365 DEV (`waldmann-dev.crm4`, Env
`33146d71-4fe8-e1d7-af2f-f80fe968fc47`); danach der ASC-Playground als
Ein-Sprachen-Gegenprobe.

| Umgebung | Env-ID | App-ID | Stand |
| --- | --- | --- | --- |
| Waldmann D365 DEV | `33146d71-4fe8-e1d7-af2f-f80fe968fc47` | — | nicht deployt |
| ASC SFA CS Playground | — | — | nicht deployt |

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

- **Weg für `ExportTranslation`.** Geht der native generierte Service mit
  einer Collection-Bindung? Wie sieht seine Signatur aus (erwartet die
  Doku für gebundene Aktionen eine ID als ersten Parameter)? Weist der
  Konnektor die Aktion als „unbound“ ab? Der dritte Weg
  `solutions/Microsoft.Dynamics.CRM.ExportTranslation` über den Konnektor
  ist ein Versuch ohne Beleg. Code: `callAction` in
  `src/services/dataverseApi.ts`; „Export testen“ zeigt den genutzten Weg.
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
- **Blattstruktur und Typwerte:** Die Spaltennamen, das Informationsblatt
  und die Werte in `Entity Name` stammen aus Sekundärquellen und
  Erfahrung, nicht aus der Microsoft-Doku. Nach dem ersten echten Export
  die Typ-Zuordnung (`componentKind`) und die Fixture abgleichen.
- **Namensauflösung.** Annahme: `Object Id` ist bei Tabellen und Spalten
  die `MetadataId`, bei Formularen und Ansichten die `formid` bzw.
  `savedqueryid`. Bei Auswahlwerten ist die Tabelle unbekannt.
  `EntityDefinitions` mit `$expand=Attributes` für zehn Tabellen in einem
  Aufruf ist aus solution-forge bekannt, hier aber nicht geprüft.
- **Rechte-Erkennung.** Der Fehlertext wird heuristisch geprüft
  (`privilege`, `prv…`, `0x80040220`). Welche Rechte genau die beiden
  Übersetzungsnachrichten verlangen, sagt die Doku nicht (die Seite
  „Privileges by message“ ist archiviert).
- `organization.languagecode` über den Konnektor (`organizations`) ist
  nicht geprüft; Fallback siehe Datenpfad.
