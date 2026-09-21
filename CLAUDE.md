# CodeApps — Arbeitswissen für Claude

Monorepo für Power Apps **Code Apps** (Vite + React 19, `apps/<name>/`) und
**Generative Pages** (React 17 + Fluent UI V9, eine `.tsx`, in einer
model-driven App). App-spezifisches Wissen liegt in `apps/<name>/CLAUDE.md`
bzw. `README.md`; hier steht, was repo-weit gilt. Die Gen-Page-Erfahrungen
unten stammen aus dem Bau von `apps/approval-cockpit/genpage/` und
`apps/mein-tag/` (September 2026).

## Generative Pages

### Was sie sind, wo sie liegen

Eine Gen Page ist eine einzelne `.tsx` (React 17, Fluent UI V9, keine anderen
Bibliotheken), die per `pac model genpage upload` in eine **bestehende**
model-driven App geladen wird. Sie sieht die Dataverse-Tabellen der eigenen
Umgebung über `props.dataApi` (`queryTable` / `retrieveRow` / `createRow` /
`updateRow`) — sonst nichts. Kein Cross-Environment, keine Metadaten, keine
Aggregation in der Abfrage (Zeilen holen, im Client rechnen).

Ablage: liegt eine Code App daneben, kommt die Gen Page in
`apps/<name>/genpage/`; ist die Gen Page die App, liegt sie direkt in
`apps/<name>/`. Pro Gen Page: `<Name>.tsx`, `prompt.md` (Requirements, geht als
`--prompt-file` mit), `package.json` + `genpage.d.ts` (vom Plugin generiert),
`README.md`. `RuntimeTypes.ts` ist umgebungsspezifisch generiert und
**gitignored**.

Die Regeln stehen im offiziellen Plugin `microsoft/power-platform-skills`,
Ordner `plugins/model-apps/` — `references/rules.md`, `data-caching.md`,
`connectors.md`, `localization.md`, `references/verified-icons.txt`, Samples in
`samples/`. Vor dem Schreiben lesen, nicht aus dem Gedächtnis.

### Toolchain — was hängen bleibt

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
- `pac model genpage upload` hat **kein** `--solution`. Die Seite landet in
  der Default-Solution; eine eigene Solution ist ein Schritt danach
  (`pac solution import` eines minimalen Pakets, dann
  `add-solution-component`).
- In Remote-Sessions blockt der Auto-Mode-Classifier `pac solution import`
  und `az login` (Credential Exploration). Nicht umgehen — dokumentieren und
  dem Nutzer überlassen.

### Ablauf, der funktioniert hat

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

### Typen und Spalten — die Stolperstellen

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

### Fachliche Grenzen, die wir gefunden haben

- **Power-Automate-Genehmigungen** (`msdyn_flow_approval*`) sind lesbar, aber
  auf sie antwortet man nicht per Dataverse-Write — nur über den
  Approvals-Connector oder einen Flow. Connector-Bindings entstehen aus einer
  Discovery gegen die Zielumgebung; Logical Names und Operationen nie raten.
  Es gibt außerdem kein strukturiertes Antragsteller-Feld, nur den Freitext
  `details`.
- **Aktivitäten abschließen** geht nicht über `activitypointer`, sondern per
  `updateRow` auf der konkreten Tabelle mit typspezifischen Statuswerten.
- Host-Eigenheiten: doppelter Mount beim Öffnen, neue `dataApi`-Referenz pro
  Render → `window`-Cache + In-flight-Promise (Muster in `data-caching.md`),
  nie `dataApi` in Dependency-Arrays, ein einziger State-Update pro Effect.
- Overlays (`Dropdown`, `Menu`, `Dialog`) brauchen den `mountNode` der Seite,
  sonst landen sie im Designer-DOM. Wir haben `Dialog` ganz vermieden.

### Umgebung ASC SFA CS Playground (Stand 2026-09-21)

- `https://ascsfacs.crm4.dynamics.com`, Konto `aschwarz@dynamicspro.de`,
  nur Sprache 1033 (en-US) — unsere UI-Texte sind trotzdem deutsch, bewusst.
- Sales Hub: App-ID `53fc8147-cb62-ed11-9562-000d3a24f3d4`
  (`msdynce_saleshub`). Publisher `DynamicsPro`, Prefix `pro`,
  Option-Value-Prefix 45500.
- Approval-Tabellen vorhanden, aber leer. `activitypointer` 28 offen (26 dem
  Konto), `lead` 2, `opportunity` 1 (gehört „Test Testerich").
- Deployte Gen Pages: Approval Cockpit
  `845b5c02-e107-478b-ae41-65555d89cf32`, Mein Tag
  `f74b6eee-f039-4919-a3c6-ce0eb34a7c2d`.

### Was Gen Pages hier gut können und was nicht

Gut: mehrere Tabellen auf einem Screen, Seiten aus einem Datensatz heraus
(`pageInput`), Layouts, die Forms/Views nicht können (Kanban, Timeline),
geführte Abläufe mit mehreren `createRow`. Schlecht: alles, was
Konnektoren zum Handeln braucht, Metadaten, Cross-Environment (das ist
solution-forge), Dateien, Nutzer ohne MDA-Lizenz. Kandidatenliste und
Bewertung: Pipeline-Kanban, Account 360, „Mein Tag" (gebaut),
Lead-Qualifizierungs-Wizard, Angebotsvergleich.
