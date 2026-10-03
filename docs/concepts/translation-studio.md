# Konzept — Translation Studio (Übersetzungs-Studio)

Stand 2026-10-03. Konzept aus dem Brainstorming (Idee 6), gedacht für eine
eigenständige Claude-Session. Zielordner: `apps/translation-studio/`.
Der Kickoff-Prompt steht am Ende.

## Problem

Dataverse-Beschriftungen (Tabellen- und Spaltennamen, Auswahlwerte,
Formular- und Ansichtsbeschriftungen) sind pro installierter Sprache
gepflegt. Fehlt eine Übersetzung, sehen französische Nutzer englische
Feldnamen. Der Standardweg ist: Übersetzungen exportieren → Zip → Excel
(SpreadsheetML mit tausenden Zeilen, ohne Filter auf „fehlt") → Import →
Publish. Niemand sieht, **was** fehlt, und niemand pflegt das laufend.
Waldmann betreibt drei Sprachen (1033 en-US, 1031 de-DE, 1036 fr-FR), das
Problem ist dort akut; jeder mehrsprachige Kunde hat es.

## Nutzer und Nutzen

- **System Customizer / Admin**: sieht Lücken je Solution, Tabelle und
  Sprache, pflegt Übersetzungen inline, importiert und publisht mit einem
  Klick, bekommt ein Protokoll.
- **Fachabteilung** (ohne Dataverse-Rechte): bekommt eine Excel-/CSV-Liste
  nur mit den Lücken, füllt sie, der Admin spielt sie zurück.
- Produktkandidat für alle Kunden mit mehr als einer Sprache. Keine
  Kundendaten im Spiel, nur Metadaten.

## Was die App kann (v1)

1. **Scope wählen**: Solution (unmanaged, sichtbar, aus `solutions`) oder
   „Default" (mit Warnung: groß), Komponententypen (Tabellen, Spalten,
   Auswahlwerte, Formulare, Ansichten, Sonstiges), Sprachen.
