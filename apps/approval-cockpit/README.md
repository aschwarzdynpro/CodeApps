# Approval Cockpit

A Power Apps **code app** that gives approvers a single inbox for requests
coming from many systems — leave, purchase orders, invoices, expenses and
access requests — with fast filtering and **bulk approve/reject**.

Built on the official Power Apps Vite template (React 19 + TypeScript + Vite +
`@microsoft/power-apps`).

## Features

- **Unified queue** across categories with priority + due-date sorting
- **Bulk actions** — approve or reject several requests at once
- **Detail pane** with requester, amount, metadata and an optional comment
- **Live stats** — pending count, high-priority, overdue, value at stake
- **Search & category filters**
- Runs locally with **mock data**, ready to swap in real connectors

## Project layout

```
src/
├── main.tsx              # mounts the app inside <PowerProvider>
├── PowerProvider.tsx     # initializes the Power Apps SDK (local fallback)
├── App.tsx               # cockpit shell (filters, list, detail, bulk bar)
├── types/approval.ts     # domain model
├── services/
│   ├── approvalService.ts  # service interface + mock implementation
│   └── mockData.ts         # sample requests (connector-shaped)
├── hooks/useApprovals.ts # data loading + decision state
├── components/           # StatsHeader, FilterBar, ApprovalRow, …
└── utils/format.ts       # currency / date / sort helpers
```

## Run locally

```bash
npm install
npm run dev
```

Without `power-apps init`, the app runs in **local-mock** mode (badge top-right)
and serves the sample data in `src/services/mockData.ts`.

## Connect to Power Platform

1. Install the CLI: `npm install -g @microsoft/power-apps`
2. Initialize: `power-apps init --display-name "Approval Cockpit" --environment-id <ENV-ID>`
3. Replace the mock `approvalService` with a real implementation backed by
   connectors (Power Automate Approvals, Dataverse, custom connectors). The UI
   and hooks stay unchanged — they only depend on the `ApprovalService`
   interface.
4. Build & publish:
   ```bash
   npm run build
   power-apps push
   ```

See [`../../docs/SETUP.md`](../../docs/SETUP.md) for the full workflow.
