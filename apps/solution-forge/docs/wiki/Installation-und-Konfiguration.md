[[_TOC_]]

# Solution Administration Console — Installation & Konfiguration

Diese Anleitung beschreibt die Installation der **Solution Administration
Console** über die bereitgestellte **managed Solution** und die anschließende
Konfiguration in Dataverse. Die Bedienung der App selbst ist in
[Solution-Administration-Console.md](Solution-Administration-Console.md)
dokumentiert.

Die Installation besteht aus zwei Schritten:

1. **Managed Solution importieren** — bringt die App und das Datenmodell
   (Publisher **Dynamics Pro**, Prefix `pro`) in die Ziel-Umgebung.
2. **Konfigurationsdatensätze anlegen** — je ein bzw. mehrere Datensätze in
   den Tabellen **Workbench Settings** (`pro_workbenchsettings`) und
   **Environment Config** (`pro_environmentconfig`). Die App liest beide
   Tabellen beim Start.

---

## Voraussetzungen

- Power-Platform-Umgebung mit aktivierten **Code Apps**
  ([Doku](https://learn.microsoft.com/en-us/power-apps/developer/code-apps/overview#enable-code-apps-on-a-power-platform-environment)).
- **Power Apps Premium**-Lizenz für die Endbenutzer.
- Ein Konto mit **System-Administrator**- oder **System-Customizer**-Rolle in
  der Ziel-Umgebung (für den Solution-Import und die Datensätze).
- Die bereitgestellte managed Solution-Datei (`.zip`).

---

## Schritt 1 — Managed Solution importieren

Im **Maker-Portal**:

1. [make.powerapps.com](https://make.powerapps.com) öffnen und oben rechts
   die **Ziel-Umgebung** wählen.
2. **Solutions** → **Import solution** → **Browse** → die bereitgestellte
   `.zip`-Datei wählen.
3. Dem Assistenten folgen und den Import abschließen. Erscheint eine Seite
   für **Connections**: die angeforderte Microsoft-Dataverse-Connection
   auswählen bzw. neu anlegen.

Alternativ per CLI:

```bash
pac auth create --deviceCode --environment https://<org>.crm4.dynamics.com
pac solution import --path <datei>.zip
```

Nach dem Import enthält die Umgebung die Solution mit der Code App und den
fünf `pro_`-Tabellen (`pro_workingsolution`, `pro_workbenchsettings`,
`pro_mergerun`, `pro_releasenote`, `pro_environmentconfig`).

---

## Schritt 2 — Konfigurationsdatensätze anlegen

Alle Konfigurationstabellen werden über die mitgelieferte App Solution Administration Console Settings gepflegt: **Solutions** → importierte
Solution öffnen → Tabelle anklicken → **Edit** (Daten bearbeiten). Die App
liest die Werte **beim Start** — nach Änderungen die App neu laden.

### 2.1 Workbench Settings (`pro_workbenchsettings`)

Genau **einen aktiven Datensatz** anlegen (z. B. mit dem Namen „Default").
Er ist zugleich das Pflicht-Lookup-Ziel jeder Working Solution — ohne ihn
kann die App keine Working Solutions anlegen.

| Spalte | Anzeigename | Wert |
| --- | --- | --- |
| `pro_name` | Name | `Default` |
| `pro_publisher_str` | Publisher | **Default-Publisher** für neue Working Solutions (Anzeigename des Dataverse-Publishers) |
| `pro_adoorgurl` | Azure DevOps Org URL | z. B. `https://dev.azure.com/<org>` (optional) |
| `pro_adoproject` | Azure DevOps Project | Projekt mit den Work Items (optional) |
| `pro_deploymentmanagerrole` | Deployment Manager role name | Name der Sicherheitsrolle, die die **Validate**-Gruppe, **Merge Rules** u. a. freischaltet |

Die übrigen Spalten (`pro_mastersolutionuniquename`, `pro_publisherid`,
`pro_deploymentsolutionuniquename`) werden von der App derzeit nicht genutzt
und können leer bleiben.

### 2.2 Environment Configs (`pro_environmentconfig`)

**Eine Zeile je Umgebung**, die in der App zur Auswahl stehen soll (Compare,
Dependency Check, Layers, Env Config, Operate …). Mindestens die
Host-Umgebung anlegen; typisch sind DEV/UAT/PROD.

| Spalte | Anzeigename | Wert |
| --- | --- | --- |
| `pro_name` | Name | Anzeigename in der UI (z. B. `DEV`, `UAT`, `PROD`) |
| `pro_key` | Key | Kurzschlüssel, z. B. `dev` / `uat` / `prod` |
| `pro_url` | Environment URL | Org-URL `https://<org>.crm4.dynamics.com` (ohne Slash am Ende) |
| `pro_environmentid` | Environment Id | Power-Platform-Environment-ID (aus der Maker-URL `…/environments/<ID>/…`) |
| `pro_iscurrent` | Is current | `Yes` **nur** bei der Umgebung, in der die App läuft (Host); alle anderen `No` |
| `pro_order_int` | Order | Sortierung in den Pickern (z. B. 0, 1, 2) |

Beispiel:

| Name | Key | Environment URL | Is current | Order |
| --- | --- | --- | --- | --- |
| DEV | `dev` | `https://contoso-dev.crm4.dynamics.com` | Yes | 0 |
| UAT | `uat` | `https://contoso-uat.crm4.dynamics.com` | No | 1 |
| PROD | `prod` | `https://contoso-prod.crm4.dynamics.com` | No | 2 |

> **Wichtig:** Genau **eine** Zeile trägt `Is current = Yes` — dort landen
> die schreibenden Aktionen der App. Die `pro_environmentid` wird für die
> Deep-Links ins Maker-Portal und nach Power Automate gebraucht.

---

## Prüfen

App über den App-Player bzw. das Maker-Portal starten:

- Das Badge oben rechts zeigt **„Connected"** (nicht „Demo data").
- Die **Workbench** listet die Solutions der Umgebung.
- In den Validate-/Operate-Bereichen stehen die konfigurierten Umgebungen
  im Umgebungs-Picker zur Auswahl.
