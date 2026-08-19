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

The whole procedure — version bump, export, package verification, changelog,
GitHub release — is written down in `.claude/skills/create-release/SKILL.md`
at the repo root. Read it before doing this by hand; it carries the guard that
keeps the version bump from landing in a customer environment.

| File | Version | Exported | Contents |
| --- | --- | --- | --- |
| `DynamicsProSolutionAdminConsole_1.0.0.23_managed.zip` | 1.0.0.23 | 2026-08-19 | **9** `pro_` tables incl. the three **delta** columns on `pro_transferentry` · 3 transfer-executor flows (Execute Package / Execute Cell / Scheduler), host operations on `organization: "current"` · Code App (chunk-split bundle with two **lazily loaded** workspaces, incl. the first-run **Self-Provisioning Wizard**, Role Comparer, the security concept document, the entry dialog's **Write plan**, the OData Browser's **cloud-flow copy buttons** and **record field search**, shareable workspace links, the Dual-Write cockpit's **running-version lookup** and **per-environment view**, **lookup and choice columns resolved to names** in the transfer preview and import history, plus a transfer column picker that offers **only transferable columns**, and **row-level error messages** in the transfer run log) · **executor flows rebuilt in 1.0.0.23** (Execute Cell) · 1 connection reference `pro_CR_SAC_Dataverse` · 1 security role `INT \| DEPLOYMENT MANAGER` · **unchanged since 1.0.0.17:** the data model |

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
5. **If the environment runs Dual-Write** (since 1.0.0.20): give the
   connection's service principal read access to `msdyn_dualwriteentitymap`
   **and `msdyn_dualwriteruntimeconfig`**, in every environment the cockpit is
   pointed at. Without the second one the maps still list, but every row falls
   back to "latest saved" — the symptom is the absence of any `live` marker,
   not an error.

See `docs/transfer-hub-contract.md` for the executor internals and
`installer/README.md` for the script-based install path.

## Upgrading an existing installation

A release that changes the **data model** or the **executor flows** needs a
different step depending on how the target was installed in the first place.
Check the changelog lead of the version you are importing: it states both
explicitly (1.0.0.17 added three columns; 1.0.0.23 changes a flow with no
schema change at all).

- **Installed from a managed zip:** import the newer zip over it. The columns
  and the rebuilt flows come along; nothing else to do for the data model.
- **Installed with the script installer** (`installer/install.ps1`, unmanaged):
  the managed zip cannot be laid over it. Re-run
  `installer/provision-model.ps1` for the columns and
  `installer/deploy-executor-flow.ps1` for the flows — both are idempotent and
  only add what is missing.

After either path, **verify the three transfer flows are on**; an import can
leave them deactivated, and a scheduler that is off looks exactly like "no runs
were due". Existing transfer entries are unaffected — delta mode is off until
someone switches it on per entry.

## Notes

- These are **managed** exports — the target environment cannot customize the
  components in place; re-export from playground after authoring changes.
- This folder is the **single home** for the managed export; the installer
  (`installer/README.md`) points here instead of keeping its own copy.
