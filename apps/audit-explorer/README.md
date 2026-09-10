# Audit Explorer

A Power Apps **code app** for interrogating the Dataverse **audit history** —
built around the questions people actually arrive with, not around a dashboard.

Built on the official Power Apps Vite template (React 19 + TypeScript + Vite +
`@microsoft/power-apps`).

## Why it is shaped this way

The obvious design — load a time window, show charts, let the user filter down —
does not survive contact with a real environment. A busy UAT environment holds
**32,000 audit rows in 30 days** and 124,000 overall, well past any sane client
row cap. Worse, a truncated aggregate looks exactly like a complete one, so the
dashboard would answer compliance questions with confident, wrong numbers.

Every question people actually ask is *narrow*: about one record, one person, or
one column. So the app asks first and loads second. Each mode turns its question
into a single server-side filter, and the row cap becomes a safety net instead of
a design constraint.

| Mode | Input | Filter | Typical result |
| --- | --- | --- | --- |
| **Record** | pasted form URL / GUID, or table + name search | `_objectid_value eq …` | tens of rows |
| **Person** | user + time window | `_userid_value eq … and createdon ge …` | hundreds |
| **Field** | table + column + window | `objecttypecode eq … and createdon ge …` | bounded by the column |
| **Activity** | time window | `createdon ge …` | the whole window — the one place the cap can bite |

Measured against UAT before building: an `objectid` filter cuts 123,804 rows to
4; a `userid` filter cuts 32,038 to 229.

## Result views

- **Record** leads with an identity card (table, display name, logical name,
  audited range, deep link) followed by the change history.
- **Record / Person** list events that **expand in place**. Comparing two or
  three changes side by side is the normal forensic move, so several rows can be
  open at once and there is no drill-down to walk back out of.
- **Field** gets its own **value-history table** — `old → new` belongs in the
  row, not behind an expander. That is the "who changed prices, from what, to
  what" screen, and it is the thing Dataverse offers nowhere out of the box.
- Rows cross-link **laterally** into the other modes (this record / this person)
  and out to the record's form in the model-driven app.

Each mode keeps its own query and answer, so switching tabs never leaves one
mode's result under another mode's form.

### Empty results

Three very different situations look identical on screen: the table or column
is not audited, the entries existed but retention purged them, or nothing
actually changed. Left unexplained, an empty result invites the third reading —
and on a compliance question that is the most expensive mistake the app can
make.

So the app names the cause instead of hedging. It reads `IsAuditEnabled` from
entity metadata (per table *and* per column) and the org's
`auditretentionperiodv2`, then states the verdict outright: *auditing is off for
this table*, *this question reaches past the retention window*, or *auditing is
on, so this really is an empty stretch*. Only where metadata is unavailable does
it fall back to naming the possibilities.

Two banners sit above the results for the same reason: one when org-level
auditing is off (every answer will be empty), one when the selected window
reaches past retention.

## Project layout

```
src/
├── main.tsx              # mounts the app inside <PowerProvider>
├── PowerProvider.tsx     # initializes the Power Apps SDK (local fallback)
├── App.tsx               # mode shell, per-mode query state, lateral navigation
├── config.ts             # build-time org URL for deep links
├── types/audit.ts        # audit domain model + AuditQuery
├── services/
│   ├── auditService.ts          # AuditService interface + exported singleton
│   ├── dataverseAuditService.ts # real impl (audit + systemuser + RetrieveAuditDetails)
│   ├── mockAuditService.ts      # fallback impl over the sample log
│   └── mockData.ts              # seeded, deterministic sample audit log
├── hooks/
│   ├── useAuditQuery.ts  # one bounded question, answer cached per query object
│   └── useAudit.ts       # whole-window load for the activity dashboard
├── components/           # ModeTabs, query forms, EventAccordion, FieldChangeTable…
├── views/ActivityView.tsx # the volume dashboard (KPIs, timeline, charts)
└── utils/                # formatting, record-reference parsing
```

### Data layer

The UI depends only on the `AuditService` interface:

- `search(query)` — one bounded question (record / person / field)
- `list(options)` — a whole time window, for the activity dashboard
- `getChanges(id)` — field diff via `RetrieveAuditDetails`, only used when the
  inline payload is unavailable
