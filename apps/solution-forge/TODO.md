# TODO: Auth auf Service Principal umstellen (DevOps + Dataverse)

> **Zwischenstand 2026-06-11:** App läuft auf INT-11 (Solution
> `WorkbenchSchulz`). Dataverse ist bereits auf SP umgestellt
> (`sst_CRDataverse` → „App-Reg D365-CE nonProd"). Das **DevOps-Panel ist
> temporär deaktiviert** (`DEVOPS_PANEL_ENABLED = false` in `src/config.ts`)
> und der DevOps-Konnektor aus der App entfernt (kein Connection-Prompt),
> bis der SP Zugang zur DevOps-Org hat. Grund: OAuth-Connections mit
> `aschwarz@hso.com` scheitern an TF400813 — Token wird im HSO-Heimat-Tenant
> ausgestellt, die Org hängt am Schulz-Tenant (Gast-Mitgliedschaft hilft
> nicht).
>
> **Reaktivierung, sobald der SP in der DevOps-Org ist:**
> 1. SP-Connection „Azure DevOps / Service principal authentication" auf
>    INT-11 anlegen, `sst_CRDevOps` darauf umstellen
> 2. `pac code add-data-source -a shared_visualstudioteamservices
>    -cr sst_CRDevOps -s 67315e76-c155-ed11-bba2-0022489de585
>    -env https://operations-d365-schulz-int-11.crm4.dynamics.com`
>    (AddSolutionComponent-Schema-Workaround beachten!)
> 3. In `dataverseSolutionService.getWorkItem()` den AzureDevOpsService-
>    Aufruf wiederherstellen (Anleitung im Methoden-Kommentar)
> 4. `DEVOPS_PANEL_ENABLED = true`, Build, `power-apps push`

Geplanter Umbau für einen späteren Lauf: beide Konnektor-Connections der
App auf **eine gemeinsame App Registration** stellen, damit Work-Item-Panel
und Compare für alle Benutzer ohne eigene Rechte/Consents laufen.

Stand: geplant am 2026-06-11. Beide Konnektoren unterstützen Service
Principal Auth (DevOps-Connector-Dialog: „Service principal
authentication" mit Tenant / Client ID / Client Secret).

## Checkliste

### 1. App Registration (Tenant `24686796-cf09-4d11-ac19-9ab3819f3491`)
- [ ] App Registration „SolutionForge-Service" anlegen
      (scriptbar: `az login --use-device-code` + `az ad app create`)
- [ ] Client Secret oder besser Zertifikat erzeugen; Rotation einplanen
- [ ] Keine API-Permissions nötig — Zugriff kommt über Mitgliedschaft in
      DevOps-Org bzw. Application User in Dataverse

### 2. Azure DevOps (`dev.azure.com/SchulzD365`) — manuell im Browser
- [ ] Organization Settings → Users → **Add users** → Service Principal
      hinzufügen, Access Level **Basic**
- [ ] Projekt `D365UO` zuordnen (Readers reicht für Work-Item-Lesen)
- [ ] Neue DevOps-Connection in make.powerapps.com mit
      „Service principal authentication" anlegen

### 3. Dataverse Application User (DEV NAAF-2, UAT, PROD)
- [ ] Je Umgebung Application User anlegen
      (scriptbar: `pac admin create-service-principal` oder Admin Center →
      Users + permissions → Application users)
- [ ] Rolle: DEV/UAT initial System Customizer ok; für PROD Custom-Rolle
      „Solution Forge Reader" (nur Read auf `workflow`,
      `sdkmessageprocessingstep`, `webresource`, `solution`,
      `solutioncomponent`)
- [ ] Neue Dataverse-Connection mit „Connect with service principal"

### 4. App umhängen (Claude-Lauf)
- [ ] Beide Connections mit dem Dev-Team teilen („Can use")
- [ ] `pac code add-data-source -a shared_visualstudioteamservices -c <neue ID>`
- [ ] `pac code add-data-source -a shared_commondataserviceforapps -c <neue ID>`
- [ ] Dabei je Lauf: `AddSolutionComponent.Schema.json` beiseite legen und
      den `addsolutioncomponent`-Block in
      `.power/schemas/appschemas/dataSourcesInfo.ts` wieder einfügen
      (siehe README „Achtung beim Nachgenerieren")
- [ ] `npm run build` + `npm run lint` + `power-apps push`
- [ ] Test: Work-Item-Panel und Compare mit einem Benutzer **ohne**
      PROD-/DevOps-Rechte

## Sicherheitshinweise
- Geteilte SP-Connections sind von den Berechtigten auch außerhalb der App
  nutzbar (eigene Flows/Apps) → Minimal-Rollen sind Pflicht
- Secret-/Zertifikats-Rotation in den Betriebsprozess aufnehmen

## Weitere offene Ausbaustufen (aus README-Roadmap)
- Compare: Inhalts-Drift via Hash (`clientdata` / `xaml` / `content`),
  Side-by-side-Diff
- Compare: Umgebungen aus Steuertabelle statt `config.ts`
  (`GetOrganizations()` zur Validierung)
- Working Solution direkt aus zugewiesenem Work Item anlegen;
  Status-Chips in der Solution-Liste
- Release-Zug: Versions-Bump + Export der Deployment Solution nach Merge
