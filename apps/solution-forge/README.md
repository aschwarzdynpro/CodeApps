# Solution Administration Console

Power Apps **Code App** zum Verwalten von Dataverse-Solutions während der
Feature- und Bug-Entwicklung: Working Solutions anlegen, Komponenten
einsehen, Feature-/Bug-Solutions in eine Deployment Solution mergen und
Releases vor dem Deployment prüfen (Dependency Check, Layer Inspector,
App Sharing) — gebündelt im **ALM Detective**, der die Checks phasenweise
durchläuft und einen nach Kritikalität sortierten Bericht erstellt.

## Konzept

Eine **Working Solution** besteht aus zwei Teilen:

1. **Darstellungs-Schicht**: ein Datensatz der Tabelle
   `ssid_workingsolution` mit Titel (`ssid_name`), dediziertem
   DevOps-ID-Feld (`ssid_devopsid`), Typ (`sst_type_opt`: Feature / Bug /
   Release), Owner, Deployment-Status (`ssid_deploymentstatus`) und
   Merge-Log-Feldern (`sst_mergeintodeploymentsolution`,
   `sst_lastmergeintodeploymentsolution`).
2. **Echte Solution**: die unmanaged Dataverse-Solution mit den
   Komponenten, verlinkt über `ssid_uniquesolutionname`.

