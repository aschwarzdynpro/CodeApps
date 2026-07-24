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
| `DynamicsProSolutionAdminConsole_1.0.0.14_managed.zip` | 1.0.0.14 | 2026-07-25 | 8 `pro_` tables · 3 transfer-executor flows (Execute Package / Execute Cell / Scheduler), host operations now wired to `organization: "current"` so they render in the designer and activate normally at a customer · Code App (chunk-split bundle, incl. the first-run **Self-Provisioning Wizard**) · 1 security role |

Only the newest managed export is kept here (managed solutions upgrade
cumulatively — an older versioned zip can't be imported over a newer one).

## Importing into a target environment

1. `pac solution import --path DynamicsProSolutionAdminConsole_<version>_managed.zip`
   (device-code auth, per the standing preference).
2. **Bind the connection reference `pro_CR_SAC_Dataverse` to a Dataverse
   connection, then turn the three transfer flows on.** Both the Maker Portal
   "Turn on" button and the headless script work:
   ```powershell
   pwsh installer/activate-flows.ps1 -EnvironmentUrl https://<org>.crm4.dynamics.com -TenantId <guid> `
        -ConnectionReference pro_CR_SAC_Dataverse -ConnectionId <dataverse-connection-guid>
   ```
   The flows' host-environment operations use `organization: "current"`, so the
   designer renders them and activation validates cleanly once the connection is
   bound; the child's genuine cross-environment operations pass the source/target
   org URL as a runtime expression (a non-foldable value that skips the
   design-time schema check). The connection's service principal must read/write
   every configured source and target environment.
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
