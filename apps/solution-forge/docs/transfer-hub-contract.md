# Configuration Data Transfer Hub — Pipeline Contract

The Solution Administration Console (menu **Manage → Data Transfer**) authors
*transfer packages*: declarative descriptions of which configuration data an
**external pipeline** transports from a source Dataverse environment into one
or more target environments. The app **never executes** a transfer — that is
deliberately out of scope. This document is the contract the executor is built
against.

## Where the configuration lives

- Host environment of the app (Schulz INT-11), solution
  `DynamicsProSolutionAdminConsole`, publisher `DynamicsPro` (prefix `pro`).
- Entity sets (Web API): **`pro_transferpackages`**,
  **`pro_transferentries`** (`pro_transferentry.pro_package_ref` → package,
  relationship `pro_transferentry_package`, delete = cascade) and
  **`pro_transferruns`** (run queue + execution log; lookup → package with
  delete = remove-link, so run history survives a package delete).
- Environment keys (`pro_targetenvs_str`, `pro_sourceenv_str`) resolve against
  the **`pro_environmentconfigs`** table: `pro_key` → `pro_url`
  (+ `pro_environmentid`). The same registry drives the app's `ENVIRONMENTS`.

## Run queue (`pro_transferrun`) — how execution is triggered

The hub's **▶ Run** button creates one `pro_transferrun` row per requested
execution; the executor is queue-driven (never scans packages on its own
schedule unless you build that separately):

| Column | Type | Semantics |
|---|---|---|
| `pro_name` | String(400) | Display name (`<package> — <utc timestamp>`). |
| `pro_package_ref` | Lookup | The package to execute. |
| `pro_status_opt` | Choice | 867520000 Queued / …001 Running / …002 Succeeded / …003 Failed / …004 Partially succeeded / …005 Cancelled / …006 **Scheduled**. |
| `pro_targetenvs_str` | String(400) | Target env keys **snapshotted at request time** — the executor uses THIS list, not the package's current one. |
| `pro_scheduledfor_dat` | DateTime | "Run later" due time (status Scheduled). The **scheduler flow** (recurrence, every 5 min) promotes due Scheduled runs to Queued; the executor never reads this column. |
| `pro_startedon_dat` / `pro_finishedon_dat` | DateTime | Written by the executor. |
| `pro_summary_str` | String(1000) | One-line result written by the executor. |
| `pro_log_txt` | Memo | Result JSON written by the executor (shown in the hub). |
| `createdon` / `createdby` | audit | Who requested the run, when. |

**Executor protocol:**

1. Pick up rows with `pro_status_opt eq 867520000` (Queued), oldest first —
   ideally via a Dataverse trigger ("row added **or modified**", filtering
   attribute `pro_status_opt`, guard on status Queued), else by polling.
   "Run later" rows arrive as **Scheduled** (867520006) with
   `pro_scheduledfor_dat`; the companion scheduler flow flips them to Queued
   once due, which fires the same trigger. Cancelled rows are never picked
   up (the hub cancels Queued/Scheduled runs by setting status Cancelled).
2. Immediately set `pro_status_opt = Running` + `pro_startedon_dat` (this is
   the claim — with a single executor instance no further locking is needed).
3. Execute the run's package (semantics below) against the run's
   `pro_targetenvs_str`.
4. Write `pro_finishedon_dat`, `pro_summary_str`, `pro_log_txt` and the final
   status: Succeeded / Failed / **Partially succeeded** (some entries or
   targets errored, others landed).
5. Suggested `pro_log_txt` shape (the hub renders it verbatim as JSON):

```json
[
  { "entry": "Payment terms", "target": "uat", "created": 0, "updated": 42,
    "deactivated": 0, "deleted": 0, "errors": [] },
  { "entry": "Price lists", "target": "prod", "created": 1, "updated": 6,
    "errors": ["cust_code 'X9' matched 2 rows — skipped"] }
]
```

A run whose package was deleted in the meantime (lookup empty) is marked
Failed with a note. Runs in status Cancelled are never picked up.

## Execution semantics

