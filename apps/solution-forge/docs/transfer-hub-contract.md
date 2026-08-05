# Configuration Data Transfer Hub — Pipeline Contract

The Solution Administration Console (menu **Operate → Data Transfer**) authors
*transfer packages*: declarative descriptions of which configuration data is
transported from a source Dataverse environment into one or more target
environments. Execution is done by **cloud flows installed alongside the app**
(executor parent + child + scheduler, see
`installer/deploy-executor-flow.ps1`); the app itself **never executes** a
transfer in-session. This document is the contract those flows are built
against — it is written so a *different* executor (an external pipeline, an
Azure Function, …) could implement the same protocol.

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
| `pro_dryrun_bit` | Boolean | Simulation — the executor partitions, counts and logs but writes nothing. |
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
| `pro_recurrence_opt` | Choice | 867520000 None / …001 Daily / …002 Weekly — automatic cadence. |
| `pro_nextrun_dat` | DateTime | Next due automatic run (UTC). Carries the time of day and, for Weekly, the weekday. |
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
| `pro_fetchxml_txt` | Memo | **The executable query — always populated** (both modes). A `top="N"` the author wrote is honored. An executor reading through the Dataverse connector gets **one 5000-row page** and no working way to page further (see the row-limit note below); a different executor may implement paging (`count`/`page` or paging cookies). The shipped cloud-flow executor refuses to write when a read hits the 5000-row cap. |
| `pro_matchmode_opt` | Choice | Record matching, see below. `null` ⇒ GUID upsert. |
| `pro_matchcolumns_str` | String(1000) | Comma-separated logical column names (columns mode). |
| `pro_orphanhandling_opt` | Choice | What to do with orphaned target records. `null` ⇒ Ignore. |
| `pro_order_int` | Int | In-package execution order, ascending. |
| `pro_notes_txt` | Memo | Operator notes, informational. |
| `pro_columnplan_txt` | Memo | **Write recipe JSON** computed by the hub at save time: `{"s":[scalar cols],"l":[{"c":col,"s":target entity set}],"x":[{"c":col,"r":reason}]}` — the executor copies `s` 1:1 and binds `l` as `<c>@odata.bind = /<s>(<guid>)`; `x` documents skipped columns. Empty ⇒ executor errors the entry (author must re-save it). The hub's entry dialog renders this same recipe live (section **Write plan**), so `x` is authoring feedback, not just documentation — keep the reason strings stable, `utils/columnPlanReport.ts` maps them to human sentences. |
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
| 867520001 | **Match by columns** — find the target record by equality on *all* `pro_matchcolumns_str` columns (**max. 5**, see below). |

| `pro_orphanhandling_opt` | |
|---|---|
| 867520000 | **Ignore** — leave target records untouched. |
| 867520001 | **Deactivate** — set orphaned target records `statecode 1`. |
| 867520002 | **Delete** — delete orphaned target records. |

| `pro_recurrence_opt` | |
|---|---|
| 867520000 | **None** — the package only runs when a run is queued manually. |
| 867520001 | **Daily** — one run every 24 h at the `pro_nextrun_dat` time. |
| 867520002 | **Weekly** — one run every 7 days at the `pro_nextrun_dat` weekday/time. |

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

The repo ships a working executor implementation of this contract as a
**pair of cloud flows** plus the scheduler:

- **Parent** `PA | AUTO | Transfer Run | Execute Package`
  (`installer/executor-flow.clientdata.json`, placeholders `__CONNREF__`,
  `__CHILD_ID__`; host-env operations use `organization: "current"` so the
  flows stay portable and render in the designer): Dataverse-webhook trigger on
  `pro_transferrun` status changes, claims the run, resolves environments,
  validates entries, then dispatches **one child-flow call per entry × target
  cell** (`Workflow` action, sequential) and appends each returned cell log
  into `pro_transferrun.pro_log_txt` (read-modify-write — the column is a
  valid JSON array at every moment, so the hub UI shows live progress).
  Final totals/status come from that log via XPath `sum()` over
  `xml(json(...))`.
- **Child** `PA | AUTO | Transfer Run | Execute Cell`
  (`installer/executor-child-flow.clientdata.json`): Request/Button trigger
  with inputs `{entryId, srcUrl, tgtUrl, targetKey}`; reads the entry +
  source/target rows itself, partitions rows with Filter arrays (updates =
  source keys in the target index, creates = the rest, ambiguous = composite
  key occurs >1× among target keys, case-insensitive `indexOf`/`lastIndexOf`
  probe; composite keys = fixed 5-slot concat, **max 5 match columns**), then
  runs update/create/orphan loops **at the top level of its own run — the
  only place Logic Apps honors foreach concurrency** (20 parallel) — and
  returns the cell-log JSON in its Response.
- **Scheduler** (`installer/scheduler-flow.clientdata.json`, every 5 min).
  Two jobs: promote due **Scheduled runs** to Queued, and queue a run for
  every **recurring package** whose `pro_nextrun_dat` is due
  (`pro_recurrence_opt` Daily/Weekly, `statecode 0`), then roll that stamp
  forward by the cadence — `addDays(next, (missedPeriods + 1) × interval)`,
  so a scheduler outage never produces a burst of catch-up runs. Time of day
  and weekday live inside `pro_nextrun_dat`; the hub writes it as UTC from
  the user's local pick. DST shifts the local time by an hour (the stamp is
  rolled in fixed 24 h/7 d steps) — re-pick the first run to correct it.

