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
│   ├── auditService.ts     # service interface + mock implementation
│   └── mockData.ts         # seeded, deterministic sample audit log
├── hooks/useAudit.ts     # data loading
├── components/           # KpiCards, Timeline, BarChart, EventList, EventDetail…
└── utils/format.ts       # dates, operation colors, aggregation helpers
```

## Run locally

```bash
npm install
npm run dev
```

Without `power-apps init`, the app runs in **local-mock** mode (badge top-right)
and serves the generated sample log in `src/services/mockData.ts`.

## Connect to the Dataverse audit data

1. Install the CLI: `npm install -g @microsoft/power-apps`
2. Initialize: `power-apps init --display-name "Audit Explorer" --environment-id <ENV-ID>`
3. Replace the mock `auditService` with a real implementation that:
   - queries the **Audit** table for the dashboard aggregates, and
   - calls **`RetrieveRecordChangeHistory`** / **`RetrieveAuditDetails`** to
     resolve the attribute-level old/new values for the detail view.

   The UI and hooks only depend on the `AuditService` interface, so they stay
   unchanged. See the Dataverse auditing developer docs:
   <https://learn.microsoft.com/en-us/power-apps/developer/data-platform/auditing/overview>
4. Build & publish:
   ```bash
   npm run build
   power-apps push
   ```

See [`../../docs/SETUP.md`](../../docs/SETUP.md) for the full workflow.
