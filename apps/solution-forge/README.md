# Solution Forge

Power Apps **Code App** zum Verwalten von Dataverse-Solutions während der
Feature- und Bug-Entwicklung: Working Solutions anlegen, Komponenten
einsehen und Feature-/Bug-Solutions in eine Deployment Solution mergen.

## Konzept

Eine **Working Solution** ist eine normale unmanaged Dataverse-Solution,
deren Unique Name die Konvention der App trägt:

| Typ | Unique Name | Beispiel |
| --- | --- | --- |
| Feature | `feature_<ADO-ID>` | `feature_4711` |
| Bug | `bug_<ADO-ID>` | `bug_4732` |
| Deployment | `deploy_<name>` | `deploy_sprint_12` |

- **Titel** → `friendlyname` (Anzeigename der Solution)
- **Azure DevOps ID** → Teil des `uniquename` (der Typ-Präfix liefert den
  von Dataverse geforderten führenden Buchstaben)
- **Beschreibung** → `description`

Alle anderen unmanaged Solutions der Umgebung erscheinen unter „Other".

## Features

- **Workbench**: Liste aller Working Solutions mit Typ-Filter (Feature /
  Bug / Deployment), Suche über Titel, Unique Name und ADO-ID.
- **Anlegen**: Dialog mit Typ, ADO-ID, Titel, Beschreibung, Publisher und
  Live-Preview des Unique Name inkl. Duplikat-Prüfung. Die Solution wird
  real in Dataverse erzeugt und ist sofort im Maker-Portal sichtbar.
- **Detail**: Metadaten, Komponenten der Solution gruppiert nach Typ,
  Deep-Link **Open in Maker Portal** (Environment-ID kommt zur Laufzeit aus
  dem Host-Kontext) sowie ein Azure-DevOps-Link zum Work Item.
- **Merge**: Deployment Solution als Ziel wählen, Feature-/Bug-Solutions
  ankreuzen, Komponenten-Plan prüfen (Konflikte markiert, Duplikate werden
  übersprungen) und mergen (`AddSolutionComponent` je Komponente).

## Architektur

Die UI hängt nur am Interface `SolutionService` in
[`src/services/solutionService.ts`](src/services/solutionService.ts):

- `listSolutions()` – unmanaged Solutions (Tabelle `solution`), klassifiziert
  über die Unique-Name-Konvention (`src/utils/naming.ts`)
- `listPublishers()` – Publisher-Auswahl für den Anlage-Dialog
- `createWorkingSolution()` – legt die Solution in Dataverse an
  (`publisherid@odata.bind`)
- `listComponents(solutionId)` – Zeilen der Tabelle `solutioncomponent`
- `mergeIntoDeployment(target, sources)` – `AddSolutionComponent` pro
  Komponente, bereits vorhandene Objekte werden übersprungen

Implementierungen:

- `dataverseSolutionService.ts` – echte Impl., **fällt automatisch auf Mock
  zurück**, solange kein Power-Platform-Host bzw. `src/generated/` fehlt.
- `mockSolutionService.ts` + `mockData.ts` – In-Memory-Beispieldaten; auch
  Anlage und Merge funktionieren offline.

## Lokal starten

```bash
npm install
npm run dev      # http://localhost:3000 — läuft standalone mit Mock-Daten
```

## An die Umgebung anbinden

```bash
pac auth create --environment <ENV-ID>
power-apps init --display-name "Solution Forge" --environment-id <ENV-ID>

pac code add-data-source -a dataverse -t solution
pac code add-data-source -a dataverse -t publisher
pac code add-data-source -a dataverse -t solutioncomponent
```

`src/services/dataverseSolutionService.ts` importiert die generierten
Services **statisch** und setzt voraus, dass alle vier Generatoren gelaufen
sind — ohne `src/generated/` schlägt der Build fehl. Die Mapper sind an die
generierten Modelle (`SolutionsModel`, `SolutioncomponentsModel`,
`PublishersModel`) gebunden; nach einem erneuten Generieren mit anderen
Shapes die SELECT-Listen und Mapper dort nachziehen.

### Merge support

Der Merge nutzt die Dataverse-Action **AddSolutionComponent**
(`power-apps add-dataverse-api`, bereits eingebunden). Das
`rootcomponentbehavior` der Quelle wird übernommen: Tabellen, die nur als
Shell bzw. ohne Subkomponenten in der Feature-Solution stecken, landen
genauso im Deployment-Ziel.

### Azure-DevOps-Links

Work-Item-Links brauchen die Organisation/Projekt-Konfiguration in
`.env.local`:

```
VITE_ADO_ORG_URL=https://dev.azure.com/<org>
VITE_ADO_PROJECT=<projekt>
VITE_ENVIRONMENT_ID=<env-id>   # Fallback für Maker-Links außerhalb des Hosts
```

## Roadmap (Denkrichtung)

- **Azure-DevOps-Integration**: Work-Item-Status und Titel direkt am
  Solution-Eintrag anzeigen (Custom Connector / Graph der ADO REST API),
  Anlage einer Working Solution direkt aus einem zugewiesenen Work Item.
- **Komponenten-Anzeigenamen**: Auflösung über
  `msdyn_solutioncomponentsummary` (die Quelle des Maker-Portals) statt
  Typ + Objekt-GUID.
- **Release-Zug**: Versions-Bump und Export der Deployment Solution nach
  dem Merge, Status-Tracking pro Sprint.

## Build & Deploy

```bash
npm run build    # tsc -b && vite build
npm run lint
power-apps push  # veröffentlicht in die Umgebung
```
