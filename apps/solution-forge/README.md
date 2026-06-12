# Solution Administration Console

Power Apps **Code App** zum Verwalten von Dataverse-Solutions während der
Feature- und Bug-Entwicklung: Working Solutions anlegen, Komponenten
einsehen, Feature-/Bug-Solutions in eine Deployment Solution mergen und
Releases vor dem Deployment prüfen (Dependency Check, Layer Inspector).

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
- **Compare (ALM)**: Solution wählen → Cloud Flows, Workflows, Business
  Rules, Plugin Steps und Scripts werden über **DEV / UAT / PROD**
  verglichen (Status, modifiedon, managed/unmanaged). Abweichungen sind
  markiert und filterbar: *Missing*, *Status drift*, *Unmanaged in target*.
  Cross-Env-Zugriff über den Microsoft-Dataverse-Konnektor
  (`ListRecordsWithOrganization`, läuft mit den Rechten des angemeldeten
  Benutzers in der jeweiligen Umgebung). Umgebungen sind aktuell hart in
  `config.ts` hinterlegt (`ENVIRONMENTS`) — geplante Ausbaustufe ist eine
  Steuertabelle. Hinweis: `modifiedon` wird bewusst nicht als Drift-Signal
  gewertet (Solution-Import überschreibt es). Optionaler Zweitpass
  **Inhalts-Drift**: hasht je Komponente die Definition
  (`clientdata`/`xaml`/`content`) in allen Umgebungen und markiert
  *Content drift*, wenn sie sich unterscheidet — mit **Side-by-side-Diff**
  pro Zeile (⇄ diff) zwischen zwei wählbaren Umgebungen. Cloud-Flow-JSON
  wird pretty-printed, Web Resources base64-dekodiert (binäre zeigen nur
  die Größe). Wird on demand geladen, weil die Definitionen groß sein
  können; mögliches False-Positive: ein Import kann `clientdata` umschreiben
  (eingebettete Connection-Infos) — der Diff zeigt, ob die Änderung echt ist.
- **Dependency Check**: Release-Solution gegen UAT/PROD prüfen
  (`RetrieveMissingDependencies`) — listet benötigte Komponenten, die weder
  in der Solution noch im Ziel vorhanden sind (Import würde scheitern),
  inkl. **Add to Solution** je fehlender Komponente. Name-gematchte Typen
  (EnvVars, Connection References, Web Resources, Canvas Apps) zählen als
  vorhanden, wenn das Ziel sie unter gleichem Namen kennt.
- **Layer Inspector**: Komponenten einer Solution gegen die Layer-Stacks
  in UAT/PROD prüfen (virtuelle Tabelle `msdyn_componentlayer`, eine
  Abfrage pro Komponente mit `msdyn_componentid` + 
  `msdyn_solutioncomponentname`). Findet **unmanaged „Active"-Layer über
  managed Komponenten** — direkte Customizations im Ziel, die jede
  deployte Änderung maskieren — sowie Komponenten, die im Ziel nur
  unmanaged existieren. Klassische Typnamen (Entity, Workflow, …) sind
  statisch gemappt, solution-aware Typen kommen dynamisch aus
  `solutioncomponentdefinition`.

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