1. The unit of execution is ONE `pro_transferrun`. Resolve its package; read
   the package's **active** entries as below. (Cross-package ordering via
   `pro_order_int` applies only if you batch multiple queued runs.)
2. Per package, read its **active** entries: `_pro_package_ref_value eq
   <packageId> and statecode eq 0`, ordered by `pro_order_int asc`.
   **Entry order is meaningful** — lookup parents come before their children,
   so upserting in order resolves intra-package references.
3. Per entry, run `pro_fetchxml_txt` against the **source** environment
   (`pro_sourceenv_str` → `pro_environmentconfig.pro_url`) and write the rows
   into **every** target environment of the RUN (`pro_transferrun.
   pro_targetenvs_str` — the snapshot; comma-separated keys). A run without
   target keys is a no-op.
4. Inactive packages/entries (`statecode 1`) are skipped entirely.

## `pro_transferpackage` columns

| Column | Type | Semantics |
|---|---|---|
| `pro_name` | String(200) | Display name (logging). |
| `pro_description_txt` | Memo | Free text, informational. |
| `pro_targetenvs_str` | String(400) | Comma-separated environment **keys** (e.g. `uat,prod`). Empty ⇒ no-op. |
| `pro_order_int` | Int | Cross-package execution order, ascending. |
| `statecode` | State | 0 = execute, 1 = skip. |

## `pro_transferentry` columns

| Column | Type | Semantics |
|---|---|---|
| `pro_name` | String(200) | Display name (logging). |
| `pro_package_ref` | Lookup | Owning package. |
| `pro_sourceenv_str` | String(50) | Source environment **key**. |
| `pro_sourcetable_str` | String(200) | Logical name of the source table. |
| `pro_sourcetabledisplay_str` | String(400) | Display-name snapshot (logging only). |
| `pro_sourceentityset_str` | String(200) | Entity-set snapshot (metadata-resolved at authoring time). Empty ⇒ resolve via `EntityDefinitions`. **Never** naively pluralize. |
| `pro_primaryidattr_str` | String(200) | Primary-id attribute snapshot (e.g. `cust_paymenttermid`). |
| `pro_querymode_opt` | Choice | How the query was authored — informational; the executable query is always the snapshot below. |
| `pro_viewid_str` / `pro_viewname_str` | String | Saved-view provenance (view mode). **Do not read `savedquery` at run time** — the view may have changed or been deleted since the snapshot; the snapshot is authoritative. |
| `pro_viewsnapshotat_dat` | DateTime | When the view FetchXML was last snapshotted. |
| `pro_fetchxml_txt` | Memo | **The executable query — always populated** (both modes). Carries no paging attributes; paging is the pipeline's job (inject `count`/`page` or use paging cookies). |
| `pro_matchmode_opt` | Choice | Record matching, see below. `null` ⇒ GUID upsert. |
| `pro_matchcolumns_str` | String(1000) | Comma-separated logical column names (columns mode). |
| `pro_orphanhandling_opt` | Choice | What to do with orphaned target records. `null` ⇒ Ignore. |
| `pro_order_int` | Int | In-package execution order, ascending. |
| `pro_notes_txt` | Memo | Operator notes, informational. |
| `pro_columnplan_txt` | Memo | **Write recipe JSON** computed by the hub at save time: `{"s":[scalar cols],"l":[{"c":col,"s":target entity set}],"x":[{"c":col,"r":reason}]}` — the executor copies `s` 1:1 and binds `l` as `<c>@odata.bind = /<s>(<guid>)`; `x` documents skipped columns. Empty ⇒ executor errors the entry (author must re-save it). |
| `statecode` | State | 0 = execute, 1 = skip. |

## Choice values

Mirrored in `src/types/transferHub.ts` — codes are pinned, never renumber.

| `pro_querymode_opt` | |
|---|---|
| 867520000 | Saved view (snapshot) |
| 867520001 | FetchXML (hand-written) |

| `pro_matchmode_opt` | |
|---|---|
| 867520000 | **GUID upsert** — write with the source record's id; ids stay identical across environments. |
| 867520001 | **Match by columns** — find the target record by equality on *all* `pro_matchcolumns_str` columns. |

