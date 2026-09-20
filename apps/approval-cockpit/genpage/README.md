# Approval Cockpit — Generative Page

Zweite Fassung des Approval Cockpits, diesmal **nicht** als Code App, sondern als
**Generative Page** in einer model-driven App. Gleiche Idee, anderer Laufzeit-Ort
und andere Datenbasis: diese Seite liest die **echten Power-Automate-Genehmigungen**
aus Dataverse, während `../src/` mit Mock-Daten arbeitet.

Generative Pages sind seit November 2025 GA. Der code-first Weg — genau dieser
Ordner — ist laut Microsoft der empfohlene Pfad, weil er weltweit funktioniert und
Zugriff auf aktuelle Modelle hat:
<https://learn.microsoft.com/en-us/power-apps/maker/model-driven-apps/generative-page-external-tools>

## Code App vs. Gen Page

| | Code App (`../src/`) | Gen Page (dieser Ordner) |
| --- | --- | --- |
| Laufzeit | eigenständige Power Apps Code App | Seite **innerhalb** einer model-driven App |
| Stack | React 19 + Vite + `@microsoft/power-apps` | React 17 + Fluent UI V9, eine einzige `.tsx` |
| Daten | Mock (`services/mockData.ts`) | Dataverse `msdyn_flow_*` über `dataApi` |
| Deployment | `npm run build` + `power-apps push` | `pac model genpage upload` |
| Styling | eigenes CSS | Fluent-Tokens, `makeStyles` |

Beide bleiben bestehen — die Code App als eigenständige App, die Gen Page als
Einstiegspunkt für Leute, die ohnehin schon in der model-driven App arbeiten.

## Datenmodell

Die Seite verbindet zwei Standard-Tabellen:

| Tabelle | Rolle | Gelesene Spalten |
| --- | --- | --- |
| `msdyn_flow_approvalrequest` | eine Zeile je Genehmiger — das persönliche Postfach | `msdyn_flow_approvalrequest_name`, `_msdyn_flow_approvalrequest_approval_value`, `msdyn_flow_approvalrequest_dueon`, `msdyn_flow_approvalrequest_expireson`, `msdyn_flow_approvalrequest_responseoptions`, `statecode`, `statuscode`, `createdon`, `_ownerid_value` |
| `msdyn_flow_approval` | die Genehmigung selbst | `msdyn_flow_approval_title`, `_details`, `_category`, `_priority`, `_itemlink`, `_itemlinkdescription`, `_dueon`, `_expireson`, `_name`, `statuscode`, `createdon`, `_createdby_value` |
| `usersettings` | Datumsformat des angemeldeten Benutzers | `uilanguageid`, `localeid`, `dateformatstring`, `dateseparator` |

Ladepfad: erst die eigenen Requests (`_ownerid_value eq <me> and statecode eq 0`),
dann die zugehörigen Approvals über einen gechunkten `or`-Filter auf deren IDs.
So werden nur Genehmigungen gelesen, hinter denen auch wirklich eine eigene
Zuweisung steht — kein org-weiter Scan.

**Wichtig — es gibt kein strukturiertes „Angefordert von"-Feld.** Power-Automate-
Genehmigungen kennen keinen Antragsteller als eigene Spalte; wer etwas beantragt
hat, steht im Freitext `msdyn_flow_approval_details`, so wie der Flow es
hineingeschrieben hat. Die Seite zeigt deshalb **„Erstellt von"** (`_createdby_value`,
üblicherweise der Flow-Owner) plus die vollen Details — und erfindet keinen
Requester. Das ist der wesentliche Unterschied zum Mock-Modell der Code App, das
ein sauberes `requester`-Objekt hat.

Priorität (`msdyn_flow_approval_priority`) ist ein Optionset:
`192350000` Dringend · `192350001` Wichtig · `192350002` Mittel · `192350003` Niedrig.

## Was die Seite kann

- **KPI-Leiste** — offen, überfällig, fällig in 7 Tagen, dringend/wichtig
- **Liste** (Fluent `DataGrid`) mit Sortierung, Spaltenbreiten und Resizing
- **Filter** — Volltext über Titel/Details/Kategorie, Priorität, Fälligkeit
- **Detail-Pane** mit Details, Antwortoptionen, Fristen und Deep-Link auf den
  zugehörigen Datensatz (`msdyn_flow_approval_itemlink`)
- Datumsformate aus den Dataverse-Benutzereinstellungen, nicht hartkodiert
- De-dupe gegen den Double-Mount des Genpage-Hosts (`window`-Cache + In-flight-Promise)

## Was bewusst (noch) fehlt: Genehmigen / Ablehnen

Die Code App hat Bulk-Approve/Reject. Diese Seite ist **read-only plus Deep-Link** —
und zwar nicht aus Bequemlichkeit:

Auf eine Power-Automate-Genehmigung antwortet man nicht durch Schreiben in
Dataverse. Der unterstützte Weg führt über den **Approvals-Connector** bzw. einen
Flow. Gen Pages können Konnektoren nutzen (Preview), aber das Binding entsteht aus
einer **Discovery gegen die Zielumgebung**: verfügbare Connections auflisten,
Connection Reference anlegen, Operation und Parameter ermitteln. Die Genpage-Regeln
sind hier ausdrücklich: Logical Names, Operationen und Parameter **nie raten**, nur
aus der Discovery übernehmen.

Ohne angebundene Umgebung lässt sich das nicht ehrlich vorbereiten. Deshalb Phase 2,
sobald die Umgebung feststeht — siehe unten.

## Deployment

### Voraussetzungen

- Node.js ≥ 18, PAC CLI (`pac help` muss > 2.10.0 melden)
- `pac auth create --deviceCode --environment <url>` in die Zielumgebung
- Eine model-driven App, in die die Seite einsortiert wird

