# AGENTS.md — CodeApps Monorepo

Orientierung und Arbeitswissen für KI-Agenten und neue Entwickler. Dies ist
die **einzige repo-weite Instruktionsdatei**; `CLAUDE.md` im Root importiert
sie nur. App-spezifisches Wissen liegt in `apps/<name>/CLAUDE.md` bzw.
`README.md`.

Das Repo hat **keine Root-`package.json`** — jede App unter `apps/` ist ein
eigenständiges Projekt. Immer in das jeweilige App-Verzeichnis wechseln,
bevor `npm` läuft.

## Was das ist

Monorepo für zwei Arten von Power-Platform-Frontends:

- **Code Apps** — code-first Web-Apps (React 19 + TypeScript + Vite +
  `@microsoft/power-apps`), eigenständig deploybar, gescaffoldet aus
  `github:microsoft/PowerAppsCodeApps/templates/vite`.
- **Generative Pages (Gen Pages)** — eine einzelne `.tsx` (React 17 + Fluent
  UI V9), die per `pac model genpage upload` in eine **bestehende
  model-driven App** geladen wird. Kein Build, kein Vite, kein
  `power.config.json`.

Doku-Sprache ist überwiegend **Deutsch** (Code Englisch).

## Struktur

```
CodeApps/
├── apps/
│   ├── solution-forge/     # Code App: Solution Administration Console (Hauptprojekt, aktiv)
│   ├── audit-explorer/     # Code App: Dataverse-Audit-History, query-first
│   ├── sales-dashboard/    # Code App: Sales Dashboard GVL (Waldmann), Fassung eines Legacy-Dashboards
│   ├── approval-cockpit/   # Code App: Genehmigungs-Inbox, nur Mock-Daten (kein power.config.json)
│   └── mein-tag/           # Gen Page in Sales Hub: Aktivitäten nach Fälligkeit + stille Opps/Leads
├── docs/                   # SETUP.md (neue App anlegen), IDEAS*.md, HANDOVER.md (Audit Explorer)
├── marketing/              # Sales-Deck + Handout der Solution Administration Console
├── .claude/skills/         # create-release (managed Export + GitHub-Release, nur solution-forge)
├── AGENTS.md               # diese Datei
├── CLAUDE.md               # nur `@AGENTS.md`
└── README.md               # Repo-Übersicht, apps/README.md = App-Tabelle
```

**`apps/solution-forge/` ist der Hauptteil des Repos** (~90 % der Commits).
Bevor du dort arbeitest: **zuerst `apps/solution-forge/CLAUDE.md` lesen**
(Agent-Handbuch, ~1.500 Zeilen: Deployment-Kontext, Bootstrap, Architektur,
Gotchas). Danach `Roadmap.md` (Arbeitsvorrat) und `TODO.md`. Der Ordnername
`solution-forge` ist historisch; die App heißt „Solution Administration
Console" (npm-Name `solution-administration-console`).

## Konventionen

- **Commits:** Conventional Commits mit App-Scope —
  `feat(solution-forge): …`, `fix(audit-explorer): …`, `feat(mein-tag): …`,
  `docs(repo): …`, `release(solution-forge): managed export 1.0.0.NN`.
  Betreff in der Sprache der App-Doku (solution-forge Englisch, mein-tag
  Deutsch), Body erklärt das Warum. Trailer `Co-Authored-By: Claude …`
  bleibt; keine „Generated with Claude Code"-Zeile.
- **Branches:** `main` ist Arbeits- und Release-Branch; Features auf
  `feature/<name>` bzw. `feat/<name>`. Kein PR ohne Aufforderung.
- **Logins immer per Device Code** (`pac auth create --deviceCode`,
  `az login --use-device-code`, `node scripts/login-npm-cli.mjs` für die
  npm-CLI im Schulz-Tenant).
- **Keine Kundendaten im Repo:** Demo-/Mock-Daten laufen auf dem eigenen
  Publisher-Prefix `pro` — keine echten Personen, Tenants oder Kundentabellen
  in Mock-Daten oder UI-Texten.
- In Remote-Sessions blockt der Auto-Mode-Classifier `pac solution import`
  und `az login` (Credential Exploration). Nicht umgehen — dokumentieren und
  dem Nutzer überlassen.

---

# Code Apps

## Befehle (pro Code App, in `apps/<app>/`)

