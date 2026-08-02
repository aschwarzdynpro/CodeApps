# Working Solution — Contract (Memo für den Projekt-Hub-Skill-Agent)

Zweck: Ein Agent im **Projekt Hub** soll Working Solutions **selbst anlegen und
pflegen**, ohne die Solution Administration Console (Code App) zu benutzen.
Dieses Memo ist der vollständige Vertrag: Datenstruktur, was gepflegt wird, wie
provisioniert wird, Fallstricke.

Referenz-Implementierung (nicht raten — dagegen prüfen):
`apps/solution-forge/src/services/dataverseSolutionService.ts` →
`createWorkingSolution` (Z. 1078) + `createPresentationRow` (Z. 1139),
`src/utils/naming.ts`, `src/types/solution.ts`,
Schema-Quelle: `installer/provision-model.ps1` (Z. 140–204, 322–325).

---

## 1. Was eine Working Solution IST

**Zwei Records, kein Automatismus dazwischen:**

1. Eine **echte unmanaged Dataverse-Solution** (Standardtabelle `solution`) —
   der Container, der die Komponenten trägt.
2. Eine Zeile in der Custom-Tabelle **`pro_workingsolution`** — reine
   *Darstellungs-/Prozess-Schicht* (Titel, DevOps-ID, Typ, Owner, Status,
   Merge-Regeln).

**Verknüpft NUR über den String `pro_workingsolution.pro_uniquesolutionname`
== `solution.uniquename`.** Kein Lookup, keine referentielle Integrität, kein
Cascade. Ein Tippfehler ⇒ „orphan record" (die App zeigt ihn mit
`solutionMissing`), eine Solution ohne Zeile ⇒ erscheint als Typ `other`.

> **Es gibt KEIN Plugin und KEINEN Flow auf `pro_workingsolution`.**
> Die gesamte Provisionierung ist ein **In-Code-Schritt** der App: zwei
> HTTP-Calls hintereinander. Wer die Tabelle direkt beschreibt, bekommt
> **keine** Solution — der Agent muss beide Schritte selbst machen.
> Einzige Server-Automatik im Umfeld: der Cloud Flow
> *„PA | MANUAL | Working Solution | Sync DevOps Work Item Status"*, der
> ausschließlich `pro_devopsworkitemstatus/-type/-areapath/-iterationpath`
> nachträgt — manuell getriggert, nicht Teil des Anlegens.

---

## 2. Tabelle `pro_workingsolution`