All three are deployed create-or-update + activate by
`installer/deploy-executor-flow.ps1` (child first — the parent's `Workflow`
action references the child's **workflowid**, injected as `__CHILD_ID__`).
All three live in the app solution, so a **solution export/import carries
them along**; record ids survive the transport, which keeps the parent →
child reference intact. In the target environment only the usual ALM steps
remain: bind the Dataverse connection reference and activate the flows
(re-running the deploy script there is equally fine and re-injects the id).

**Dry run** (`pro_transferrun.pro_dryrun_bit`): the parent passes the flag to
each child, which empties the `foreach` inputs of the update/create/orphan
loops. Partitioning, counting and logging are untouched, so the run log
reports exactly what *would* have happened; the summary is prefixed
`DRY RUN — would be: …`. Nothing is written in any target.

Semantics: `created`/`updated`/`deactivated`/`deleted` count **attempted**
rows (partition sizes); a failing write surfaces as a cell-level error string
("… loop reported row failures — see the flow run history"), the cell's
`errs` count drives Partial/Failed status, and a crashed child yields an
error cell ("cell execution failed…"). Per-row error texts are not produced —
row-level diagnostics live in the child flow's run history. Both flows are
**variable-free** (see engine findings below).

**Row limit — hard 5000 per query, guarded.** A connector FetchXML read
returns at most one 5000-row page (see the engine findings: the pagination
policy does *not* apply to `fetchXml`, and an accumulator loop is impossible
because `setVariable` cannot self-reference). A truncated read makes every
transfer decision unreliable — missing source rows look like orphans (→ mass
delete!), missing target rows look like new records (→ duplicates). The child
therefore computes `Capped` (source **or** target returned ≥ 5000 rows) and,
when set, **skips all four write loops**, reports all counters as 0 and logs
`ERROR: the query hit the 5000-row page cap (source N, target M) — NOTHING
was written; narrow the entry query with a filter`. Verified on INT-11 with a
34 662-row source and orphan handling *Delete*: no row was touched.

Further limits: lookups only single-target (polymorphic/owner skipped per
plan); entries without a column plan error with "re-save the entry in the
hub"; composite keys are limited to **5 match columns** (fixed slot count,
enforced by the hub's save gate).

**Measured (INT-11, 30-row dev→dev GUID upsert):** v1 sequential ~86 s →
v3 variable-free single flow 37 s → **v4 parent+child 10 s**
(startedon→finishedon). The child's top-level loop does 30 writes in ~2.4 s.

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

- **Host-env `*WithOrganization` operations MUST use `organization: "current"`,
  never a literal env URL.** These ops resolve their connector schema at
  **design time** (Maker "Turn on" + the designer) via
  `GetMetadataForGetEntityWithOrganization`, which needs a resolvable
  `organization`. A **literal** URL is *foldable*, so the check runs against
  exactly that org — fine on the env whose URL it is, but after a managed
  export the *host* URL is baked in, and at any OTHER environment it is
  unreachable by that env's connection → `InvalidOpenApiFlow /
  DynamicOperationRequestClientFailure … 401 … "The response is not in a JSON
  format."`, and the designer stops rendering at the first such action (~14 of
  35 visible). This was the real cause of the "cannot turn on at a customer"
  failure — not the activation method. **Fix:** `organization: "current"`
  resolves against the connection's own env everywhere, so the flows render in
  the designer and the portal "Turn on" validates (once the connection
  reference is bound). The child's genuine cross-env ops keep the runtime
  `srcUrl`/`tgtUrl` expression: a **non-foldable runtime expression** skips the
  design-time metadata call entirely (the same escape hatch noted for the
  xMultiple messages below), so it neither breaks the designer nor blocks
  turn-on. A `statecode` PATCH (`workflows(id) {statecode:1,statuscode:2}`)
  still activates headlessly — `deploy-executor-flow.ps1` (dev/host) and
  `activate-flows.ps1` (post managed-import) use it — but the portal button is
  no longer off-limits.
- **Nested `Foreach` loops ALWAYS run sequentially.** The
  `runtimeConfiguration.concurrency.repetitions` setting is honored only for
  top-level loops; any foreach nested inside another foreach (even one level,
  even inside If branches) executes its iterations serially at roughly
  0.5–0.9 s per iteration (scheduling overhead), regardless of the setting.
  True row parallelism requires hoisting the row loop to the top level of its
  own run — the v4 executor does exactly that with a **child flow per
  entry × target cell**: a `Workflow` action whose
  `host.workflowReferenceName` is the child's **`workflowid`** (NOT
  `workflowidunique` — the dependency check does a PrimaryKeyLookup and
  rejects the unique id), calling a child with a Request/`Button` trigger +
  `Response` action. Verified headless (Web-API-authored, SP connection
  references, no maker-portal setup): call round-trip ~3.4 s, child loop
  parallel.
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
- **`setVariable` may never reference its own variable — not even inside a
  sequential `Until`.** The activation fails with
  `WorkflowRunActionInputsInvalidProperty: Self reference is not supported`.
  That rules out the classic accumulator loop for FetchXML paging.
- **The connector's `paginationPolicy` does NOT apply to `fetchXml` reads.**
  Measured on INT-11 against `principalobjectaccess` (34 662 rows): with
  `runtimeConfiguration.paginationPolicy.minimumItemCount: 100000` the action
  returned **5000** rows — exactly the same as without it. FetchXML paging
  through the connector therefore has no working mechanism today (policy
  ineffective, accumulator loop forbidden, `AppendToArrayVariable` only
  appends a nested page array with no flatten primitive). Hence the hard cap
  plus the `Capped` guard described above; a real fix needs either an
  OData-based read path (where the policy does work) or per-page child-flow
  invocations.
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