Beim Anlegen erzeugt die App beides; der Unique Name folgt weiterhin der
Konvention (`feature_<id>` / `bug_<id>` / `deploy_<name>`). Unmanaged
Solutions **ohne** Darstellungs-Datensatz erscheinen weiterhin in der
Liste (Klassifizierung über die Namenskonvention, sonst „Other").
Findet sich zur Row keine echte Solution, wird das im Detail markiert
(Komponenten/Merge/Compare sind dann deaktiviert).

Nach einem Merge setzt die App auf den Quell-Datensätzen automatisch
`sst_mergeintodeploymentsolution`, den Zeitstempel und den
Deployment-Status „Merged into Deployment Solution".

## Features

- **Kollisions-Radar**: „Scan collisions" lädt die Komponenten aller
  getrackten Working Solutions (ohne Releases) und markiert Komponenten,
  die in **mehr als einer** offenen Working Solution stecken — wer zuletzt
  deployt, überschreibt. Betroffene Solutions bekommen einen ⚠-Chip; die
  Detail-Ansicht listet die geteilten Komponenten und mit wem.
- **Workbench**: Liste aller Working Solutions mit Typ-Filter (Feature /
  Bug / Deployment), Suche über Titel, Unique Name und ADO-ID. Mit dem
  Schalter **incl. components** durchsucht die Suche zusätzlich die
  Komponenten-Anzeigenamen aller Solutions („welche Solutions enthalten
  ‚SST | Monteur'?") — dafür wird beim Aktivieren einmalig ein
  Komponenten-Index aufgebaut; Treffer werden als Chips an der Solution
  angezeigt.
- **Anlegen**: Dialog mit Typ, ADO-ID, Titel, Beschreibung, Publisher und
  Live-Preview des Unique Name inkl. Duplikat-Prüfung. Die Solution wird
  real in Dataverse erzeugt und ist sofort im Maker-Portal sichtbar.
- **Detail**: Metadaten, Komponenten der Solution gruppiert nach Typ in
  aufklappbaren Gruppen (Anzeigenamen via `msdyn_solutioncomponentsummary`,
  derselben Quelle wie im Maker-Portal), Deep-Link **Open in Maker Portal**
  (Environment-ID kommt zur Laufzeit aus dem Host-Kontext) sowie ein
  Azure-DevOps-Link zum Work Item.
- **Merge**: Deployment Solution als Ziel wählen, Feature-/Bug-Solutions
  ankreuzen, Komponenten-Plan prüfen (Konflikte markiert, Duplikate werden
  übersprungen) und mergen (`AddSolutionComponent` je Komponente).
- **Compare (ALM)**: Release-Solution wählen → Cloud Flows, Workflows,
  Business Rules, Plugin Steps und Scripts werden über **DEV / UAT / PROD**
  verglichen, gruppiert nach Typ in aufklappbaren Sektionen. Abweichungen
  sind markiert und filterbar: *Missing* (nicht im Ziel) und *Status drift*
  (z. B. Flow Draft in PROD, Plugin Step deaktiviert). Cross-Env-Zugriff
  über den Microsoft-Dataverse-Konnektor (`ListRecordsWithOrganization`,
  läuft mit den Rechten des angemeldeten Benutzers in der jeweiligen
  Umgebung). Umgebungen aktuell hart in `config.ts` (`ENVIRONMENTS`).
  Hinweis: `modifiedon` wird bewusst nicht als Drift-Signal gewertet
  (Solution-Import überschreibt es). **Unmanaged Layer, die Existenz aller
  übrigen Komponenten-Typen und der Definitions-Diff** sind in den
  **Layer Inspector** gewandert.
- **Dependency Check**: Release-Solution gegen UAT/PROD prüfen
  (`RetrieveMissingDependencies`) — listet benötigte Komponenten, die weder
  in der Solution noch im Ziel vorhanden sind (Import würde scheitern),
  inkl. **Add to Solution** je fehlender Komponente. Name-gematchte Typen
  (EnvVars, Connection References, Web Resources, Canvas Apps) zählen als
  vorhanden, wenn das Ziel sie unter gleichem Namen kennt.
- **Layer Inspector**: **alle** Komponenten einer Release-Solution gegen die
  Layer-Stacks im Ziel-Env (UAT/PROD) prüfen (virtuelle Tabelle
  `msdyn_componentlayer`, eine Abfrage pro Komponente). Verdict je Komponente:
  **unmanaged „Active"-Layer über managed** (direkte Customization, maskiert
  Deployments), **unmanaged-only**, **Missing** (= Existenz-Check: zeigt, ob
  Plugin Assemblies, Custom APIs etc. überhaupt deployed sind) oder *clean*.
  **Environment Variables (Typ 380/381) werden übersprungen** — sie tragen per
  Definition einen Active-Layer (der aktuelle Wert) und wären sonst nur
  False Positives.
  Ergebnisse erscheinen **pro Komponententyp, sobald die Sektion fertig ist**
  (Rest lädt im Hintergrund); Sektionen sind aufklappbar. Zwei Filter-Chips
  über der Liste (**Missing** / **Unmanaged layer**) blenden die Ergebnisse
  auf die jeweilige Kategorie ein. Für diffbare Typen
  (Flows/Workflows/Business Rules/Scripts) ein **⇄ diff DEV vs. Ziel**
  (Side-by-side). Klassische Typnamen statisch gemappt, solution-aware Typen
  dynamisch aus `solutioncomponentdefinition`; Typen ohne Layer-Daten bleiben
  „No layer data". Zeilen mit unmanaged Layer
  bekommen einen Absprung ins Maker-Portal des Ziel-Environments: für
  Tabellen, Canvas Apps, Custom Pages, Cloud Flows, Workflows/BPF/Actions,
  Web Resources, Plugin Assemblies und Plugin Steps direkt auf die **solution
  layers**-Seite der Komponente (**↗ layers in {env}**), sonst auf die
  Solution (**↗ solution in {env}**) →
  Komponente wählen → „Advanced → See solution layers". Die Ziel-Env-Solution-
  ID wird per `uniquename` aufgelöst (IDs divergieren je Env); die Maker-Route
  je Typ baut `config.makerLayerPath` (Canvas App vs. Custom Page über
  `canvasapptype`, Cloud Flow vs. Process über Workflow-`category` — dafür je
  ein Bulk-Lookup auf `canvasapps`/`workflows`). Entity-Sub-Komponenten
  (Forms/Views/Columns/Business Rules) brauchen die Tabellen-ID in der Route
  und fallen vorerst auf die Solution-Objektliste zurück, ebenso ungemappte
  Typen. Das Entfernen passiert bewusst im Portal, nicht in der App (nicht
  umkehrbar). Eine in-app-Variante über `BulkRemoveActiveCustomizations` wäre
  technisch möglich, liefert aber keinen Erfolgs-Payload und ist destruktiv
  cross-env (`RemoveActiveCustomizations` ist im Web API gar nicht erreichbar —
  nur SOAP); Details in CLAUDE.md gotcha #8.
- **App Sharing**: Canvas Apps und Custom Pages einer Solution daraufhin
  prüfen, mit wem sie in DEV/UAT/PROD geteilt sind. Solution-Import
  überträgt **kein** User-Sharing — eine deployte Canvas App erreicht
  niemanden, bis sie im Ziel geteilt wird; genau diese Lücke wird oben
  hervorgehoben. Cross-Env-Match über den import-stabilen `canvasapp.name`;
  die Prinzipale kommen aus der Sharing-Tabelle `principalobjectaccess`
  (per FetchXML über `ListRecordsWithOrganization`, gefiltert auf
  `objectid`), je Umgebung über den bereits verdrahteten Konnektor — keine
  neue Data Source. (Der direkte Weg `RetrieveSharedPrincipalsAndAccess`
  scheidet aus: der Konnektor kann nur POST-Actions cross-env aufrufen,
  keine GET-Functions.) Custom Pages (`canvasapptype 2`) erhalten Zugriff
  über die Rollen der modellgetriebenen App, nicht über direktes Sharing —
  „nicht geteilt" ist dort normal.
- **ALM Detective**: Pre-Deployment-Audit, das die ausgewählten ALM-Checks
  (Dependency Check, Compare inkl. Content Drift, Layer Inspector, App
  Sharing) phasenweise gegen eine Release-Solution laufen lässt und die
  Ergebnisse zu **einem nach Kritikalität sortierten Bericht** bündelt.
  Ein Phasen-Stepper zeigt den Fortschritt je Check; Findings sind nach
  Severity gruppiert/filterbar (Critical: fehlende Dependency; High:
  unmanaged Layer über managed Komponente, Canvas App nicht geteilt;
  Medium: Status-/Content-Drift; Low: Missing in Target, unmanaged-only,
  Lookup-Fehler). Kompakter als die Einzelseiten — für die volle Tiefe den
  jeweiligen Feature-Tab öffnen. Der Detective orchestriert nur die
  vorhandenen Services (kein eigener Datenpfad).

## Architektur

Die UI hängt nur am Interface `SolutionService` in
[`src/services/solutionService.ts`](src/services/solutionService.ts):

- `listSolutions()` – unmanaged Solutions (Tabelle `solution`), klassifiziert
  über die Unique-Name-Konvention (`src/utils/naming.ts`)
- `listPublishers()` – Publisher-Auswahl für den Anlage-Dialog
- `createWorkingSolution()` – legt die Solution in Dataverse an
  (`publisherid@odata.bind`)
- `listComponents(solutionId)` – Anzeigenamen aus der virtuellen Tabelle
  `msdyn_solutioncomponentsummary`, gejoint mit `solutioncomponent` für das
  `rootcomponentbehavior` (Fallback auf die Roh-Tabelle, falls die Summary
  nichts liefert)
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
power-apps init --display-name "Solution Administration Console" --environment-id <ENV-ID>

pac code add-data-source -a dataverse -t solution
pac code add-data-source -a dataverse -t publisher
pac code add-data-source -a dataverse -t solutioncomponent
pac code add-data-source -a dataverse -t msdyn_solutioncomponentsummary
```

> **Achtung beim Nachgenerieren:** Sobald die Action
> `AddSolutionComponent` eingebunden ist, schlägt jedes weitere
> `pac code add-data-source` fehl („The JSON does not represent a valid
> data source") — die CLI kann das Action-Schema beim Reprocessing nicht
> lesen. Deshalb **immer über das Wrapper-Skript gehen**, das den
> Workaround (Schema beiseite legen + `addsolutioncomponent`-Block in
> `dataSourcesInfo.ts` wiederherstellen) automatisch erledigt:
>
> ```powershell
> ./scripts/add-data-source.ps1 -a dataverse -t <tabelle>
> ```

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

### Azure DevOps anbinden

Die Detail-Ansicht zeigt pro Solution ein Work-Item-Panel (Status,
Assignee, Absprung). Die Nummer kommt aus dem Unique Name
(`feature_4711`), einem rein numerischen Unique Name oder dem Titel
(„Assembly App V2 | 11941").

Angebunden über den offiziellen **Azure-DevOps-Konnektor** (bereits
verdrahtet): `dataverseSolutionService.getWorkItem()` ruft die generierte
Operation `ListWorkItems` auf und mappt `System_State` /
`System_AssignedTo` / `System_Title`. Einrichtung in einer neuen
Umgebung:

1. In [make.powerapps.com](https://make.powerapps.com) → Connections →
   **New connection** → *Azure DevOps* → mit dem DevOps-Konto anmelden.
2. `pac connection list` → Connection-ID notieren.
3. ```bash
   pac code add-data-source -a shared_visualstudioteamservices -c <connection-id>
   ```
   (vorher das `AddSolutionComponent`-Schema beiseite legen, siehe
   „Achtung beim Nachgenerieren").

Organisation/Projekt stehen in [`.env`](.env) (zur Build-Zeit
eingebacken, lokal via `.env.local` überschreibbar):

```
VITE_ADO_ORG_URL=https://dev.azure.com/SchulzD365
VITE_ADO_PROJECT=D365UO
VITE_ENVIRONMENT_ID=<env-id>   # Fallback für Maker-Links außerhalb des Hosts
```

Andere Benutzer der App werden beim ersten Start aufgefordert, ihre
eigene Azure-DevOps-Verbindung zu bestätigen (Standard-Verhalten von
Konnektor-Connections in Code Apps).

## Roadmap (Denkrichtung)

- **Service-Principal-Auth** für beide Konnektoren — konkreter
  Umsetzungsplan in [`TODO.md`](TODO.md).

- **DevOps weiterdenken**: Anlage einer Working Solution direkt aus einem
  zugewiesenen Work Item, Status-Chips in der Solution-Liste.
- **Release-Zug**: Versions-Bump und Export der Deployment Solution nach
  dem Merge, Status-Tracking pro Sprint.

## Build & Deploy

```bash
npm run build    # tsc -b && vite build
npm run lint
power-apps push  # veröffentlicht in die Umgebung
```
