# OData Browser — Feature Plan

Menu **Operate → OData Browser** (`gated: true`). A guided explorer for the
Dataverse Web API of **any configured environment**: browse entity sets, filter
them, open single records, pick columns, expand relationships — with
metadata-driven IntelliSense on every input.

Decisions locked with the product owner (2026-07-29):

| Decision | Value |
| --- | --- |
| Scope v1 | **Read-only.** The full CRUD *architecture* (types, service interface, diff/patch builder, confirm plumbing) is built and unit-tested, but no write call is wired and no write UI is rendered. Enabling later = flip one flag + implement three methods. |
| Query input | **Builder + raw query line, bidirectionally coupled.** Both get IntelliSense from one engine. |
| Access | **Deployment Manager** (`gated: true`), same as Env Config / Audit Config. |

No new data sources, no solution change, no installer change — everything runs
through the existing `shared_commondataserviceforapps` connector.

## 1. Platform surface — what we actually have

Verified against `.power/schemas/appschemas/dataSourcesInfo.ts` and
`src/generated/services/MicrosoftDataverseService.ts`.

**Read (v1):**

```
ListRecordsWithOrganization(organization, entityName, prefer?, accept?,
  x_ms_odata_metadata_full?, MSCRM_IncludeMipSensitivityLabel?,
  $select?, $filter?, $orderby?, $expand?, fetchXml?, $top?, $skiptoken?,
  partitionId?)                       → GET /api/data/v9.1.0/{entityName}

GetItemWithOrganization(prefer, accept, organization, entityName, recordId,
  x_ms_odata_metadata_full?, MSCRM_IncludeMipSensitivityLabel?,
  $select?, $expand?, partitionId?)   → GET …/{entityName}({recordId})
```

`prefer` is a **raw header string** → we can send
`odata.include-annotations="*"` (formatted values, lookup logical names) and
`odata.maxpagesize=<n>` (server-driven paging).

**Write (seams only, v1 not wired):** `CreateRecordWithOrganization`,
`UpdateRecordWithOrganization`, `UpdateOnlyRecordWithOrganization` (If-Match →
optimistic concurrency), `DeleteRecordWithOrganization`,
`AssociateEntitiesWithOrganization`, `DisassociateEntitiesWithOrganization`.

**Not available through the connector** — the plan must route around these:

| Missing | Consequence | Workaround in this plan |
| --- | --- | --- |
| `$count` / `$count=true` | No cheap total | Explicit **Count** button → FetchXML `aggregate="countcolumn"` (pattern already in `dataverseTransferHubService.buildCountFetchXml`). Dataverse caps aggregates at 50 000 → show `≥ 50 000`. |
| `$apply` | No group-by/aggregation in OData | FetchXML mode (P5) covers grouping. |
| `$search` | No relevance search | Out of scope (that is the `searchquery` action). |
| `$batch` | No multi-query round trip | Sequential calls; irrelevant for a browser. |

Hard limits that stay: Dataverse returns **max 5000 rows per page**;
`$top > 5000` is silently capped. FetchXML reads through this connector are
hard-capped at 5000 with **no** working pagination policy (see CLAUDE.md /
transfer-hub findings) — so the row-fetching path is **OData, not FetchXML**.

## 2. Identity & safety model — read this before building

Every query runs through the connector, i.e. **as the connection's service
principal** (`pro_CRDataverse` → “App-Reg D365-CE nonProd”), *not* as the
signed-in user. At Schulz that SP is **System Administrator**.

Consequences, all of which the feature must own explicitly:

1. **Gated** (`gated: true`) — without the Deployment Manager role the menu
   item is locked, exactly like Env Config.
2. **Persistent banner** in the workspace: “Queries run as the connector
   service principal — results ignore your personal row-level and field-level
   security.” Not a tooltip. A visible strip.
3. **Read-only in v1** — a write path here would be an unfiltered admin editor
   over every table in every environment.
4. When writes are switched on later: `createdby`/`modifiedby` will be the SP,
   not the human. Confirm dialogs must say so, PROD gets the danger variant
   (`ConfirmDialog` pattern), and the request must be logged client-side.
5. Cross-env reads need the SP to have read privileges in the *target*
   environment — the most likely runtime error class. Error mapping (§8) turns
   privilege faults into a readable “SP lacks prvRead on `<table>` in `<env>`”.

