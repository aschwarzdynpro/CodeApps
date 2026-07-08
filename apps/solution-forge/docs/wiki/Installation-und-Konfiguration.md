[[_TOC_]]

# Solution Administration Console — Installation & Konfiguration

Diese Anleitung beschreibt, wie die **Solution Administration Console**
(Power Apps **Code App**, intern „Solution Forge") in eine Dataverse-Umgebung
installiert und konfiguriert wird — für einen neuen Kunden oder eine weitere
Umgebung. Die Bedienung der App selbst ist in
[Solution-Administration-Console.md](Solution-Administration-Console.md)
dokumentiert.

Eine Installation besteht immer aus **zwei Teilen**:

1. **Datenmodell** — Publisher **Dynamics Pro** (`DynamicsPro`, Prefix `pro`),
   Solution `DynamicsProSolutionAdminConsole` und die fünf `pro_`-Tabellen
   (`pro_workingsolution`, `pro_workbenchsettings`, `pro_mergerun`,
   `pro_releasenote`, `pro_environmentconfig`). Das Schema ist **fix** — die
   App referenziert überall `pro_*`-Namen, es gibt keinen kundenspezifischen
   Prefix.
2. **Code App** — der React/Vite-Build, der per `power-apps push` in die
   Umgebung veröffentlicht wird (inkl. Data Sources und Dataverse-Konnektor).

---

## Voraussetzungen

### Tools (Installations-Rechner)

| Tool | Zweck | Installation |
| --- | --- | --- |
| [Node.js](https://nodejs.org/) (LTS) | Build der App | — |
| Power Platform CLI (`pac`) | Auth, Data Sources, Environment-Infos | `dotnet tool install -g Microsoft.PowerApps.CLI.Tool` |
| Power Apps npm-CLI (`power-apps`) | `init` / `add-flow` / `push` | `npm install -g @microsoft/power-apps` |
| PowerShell 7 (`pwsh`) | Installer- und Deploy-Skripte | — |
| Az.Accounts (PowerShell-Modul) | Token für die Dataverse Web API (Provisioning) | `Install-Module Az.Accounts -Scope CurrentUser` |

### Ziel-Umgebung

- Power-Platform-Umgebung mit aktivierten **Code Apps**
  ([Doku](https://learn.microsoft.com/en-us/power-apps/developer/code-apps/overview#enable-code-apps-on-a-power-platform-environment)).
- **Power Apps Premium**-Lizenz für die Endbenutzer.
- Ein Konto mit **System-Administrator/Customizer**-Rechten für die
  Installation (legt Publisher, Solution, Tabellen an und pusht die App).
- Eine **Microsoft-Dataverse-Connection** in der Ziel-Umgebung
  (Maker-Portal → *Connections* → *New connection* → *Microsoft Dataverse*).
  Empfohlen: eine Connection auf Basis eines **Service Principal** (App-
  Registrierung), da alle Cross-Environment-Reads der App über diese
  Connection laufen. Der SP braucht **Leserechte** in allen konfigurierten
  Umgebungen (u. a. `solution`, `solutioncomponent`, `workflow`,
  `plugintracelog`, `asyncoperation`, `role`/`privilege`,
  `principalobjectaccess`, `importjob`, `environmentvariabledefinition`,
  `connectionreference`).

---

## Variante A — Geführte Installation (empfohlen)

Der interaktive Installer erledigt alle Schritte in einem Lauf:
Voraussetzungs-Check → Anmeldung (Device Code) → Datenmodell →
Connection-Auswahl → Bootstrap-Konfigurationsdatensätze → `.env.local` →
Build & Push → Checkliste.

```powershell
cd apps/solution-forge

# Vollständig geführt:
pwsh installer/install.ps1

# Oder mit vorab beantworteten Fragen:
pwsh installer/install.ps1 `
  -EnvironmentUrl https://<org>.crm4.dynamics.com `
  -TenantId <tenant-guid> `
  -EnvironmentId <power-platform-env-guid> `
  [-ConnectionId <dataverse-connection-id>]
```

Nützliche Schalter:

| Schalter | Wirkung |
| --- | --- |
| `-SkipProvision` | Datenmodell existiert bereits — nur konfigurieren & pushen |
| `-SkipPush` | Nur Datenmodell + Konfiguration, Push später von Hand |
| `-UseConnectionReference` | Bindet den Konnektor zusätzlich über die Connection Reference `pro_CRDataverse` (nur nötig, wenn die App später als **managed Solution** verteilt wird; für `power-apps push` macht es zur Laufzeit keinen Unterschied) |
| `-AppDisplayName '…'` | Anzeigename der App (Default „Solution Administration Console") |

Hinweise zum Lauf:

- Die **Environment-ID** ist die Power-Platform-ID aus der Maker-URL
  (`…/environments/<ID>/…`), **nicht** die Dataverse-`organizationid`. Der
  Installer versucht sie über `pac env list` selbst aufzulösen.
- Ohne `-ConnectionId` sucht der Installer die Dataverse-Connection über
  `pac connection list`; existiert keine, vorher einmalig im Maker anlegen.
- Der Installer schreibt `power.config.json` direkt (statt `power-apps init`)
  und erhält dabei eine vorhandene `appId` — ein **Re-Run aktualisiert also
  dieselbe App**, statt eine neue anzulegen.
- `power-apps push` streamt seine Ausgabe live; sobald die **Play-URL**
  erscheint, ist der Deploy fertig. Hängt das Terminal danach (bekannter
  libuv-Abort der npm-CLI beim Prozess-Ende), ist **Ctrl+C unkritisch** —
  der Push war erfolgreich.

Danach weiter mit [Nachbereitung](#nachbereitung-checkliste) und
[Konfiguration](#konfiguration).

---

## Variante B — Manuelle Installation

Für Sonderfälle (CI, gehärtete Umgebungen) lassen sich die Schritte einzeln
ausführen.

### B.1 Datenmodell bereitstellen

Entweder per Skript (idempotent, re-runnable):

```powershell
pwsh installer/provision-model.ps1 -EnvironmentUrl https://<org>.crm4.dynamics.com [-TenantId <guid>]
```

…oder als **managed Solution-Import** statt Skript:

```bash
pac solution import --path installer/package/DynamicsProSolutionAdminConsole_managed.zip
```

Beides erzeugt Publisher `DynamicsPro` (Prefix `pro`), die Solution
`DynamicsProSolutionAdminConsole` und die fünf `pro_`-Tabellen inkl. Choices
(mit gepinnten Optionswerten) und Lookups.

### B.2 Code App einrichten und pushen

`src/generated/`, `.power/` und `power.config.json` sind **gitignored** — nach
einem frischen Clone fehlen sie und müssen erzeugt werden:

```bash
cd apps/solution-forge
npm install

pac auth create --deviceCode --environment https://<org>.crm4.dynamics.com

power-apps init --non-interactive \
  -n "Solution Administration Console" --cloud prod \
  -e <power-platform-env-id> -b ./dist -f index.html -a http://localhost:3000
```

Dann die Data Sources — **immer über das Wrapper-Skript, nie `pac code
add-data-source` direkt** (siehe [Troubleshooting](#troubleshooting)):

```powershell
# Standard- und Modell-Tabellen (native Data Sources, laufen als angemeldeter User):
./scripts/add-data-source.ps1 -a dataverse -t solution
./scripts/add-data-source.ps1 -a dataverse -t publisher
./scripts/add-data-source.ps1 -a dataverse -t solutioncomponent
./scripts/add-data-source.ps1 -a dataverse -t msdyn_solutioncomponentsummary
./scripts/add-data-source.ps1 -a dataverse -t systemuser
./scripts/add-data-source.ps1 -a dataverse -t role
./scripts/add-data-source.ps1 -a dataverse -t pro_workingsolution
./scripts/add-data-source.ps1 -a dataverse -t pro_workbenchsettings
./scripts/add-data-source.ps1 -a dataverse -t pro_mergerun
./scripts/add-data-source.ps1 -a dataverse -t pro_releasenote
./scripts/add-data-source.ps1 -a dataverse -t pro_environmentconfig
# Operate-Gruppe (nur Schreibpfade — alle Reads laufen über den Konnektor):
./scripts/add-data-source.ps1 -a dataverse -t asyncoperation   # Job-Cancel/Retry
./scripts/add-data-source.ps1 -a dataverse -t organization     # Trace-Level-Switch

# Dataverse-Konnektor — direkte Connection-Bindung:
./scripts/add-data-source.ps1 -a shared_commondataserviceforapps -c <connection-id>
#   … ODER über eine Connection Reference (für managed-Solution-Verteilung;
#   die Reference pro_CRDataverse muss vorab existieren):
./scripts/add-data-source.ps1 -a shared_commondataserviceforapps -cr pro_CRDataverse -s <solution-id>
```

Optional den DevOps-Sync-Cloud-Flow registrieren (nur wenn die Umgebung den
Flow *PA | MANUAL | Working Solution | Sync DevOps Work Item Status* trägt —
er muss solution-aware sein und einen Power-Apps-(V2)-Trigger haben):

```bash
power-apps add-flow --flow-id <flow-id>
# Danach prüfen, ob add-flow den handgepflegten Block gedroppt hat:
#   grep '"retrievemissingdependencies"' .power/schemas/appschemas/dataSourcesInfo.ts
# Fehlt er → wieder einsetzen (Vorlage steht in scripts/add-data-source.ps1).
```

Zum Schluss `.env.local` schreiben (siehe
[Build-Zeit-Konfiguration](#2-env-local-build-zeit-fallback)), dann bauen und
pushen:

```bash
npm run build      # tsc -b && vite build — muss grün sein
power-apps push    # veröffentlicht die App in die Umgebung
```

> **Push-Weg:** Grundsätzlich `power-apps push` (npm-CLI). `pac code push`
> funktioniert nur, solange **kein** Cloud Flow registriert ist — mit
> Flow-Registrierung bricht es am `workflowDetails`-Block in
> `power.config.json` ab (HTTP 400).

### B.3 Lokale Entwicklung (ohne Umgebung)

```bash
npm install
npm run dev      # http://localhost:3000 — läuft standalone mit Mock-Daten
```

Ohne Power-Platform-Host bzw. ohne `src/generated/` fällt die App automatisch
auf den Mock-Service zurück (Badge „Demo data" in der Topbar); Anlegen und
Mergen funktionieren offline gegen In-Memory-Daten. **Achtung:** Der
Produktions-Build (`npm run build`) setzt voraus, dass alle Data-Source-
Generatoren gelaufen sind — ohne `src/generated/` schlägt er fehl.

---

## Konfiguration

Die App liest ihre Konfiguration in drei Schichten; jede Schicht überschreibt
die vorherige, fehlende Werte fallen zurück:

```
Code-Defaults (src/config.ts)  →  .env.local (Build-Zeit)  →  Dataverse-Tabellen (Laufzeit, beim App-Start)
```

### 1. Dataverse-Konfigurationstabellen (führend)

Die laufende Konfiguration wird **im Maker-Portal in Dataverse gepflegt**
(Solution `DynamicsProSolutionAdminConsole` → Tabellen) und beim App-Start
geladen:

**`pro_workbenchsettings`** — genau ein aktiver Datensatz („Default", vom
Installer angelegt; Pflicht-Lookup-Ziel jeder Working Solution):

| Spalte | Bedeutung |
| --- | --- |
| `pro_publisher_str` | **Default-Publisher** für neue Working Solutions |
| `pro_adoorgurl` | Azure-DevOps-Organisations-URL (z. B. `https://dev.azure.com/<org>`) |
| `pro_adoproject` | Azure-DevOps-Projekt mit den Work Items |
| `pro_deploymentmanagerrole` | Name der Sicherheitsrolle, die die **Validate**-Gruppe u. a. freischaltet |

**`pro_environmentconfig`** — eine Zeile je Umgebung; steuert, welche
Umgebungen in Compare / Dependency Check / Layers / Env Config / Operate zur
Auswahl stehen:

| Spalte | Bedeutung |
| --- | --- |
| `pro_name` | Anzeigename (Label in der UI) |
| `pro_key` | Kurzschlüssel, z. B. `dev` / `uat` / `prod` |
| `pro_url` | Org-URL (`https://<org>.crm4.dynamics.com`, ohne Slash am Ende) |
| `pro_environmentid` | Power-Platform-Environment-ID (für Maker-/Flow-Deep-Links) |
| `pro_iscurrent` | `true` **nur** bei der Host-Umgebung (dort landen native Writes) |
| `pro_order_int` | Sortierung in den Pickern |

Der Installer legt nur die Host-Umgebung („Current") an — **UAT/PROD als
weitere Zeilen im Maker ergänzen.**

### 2. `.env.local` (Build-Zeit-Fallback)

`.env`-Dateien sind repo-weit gitignored. `.env.local` liefert die Werte, die
die App braucht, **bevor** die Dataverse-Config geladen ist (bzw. als
Fallback, wenn sie fehlt). Der Installer schreibt sie automatisch:

```
VITE_ENVIRONMENT_ID=<power-platform-env-id>       # Fallback für Maker-Links
VITE_ENVIRONMENTS=[{"key":"dev","label":"Current","url":"https://<org>.crm4.dynamics.com","environmentId":"<env-id>","isCurrent":true}]
```

Optionale weitere Variablen (Fallbacks zu den Dataverse-Werten):

```
VITE_ADO_ORG_URL=https://dev.azure.com/<org>
VITE_ADO_PROJECT=<projekt>
VITE_DEPLOYMENT_MANAGER_ROLE=<rollenname>
```

Änderungen an `.env.local` wirken erst nach `npm run build` + erneutem Push.

### 3. Code-Konstanten (`src/config.ts`)

Nur für Sonderfälle relevant:

- `DEVOPS_PANEL_ENABLED` — das Azure-DevOps-Work-Item-Panel ist derzeit
  **deaktiviert** (`false`), bis die Service-Principal-Anbindung für den
  DevOps-Konnektor steht (siehe `TODO.md`). Reaktivierung: DevOps-Konnektor
  als Data Source wieder einbinden, den `AzureDevOpsService`-Aufruf in
  `dataverseSolutionService.getWorkItem()` reaktivieren, Flag auf `true`.
- `WATCHDOG_TABLES` — logische Namen der kundenspezifischen
  Heartbeat-Tabellen für das Watchdog-Board im Job Monitor (Default
  `cust_heartbeatdefinition`/`cust_heartbeat`). Existieren die Tabellen
  nicht, zeigt das Board einen „not installed"-Hinweis — kein Fehler.

### Sicherheitsrollen & Berechtigungen

1. **Deployment-Manager-Rolle**: Die in der Config benannte Rolle (z. B.
   `INT | Deployment Manager`) schaltet die **Validate**-Gruppe, **Merge
   Rules**, Release-Notes-**Publish**, Trace-Level-Switch und
   Job-Bulk-Aktionen frei. Rolle in der Umgebung anlegen (falls nicht
   vorhanden) und den Managern zuweisen — die App prüft direkte **und**
   team-vererbte Zuweisungen über den Rollen-**Namen** (BU-Kopien zählen mit).
   **Workbench** und **Merge** sind nicht gated.
2. **`pro_*`-Tabellenrechte**: Alle App-Benutzer brauchen Lese-/Schreibrechte
   auf `pro_workingsolution`, `pro_workbenchsettings`, `pro_mergerun`,
   `pro_releasenote` und `pro_environmentconfig` (eine mitgelieferte Rolle
   gibt es noch nicht — Rechte manuell in einer Security Role pflegen).
3. **Native Writes laufen als angemeldeter User**: Anlegen/Mergen/Löschen von
   Solutions sowie Trace-Level/Job-Aktionen brauchen die entsprechenden
   Dataverse-Privilegien beim Benutzer selbst (Customizing-Rechte für
   Solution-Operationen).
4. **Konnektor-Connection teilen**: Die gebundene Dataverse-Connection im
   Maker mit dem Team teilen (**Can use**), sonst scheitern die
   Cross-Env-Reads bei anderen Benutzern.

---

## Nachbereitung (Checkliste)

Nach dem Push (Installer zeigt dieselbe Liste am Ende):

1. **Config in Dataverse pflegen**: `pro_workbenchsettings` „Default"
   ausfüllen (Publisher, ADO Org/Projekt, Rollenname) und in
   `pro_environmentconfig` UAT/PROD ergänzen.
2. **Rollen zuweisen**: Deployment-Manager-Rolle an die Manager; alle Nutzer
   erhalten Rechte auf die `pro_*`-Tabellen.
3. **Connection teilen**: Dataverse-Connection mit dem Team teilen (Can use).
4. **App einer Solution zuordnen**: im Maker-Portal → Solution öffnen →
   *Add existing → App → Code app* (`power-apps push` registriert die App
   **nicht** automatisch in einer Solution).
5. **Smoke-Test**: App über die Play-URL öffnen — Badge oben rechts muss
   „Connected" zeigen (nicht „Demo data"); Workbench listet die Solutions
   der Umgebung.

---

## Update / Redeploy

Für Folge-Deployments in eine bereits eingerichtete Umgebung:

```bash
npm run build && npm run lint   # beides muss grün sein
power-apps push
```

Für die im Repo registrierten Umgebungen gibt es das Direct-Push-Skript mit
eingebautem Guard (`pac org who` muss die Ziel-URL sein, sonst Abbruch):

```powershell
pwsh scripts/deploy-env.ps1 -Env <playground|schulz|waldmann>   # Registry im Skript
```

Details dazu in [`deploy/README.md`](../../deploy/README.md). Nach einem
Branch-Merge, der **neue Data Sources** einführte, fehlen die zugehörigen
generierten Services lokal — dann die betreffenden
`./scripts/add-data-source.ps1`-Aufrufe erneut ausführen. Soll-Liste
ermitteln:

```bash
grep -rho "generated/services/\w*" src | sort -u   # erwartet
ls src/generated/services                           # vorhanden
```

---

## Troubleshooting

| Symptom | Ursache & Lösung |
| --- | --- |
| `pac code add-data-source` bricht ab: *„The JSON does not represent a valid data source"* | Bekannter Generator-Bug, sobald die Action `AddSolutionComponent` eingebunden ist. **Immer `./scripts/add-data-source.ps1` verwenden** — es legt das Schema beiseite und stellt die handgepflegten Blöcke (`addsolutioncomponent`, `retrievemissingdependencies`) in `dataSourcesInfo.ts` wieder her. |
| Build: `Cannot find module '../generated/...'` | Frischer Clone bzw. neue Data Source ohne Generator-Lauf — Bootstrap aus [B.2](#b2-code-app-einrichten-und-pushen) ausführen. |
| `pac code push` bricht mit HTTP 400 ab (*„Could not find member 'workflowDetails'…"*) | Die Umgebung trägt einen registrierten Cloud Flow — stattdessen `power-apps push` (npm-CLI) verwenden. |
| Terminal hängt nach *„App pushed successfully"* / Play-URL | libuv-Abort der npm-CLI beim Prozess-Ende. Ctrl+C ist ok — der Push war erfolgreich. |
| npm-CLI: 404 *„environment … not found in tenant …"* | Silent-SSO der npm-CLI hat den falschen Tenant erwischt. Browser vorher auf das richtige Konto bringen, dann `power-apps logout` und erneut anmelden. |
| Laufzeit: *„Connection reference not found: pa_manual_workingsolution_…"* beim „Sync with DevOps" | Der Cloud Flow ist im aktuellen Push nicht registriert — `power-apps add-flow` erneut ausführen (danach `retrievemissingdependencies`-Block prüfen, s. o.) und wieder pushen. |
| App zeigt dauerhaft „Demo data" statt „Connected" | Die App läuft nicht im Power-Apps-Host (lokal `npm run dev`) oder die Data Sources fehlen im Push — Bootstrap prüfen. |
| Anlegen einer Solution scheitert mit `0x80048d19` | `publisherid@odata.bind` muss **lowercase** sein — im Code bereits berücksichtigt; relevant nur bei Eigenanpassungen am generierten Modell. |
| Compare/Validate liefert je Umgebung Fehler | Der Service Principal der Konnektor-Connection hat in der Ziel-Umgebung keine Leserechte — Rechte dort vergeben; einzelne Env-Fehler degradieren zu Hinweisen, blocken aber nicht die ganze Ansicht. |
| Watchdog-Board: „not installed" | `WATCHDOG_TABLES` (config.ts) zeigt auf Tabellen, die es in der Umgebung nicht gibt — logische Namen anpassen oder Hinweis ignorieren. |

## Migration von Bestandsdaten (Altmodell)

Für die einmalige Übernahme der Alt-Daten (`ssid_`/`sst_`-Modell) auf INT-11
existiert `installer/migrate-int11.ps1` (Lookup-Remap, `createdon` bleibt
erhalten). **Dry-Run ist der Default**; erst `-Execute` schreibt.
