# Audit Explorer

A Power Apps **code app** that turns the Dataverse **audit history** into an
interactive dashboard with **drill-down** — from aggregate trends all the way
down to a single field-level change.

Built on the official Power Apps Vite template (React 19 + TypeScript + Vite +
`@microsoft/power-apps`).

## Features

- **Overview dashboard** — KPIs (total / Create / Update / Delete, active users,
  tables touched), a stacked **activity timeline** by day, and bar charts for
  *events by table* and *most active users*
- **Audited-tables slicer** — a list of every table that has auditing enabled
  (a superset of the tables with activity); click one to **filter all tiles and
  charts** to that table, click again or *Clear* to reset
- **Drill-down**: Overview → click a table/user → list of audit events → click
  an event → **field-level diff** (old value → new value), with a breadcrumb
  to walk back up
- **Global filters** that persist across drilling: date range (7 / 30 / all
  days), operation (click a KPI), and free-text search
- Runs locally with **mock data**, ready to swap in the real Dataverse audit API

## Drill-down levels

1. **Overview** — aggregated charts and KPIs across the filtered range
2. **List** — every audit event for the selected table or user
3. **Detail** — the audit record with each changed column shown as old → new

## Project layout

```
src/
├── main.tsx              # mounts the app inside <PowerProvider>
├── PowerProvider.tsx     # initializes the Power Apps SDK (local fallback)
├── App.tsx               # dashboard shell + drill-down view state
├── types/audit.ts        # audit domain model
├── services/
│   ├── auditService.ts          # AuditService interface + exported singleton
│   ├── dataverseAuditService.ts # real impl (audit table + RetrieveAuditDetails)
│   ├── mockAuditService.ts      # fallback impl over the sample log
│   └── mockData.ts              # seeded, deterministic sample audit log
├── hooks/useAudit.ts     # data loading
├── components/           # KpiCards, Timeline, BarChart, EventList, EventDetail…
└── utils/format.ts       # dates, operation colors, aggregation helpers
```

### Data layer

The UI depends only on the `AuditService` interface:

- `list()` — events for the aggregates and the event list (from the `audit` table)
- `getChanges()` — the lazy field-level diff (from `RetrieveAuditDetails`)
- `listAuditedTables()` — tables with auditing enabled, for the slicer (from
  table metadata: `EntityDefinitions` filtered on `IsAuditEnabled`)

The exported singleton is the **Dataverse** implementation, which **auto-falls
back to mock data** whenever the generated data source isn't present — so local
dev just works, and going live never touches the UI.

## Run locally

The service layer statically imports the generated Dataverse client, so the
generated artifacts must exist before the first build. Run the connection
steps below **once**, then:

```bash
npm install
npm run dev
```

`power.config.json`, `.power/` and `src/generated/` are env-specific or
generated and **not committed** — each contributor re-creates them with the
commands below.

The Power Apps SDK runtime hosts the app at the "Local Play" URL once
`power-apps init` has registered it. At runtime, any error reaching Dataverse
(missing client, no auth) silently falls back to the seeded mock log in
`src/services/mockData.ts`, so the dashboard stays usable.

## Connect to the Dataverse audit data

Prerequisites: an environment with **code apps enabled**, **auditing turned on**
for the org and the tables/columns you care about, a **Power Apps Premium**
license, and **PAC CLI ≥ 1.46**.

```bash
npm install -g @microsoft/power-apps

# 1. Authenticate + register the app in your environment
pac auth create --environment <ENV-ID>
power-apps init --display-name "Audit Explorer" --environment-id <ENV-ID>

# 2. Add the audit table → generates src/generated/services/AuditsService.ts
pac code add-data-source -a dataverse -t audit

# 3. For the field-level diff, add the RetrieveAuditDetails function
power-apps add-dataverse-api --api-name RetrieveAuditDetails
# (use `power-apps find-dataverse-api --search RetrieveAuditDetails` if unsure)

# 4. Test against real data, then publish
npm install
npm run dev                        # open the "Local Play" URL
npm run build
power-apps push
```

The service layer in `src/services/dataverseAuditService.ts` is already
wired against the generated `AuditsService` and `RetrieveAuditDetailsService`
classes:

- `list()` calls `AuditsService.getAll(...)` with a tight `$select` and maps
  rows into `AuditEvent`.
- `getChanges()` calls `RetrieveAuditDetailsService.RetrieveAuditDetails(id)`
  and flattens the `AttributeAuditDetail`'s `OldValue` / `NewValue` into
  `AttributeChange[]`.
- `listAuditedTables()` derives the slicer list from the distinct tables seen
  in the log. The code app data client has no direct `EntityDefinitions`
  access, so tables that are audited but quiet won't appear until they have
  at least one event.

The dashboard, hooks and components stay unchanged. Dataverse auditing docs:
<https://learn.microsoft.com/en-us/power-apps/developer/data-platform/auditing/overview>

See [`../../docs/SETUP.md`](../../docs/SETUP.md) for the general workflow.