### Plugin (empfohlen)

```bash
# im Claude Code CLI
/plugin marketplace add microsoft/power-platform-skills
/plugin install model-apps@power-platform-skills
```

Danach `/genpage` — die Requirements aus [`prompt.md`](prompt.md) hineingeben.
Der Planner fragt Umgebung, App und Solution ab und übernimmt Phase 2 (Connector).

### Manuell

```bash
# 1. Typen aus der Zielumgebung erzeugen (überschreibt nichts in diesem Ordner)
pac model genpage generate-types \
  --data-sources "msdyn_flow_approval,msdyn_flow_approvalrequest,usersettings" \
  --output-file ./RuntimeTypes.ts

# 2. lokale Abhängigkeiten für IntelliSense
npm install

# 3. hochladen und in die Sitemap einhängen
pac model genpage upload \
  --app-id <app-id> \
  --code-file ./ApprovalCockpit.tsx \
  --name "Approval Cockpit" \
  --data-sources "msdyn_flow_approval,msdyn_flow_approvalrequest,usersettings" \
  --prompt "$(cat prompt.md)" \
  --agent-message "Read-only Genehmigungs-Cockpit auf den Power-Automate-Approval-Tabellen" \
  --add-to-sitemap
```

`RuntimeTypes.ts` ist **umgebungsspezifisch und generiert** — nicht einchecken, nicht
von Hand pflegen. `ApprovalCockpit.tsx` importiert daraus nur `GeneratedComponentProps`;
bis die Datei erzeugt ist, meldet der Editor an dieser einen Zeile einen ungelösten
Import.

## Deployment-Stand

| | |
| --- | --- |
| Umgebung | ASC SFA CS Playground — `https://ascsfacs.crm4.dynamics.com` |
| App | Sales Hub (`msdynce_saleshub`), App ID `53fc8147-cb62-ed11-9562-000d3a24f3d4` |
| Page ID | `845b5c02-e107-478b-ae41-65555d89cf32` |
| Sitemap | Seite ist in die Navigation der App eingehängt (unmanaged Layer auf Sales Hub) |
| Datenquellen | als App-Komponenten registriert |
| PAC CLI | 2.12.2 (braucht .NET **10** — das Tool-Asset liegt unter `tools/net10.0/`) |

Upload-Befehl siehe unten; `--solution` gibt es bei `pac model genpage upload`
nicht, die Seite landet in der Default-Solution.

## Befunde aus der Umgebung

- **Spaltennamen bestätigt.** `generate-types` liefert alle tabellenspezifischen
  Spalten genau so, wie sie hier verwendet werden. Die drei System-Spalten
  (`_ownerid_value`, `_createdby_value`, `createdon`) stehen **nicht** im
  generierten Tabellentyp — sie liegen auf der `TableRow<>`-Basis der Runtime.
  Beleg: der generierte Typ enthält deren Shadow-Namen (`createdbyname`,
  `owningbusinessunitname`), und eine FetchXML-Abfrage mit `ownerid`, `createdon`
  und `createdby` wird von Dataverse akzeptiert.
- **`GeneratedComponentProps` hat nur `dataApi`** — kein `pageInput`. Die Seite
  nutzt auch keines.
- **Beide Approval-Tabellen sind leer.** `msdyn_flow_approval` und
  `msdyn_flow_approvalrequest` existieren in der Umgebung (sie kommen mit der
  Flow-Solution), enthalten aber null Zeilen. Die Seite rendert deshalb ihren
  Leerzustand, bis ein Approval-Flow gelaufen ist oder Testdaten angelegt wurden.
- **Die Umgebung ist einsprachig Englisch (LCID 1033).** Die UI-Texte dieser Seite
  sind deutsch — bewusst, weil Repo und Team deutsch sind, aber es passt nicht zur
  Spracheinstellung der Umgebung.

## Offen

1. **Eigene Solution** `pro_ApprovalCockpitGenPage` (Publisher `DynamicsPro`,
   Prefix `pro`) ist **nicht** angelegt — der `pac solution import` wurde in der
   Session blockiert. Das Paket ist gebaut und der Weg steht fest: importieren,
   dann die Seite per `pac solution add-solution-component` als Komponente
   aufnehmen. Ohne eigene Solution liegt die Seite in der Default-Solution und
   lässt sich nicht sauber transportieren.
2. **Phase 2 — Genehmigen/Ablehnen** über den Approvals-Connector, inklusive
   Bulk-Aktion wie in der Code App. Jetzt möglich, weil die Umgebung feststeht:
   Connections auflisten, Connection Reference anlegen, Operation ermitteln.
3. **Sprache** der UI-Texte entscheiden (siehe Befunde).
4. **Visuelle Prüfung** in der App steht aus — im Container gibt es keine
   authentifizierte Browser-Session.

## Geprüft

- `tsc --noEmit` gegen React 17 + Fluent UI V9 (`@fluentui/react-components@9.54`,
  `@fluentui/react-icons@2.0.326`) — fehlerfrei
- Alle 9 Icon-Importe gegen `verified-icons.txt` des Plugins abgeglichen
  (`InboxRegular` existiert z. B. **nicht** und ist deshalb nicht verwendet)
- Spaltennamen aus der offiziellen Dataverse-Tabellenreferenz, nicht geraten —
  bleiben trotzdem bis `generate-types` unbestätigt gegen die konkrete Umgebung
- Regel-Check: kein `100vh`/`100vw`, kein zweiter `FluentProvider`, kein `Dialog`,
  kein `dataApi` in Dependency-Arrays, alle Hooks vor jedem `return`
