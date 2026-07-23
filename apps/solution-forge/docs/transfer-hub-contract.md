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
| `pro_status_opt` | Choice | 867520000 Queued / …001 Running / …002 Succeeded / …003 Failed / …004 Partially succeeded / …005 Cancelled. |
| `pro_targetenvs_str` | String(400) | Target env keys **snapshotted at request time** — the executor uses THIS list, not the package's current one. |
| `pro_startedon_dat` / `pro_finishedon_dat` | DateTime | Written by the executor. |
| `pro_summary_str` | String(1000) | One-line result written by the executor. |
| `pro_log_txt` | Memo | Result JSON written by the executor (shown in the hub). |
| `createdon` / `createdby` | audit | Who requested the run, when. |

**Executor protocol:**

1. Pick up rows with `pro_status_opt eq 867520000` (Queued), oldest first —
   ideally via a Dataverse trigger ("row added", filter on status), else by
   polling.
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