| `pro_orphanhandling_opt` | |
|---|---|
| 867520000 | **Ignore** — leave target records untouched. |
| 867520001 | **Deactivate** — set orphaned target records `statecode 1`. |
| 867520002 | **Delete** — delete orphaned target records. |

## Record matching

- **GUID upsert** (default): upsert on the primary key —
  `PATCH <targetSet>(<sourceId>)` with `If-None-Match` semantics or the Web
  API upsert. `pro_primaryidattr_str` names the id attribute in the query
  result.
- **Match by columns**: query the target for equality on all match columns.
  - 0 hits → create;
  - 1 hit → update that record;
  - \>1 hits → **error the entry** (ambiguous key — do not guess), continue
    with the next entry, report at the end.
  - Match columns are guaranteed (by the hub's validation) to be part of the
    query's attribute set.

## Orphan handling

An **orphan** is a target record that lies inside the entry's scope but has no
counterpart in the source result. Scope = the entry's FetchXML filter
translated to the target (same filter, target data). The pipeline therefore
runs the entry query **against the target** to enumerate candidates, then
compares by the match identity (GUID or match columns). Records failing the
comparison are orphans → apply the entry's flag (Ignore / Deactivate /
Delete).

## Caveats the executor must honor

- **Lookup columns** (`_x_value` in the result) transfer only if the
  referenced row exists in the target — order entries parent-first; the hub's
  UI tells authors the same. Cross-package/env references outside the package
  are the author's responsibility.
- **link-entity attributes** in a query are read-only context (aliased
  columns) — never write them; write only the main entity's columns.
- Skip platform-managed columns on write (`createdon`, `modifiedon`,
  `ownerid` unless intentionally mapped, `statecode`/`statuscode` unless the
  source row carries them and the author included them).
- Choice/Boolean columns come through FetchXML as raw values — write raw
  values; formatted values (`…@OData.Community.Display.V1.FormattedValue`)
  are display-only.
- The FetchXML snapshot may select `all-attributes` — the executor should
  then subtract the platform-managed columns above.

## Reference executor: `installer/deploy-executor-flow.ps1`

The repo ships a working executor implementation of this contract as a cloud
flow: template `installer/executor-flow.clientdata.json` (placeholders
`__HOST_URL__` + `__CONNREF__`), plus the companion **scheduler flow**
(`installer/scheduler-flow.clientdata.json`, recurrence every 5 min,
promotes due Scheduled runs to Queued) — both deployed create-or-update +
activate by `installer/deploy-executor-flow.ps1`. It implements the full protocol —
claim (Running + startedon), per entry × target: source/target read via the
entry's FetchXML snapshot, GUID- or column-matching (composite keys), create/
update with a payload built from the entry's **column plan**
(`pro_columnplan_txt`: writable scalars + single-target lookups as
`@odata.bind`; computed by the hub at entry save), orphan deactivate/delete,
per-cell log, final status/summary/log write-back.

**v3 design (2026-07-23, performance rework — entirely variable-free):**
row sets are partitioned up front with Filter-array queries (updates = source
keys present in the target index, creates = the rest, ambiguous = composite
key occurs more than once among the target keys, checked case-insensitively
via an `indexOf`/`lastIndexOf` string probe), composite keys support **at most
5 match columns** (a fixed 5-slot concat; more → entry error), the per-cell
log entry is **appended live into `pro_transferrun.pro_log_txt`**
(read-modify-write in the sequential part of the flow — the column is a valid
JSON array at every moment of the run, so the hub UI can show progress), and
the final totals/status are computed from that log with XPath `sum()` over
`xml(json(...))`. Semantics that changed vs v1/v2: `created`/`updated`/
`deactivated`/`deleted` count **attempted** rows (the partition sizes); when a
write fails, the row loop reports the failure as a cell-level error string
("… loop reported row failures — see the flow run history") and the cell's
`errs` count drives Partial/Failed status. Per-row error texts are no longer
produced — row-level diagnostics live in the Power Automate run history.
Limits: 5000-row page cap per query (warned in the cell errors), lookups only
single-target (polymorphic/owner skipped per plan), entries without a column
plan error with "re-save the entry in the hub".