- `findUsers`, `listTables`, `listAttributes`, `findRecords` — picker sources
- `getAuditSettings()` — org audit switch + retention, from `organization`
- `getTableAudit(table)` — `IsAuditEnabled` and column display names, via the
  SDK's `getEntityMetadata` for an arbitrary table (cached per session; callers
  tolerate a null answer, since metadata for a table with no data source is not
  guaranteed to be served)

Rows select **`changedata`**, which carries the whole old/new diff inline. That
removes a `RetrieveAuditDetails` round trip per opened row and is what makes a
column-level question answerable at all — OData cannot reach into the JSON, so
the column is narrowed client-side inside an already bounded set. The column is
requested optimistically and dropped for the session if the runtime refuses it.

The exported singleton is the **Dataverse** implementation, which **auto-falls
back to mock data** whenever the host isn't a Power Platform environment — so
local dev just works.

## Run locally

The service layer statically imports the generated Dataverse client, so the
generated artifacts must exist before the first build. Run the connection steps
below **once**, then:

```bash
npm install
npm run dev
```

`power.config.json`, `.power/`, `src/generated/` and `.env.local` are
env-specific or generated and **not committed** — each contributor re-creates
them with the commands below.

## Connect to a Dataverse environment

Prerequisites: **code apps enabled** for the environment (Admin Center →
Environment → Settings → Product → Features — off by default), **auditing turned
on** for the org and the tables you care about, a **Power Apps Premium** license,
and **PAC CLI ≥ 1.46**.

```bash
npm install -g @microsoft/power-apps

# 1. Authenticate + register the app in the target environment
pac auth create --environment <ENV-ID>
pac code init --environment <ENV-ID> --displayName "Audit Explorer" \
  --buildPath "./dist" --fileEntryPoint "index.html" --appUrl "http://localhost:3000"

# 2. Tables first…
pac code add-data-source -a dataverse -t audit
pac code add-data-source -a dataverse -t systemuser
pac code add-data-source -a dataverse -t organization

# 3. …then the API. Order matters — see the gotcha below.
npx power-apps add-dataverse-api --api-name RetrieveAuditDetails

# 4. Build and publish
npm run build
pac code push
```

> **Gotcha:** `pac code add-data-source` scans `.power/schemas/dataverse/` and
> chokes on the API schema file that `add-dataverse-api` leaves there
> (*"The JSON does not represent a valid data source"*). Add all **tables
> first** and APIs **last**. If you have to add a table later, move
> `RetrieveAuditDetails.Schema.json` aside and put it back afterwards.

> **Gotcha:** `pac code push --environment <id>` does **not** retarget the push.
> The target comes from `power.config.json`; the flag only sets the auth
> context, and the push reports success against the *old* environment. One
> config equals one environment — `pac code init` refuses to run while a config
> exists, so switching targets means removing `power.config.json` **and**
> `.power/` first.

### Deep links into the model-driven app (`VITE_ORG_URL`)

The "open in Dynamics" links need the Dataverse org URL, which cannot be
discovered at runtime: `getContext()` exposes only `environmentId`, and
`RetrieveCurrentOrganization` cannot be generated as a data source — its
`EndpointAccessType` enum parameter makes the generator look for a *table* of
that name and 404.

So it is a build-time setting. `.env` documents it and deliberately leaves it
empty; set the real value per deployment in `.env.local` (git-ignored):

```
VITE_ORG_URL=https://operations-d365-schulz-uat-1-1.crm4.dynamics.com
```

When unset, the links are simply hidden rather than pointing at a foreign
tenant.

## Known limits

- **Owner is not current state.** The record card shows the owner from the last
  audited ownership change, labelled as such. The record's own row is not
  queryable — the app has data sources for `audit` and `systemuser` only.
- **Record search only finds audited records.** The quick-search runs over the
  audit log for the same reason.
- **The table picker is fed from the log**, so a table that is audited but
  quiet will not appear in the shortlist. The *column* picker comes from entity
  metadata and does list audited-but-unchanged columns.
- **Audit privileges apply.** A user without *View Audit History* / *View Audit
  Summary* sees an empty app.

Dataverse auditing docs:
<https://learn.microsoft.com/en-us/power-apps/developer/data-platform/auditing/overview>

See [`../../docs/SETUP.md`](../../docs/SETUP.md) for the general workflow.
