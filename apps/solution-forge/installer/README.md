# Solution Administration Console — Installer

Tooling to provision the app's data model and deploy the Code App into a
Dataverse environment. The product schema is fixed under publisher
**Dynamics Pro** (`DynamicsPro`, customization prefix **`pro`**) — the app
references `pro_*` logical names everywhere, so a fresh install is correct by
construction (no per-customer prefix rewrite).

## Contents

| File | Purpose |
| --- | --- |
| `lib/Dataverse.ps1` | Shared helpers: token (cached Az context → device-code fallback), `Invoke-Dv` Web API wrapper, metadata label/option helpers. |
| `provision-model.ps1` | Creates publisher + solution + the 4 `pro_` tables (columns, choices with pinned values, lookups). Idempotent. |
| `migrate-int11.ps1` | One-off: copies the legacy `ssid_`/`sst_` data on INT-11 into the `pro_` model (lookup remap, `createdon` preserved). Dry-run by default; `-Execute` writes. |

## Usage

```powershell
# 1. Provision the data model in the target environment
pwsh installer/provision-model.ps1 -EnvironmentUrl https://<org>.crm4.dynamics.com [-TenantId <guid>]

# 2. (INT-11 only) migrate legacy data
pwsh installer/migrate-int11.ps1            # dry run
pwsh installer/migrate-int11.ps1 -Execute   # write

# 3. Register + push the Code App  (see ../CLAUDE.md "Frischer Checkout" for the
#    full power-apps init + add-data-source + push sequence)
```

Auth uses an existing Az context for the tenant if present, otherwise an Az
device-code sign-in (per the standing device-code preference).

## TODO (PR2 — interactive installer)

- `install.ps1` wizard: env/connection/publisher/solution selection, managed
  solution import, settings seeding, app push, solution membership.
- Managed solution package export of the `pro_` model.
- Data-driven runtime config (`pro_environmentconfig`) so Compare/Dependency
  targets + ADO org/project are customer-specific instead of hardcoded in
  `src/config.ts`.
- Connection **reference** (`pro_CRDataverse`) flow instead of the direct
  connection binding used for the INT-11 bring-up.
