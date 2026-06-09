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

The UI depends only on the `AuditService` interface (`list()` for the
aggregates/list, `getChanges()` for the lazy field-level diff). The exported
singleton is the **Dataverse** implementation, which **auto-falls back to mock
data** whenever the generated data source isn't present — so local dev just
works, and going live never touches the UI.

## Run locally

```bash
npm install
npm run dev
```

Without `power-apps init`, the app runs in **local-mock** mode (badge top-right)
and serves the generated sample log in `src/services/mockData.ts`.

## Connect to the Dataverse audit data

Prerequisites: an environment with **code apps enabled**, **auditing turned on**
for the org and the tables/columns you care about, a **Power Apps Premium**
license, and **PAC CLI ≥ 1.46**.

```bash
npm install -g @microsoft/power-apps

# 1. Authenticate + register the app in your environment
pac auth create --environment <ENV-ID>
power-apps init --display-name "Audit Explorer" --environment-id <ENV-ID>

# 2. Add the audit table → generates src/generated/services/AuditService.ts
pac code add-data-source -a dataverse -t audit

# 3. (For the diff) add the RetrieveAuditDetails function
power-apps find-dataverse-api      # then add-dataverse-api for the match

# 4. Test against real data, then publish
npm run dev                        # open the "Local Play" URL
npm run build
power-apps push
```

Then finish the wiring in `src/services/dataverseAuditService.ts`:

- In `loadAuditTable()`, swap the dynamic import for the generated static import
  (`import { AuditService } from '../generated/services/AuditService'`) for full
  type safety.
- In `getChanges()`, map the `RetrieveAuditDetails` response (its `OldValue` /
  `NewValue` attribute collections) into `AttributeChange[]`.

The dashboard, hooks and components stay unchanged. Dataverse auditing docs:
<https://learn.microsoft.com/en-us/power-apps/developer/data-platform/auditing/overview>

See [`../../docs/SETUP.md`](../../docs/SETUP.md) for the general workflow.