2. **Lückenmatrix**: Zeile = Beschriftung (Komponente, Typ, Objekt-ID,
   Spalte), Spalten = Basissprache (read-only) plus eine editierbare Zelle
   je weiterer Sprache. Zustände: **fehlt** (leer, rot), **vermutlich
   unübersetzt** (identisch mit Basistext, gelb; Heuristik, per Klick als
   „korrekt so" markierbar), **geändert** (lokal editiert, blau), ok.
   Filter: nur fehlend, nur geändert, Typ, Tabelle, Volltext. Zähler je
   Sprache in einer KPI-Leiste.
3. **Glossar-Vorschläge**: derselbe Basistext ist an anderer Stelle schon
   übersetzt → Vorschlag mit einem Klick übernehmen; „für alle gleichen
   Basistexte übernehmen" als Bulk. Konsistenz-Report: gleicher Basistext,
   verschiedene Übersetzungen.
4. **Excel-Roundtrip**: Lückenliste als CSV/xlsx exportieren (nur die
   gewählten Zeilen, mit stabilen Schlüsseln Objekt-ID + Spalte + Sprache),
   ausgefüllte Datei wieder einlesen → Diff-Vorschau, dann wie 5.
5. **Anwenden**: Diff-Vorschau (nur geänderte Zellen, Anzahl je Sprache,
   Liste) → Import → Fortschritt des Importjobs → Publish (Standard an,
   abschaltbar) → Ergebnisprotokoll mit Fehlern je Zeile. Verlauf der Läufe
   lokal (wie der Verlauf im Schedule Board Manager), v2 eigene Tabelle.
6. **Einrichtung/Diagnose**: Org-URL gesetzt, Konnektor erreichbar,
   `solutions` lesbar, Export erlaubt (Probe mit kleiner Solution),
   Sprachen erkannt. Bei nur einer Sprache: klarer Hinweis statt leerer
   Matrix.

Bewusst nicht in v1: maschinelle Übersetzung (DeepL/Azure Translator über
Konnektor ist v2, braucht Datenschutz-Entscheidung), Bearbeiten der
Basissprache, Beschriftungen in Canvas Apps/Gen Pages/Flows, Rollen-Namen.

## Technischer Weg (die zentrale Entscheidung)

Der Dataverse-Konnektor kann **nur POST-Aktionen und Tabellen-Reads**
(solution-forge `CLAUDE.md`, Gotcha #8): kein PUT auf `EntityDefinitions`,
keine GET-Functions. Deshalb nicht über Metadaten-Updates gehen, sondern
über den **nativen Übersetzungs-Export/-Import**, der genau eine Aktion je
Richtung ist und alle Komponententypen in einem Format abdeckt:

| Schritt | Aufruf | Hinweis |
| --- | --- | --- |
| Export | `PerformUnboundActionWithOrganization(orgUrl, 'ExportTranslation', { SolutionName })` | Antwort `ExportTranslationFile` = Base64-Zip mit `CrmTranslations.xml` (Excel-2003-SpreadsheetML, Sheets „Information", „Display Strings", „Localized Labels"; Kopfzeile nennt die Sprach-Spalten → daraus die provisionierten Sprachen ableiten, keine GET-Function nötig) |
| Parsen | JSZip + `DOMParser` im Browser | pure functions `parseTranslationFile`, `findGaps`, `suggestFromGlossary`, `applyEdits`, `serializeTranslationFile` mit Vitest; Fixture = anonymisierte Mini-Datei mit drei Sprachen |
| Import | `ImportTranslation { TranslationFile (Base64-Zip), ImportJobId (neue GUID) }` | vollständige Datei mit angewendeten Änderungen zurückschreiben, Zeilenreihenfolge und alle Sheets erhalten; läuft asynchron |
| Fortschritt | Tabelle `importjob` per Konnektor (`progress`, `completedon`, `data`) pollen | Polling pausiert bei `document.hidden` |
| Publish | `PublishAllXml` (Aktion) | explizit, mit Confirm |
| Scope-Liste | `solutions` (`ismanaged eq false and isvisible eq true`) | managed Solutions read-only anzeigen |

Schnellpfad für einzelne Auswahlwerte (`UpdateOptionValue` mit
`MergeLabels: true`, ebenfalls POST) ist v2; v1 hat einen Pfad.

**Vor dem Code live oder per Doku verifizieren** (offene Punkte, in der
README unter „Offen" führen, bis geprüft): exakte Parameternamen der beiden
Aktionen in der Web-API-Referenz; ob `ExportTranslation` mit `SolutionName
= "Default"` erlaubt ist; Payload-Grenze des Konnektors für die
Base64-Datei (große Default-Exports ggf. verweigern und auf eine Solution
verweisen); ob leere Zellen beim Import „unverändert" oder „löschen"
bedeuten (bestimmt, ob die Datei komplett oder nur mit geänderten Zeilen
zurückgeht); ob `importjob` für den Nutzer lesbar ist.

Identität: **Benutzer-Connection**, keine SP-Connection (wie Serienplanung
und Schedule Board Manager). Export/Import brauchen System Customizer; die
App fängt den Fehler ab und schaltet auf read-only mit Klartext-Hinweis.

## Architektur (Repo-Muster)

- Vite + React 19 + TypeScript + Fluent UI v9 (wie `schedule-board-manager`),
  Service-Interface `translationService.ts` mit `dataverseTranslationService`
  und `mockTranslationService` (Mock liefert eine synthetische Datei mit
  drei Sprachen und eingebauten Lücken; die App ist offline komplett
  demobar inklusive simuliertem Importjob).
- Zustände: Matrix bis einige zehntausend Zeilen → virtualisierte Liste
  (eigene Fensterung, keine schwere Grid-Lib), Filter als pure functions.
- Hilfe-Panel wie im Schedule Board Manager (`src/help/helpContent.ts`),
  bei jeder sichtbaren Änderung nachziehen.
- `power.config.json`, `src/generated/`, `.env` gitignored; `.env.example`
  mit `VITE_ORG_URL`. Einrichtung in der README wie bei `series-planner`.
- UI-Sprache Deutsch, Strings zentral in einer Datei (die App selbst
  könnte später mehrsprachig werden, Ironie vermeiden).

## Leitplanken

- Nie eine unveränderte Datei importieren; nie die Basissprache schreiben.
- Ein Import zur Zeit; Konfigurations-Sperre, solange der Job läuft.
- Datei, die zurückgeht, ist die exportierte Datei plus Edits; keine
  Zeilen entfernen, keine Spalten umsortieren, XML korrekt escapen.
- Roundtrip-Test: Export → Serialisierung ohne Edits ist nach
  Whitespace-Normalisierung identisch.
- Managed Solution gewählt → read-only, Hinweis.
- Heuristik „unübersetzt" nie automatisch schreiben, nur markieren.

## Akzeptanz

- In Waldmann DEV: Lücke in `fr-FR` an einer Spalte des Projekts im Studio
  füllen, importieren, publishen, Label im Formular sichtbar; die
  Lückenzahl für eine Tabelle stimmt mit einer Handprüfung überein.
- Roundtrip-Test grün; Vitest für alle pure functions; `npm run build`
  und `npm run lint` grün; Mock-Modus zeigt Matrix, Vorschläge, Diff,
  simulierten Import.
- Im Playground (nur 1033): Einrichtungsseite grün, Matrix sagt „keine
  weiteren Sprachen installiert".

## Zielumgebungen

- Erst **Waldmann D365 DEV** (`https://waldmann-dev.crm4.dynamics.com`,
  Env `33146d71-4fe8-e1d7-af2f-f80fe968fc47`, pac-Profil `Waldmann` ist ein
  SP; Browser-Test als `AAD_ADM_HSO_Schwarz@waldmann.onmicrosoft.com`).
  Details in `AGENTS.md` (Abschnitt Waldmann) und `apps/my-day/README.md`.
- Danach ASC-Playground als Ein-Sprachen-Gegenprobe.

## Kickoff-Prompt

```text
Lies zuerst AGENTS.md im Repo-Root, dann docs/concepts/translation-studio.md
(das Konzept, verbindlich) und zur Orientierung an den Mustern
apps/schedule-board-manager/README.md plus dessen src/services/
(dataverseMetadata.ts, mockBoardService.ts, Service-Interface) und
apps/series-planner/README.md (Einrichtungsseite, pure functions mit
Vitest, Abschnitt „Offen"). Für die Konnektor-Grenzen lies in
apps/solution-forge/CLAUDE.md die Gotchas #4 und #8.

Aufgabe: Lege die neue Code App apps/translation-studio/ („Translation
Studio") an und setze v1 aus dem Konzept um. Vorgehen:
1. Scaffold nach docs/SETUP.md (degit des Vite-Templates, npm install,
   Fluent UI v9, Vitest, ESLint-Konfiguration wie schedule-board-manager);
   power.config.json, src/generated/ und .env gitignored, .env.example mit
   VITE_ORG_URL.
2. Verifiziere vor dem Code per offizieller Microsoft-Doku (WebFetch) die
   Web-API-Aktionen ExportTranslation, ImportTranslation, PublishAllXml und
   den Aufbau von CrmTranslations.xml; halte jede nicht verifizierbare
   Annahme in README „Offen" fest.
3. Baue mock-first: Service-Interface, Dataverse- und Mock-Implementierung,
   pure functions (parseTranslationFile, findGaps, suggestFromGlossary,
   applyEdits, serializeTranslationFile) mit Vitest und einer
   synthetischen SpreadsheetML-Fixture mit drei Sprachen; Roundtrip-Test.
4. UI: Scope-Auswahl, virtualisierte Lückenmatrix mit Zuständen und
   Filtern, Glossar-Vorschläge, CSV-Export/-Import, Diff-Vorschau, Import
   mit Importjob-Fortschritt und Publish, Einrichtungsseite, Hilfe-Panel.
   UI-Sprache Deutsch, Strings zentral.
5. README (Problem, Datenpfad, Einrichtung mit den pac-/power-apps-
   Befehlen für Waldmann DEV, Deployment-Stand, Offen), Roadmap.md,
   Eintrag in apps/README.md.
Regeln: npm run build, lint und test müssen grün sein; Conventional
Commits mit Scope translation-studio auf Branch feature/translation-studio;
kein Push und kein Deployment ohne Rückfrage; pac/az-Logins nur per Device
Code und nur, wenn ich es anstoße — was du remote nicht prüfen kannst,
dokumentiere als konkrete Befehle für mich. Keine Kundendaten in Mocks.
Melde dich mit Zwischenständen, wenn das Scaffold steht und wenn der
Mock-Modus komplett läuft.
```