## 3. Files

```
src/types/odataBrowser.ts            query model, metadata model, results, write types
src/services/metadataCatalog.ts      per-org metadata cache (entities, attributes, relationships, options)
src/services/odataBrowserService.ts  interface (read + write signatures)
src/services/dataverseOdataBrowserService.ts
src/services/mockOdataBrowserService.ts
src/utils/odataQuery.ts   (+ .test.ts)  build/parse query, column classification
src/utils/odataFilter.ts  (+ .test.ts)  operator catalog, filter render/parse/FetchXML, tree edits
src/utils/odataFormat.ts  (+ .test.ts)  annotations → displayable cell values
src/utils/odataSuggest.ts (+ .test.ts)  IntelliSense engine (pure)
src/utils/odataErrors.ts  (+ .test.ts)  fault → human hint
src/utils/odataWrite.ts   (+ .test.ts)  diff → PATCH body (built in v1, unused until write mode)
src/components/OdataBrowserWorkspace.tsx   shell: env picker, builder, raw line, results
src/components/OdataFilterBuilder.tsx      guided $filter editor (groups, typed operators, choice labels)
src/components/QueryInput.tsx              input + suggestion popup (one component, all fields)
src/components/OdataResultGrid.tsx         result table, sort, cell rendering, drill-through
src/components/OdataRecordPanel.tsx        single record + related-records navigation
```

Registration: `App.tsx` (`Tab` union `'odata'`, `NAV_GROUPS` → Operate,
`TAB_TITLES`, render block), plus the repo rule — `HelpPanel.tsx`, `README.md`,
`Roadmap.md`, `CLAUDE.md`.

Housekeeping: `label()` (metadata `Label` → localized string) is currently
duplicated in `dataverseAuditConfigService.ts` and
`dataverseTransferHubService.ts` — hoist it into `metadataCatalog.ts` and let
both import it.

## 4. Metadata catalog — the IntelliSense fuel

`metadataCatalog.ts`, cached **per org URL** (`Map` in module scope, mirrored
into `sessionStorage` under a versioned key so a tab reload stays fast).
Primary path is the raw `EntityDefinitions` metadata set through
`odataQuery` — the proven route in this repo. The connector's typed metadata
ops (`GetMetadataForGetEntityWithOrganization`, `GetEntityRelationships…`)
stay as fallback.

**Entity list** (one call per org, ~1000 rows):

```
EntityDefinitions
$select=LogicalName,SchemaName,EntitySetName,DisplayName,DisplayCollectionName,
        PrimaryIdAttribute,PrimaryNameAttribute,ObjectTypeCode,
        IsPrivate,IsActivity,IsCustomEntity,IsManaged
```

`IsPrivate` rows are hidden by default (toggle “show system/private tables”).

**Entity detail** (lazy, per table, cached):

```
EntityDefinitions?$filter=LogicalName eq '<t>'
$expand=Attributes($select=LogicalName,SchemaName,DisplayName,AttributeType,
                           AttributeTypeName,AttributeOf,IsValidForRead,
                           IsValidForCreate,IsValidForUpdate,
                           IsValidForAdvancedFind,IsPrimaryId,IsPrimaryName),
        ManyToOneRelationships($select=SchemaName,ReferencingAttribute,
                           ReferencedEntity,ReferencingEntityNavigationPropertyName),
        OneToManyRelationships($select=SchemaName,ReferencedAttribute,
                           ReferencingEntity,ReferencingAttribute,
                           ReferencedEntityNavigationPropertyName),
        ManyToManyRelationships($select=SchemaName,Entity1LogicalName,
                           Entity2LogicalName,Entity1NavigationPropertyName,
                           Entity2NavigationPropertyName,IntersectEntityName)
```

⚠ Verify (§10.3) that four expands survive one call; if not, split into
attributes + relationships and cache both under the same entity key.

**Column rules derived once, used everywhere** (`describeColumn`):

- `AttributeOf != null` or `IsValidForRead === false` → **not selectable**
  (these are the virtual label/base siblings; `$select`ing them faults).
