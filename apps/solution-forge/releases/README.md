# Releases — Solution Administration Console

Versioned **managed** solution exports of `DynamicsProSolutionAdminConsole`,
the full product: the `pro_` data model, the Configuration Data Transfer Hub
executor cloud flows, and the Code App itself. These are the artifacts to
**import into a customer environment** (`pac solution import`) as an
alternative to the script-based installer (`installer/install.ps1`).

Each file is a snapshot exported from the **playground** authoring environment
(`ASC SFA CS Playground`), which is where the Code App is pushed into the
solution via `pac code push --solutionName DynamicsProSolutionAdminConsole`.

| File | Version | Exported | Contents |
| --- | --- | --- | --- |
| `DynamicsProSolutionAdminConsole_1.0.0.12_managed.zip` | 1.0.0.12 | 2026-07-24 | 8 `pro_` tables · 3 transfer-executor flows (Execute Package / Execute Cell / Scheduler) · Code App (chunk-split bundle) · 1 security role |

## Importing into a target environment

1. `pac solution import --path DynamicsProSolutionAdminConsole_<version>_managed.zip`
   (device-code auth, per the standing preference).
2. **Bind the Dataverse connection reference** the executor flows use
   (`pro_CRDataverse` / `pro_CR_SAC_Dataverse` depending on the install) to a
   connection whose service principal can read/write every configured source
   and target environment, then **activate the three transfer flows** — a
   managed import leaves flows off until their connection reference is bound.
3. Assign the `pro_*` table privileges / the shipped security role to the
   users who operate the console.
4. Add the Code App to the environment's app list if it is not surfaced
   automatically (Maker → Apps).

See `docs/transfer-hub-contract.md` for the executor internals and
`installer/README.md` for the script-based install path.

## Notes

- These are **managed** exports — the target environment cannot customize the
  components in place; re-export from playground after authoring changes.
- The data-model-only managed zip under `installer/package/` is an older,
  narrower artifact (the `pro_` tables only) kept for the installer's
  data-model-import path; it is **not** a full-app release.
