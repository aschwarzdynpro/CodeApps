# Solution Administration Console — Installer

Tooling to provision the app's data model and deploy the Code App into a
Dataverse environment (a new customer or a new environment). The product schema
is fixed under publisher **Dynamics Pro** (`DynamicsPro`, customization prefix
**`pro`**) — the app references `pro_*` logical names everywhere, so a fresh
install is correct by construction (no per-customer prefix rewrite).

## Contents

| File | Purpose |
| --- | --- |
| `install.ps1` | **Interactive installer (start here).** Prereqs → device-code login → data model → connection → customer config → settings seed → `.env.local` → app push → checklist. |
| `lib/Dataverse.ps1` | Shared helpers: token (cached Az context → device-code fallback), `Invoke-Dv` Web API wrapper, metadata label/option helpers. |
| `provision-model.ps1` | Creates publisher + solution + the 4 `pro_` tables (columns, choices with pinned values, lookups). Idempotent. Called by `install.ps1`. |
| `migrate-int11.ps1` | One-off: copies the legacy `ssid_`/`sst_` data on INT-11 into the `pro_` model (lookup remap, `createdon` preserved). Dry-run by default; `-Execute` writes. |
| `package/DynamicsProSolutionAdminConsole_managed.zip` | Managed solution export of the `pro_` data model — for solution-import-based installs (`pac solution import`) instead of the script-based provisioning the wizard uses. |

## Usage

```powershell
# Full guided install into a target environment:
pwsh installer/install.ps1
#   or non-interactively seed the first answers:
pwsh installer/install.ps1 -EnvironmentUrl https://<org>.crm4.dynamics.com -TenantId <guid>

# Re-run pieces individually:
pwsh installer/provision-model.ps1 -EnvironmentUrl https://<org>.crm4.dynamics.com   # just the data model
pwsh installer/install.ps1 -SkipProvision                                            # model already present
pwsh installer/install.ps1 -SkipPush                                                 # configure only, push by hand
```

The wizard captures customer-specific config (default publisher for new working
solutions, core/deployment solution names, Compare target environments, Azure
DevOps org/project, deployment-manager role name) and writes it to `.env.local`
as `VITE_*` build vars, which `src/config.ts` reads (Schulz values are the
fallback). The data model schema itself stays fixed (`pro_`).

Auth uses an existing Az context for the tenant if present, otherwise an Az
device-code sign-in (per the standing device-code preference). The
`power-apps`/`pac` CLIs sign in separately (device code / browser SSO).

**Connection binding:** by default the connector is bound **directly** to a
Dataverse connection (its GUID is baked into `power.config.json` at push) — the
installer discovers it via `pac connection list` or you pass `-ConnectionId`. A
Code App resolves the connection at push time, so a managed-solution-style
post-import rebind does not apply; the direct binding is simplest and identical at
runtime. Pass `-UseConnectionReference` to additionally wire a `pro_CRDataverse`
connection reference — only worthwhile if you later distribute the app via a
managed solution import rather than `power-apps push`.

## Remaining enhancements

- **Security role** with privileges on the `pro_*` tables shipped in the package
  (today the admin assigns table privileges manually — see the checklist).
- **Fully data-driven config** via a `pro_environmentconfig` Dataverse table read
  at app startup, replacing the `.env.local` build-time vars.
- **App→solution membership** automation (currently a Maker step in the checklist).