## Verified executor approach: in-solution cloud flow (probe 2026-07-23)

The queue protocol above was **empirically verified on INT-11** with a
Dataverse-webhook cloud flow created purely via the Web API — the intended
product-default executor. Findings:

- **CONFIRMED end-to-end (~4 s trigger→done):** trigger on `pro_transferrun`
  create (`SubscribeWebhookTrigger`, message 1, scope 4) → **cross-env read
  via the existing SP connection reference `pro_CRDataverse`**
  (`ListRecordsWithOrganization`, `organization` = UAT URL) → write-back to
  the triggering host row (`UpdateRecordWithOrganization`:
  `item/pro_summary_str`, `item/pro_status_opt`). No new connector,
  connection or external infrastructure needed.
- Parameter flattening: `subscriptionRequest/message|entityname|scope` on the
  trigger, `item/<column>` on writes, `entityName` camelCase on the
  `…WithOrganization` ops. No deprecation warnings surfaced.
- **Working `clientdata` template** (create via `POST workflows` with
  `category=5, type=1, primaryentity='none'` + header
  `MSCRM.SolutionUniqueName`; activate via
  `PATCH workflows(<id>) {"statecode":1,"statuscode":2}`):

```json
{"schemaVersion":"1.0.0.0","properties":{
 "connectionReferences":{"shared_commondataserviceforapps":{"runtimeSource":"embedded","connection":{"connectionReferenceLogicalName":"pro_CRDataverse"},"api":{"name":"shared_commondataserviceforapps"}}},
 "definition":{"$schema":"https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#","contentVersion":"1.0.0.0",
  "parameters":{"$connections":{"defaultValue":{},"type":"Object"},"$authentication":{"defaultValue":{},"type":"SecureObject"}},
  "triggers":{"When_a_run_is_queued":{"type":"OpenApiConnectionWebhook","inputs":{"host":{"connectionName":"shared_commondataserviceforapps","operationId":"SubscribeWebhookTrigger","apiId":"/providers/Microsoft.PowerApps/apis/shared_commondataserviceforapps"},"parameters":{"subscriptionRequest/message":1,"subscriptionRequest/entityname":"pro_transferrun","subscriptionRequest/scope":4}}}},
  "actions":{
   "List_UAT_org":{"runAfter":{},"type":"OpenApiConnection","inputs":{"host":{"connectionName":"shared_commondataserviceforapps","operationId":"ListRecordsWithOrganization","apiId":"/providers/Microsoft.PowerApps/apis/shared_commondataserviceforapps"},"parameters":{"organization":"https://operations-d365-schulz-uat-1-1.crm4.dynamics.com","entityName":"organizations","$select":"name","$top":1}}},
   "Write_back":{"runAfter":{"List_UAT_org":["Succeeded"]},"type":"OpenApiConnection","inputs":{"host":{"connectionName":"shared_commondataserviceforapps","operationId":"UpdateRecordWithOrganization","apiId":"/providers/Microsoft.PowerApps/apis/shared_commondataserviceforapps"},"parameters":{"organization":"https://operations-d365-schulz-int-11.crm4.dynamics.com","entityName":"pro_transferruns","recordId":"@triggerOutputs()?['body/pro_transferrunid']","item/pro_summary_str":"PROBE ok - UAT org: @{first(outputs('List_UAT_org')?['body/value'])?['name']}","item/pro_status_opt":867520002}}}
  }}}}
```

**Hard-won engine findings (2026-07-23 performance probes — all empirically
verified on INT-11, do not re-learn these):**

- **Nested `Foreach` loops ALWAYS run sequentially.** The
  `runtimeConfiguration.concurrency.repetitions` setting is honored only for
  top-level loops; any foreach nested inside another foreach (even one level,
  even inside If branches) executes its iterations serially at roughly
  0.5–0.9 s per iteration (scheduling overhead), regardless of the setting.
  This bounds the current executor at ~0.6 s per row. True row parallelism
  requires hoisting the row loop to the top level of its own run — i.e. a
  **child flow per entry × target cell** ("Run a Child Flow" / `Workflow`
  action) whose Request-triggered run owns the row loop.
