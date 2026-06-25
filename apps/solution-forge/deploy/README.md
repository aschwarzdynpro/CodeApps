# Per-Environment Deploy

Direct-Push der Code App in eine bestimmte Umgebung — **eine** Quelle der Wahrheit
(`$Registry` in [`../scripts/deploy-env.ps1`](../scripts/deploy-env.ps1)), mit
**Guard** gegen Fehl-Deploys (verifiziert vor dem Push, dass das aktive `pac`-Org
wirklich das Ziel ist).

## Nutzung

```powershell
pwsh scripts/deploy-env.ps1 -Env playground   # ASC SFA CS Playground (DPRO)
pwsh scripts/deploy-env.ps1 -Env schulz       # D365-SCHULZ-INT-11 (SchulzNEW)
pwsh scripts/deploy-env.ps1 -Env schulz -SkipBuild
```

Das Skript pro Lauf:
1. wählt das `pac`-Profil per **Name** (kein fixer Index — die driften),
2. **Guard:** `pac org who` muss die Ziel-URL sein, sonst Abbruch,
3. schreibt `power.config.json` + `.env.local` passend zur Umgebung,
4. erzeugt Data Sources + Connector (`-cr` ODER `-c`, je Umgebung),
5. `npm run build` + `pac code push`,
6. Guard-Re-Check direkt vor dem Push, dann Play-URL.

## Umgebungen

| `-Env` | Org | App-ID | Connector | Push |
| --- | --- | --- | --- | --- |
| `playground` | `ascsfacs` | `0f71f8ea…` | `-cr pro_CR_SAC_Dataverse` | ✅ direct |
| `schulz` | `…schulz-int-11` | `cade30e1…` | `-c 73569138…` (SP) | ✅ direct |
| `waldmann` | `waldmann-dev` | `901f3e7f…` | — | ❌ **deaktiviert** |

**Waldmann ist bewusst deaktiviert** (`Enabled=$false`): die Umgebung bekommt die
App als **managed Solution (Import)**, nicht per Direct-Push. Ein Versuch bricht mit
einem Hinweis ab — das ist das „ungültig stellen wenn nicht gebraucht".

## Hinweise

- Die generierten `*.power.config.json` hier sind **Snapshots zur Referenz**
  (gitignored); maßgeblich ist die `$Registry` im Skript.
- INT-11 (`schulz`) wird **ohne** DevOps-Sync-Flow gepusht (DevOps deaktiviert,
  `DEVOPS_PANEL_ENABLED=false`). Wird DevOps reaktiviert, muss der Flow per
  `power-apps add-flow` registriert und mit `power-apps push` (statt `pac code
  push`) deployt werden — siehe Gotcha #12 in `../CLAUDE.md`.
- Neues `pac`-Profil nötig?
  `pac auth create --deviceCode --environment <org-url>` (Device-Code).