- `Lookup` / `Customer` / `Owner` → `$select` uses **`_<logical>_value`**,
  `$expand` uses the nav property from `ManyToOneRelationships`. Targets come
  from the same relationship rows (multi-target = polymorphic → no expand
  suggestion, only `_value`).
- `Picklist` / `State` / `Status` / `MultiSelectPicklist` → value editor is an
  option dropdown, display comes from the FormattedValue annotation.
- `DateTime` (`DateAndTime` vs `DateOnly` via `AttributeTypeName`) → date/time
  picker that emits an ISO literal, plus the Dataverse date functions.
- `File` / `Image` / `PartyList` → not selectable, shown greyed in the picker
  with a reason.

**Option labels** — via the proven **`stringmap`** route (same trick as
`dataverseFlowComparerService.loadAreaLabels`), not a metadata cast:
filter `attributename eq '<attr>' and objecttypecode eq <ObjectTypeCode>`,
take `attributevalue` → `value`, language preference **org base language first,
then 1033, then anything**. `ObjectTypeCode` comes from the entity list, so no
extra lookup. Cached per (org, entity, attribute).

## 5. Query model and the builder ⇄ raw coupling

`utils/odataQuery.ts` (pure, Vitest):

```ts
export interface ODataQuery {
  entitySet: string
  recordId: string | null            // single-record mode
  select: string[]
  filter: FilterNode | null          // structured
  filterRaw: string | null           // set when the text can't be modelled
  orderBy: { column: string; desc: boolean }[]
  expand: ExpandClause[]             // { nav, select[], filter?, top?, orderBy? }
  top: number | null
  pageSize: number                   // → prefer odata.maxpagesize
  annotations: boolean               // → prefer odata.include-annotations="*"
}
```

Two renderers, deliberately separate:

- `toConnectorParams(q)` → the values handed to `ListRecordsWithOrganization`
  **unencoded** (the platform encodes them).
- `toWebApiUrl(orgUrl, q)` → the percent-encoded `…/api/data/v9.2/…` URL for
  the Copy button and “open in browser”.

`parseQuery(text, entityMeta)` → `{ query, issues[] }`, tolerant: splits on
top-level `&`, recognises `$select/$filter/$orderby/$expand/$top`, and for
`$filter` tries a structured parse.

> **Coupling rule: the raw text always wins.** If a `$filter` cannot be
> represented as a `FilterNode` (nested lambdas, hand-written functions), it is
> kept verbatim in `filterRaw`, the builder shows a read-only
> “advanced filter — edit in the raw line” chip and **never rewrites it**.
> That is what keeps “the whole palette” reachable without the builder eating
> expert queries.

**Filter tree + operator catalog:**

```ts
type FilterNode =
  | { kind: 'group'; op: 'and' | 'or'; children: FilterNode[] }
  | { kind: 'cond'; column: string; operator: OpId; values: string[] }
```

Operators offered per column type — this is the “guided” part:

| Type | Operators |
| --- | --- |
| any | `eq`, `ne`, `is null`, `is not null` |
| string | `contains`, `startswith`, `endswith`, `not contains`, `in` |
| number / money / date | `gt`, `ge`, `lt`, `le`, `between` (→ `ge A and le B`) |
| date extras | `Today`, `Yesterday`, `ThisMonth`, `ThisYear`, `LastXDays(n)`, `NextXDays(n)`, `On`, `OnOrAfter`, `OnOrBefore`, `Between` (all as `Microsoft.Dynamics.CRM.*`) |
| choice | `eq`/`ne` with an option dropdown; multi-select choice → `ContainValues` |
| lookup | `eq <guid>` (with a record picker), `is null`, `EqualUserId`, `EqualBusinessId` |
| boolean | `eq true` / `eq false` |
| relationship (advanced row) | `nav/any(a:a/col eq v)`, `nav/all(...)` |

Literal escaping helpers (`odataString` doubles `'`, `odataGuid`, `odataDate`)
are the single source of truth — the builder, the suggestion inserts and the
tests all use them.

## 6. IntelliSense

One pure engine, one test suite, reused by every input:

```ts
suggest(text: string, caret: number, ctx: SuggestContext): Suggestion[]
// Suggestion = { label, insert, detail, kind, replaceFrom, replaceTo }
```

`SuggestContext` carries the current entity metadata, the catalog (for entity
sets and expand targets) and the option cache. The component is dumb: it
applies `replaceFrom..replaceTo`.