| Befehl | Bedeutung |
| --- | --- |
| `npm install` | Deps; solution-forge braucht zusätzlich Laufzeit-Dep `diff` |
| `npm run dev` | Vite-Dev-Server (`http://localhost:3000`, „Local Play" in Power Apps) |
| `npm run build` | `tsc -b && vite build` — **muss grün sein vor jedem Commit** |
| `npm run lint` | ESLint (React 19, react-hooks, React-Compiler-Regeln) — **muss grün sein** |
| `npm run test` | Vitest (nur solution-forge; Tests liegen neben `src/utils/*`) |
| `power-apps push` / `pac code push` | Veröffentlicht in die Ziel-Umgebung — **nie blind**, siehe unten |

Toolchain: Node 24 (LTS reicht), `@microsoft/power-apps` (npm-CLI, global),
`pac` CLI (Power Platform CLI), PowerShell 7 für die Skripte in
`apps/solution-forge/scripts` und `installer`.

## Gitignored, aber build-relevant (häufigste Stolperfalle)

In `audit-explorer` und `solution-forge` sind **`power.config.json`** und
**`src/generated/`** gitignored (environment-spezifisch bzw. generiert).
Nach frischem Clone oder Branch-Merge fehlen sie ⇒ Build bricht mit
`Cannot find module '../generated/...'`. Wiederherstellen mit
`power-apps init` + Data Sources hinzufügen — für solution-forge **nur über
den Wrapper** `scripts/add-data-source.ps1`, nicht `pac` direkt (Bootstrap-
Sequenz steht in dessen `CLAUDE.md`). `sales-dashboard` committet beides.
Zusätzlich gitignored: `.env*` (außer `.env.example`), `*.local`, `dist/`,
`.power/`, `.claude/settings.local.json`; bei Gen Pages `RuntimeTypes.ts`.

## Architektur-Muster (alle Code Apps)

- UI hängt nur an einem Service-Interface (`src/services/<x>Service.ts`);
  eine echte Dataverse-Implementierung und ein **Mock** (`mock*Service.ts` +
  `mockData.ts`), auf den die App ohne Power-Kontext automatisch zurückfällt.
  **Neue Service-Methode ⇒ Mock immer mitziehen**, die Apps müssen offline
  demobar bleiben.
- **ESLint / React Compiler:** kein `setState` synchron in Effects; Ausnahme
  nur mit `// eslint-disable-next-line react-hooks/set-state-in-effect`
  direkt über der Zeile. `src/generated` ist lint-ignoriert.
- **Feature-Änderung in solution-forge** ⇒ `HelpPanel.tsx`, `README.md`,
  `Roadmap.md` nachziehen.

## Umgebungen & Sicherheit beim Push

Die Apps zielen auf **mehrere Kunden-Tenants** (Schulz, Waldmann, eigener
Playground). Env-/App-IDs stehen in der jeweiligen `power.config.json` bzw.
in der Registry von `apps/solution-forge/scripts/deploy-env.ps1` (Quelle der
Wahrheit für solution-forge).

- **Das aktive `pac`-Profil ist flüchtig** — es überlebt weder den Wechsel
  zwischen Tool-Aufrufen noch einen `power-apps`-npm-CLI-Aufruf innerhalb
  eines Laufs. Profilwahl, Guard (`pac org who` == Ziel-URL) und schreibende
  Aktion gehören **in einen Aufruf**. Sonst landet ein Push in einer fremden
  Kundenumgebung (ist passiert).
- solution-forge: `pwsh scripts/deploy-env.ps1 -Env <playground|schulz>`
  statt manuellem Push; `waldmann` ist bewusst deaktiviert (managed Import).
- **Release** der Solution Administration Console („Release erzeugen") läuft
  über den Skill `.claude/skills/create-release/SKILL.md`; Artefakte in
  `apps/solution-forge/releases/`, Tags `SAC_v<version>`.

## Neue Code App anlegen

`docs/SETUP.md` (Kurzform: `npx degit
github:microsoft/PowerAppsCodeApps/templates/vite apps/<name>`, `npm install`,
`power-apps init …`). Dieselben Konventionen übernehmen (Service-Interface +
Mock, gitignore für `power.config.json`/`src/generated/`) und die App in
`apps/README.md` eintragen.

---

# Generative Pages

Die Erfahrungen hier stammen aus dem Bau von `apps/mein-tag/` (Muster-
Implementierung) und einer inzwischen verworfenen Gen Page für das Approval
Cockpit (September 2026; der Code liegt in der Git-Historie bis Commit
9b405c4).

## Was sie sind, wo sie liegen

Eine Gen Page ist eine einzelne `.tsx` (React 17, Fluent UI V9, keine anderen
Bibliotheken), die per `pac model genpage upload` in eine **bestehende**
model-driven App geladen wird. Sie sieht die Dataverse-Tabellen der eigenen
Umgebung über `props.dataApi` (`queryTable` / `retrieveRow` / `createRow` /
`updateRow`) — sonst nichts. Kein Cross-Environment, keine Metadaten, keine
Aggregation in der Abfrage (Zeilen holen, im Client rechnen).

Ablage: liegt eine Code App daneben, kommt die Gen Page in
`apps/<name>/genpage/`; ist die Gen Page die App, liegt sie direkt in
`apps/<name>/` (so bei `mein-tag`). Pro Gen Page:

| Datei | Zweck | im Git |
| --- | --- | --- |
| `<Name>.tsx` | die Seite — eine Datei, React 17 + Fluent UI V9, keine anderen Libs | ja |
| `prompt.md` | Requirements in Prosa, geht als `--prompt-file` beim Upload mit | ja |
| `package.json`, `genpage.d.ts` | vom Plugin generiertes Manifest + Ambient-Typen für `Xrm`/Cache-Keys — nicht von Hand editieren | ja |
| `README.md` | Datenmodell, Deployment-Stand (Env, App-ID, Page-ID), Upload-Befehle | ja |
| `RuntimeTypes.ts` | `pac model genpage generate-types` — umgebungsspezifisch | **nein** |

Die Regeln stehen im offiziellen Plugin `microsoft/power-platform-skills`,
Ordner `plugins/model-apps/` — `references/rules.md`, `data-caching.md`,
`connectors.md`, `localization.md`, `references/verified-icons.txt`, Samples in
`samples/`. **Vor dem Schreiben lesen, nicht aus dem Gedächtnis.**

## Toolchain — was hängen bleibt

- **PAC CLI 2.12.2 braucht .NET 10.** Das Tool-Asset liegt unter
  `tools/net10.0/`. Unter einem .NET-8-SDK scheitert
  `dotnet tool install Microsoft.PowerApps.CLI.Tool` mit der irreführenden
  Meldung „DotnetToolSettings.xml not found". Das SDK entscheidet, nicht die
  Runtime — .NET-10-**SDK** installieren (`dotnet-install.sh --channel 10.0`
  in dasselbe Verzeichnis wie das vorhandene SDK, sonst schattet der zweite
  Host den ersten).
- Kein npm-Paket für PAC; `@microsoft/powerplatform-cli` existiert nicht.
- `pac auth create --deviceCode --environment <url>` reicht für alle
  `pac model …`-Befehle. Die **Plugin-Skripte** (`provision-solution.js`,
  `provision-entities.js`, …) nutzen dagegen `az account get-access-token` —
  sie brauchen eine Azure-CLI-Anmeldung im selben Tenant, PAC-Auth hilft
  ihnen nicht.
- `pac env fetch --xmlFile <fetchxml>` ist der schnellste Blick in die Daten
  (kein `top` zusammen mit Paging; `aggregate="true"` + `count` funktioniert).
  Es gibt **keinen** PAC-Befehl, der Datenzeilen schreibt.
- `pac model genpage remove` löst eine Seite nur aus der Sitemap; **ein
  `delete` gibt es nicht** — die `uxagentproject`-Zeile bleibt in Dataverse
  (löschen nur im Maker-Portal).
- `pac model genpage upload` hat **kein** `--solution`. Die Seite landet in
  der Default-Solution; eine eigene Solution ist ein Schritt danach
  (`pac solution import` eines minimalen Pakets, dann
  `add-solution-component`).

## Ablauf, der funktioniert hat

1. `pac model list-languages`, `pac model list-tables --search "a,b,c"`,
   `pac model list` (App-ID), `pac env fetch` für die Datenlage — **vor** dem
   Code. Leere Tabellen erkennt man sonst erst nach dem Deployment.
2. Manifest: `node <plugin>/scripts/generate-page-manifest.js <dir> <slug>`.
3. `pac model genpage generate-types --data-sources "…" --output-file
   ./RuntimeTypes.ts` und jede selektierte Spalte gegen die Datei prüfen.
4. Seite schreiben (Muster: `apps/mein-tag/MeinTag.tsx`).
5. Type-Check in einer Scratch-Kopie: echte `RuntimeTypes.ts` + Ambient-Stub
   für `TableRow`, `BaseTableRegistrations`, `BaseUxAgentDataApi` +
   `tsconfig` mit `jsx: react`, `strict`, `skipLibCheck`; `npm install` der
   generierten `package.json`; `npx tsc --noEmit`. Findet echte Fehler.
6. Regel-Grep: `100vh`, `100vw`, `FluentProvider`, `<Dialog`, `useTheme`,
   `dataApi` in Dependency-Arrays; jeden Icon-Import gegen
   `verified-icons.txt` (Namen wie `InboxRegular` existieren nicht).
7. `pac model genpage upload --app-id … --code-file … --name … --data-sources
   … --prompt-file prompt.md --agent-message … --add-to-sitemap`. Der Upload
   generiert die Typen selbst noch einmal und transpiliert.
8. Page-ID und Datenstand in der README der Seite nachziehen; die App in
   `apps/README.md` eintragen.

## Typen und Spalten — die Stolperstellen

- **System-Spalten fehlen im generierten Tabellentyp**, sind aber da:
  `_ownerid_value`, `_createdby_value`, `createdon`, `modifiedon` liegen auf
  der ambienten `TableRow<>`-Basis. Beleg: der Typ enthält deren Shadow-Namen
  (`createdbyname`, `owningbusinessunitname`), und FetchXML akzeptiert die
  Attribute. Selektieren und filtern geht.
- Shadow-Namen (`*name`, `*yominame`) sind **nicht** selektierbar — Lookup
  als `_x_value` holen, Anzeige aus
  `_x_value@OData.Community.Display.V1.FormattedValue`.
- `GeneratedComponentProps` hat nur `dataApi`, kein `pageInput` (außer die
  Seite ist dafür konfiguriert).
- `lead.fullname` fehlt im generierten Typ → `firstname` + `lastname`.
- `activitypointer.activitytypecode` ist ein readonly-String mit dem logischen
  Namen der konkreten Tabelle (`task`, `email`, …) — direkt als `entityName`
  für `Xrm.Navigation.openForm` verwendbar, kein Mapping.
- Geldbeträge als FormattedValue anzeigen, Datum über
  `usersettings.dateformatstring`/`dateseparator` — nie hartkodieren.
- Lookups **schreiben** über die DataAPI: `_feld_value: "/logischerName(id)"`.
  `@odata.bind` wird stillschweigend verworfen. (Raw Web API ist andersherum.)

## Fachliche Grenzen, die wir gefunden haben

- **Power-Automate-Genehmigungen** (`msdyn_flow_approval*`) sind lesbar, aber
  auf sie antwortet man nicht per Dataverse-Write — nur über den
  Approvals-Connector oder einen Flow. Connector-Bindings entstehen aus einer
  Discovery gegen die Zielumgebung; Logical Names und Operationen nie raten.
  Es gibt außerdem kein strukturiertes Antragsteller-Feld, nur den Freitext
  `details`.
- **Aktivitäten abschließen** geht nicht über `activitypointer`, sondern per
  `updateRow` auf der konkreten Tabelle mit typspezifischen Statuswerten
  (`task`: 1/5, `phonecall`: 1/2, …).
- Host-Eigenheiten: doppelter Mount beim Öffnen, neue `dataApi`-Referenz pro
  Render → `window.__genpage_<entity>_<v>`-Cache + In-flight-Promise (Muster
  in `data-caching.md`), nie `dataApi` in Dependency-Arrays, ein einziger
  State-Update pro Effect.
- Overlays (`Dropdown`, `Menu`, `Dialog`) brauchen den `mountNode` der Seite,
  sonst landen sie im Designer-DOM. Wir haben `Dialog` ganz vermieden.

## Umgebung ASC SFA CS Playground (Stand 2026-09-21)

- `https://ascsfacs.crm4.dynamics.com`, Konto `aschwarz@dynamicspro.de`,
  nur Sprache 1033 (en-US) — unsere UI-Texte sind trotzdem deutsch, bewusst.
- Sales Hub: App-ID `53fc8147-cb62-ed11-9562-000d3a24f3d4`
  (`msdynce_saleshub`). Publisher `DynamicsPro`, Prefix `pro`,
  Option-Value-Prefix 45500.
- Approval-Tabellen vorhanden, aber leer. `activitypointer` 28 offen (26 dem
  Konto), `lead` 2, `opportunity` 1 (gehört „Test Testerich").
- Deployte Gen Page: Mein Tag `f74b6eee-f039-4919-a3c6-ce0eb34a7c2d`.
  Die Approval-Cockpit-Seite `845b5c02-…` ist per `pac model genpage remove`
  aus der Sitemap gelöst; die Seitenzeile selbst existiert in Dataverse
  weiter.

## Was Gen Pages hier gut können und was nicht

Gut: mehrere Tabellen auf einem Screen, Seiten aus einem Datensatz heraus
(`pageInput`), Layouts, die Forms/Views nicht können (Kanban, Timeline),
geführte Abläufe mit mehreren `createRow`. Schlecht: alles, was
Konnektoren zum Handeln braucht, Metadaten, Cross-Environment (das ist
solution-forge), Dateien, Nutzer ohne MDA-Lizenz. Kandidatenliste und
Bewertung: Pipeline-Kanban, Account 360, „Mein Tag" (gebaut),
Lead-Qualifizierungs-Wizard, Angebotsvergleich.