| | |
| --- | --- |
| Logical name | `pro_workingsolution` |
| **Entity set** | `pro_workingsolutions` |
| PK | `pro_workingsolutionid` |
| Ownership | **UserOwned** (`ownerid` relevant, „Assign to me") |
| Solution | `DynamicsProSolutionAdminConsole`, Publisher `DynamicsPro`, Prefix `pro` |

Prefix `pro` ist per `provision-model.ps1 -Prefix` theoretisch variabel; die
**Optionswerte sind gepinnt** und ändern sich NIE mit dem Prefix.

### Spalten (schreibrelevant)

| Spalte | Typ | Req | Wer schreibt | Semantik |
| --- | --- | --- | --- | --- |
| `pro_name` | String(100) | **Primary, ApplicationRequired** | Anleger | Titel = `solution.friendlyname` |
| `pro_devopsid` | String(**10**) | **ApplicationRequired** | Anleger | ADO Work-Item-ID; für Release-Typ Platzhalter `'N/A'` |
| `pro_uniquesolutionname` | String(**50**) | None | Anleger | **Der Join-Key** = `solution.uniquename` |
| `pro_type_opt` | Choice | None | Anleger | Feature/Bug/Release → siehe §3 |
| `pro_deploymentstatus` | Choice | None | Anleger/Prozess | Start = `500870000` (None) |
| `pro_solutionlink` | String(200), Format Url | None | Anleger | `https://make.powerapps.com/environments/{envId}/solutions/{solutionId}` |
| `pro_WorkbenchSetting` | Lookup → `pro_workbenchsettings` | **ApplicationRequired** | Anleger | Pflicht-Konfig-Anker, siehe §5.3 |
| `pro_DeploymentSolution_id` | Lookup → `pro_workingsolution` (self) | None | Merge-Prozess | Ziel-Release |
| `pro_allowedmergetypes` | MultiSelect Choice | None | Merge-Rules-Tab | Allow-Liste, Werte = `componenttype`-Codes |
| `pro_excludedmergetypes` | MultiSelect Choice | None | Merge-Rules-Tab | Exclude-Liste, dito |
| `pro_devopslink` | String(4000) Url | None | frei | |
| `pro_devopsworkitemstatus` | String(500) | None | **DevOps-Sync-Flow** | „New/Active/Resolved/Closed" |
| `pro_devopsworkitemtype` | String(250) | None | **DevOps-Sync-Flow** | „Bug"/„Feature"/„Product Backlog Item" |
| `pro_devopsareapath` / `pro_devopsiterationpath` | String(1000) | None | **DevOps-Sync-Flow** | |
| `pro_mergeintodeploymentsolution` | Bool | None | Merge | Flag |
| `pro_lastmergeintodeploymentsolution` | DateTime (UserLocal) | None | Merge | |
| `pro_merge_into_core_bit` | Bool | None | Merge | |
| `pro_last_merge_into_core_dat` | DateTime (TZ-independent) | None | Merge | |
| `statecode` / `statuscode` | State | — | Prozess | **0 = offen, 1 = geschlossen** |

**Längenlimits sind hart** — `pro_devopsid` hat nur 10 Zeichen,
`pro_uniquesolutionname` nur 50. Ein Unique Name > 50 Zeichen zerreißt den
Join lautlos.

**Offen/Geschlossen richtet sich allein nach `statecode`**, NICHT nach
`pro_deploymentstatus`. Der Status ist nur ein Label.

---

## 3. Choice-Werte (fix, nicht ableiten)

```
pro_type_opt          867520000 Feature | 867520001 Bug | 867520002 Release
pro_deploymentstatus  500870000 None
                      500870001 To be deployed
                      500870002 Deployment in progress
                      500870003 Deployment completed
                      867520001 Merged into Deployment Solution
                      867520002 Merged into Core Solution
statecode             0 Aktiv (= offen) | 1 Inaktiv (= geschlossen)
pro_allowed/excludedmergetypes  = Dataverse-componenttype-Codes:
   1 Table · 2 Column · 9 Choice · 20 SecurityRole · 26 View
   29 Process(Flow/WF/BPF/Action) · 59 Chart · 60 Form · 61 WebResource
   70 FieldSecurityProfile · 80 Model-driven App · 91 PluginAssembly
   92 SDKMessageStep · 95 ServiceEndpoint · 300 CanvasApp
   380 EnvironmentVariable · 381 EnvironmentVariableValue
   10021/10022/10023 CustomAPI(+Req/Resp) · 10064 ConnectionReference
```

Interner Key für Release ist im Code `'deployment'` (nicht `'release'`).
MultiSelect wird als **Komma-String** geschrieben (`"1,2,61"`), `null` leert.

---

## 4. Namenskonvention (`src/utils/naming.ts`)

```
feature_<numerische ADO-ID>     z.B. feature_4711
bug_<numerische ADO-ID>         z.B. bug_4712
deploy_<Release-/Sprintname>    z.B. deploy_sprint_12
```

* Regex: `^(feature|bug|deploy)_([A-Za-z0-9_]+)$`
* ID-Teil vor dem Bauen säubern: `raw.trim().replace(/[^A-Za-z0-9_]/g,'')`.
* Das Präfix liefert den von Dataverse geforderten **führenden Buchstaben**
  (Unique Names dürfen nicht mit einer Ziffer beginnen).
* Feature/Bug: ID-Teil muss `^\d+$` sein (App-Validierung).
* Release: kein Work Item ⇒ `pro_devopsid = 'N/A'`, UI blendet das aus.
* Vor dem Anlegen gegen bestehende `solution.uniquename` prüfen
  (**case-insensitive**) — Dataverse lehnt Duplikate ab.

---

## 5. Provisionierung — das Rezept

Reihenfolge ist bindend. Alles Web API `…/api/data/v9.2`.

### 5.1 Schritt 1 — echte Solution anlegen

```http
POST /api/data/v9.2/solutions
{
  "uniquename":   "feature_4711",
  "friendlyname": "Customer onboarding wizard",
  "description":  "…",
  "version":      "1.0.0.0",
  "publisherid@odata.bind": "/publishers(<publisherId>)"
}
```

* ⚠ **`publisherid@odata.bind` in Kleinbuchstaben.** Die Schreibweise
  `PublisherId@odata.bind` wird mit `0x80048d19 "undeclared property"`
  abgelehnt (Gotcha #2 im App-CLAUDE.md).
* Nur `uniquename`, `friendlyname`, `description`, `version`, `publisherid`
  senden. Server-managed Spalten (`sourcecontrolsyncstatus`,
  `enabledforsourcecontrolintegration`, …) ⇒ Ablehnung.
* Neue Record-ID aus dem **`OData-EntityId`-Response-Header** ziehen; NICHT
  `Prefer: return=representation` setzen (dann fehlt der Header).
* Fehlschlag ⇒ meist Duplikat des Unique Name oder ungültiger Publisher.

### 5.2 Publisher bestimmen

Der Anleger braucht eine `publisherid`. Konvention der App:

```http
GET /publishers?$select=publisherid,uniquename,friendlyname,customizationprefix
GET /pro_workbenchsettingses?$select=pro_publisher_str   →  ein String
```
`pro_publisher_str` ist **Freitext** und wird defensiv gegen `uniquename`,
`customizationprefix` **oder** `friendlyname` gematcht (lowercase). Kein
Treffer ⇒ Nutzer fragen, nicht raten.

### 5.3 Schritt 2 — Presentation Record anlegen

```http
POST /api/data/v9.2/pro_workingsolutions
{
  "pro_name":                "Customer onboarding wizard",
  "pro_devopsid":            "4711",              // Release: "N/A"
  "pro_uniquesolutionname":  "feature_4711",
  "pro_solutionlink":        "https://make.powerapps.com/environments/<envId>/solutions/<solutionId>",
  "pro_type_opt":            867520000,
  "pro_deploymentstatus":    500870000,
  "pro_WorkbenchSetting@odata.bind": "/pro_workbenchsettingses(<settingsId>)"
}
```

* ⚠ **Entity Set der Settings-Tabelle heißt `pro_workbenchsettingses`**
  (doppeltes „es"). Die ID kommt aus dem **ersten** (per Design einzigen)
  `pro_workbenchsettings`-Record:
  `GET /pro_workbenchsettingses?$select=pro_workbenchsettingsid&$top=1`.
* Existiert kein Settings-Record, lässt die App den Bind **weg** und legt den
  Record trotzdem an (`ApplicationRequired` wird vom Web API nicht erzwungen,
  nur von Formularen). Der Skill sollte es genauso machen — aber warnen.
* Der Lookup-Bind-Key ist **exakt `pro_WorkbenchSetting@odata.bind`**
  (Schema-Casing des Navigation Property), nicht der Logical Name.

### 5.4 Rollback-Semantik

Die App macht **keinen** Rollback: schlägt Schritt 2 fehl, bleibt die Solution
stehen und der Nutzer bekommt „Solution erstellt, Record fehlt — taucht unter
*Other* auf". Nachreichbar über §6.1. Der Skill sollte dieselbe Fehlermeldung
erzeugen statt still zu scheitern.

---

## 6. Weitere Operationen (gleiche Tabelle, gleiches Muster)

| Aktion | Wie |
| --- | --- |
| **6.1 Nacherfassen** (`trackSolution`) | Solution existiert schon ⇒ nur §5.3 ausführen |
| **6.2 Re-Link** eines Orphans | `PATCH pro_workingsolutions(<id>)` mit `pro_uniquesolutionname` + `pro_solutionlink` |
| **6.3 Umbenennen/Typ ändern** | `PATCH` Record (`pro_name`, `pro_type_opt`) **und** `PATCH solutions(<id>)` (`friendlyname`, `description`) — beide, sonst driften sie |
| **6.4 Owner setzen** | `PATCH` mit `"ownerid@odata.bind": "/systemusers(<id>)"` |
| **6.5 Abschließen** | `PATCH pro_deploymentstatus = 500870003`; „wirklich zu" ist erst `statecode = 1` |
| **6.6 Merge-Regeln** | `PATCH pro_allowedmergetypes / pro_excludedmergetypes` als Komma-String (`null` = leeren). Mergebar ⇔ `(allow leer ODER in allow) UND NICHT in exclude` |
| **6.7 Löschen** | Zwei getrennte Deletes: Record und/oder `DELETE solutions(<id>)`. Löscht **nur den Container**, Komponenten bleiben in der Umgebung |

---

## 7. Lesen / Join-Semantik (falls der Skill listet)

```
solutions:  $filter=ismanaged eq false and isvisible eq true
            (+ 'default' rauswerfen), $orderby=createdon desc
pro_workingsolutions: ALLE Zeilen (auch statecode 1) laden — offen/zu wird
            clientseitig aus statecode gefiltert
Join:       lowercase(pro_uniquesolutionname) == lowercase(solution.uniquename)
```
Typ-Kaskade beim Lesen (erste Regel, die greift):
`pro_type_opt` → aus `pro_devopsworkitemtype` (enthält „bug" ⇒ Bug;
„change request"/„cr"/„feature"/„product backlog item" ⇒ Feature) →
Namenskonvention → `other`.

---

## 8. Was der Skill NICHT tun soll

* **Nicht** `pro_mergerun`, `pro_releasenote`, `pro_transfer*` schreiben — das
  sind Historien-/Executor-Tabellen mit eigenen Verträgen
  (`docs/transfer-hub-contract.md`).
* **Nicht** Komponenten mergen (`AddSolutionComponent`) — das ist die
  Merge-Workbench der Console inkl. Merge-Regeln und Logging.
* **Nicht** `pro_devopsworkitem*`-Spalten selbst befüllen, wenn der Sync-Flow
  im Ziel-Env läuft — der überschreibt sie.
* **Nicht** die `pro_`-Tabellen anlegen. Kommen aus der Managed Solution bzw.
  `installer/provision-model.ps1`.

---

## 9. Voraussetzungen im Ziel-Environment

1. Solution `DynamicsProSolutionAdminConsole` installiert (Tabellen + Choices).
2. Mindestens ein `pro_workbenchsettings`-Record (sonst §5.3-Warnung); wird
   sonst vom Provisioning Wizard der App angelegt.
3. Ein Publisher, dessen Prefix zu den Komponenten passt.
4. Identität mit `prvCreateSolution` + Schreibrecht auf `pro_workingsolution`.

## 10. Auth / Tooling

Wiederverwendbar statt neu bauen:
`apps/solution-forge/installer/lib/Dataverse.ps1` —
`Connect-Dataverse -EnvironmentUrl <url> [-TenantId <guid>]` (Az-Kontext, sonst
**Device-Code**) + `Invoke-Dv -Method POST -Path 'solutions' -Body @{…}
[-Solution <uniquename>]`. Gibt bei Writes `EntityId`/`MetadataId` aus dem
`OData-EntityId`-Header zurück; `-Solution` setzt den Header
`MSCRM.SolutionUniqueName`. Für Entra-Logins gilt: **immer Device Code**.