Contexts recognised:

| Where the caret is | Suggested |
| --- | --- |
| entity-set box | entity sets, matched on **logical name, schema name and display name** (so “Firma” finds `accounts`) |
| `$select`, start or after `,` | selectable columns, `_x_value` variants; primary id/name pinned to the top |
| `$orderby` | columns, then ` asc` / ` desc` |
| `$filter` start, after `and`/`or`/`(` | columns + `Microsoft.Dynamics.CRM.*` functions |
| `$filter` after a column | operators valid for that column's type |
| `$filter` after an operator | option values (label + code), `true`/`false`, `null`, date snippets, GUID placeholder, user-context functions |
| after `<nav>/` | columns of the **related** entity (lambda bodies, expand paths) |
| `$expand` | nav properties (single-valued first, with target table as detail) |
| inside `$expand(` | `$select=`, then the related entity's columns |
| **raw line** | scan back to the last `&$xxx=` → delegate to the rule above |

That last row is the point: the raw query line gets *identical* completions,
because it just resolves which sub-context the caret is in.

`components/QueryInput.tsx`: `<textarea>`/`<input>` + absolutely positioned
popup; ↑/↓ navigate, Enter/Tab accept, Esc close, **Ctrl+Space** force. Under
the input a **signature strip** for the function being typed
(`LastXDays(PropertyName, PropertyValue)`).