- **Variable actions serialize.** `AppendToArrayVariable` / `IncrementVariable`
  take ~0.25–0.3 s each under a run-state lock (measured: 30 appends = 7.4 s,
  30 increments = 9.2 s, the same loop with pure Compose/Select actions =
  1.0 s). Keep variables out of anything hot; v3 has **zero** variables.
- **`UpsertMultiple`/`CreateMultiple`/`UpdateMultiple` are NOT callable through
  the Dataverse connector.** The raw Web API accepts the collection-bound call
  (even via the connector's URL shape `entityset()/Microsoft.Dynamics.CRM.
  UpsertMultiple`, HTTP 204 verified), but (a) the Logic Apps engine rejects an
  empty `recordId` path parameter at runtime
  (`WorkflowOperationParametersRuntimeMissingValue`), (b) a real `recordId`
  routes to the instance path which 404s for collection-bound actions, and
  (c) the designer-time metadata check (`GetMetadataForBoundActionInput…`)
  doesn't know the xMultiple messages at all (`XrmActionNameNotFound`) unless
  the actionName is a non-foldable runtime expression.
- **`result('<foreach>')` does not aggregate repetitions** — it returns only
  the current/last repetition's actions (length 2 for a 2-action loop), so it
  cannot collect per-row outcomes across iterations.
- Per-action timings of a flow run are queryable via
  `https://api.flow.microsoft.com/providers/Microsoft.ProcessSimple/environments/
  <envId>/flows/<workflowidunique>/runs/<runName>/actions/<action>/repetitions`
  (token audience `https://service.flow.microsoft.com/`).

Gotchas for the real executor build:

- **Activation identity:** raw Web API activation succeeded although the
  activating user did not own the SP connection — the Designer UI has its own
  connection-sharing gate; if the executor is ever (re)activated through the
  maker portal by another user, verify that path separately.
- `organizations.name` is the internal `unq…` string — use `friendlyname`
  for human-readable logging.
- **No Dataverse entity set for cloud-flow run history** (`flowruns`/
  `flowsessions` → 404) — run diagnostics live in the Power Automate portal,
  which is why the executor MUST write its own `pro_log_txt`/`pro_summary_str`.

## Example (Web API read the pipeline would do)

```
GET {host}/api/data/v9.2/pro_transferpackages?$filter=statecode eq 0
    &$select=pro_transferpackageid,pro_name,pro_targetenvs_str,pro_order_int
    &$orderby=pro_order_int asc
```

```json
{
  "pro_transferpackageid": "0f8…",
  "pro_name": "Base configuration data",
  "pro_targetenvs_str": "uat,prod",
  "pro_order_int": 1
}
```

```
GET {host}/api/data/v9.2/pro_transferentries?$filter=_pro_package_ref_value eq 0f8… and statecode eq 0
    &$select=pro_transferentryid,pro_name,pro_sourceenv_str,pro_sourcetable_str,
             pro_sourceentityset_str,pro_primaryidattr_str,pro_querymode_opt,
             pro_fetchxml_txt,pro_matchmode_opt,pro_matchcolumns_str,
             pro_orphanhandling_opt,pro_order_int
    &$orderby=pro_order_int asc
```

```json
{
  "pro_transferentryid": "9c1…",
  "pro_name": "Price lists",
  "pro_sourceenv_str": "dev",
  "pro_sourcetable_str": "cust_pricelist",
  "pro_sourceentityset_str": "cust_pricelists",
  "pro_primaryidattr_str": "cust_pricelistid",
  "pro_querymode_opt": 867520001,
  "pro_fetchxml_txt": "<fetch><entity name=\"cust_pricelist\">…</entity></fetch>",
  "pro_matchmode_opt": 867520001,
  "pro_matchcolumns_str": "cust_code",
  "pro_orphanhandling_opt": 867520001,
  "pro_order_int": 2
}
```
