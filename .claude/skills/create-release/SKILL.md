---
name: create-release
description: Erzeugt ein Release der Solution Administration Console — managed Export aus dem Playground, CHANGELOG-Eintrag mit allen Commits seit dem letzten Release, GitHub-Release mit dem Zip als Asset. Nutze dies, wenn der Nutzer "Release erzeugen", "neues Release", "Release bauen", "Release ziehen" oder Ähnliches sagt.
---

# Release erzeugen — Solution Administration Console

Erzeugt aus dem **Playground-Authoring-Environment** einen versionierten
managed Export von `DynamicsProSolutionAdminConsole`, dokumentiert ihn und
veröffentlicht ihn als GitHub-Release.

Gilt heute nur für `apps/solution-forge` — die einzige App im Monorepo mit
einem Release-Prozess. Bekommt eine zweite App einen, wird dieser Skill
parametrisiert statt kopiert.

## Feste Größen

| | |
|---|---|
| Authoring-Env | `https://ascsfacs.crm4.dynamics.com` (Playground) |
| pac-Profil | `DPRO` |
| Solution | `DynamicsProSolutionAdminConsole` |
| Zielordner | `apps/solution-forge/releases/` |
| Tag-Muster | `SAC_v<version>` |
| Release-Titel | `Solution Administration Console v<version>` |

## ⚠ Die Falle, an der das schon einmal schiefgegangen ist

**Das aktive pac-Profil überlebt den Wechsel zwischen zwei Tool-Aufrufen
nicht.** Am 2026-08-05 wurde `pac auth select --name DPRO` ausgeführt und per
`pac org who` als Playground bestätigt — im **nächsten** Aufruf stand das
Profil wieder auf `SchulzNEW`, und die Versionserhöhung landete in der
Kundenumgebung Schulz INT-11 statt im Playground.

**Regel: Profilwahl, Guard und die eigentliche Aktion gehören immer in
EINEN einzigen PowerShell-Aufruf.** Nie über zwei Aufrufe verteilen, nie auf
ein zuvor gesetztes Profil vertrauen. Jeder Aufruf, der etwas schreibt, fängt
mit diesem Block an:

```powershell
pac auth select --name DPRO | Out-Null
$who = pac org who 2>&1 | Out-String
if ($who -notmatch 'ascsfacs') { throw "GUARD: aktives Org ist NICHT der Playground.`n$who" }
```

Zurücksetzen einer versehentlichen Änderung in einer Kundenumgebung wird vom
Berechtigungs-Classifier blockiert — der Guard ist die einzige Absicherung,
die vorher greift.

## Ablauf

### 1. Vorbedingungen

- Working Tree sauber, auf `main`, gepusht (`git status --short`, `git status -sb`).
- `gh auth status` in Ordnung.
- `git fetch --tags`, damit die Tag-Liste vollständig ist.

Ist der Tree nicht sauber: **abbrechen und fragen**. Ein Release aus
uncommitteten Ständen ist nicht reproduzierbar.

### 2. Playground auf den aktuellen Stand bringen

Der Export enthält die App, die dort gerade liegt — also immer zuerst pushen,
auch wenn es überflüssig scheint:

```powershell
cd apps/solution-forge
./scripts/deploy-env.ps1 -Env playground
```

Das Skript hat einen eigenen Org-Guard und pusht mit `--solutionName`, die App
landet also in der Solution. Läuft es durch, ist der Playground aktuell.

### 3. Version bestimmen und setzen

Letztes Segment hochzählen (`1.0.0.16` → `1.0.0.17`). Gegen `git tag -l
"SAC_*"` prüfen, dass die Nummer noch nicht vergeben ist.

Alles in **einem** Aufruf, mit dem Guard von oben:

```powershell
# Guard-Block (siehe oben)
pac solution list | Select-String "DynamicsProSolutionAdminConsole"   # Ist-Version
pac solution online-version --solution-name DynamicsProSolutionAdminConsole --solution-version <neu>
```

### 4. Managed exportieren

Ebenfalls mit Guard, im selben Aufruf wie eine erneute Versionsprüfung:

```powershell
# Guard-Block
pac solution export --path releases/DynamicsProSolutionAdminConsole_<version>_managed.zip `
  --name DynamicsProSolutionAdminConsole --managed true --overwrite
```

### 5. Das Paket verifizieren — nicht annehmen

Ein Release, dessen Inhalt niemand geprüft hat, ist eine Behauptung. Immer
gegen das Zip prüfen:

```bash
cd apps/solution-forge/releases
unzip -p <zip> solution.xml | grep -E "<Version>|<Managed>"        # Version + Managed=1
unzip -l <zip> | grep -E "Workflows/|CanvasApps"                    # 3 Flows + Code App
unzip -p <zip> customizations.xml > /tmp/c.xml
grep -c "<Entity>" /tmp/c.xml                                       # Tabellenzahl
grep -oE "pro_CR_SAC_Dataverse|INT \| DEPLOYMENT MANAGER" /tmp/c.xml | sort -u
```

Erwartet: `<Managed>1</Managed>`, die Version aus Schritt 3, **9** Entities
(Stand 1.0.0.17), die drei Executor-Flows, die Connection Reference und die
Rolle. **Bringt das Release neue Spalten oder Tabellen mit, hier gezielt
danach greppen** — genau das ist der Teil, den ein Import beim Kunden braucht.

Weicht etwas ab: stoppen und klären, nicht veröffentlichen.

### 6. CHANGELOG schreiben — aus den Commits, nicht aus dem Gedächtnis

Letztes Release finden und die **vollständigen** Commit-Botschaften lesen,
nicht nur die Betreffzeilen:

```bash
git log $(git describe --tags --match "SAC_v*" --abbrev=0)..HEAD --reverse --format="=====%n%s%n%n%b"
```

Daraus eine neue Sektion **oben** in `releases/CHANGELOG.md`, **auf Deutsch**,
im Stil der vorhandenen Einträge:

- Überschrift `## <version> — <YYYY-MM-DD>`
- **Fetter Leitabsatz** mit dem Thema des Releases. Bringt es
  Schema-Änderungen (neue Spalten/Tabellen) oder neue Flow-Versionen, steht
  das **hier** und nicht im Kleingedruckten — es entscheidet über die
  Import-Schritte.
- Danach Stichpunkte je Feature/Fix. **Das Warum gehört dazu**, nicht nur das
  Was: Die Commit-Botschaften dieses Repos begründen ihre Entscheidungen
  ausführlich; genau diese Begründungen sind der Wert des CHANGELOGs.
- Bekannte Grenzen, die der Commit nennt, ehrlich mitnehmen (Beispiel: „Delta
  hebt die 5000er-Grenze nicht auf").

### 7. README-Tabelle aktualisieren

In `releases/README.md` die **eine** Tabellenzeile ersetzen (Dateiname,
Version, Datum, Inhalt). Der Ordner führt bewusst nur den neuesten Export.

Ändern sich Schema oder Flows, den Abschnitt **„Upgrading an existing
installation"** prüfen und nachziehen — dort steht der Unterschied zwischen
managed Import (bringt Spalten mit) und Skript-Install (`provision-model.ps1`
und `deploy-executor-flow.ps1` erneut laufen lassen).

### 8. Alten Export entfernen

```bash
git rm apps/solution-forge/releases/DynamicsProSolutionAdminConsole_<alt>_managed.zip
```

Managed Solutions upgraden kumulativ — ein älteres Zip neben einem neueren
lädt nur dazu ein, das falsche zu importieren.

### 9. Commit

Betreff: `release(solution-forge): managed export <version>`

PowerShell kennt keine Heredocs — die Botschaft in eine Datei im Scratchpad
schreiben und mit `git commit -F <datei>` übergeben. Trailer wie üblich:
`Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`.

Im Text festhalten, **was verifiziert wurde** (Schritt 5), nicht nur was
gebaut wurde.

### 10. Push und GitHub-Release

```bash
git push
gh release create SAC_v<version> \
  "apps/solution-forge/releases/DynamicsProSolutionAdminConsole_<version>_managed.zip" \
  --title "Solution Administration Console v<version>" \
  --notes-file <datei>
```

**Die Release-Notes sind der CHANGELOG-Eintrag dieses Releases** — dieselbe
Sprache (Deutsch), derselbe Inhalt, eine Quelle. Nicht neu formulieren, sonst
driften die beiden Fassungen auseinander. Ergänzt werden nur die zwei Zeilen,
die auf GitHub Sinn ergeben und im CHANGELOG nicht stehen: der
`pac solution import`-Befehl und der Verweis auf
`releases/README.md` für die Nachschritte.

Bringt das Release Schema-Änderungen, gehört der Upgrade-Hinweis **oben** in
die Notes, nicht ans Ende.

### 11. Verifizieren

```bash
gh release view SAC_v<version> --json tagName,name,isDraft,assets
gh release list --limit 3
```

Asset vorhanden, Größe plausibel, nicht als Draft.

## Danach berichten

- Release-URL
- Version, Zahl der Commits, die abgedeckt sind
- **Was im Paket verifiziert wurde** (Tabellen, Flows, neue Spalten)
- Ob Import-Nachschritte nötig sind (Schema-Änderung, Flow-Aktivierung)
