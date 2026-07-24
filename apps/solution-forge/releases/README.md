# Releases — Solution Administration Console

Versioned **managed** solution exports of `DynamicsProSolutionAdminConsole`,
the full product: the `pro_` data model, the Configuration Data Transfer Hub
executor cloud flows, and the Code App itself. These are the artifacts to
**import into a customer environment** (`pac solution import`) as an
alternative to the script-based installer (`installer/install.ps1`).

Each file is a snapshot exported from the **playground** authoring environment
(`ASC SFA CS Playground`), which is where the Code App is pushed into the
solution via `pac code push --solutionName DynamicsProSolutionAdminConsole`.

**Every release gets a short entry in [`CHANGELOG.md`](CHANGELOG.md)** (newest on
top) — add one whenever you export a new version here.

| File | Version | Exported | Contents |
| --- | --- | --- | --- |
| `DynamicsProSolutionAdminConsole_1.0.0.13_managed.zip` | 1.0.0.13 | 2026-07-24 | 8 `pro_` tables · 3 transfer-executor flows (Execute Package / Execute Cell / Scheduler) · Code App (chunk-split bundle, now incl. the first-run **Self-Provisioning Wizard**) · 1 security role |

Only the newest managed export is kept here (managed solutions upgrade
cumulatively — an older versioned zip can't be imported over a newer one).

## Importing into a target environment

1. `pac solution import --path DynamicsProSolutionAdminConsole_<version>_managed.zip`
   (device-code auth, per the standing preference).
2. **Bind the connection reference and activate the three transfer flows via
   the script — NOT the Maker Portal "Turn on" button:**
   ```powershell
   pwsh installer/activate-flows.ps1 -EnvironmentUrl https://<org>.crm4.dynamics.com -TenantId <guid> `
        -ConnectionReference pro_CR_SAC_Dataverse -ConnectionId <dataverse-connection-guid>
   ```
   The executor flows use dynamic `*WithOrganization` connector operations
   (entity + target org are runtime expressions). The Maker "Turn on" button
   and the designer resolve the connector schema at **design time**
   (`GetMetadataForGetEntityWithOrganization`) against an unresolved
   `organization`, which fails with `InvalidOpenApiFlow … 401 … "The response
   is not in a JSON format."` — and renders the flow only partially in the
   designer. That is cosmetic: the flows execute in full at runtime. The
   script activates them with a plain `statecode` PATCH (the supported path,
   same as the dev/host env) and never rewrites the managed definition, so no
   unmanaged layer is created. The connection's service principal must
   read/write every configured source and target environment.
3. Assign the `pro_*` table privileges / the shipped security role to the
   users who operate the console.
4. Add the Code App to the environment's app list if it is not surfaced
   automatically (Maker → Apps).

See `docs/transfer-hub-contract.md` for the executor internals and
`installer/README.md` for the script-based install path.

## Notes

- These are **managed** exports — the target environment cannot customize the
  components in place; re-export from playground after authoring changes.
- This folder is the **single home** for the managed export; the installer
  (`installer/README.md`) points here instead of keeping its own copy.