**No Monaco / CodeMirror.** Reasons: the Code-App player only serves files
referenced from `index.html` (gotcha #10), Monaco needs web workers and adds
megabytes to a bundle we already chunk-split deliberately. Hand-rolled
completion over a plain textarea is the correct trade here.

**Validation chips** (`validateQuery`) under the inputs, non-blocking:
unknown column · lookup selected without `_value` · virtual attribute ·
unknown nav property · `$top > 5000` · filter on a column with
`IsValidForAdvancedFind = false`.

## 7. Results, records, navigation

**Grid** (`OdataResultGrid.tsx`)

- Columns from `$select`, else from the response keys (annotation keys
  filtered out). Header = display name, logical name on hover; click sorts
  (writes `$orderby`, re-runs).
- Cells prefer the `…@OData.Community.Display.V1.FormattedValue` annotation
  (choices, money, dates, lookups) with the raw value in `title`; a global
  **Raw ⇄ Formatted** toggle switches all cells.
- Lookup cells are chips; click uses the
  `…@Microsoft.Dynamics.CRM.lookuplogicalname` annotation to open the target
  record — that is the actual “browse the database” move.
- Long text / JSON truncated, click opens the value in a modal
  (`.modal-backdrop` pattern).
- Footer: rows shown · **Load more** (skiptoken) · **Count** (FetchXML
  aggregate, on demand) · duration in ms · the SP-identity note.

**Record panel** (`OdataRecordPanel.tsx`) — row click or single-record mode
(`GetItemWithOrganization`, no `$select` = all columns):

- attributes grouped Identity / Data / Lookups / System, each with logical
  name, type and formatted value;
- **Related** tab: 1:N and N:N relationships from the catalog → click browses
  the child set pre-filtered (`_<ref>_value eq <id>` / the intersect nav);
- Copy JSON, copy record URL, deep link into the maker portal where a route
  exists.

**Guardrails:** default `$top = 50`; page sizes 50/100/250/1000; never
auto-run while typing (explicit **Run**, Ctrl+Enter); a request-sequence guard
drops stale responses when the environment or table is switched mid-flight.

## 8. Errors → hints (`utils/odataErrors.ts`, pure + Vitest)

The connector wraps faults as `result.error.message`; unwrap the inner OData
`error.message` (same idea as `describeError` in `App.tsx`) and map the known
ones:

| Fault | Hint |
| --- | --- |
| `Could not find a property named 'x'` | column doesn't exist — for lookups use `_x_value`; offer the closest catalog match |
| `No HTTP resource found` / `0x8006088a` | entity **set** name wrong (it is not just logical name + s — `webresourceset`, `usersettingscollection`); suggest the nearest `EntitySetName` |
| `0x80040203` FormatException | wrong literal type — e.g. a logical name where an ObjectTypeCode is expected (the `savedquery.returnedtypecode` lesson) |
| `prvRead…` / `0x80040220` | the connector SP lacks read privilege on `<table>` in `<env>` |
| `Invalid property … in the payload` | virtual/derived attribute selected |

## 9. Mock parity (repo rule)

`mockOdataBrowserService` ships a small fake catalog (`account`, `contact`,
`pro_workingsolution`) with attributes, one lookup, one choice with labels and
~20 seeded rows, so filtering, paging, expand and the record panel are fully
demoable offline — same contract as every other service pair here.

## 10. Verify on first live run

1. `prefer: odata.include-annotations="*"` survives the connector →
   FormattedValue / lookuplogicalname annotations present in `data.value`.
2. `prefer: odata.maxpagesize=<n>` → `@odata.nextLink` present in `data` and
   the skiptoken extractable. **Fallback if not:** keyset paging
   (`$orderby=<primaryid>` + `$filter=<primaryid> gt <last>`), which needs no
   server cursor at all.
3. One `EntityDefinitions` call with four expands (attributes + three
   relationship collections) — else split.
4. `stringmap` option labels filtered by numeric `objecttypecode`.
5. Nested `$expand` with `$select` inside parentheses through the connector's
   `$expand` parameter.
6. Metadata sets `GlobalOptionSetDefinitions` / `RelationshipDefinitions`
   addressable as `entityName` (needed for P5's metadata mode).

## 11. Phasing

Each phase ends green on `npm run build && npm run lint && npm test` and
updates HelpPanel / README / Roadmap / CLAUDE.md.

| Phase | Content | Done when |
| --- | --- | --- |
| **P1 Skeleton** ✅ | nav entry (gated) + SP banner, env picker (`OperateEnvPicker`), entity picker over the catalog, column picker, `$top`, Run, plain grid. `metadataCatalog` + service pair + mock. | ✅ shipped — a table can be listed in every configured environment; sorting, formatted-value toggle, paging and Copy-URL came along |
| **P2 Query core** ✅ | filter builder with typed operators/editors, multi-column `$orderby`, Count button, **raw query line with build+parse coupling**, copy-as-URL | ✅ shipped — round-trip is a property test: every builder-expressible filter renders, parses and re-renders byte-identically |
| **P3 IntelliSense** ✅ | `odataSuggest` + `QueryInput` on the raw line, validation chips, signature strip, error hints | ✅ shipped — 30 engine tests cover path/select/orderby/filter/expand and the caret-region rules; the builder's own inputs stay dropdowns, where completion would add nothing |
| **P4 Records** | single-record mode, record panel, lookup drill-through, related-record browsing, `$expand` builder with nested `$select` | you can click from an account to its contacts and back without typing |
| **P5 Comfort** | query history + saved queries (localStorage per env), CSV/JSON export, **FetchXML mode** (paste/run, reuse `utils/transferConfig.parseFetchXml`), **metadata mode** (browse EntityDefinitions & friends in the same grid) | — |
| **P6 Write (deferred)** | flip `WRITE_ENABLED`, implement `updateRecord` → `createRecord` → `deleteRecord`, confirm dialogs, PROD danger, per-field diff preview | separate decision |

## 12. What “prepare CRUD, ship read-only” means concretely

Built and tested in v1, **not** reachable from the UI:

- `OdataBrowserService` declares `createRecord`, `updateRecord`,
  `deleteRecord`, `associate`, `disassociate` with final signatures.
- `dataverseOdataBrowserService` implements them as
  `throw new Error('OData Browser write mode is disabled')`, guarded by a
  module constant `WRITE_ENABLED = false`.
- `utils/odataWrite.ts` — `buildPatchBody(original, draft, attrs)` — is fully
  implemented and Vitest-covered now: lookups as `<nav>@odata.bind`
  (`/entitySet(id)`), null-clearing, `IsValidForUpdate === false` columns
  filtered, choice values coerced to numbers, dates to ISO. This is the part
  that is easy to get wrong and cheap to test today.
- `types/odataBrowser.ts` carries `RecordDraft` / `WritePlan` / `WriteResult`.
- UI seams: `canWrite = WRITE_ENABLED && isDeploymentManager` — every write
  affordance is already behind it, so switching on is a flag plus three method
  bodies, not a refactor.
