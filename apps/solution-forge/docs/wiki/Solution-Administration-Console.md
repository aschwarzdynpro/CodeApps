[[_TOC_]]

# Solution Administration Console

Die **Solution Administration Console** (intern früher „Solution Forge") ist eine
Power Apps **Code App**, mit der Dataverse-Solutions während der Feature- und
Bug-Entwicklung verwaltet werden: Working Solutions anlegen und tracken,
Komponenten einsehen, Feature-/Bug-Solutions in eine Release-Solution **mergen**
und Releases **vor** und **nach** dem Deployment prüfen (Dependencies, Compare,
Layers, App Sharing).

Die Oberfläche ist auf Englisch; diese Dokumentation beschreibt sie auf Deutsch
und behält die englischen UI-Begriffe bei.

> **Kurzfassung:** Workbench = Solutions verwalten · Merge = in einen Release
> zusammenführen · Deployment Readiness = Prüfungen **vor** dem Deployment ·
> Analyze = Prüfungen **nach** dem Deployment.

---

## Zugriff & Rollen

| Eigenschaft | Wert |
| --- | --- |
| **App** | Solution Administration Console (Power Apps Code App) |
| **App öffnen** | **[▶ Solution Administration Console starten](https://apps.powerapps.com/play/e/431783f6-367c-eb49-984b-4e70e4c0424d/app/459ee5cd-2138-4556-b472-058c676f72ef?hideNavBar=true)** |
| **Host-Umgebung** | D365-SCHULZ-INT-11 (DEV/„current") |
| **Vergleichsziele** | UAT, PROD |
| **Start** | Über den Link oben bzw. das Maker-Portal / den App-Player der Host-Umgebung |

Die App kennt zwei Berechtigungsstufen:

- **Offen für alle Anwender:** **Workbench** und **Merge**.
- **Nur mit der Sicherheitsrolle `INT | Deployment Manager`** (direkt am eigenen
  Benutzer zugewiesen): die gesamte **Validate**-Gruppe (**Deployment
  Readiness** und **Analyze** inkl. Compare/Layers/App Sharing) sowie
  **Merge Rules**.

Ohne die Rolle erscheinen die gesperrten Menüpunkte ausgegraut mit einem
Hinweis-Symbol.

---

## Kernkonzept: die Working Solution

Alles in der App dreht sich um die **Working Solution**. Sie besteht aus
**zwei Teilen**:

1. **Echte Solution** – die unmanaged Dataverse-Solution, die die Komponenten
   trägt (Tabellen, Flows, Web Resources …). Genau das, was auch im
   Maker-Portal sichtbar ist.
2. **Darstellungs-/Tracking-Datensatz** – ein Eintrag der Tabelle
   `ssid_workingsolution` mit Titel, Typ (Feature / Bug / Release), Owner,
   Azure-DevOps-ID, Deployment-Status und Merge-Log. Verlinkt über den
   **Unique Name** der echten Solution.

Beim Anlegen erzeugt die App **beide Teile auf einmal**. Der Unique Name folgt
der Konvention:

- `feature_<id>` – Feature
- `bug_<id>` – Bug
- `deploy_<name>` – Release (Deployment-Container, ohne DevOps-ID)

### Status-Banner je Zeile

Am rechten Rand jeder Listenzeile zeigt ein Banner, welche der beiden Teile
existieren:

| Banner | Bedeutung |
| --- | --- |
| **Synced** | Beide Teile vorhanden und verknüpft (Normalfall). |
| **WS only** | Nur der Tracking-Datensatz, keine echte Solution → im Detail neu verlinken. |
| **Sol only** | Nur die Solution, noch nicht getrackt → im Detail tracken. |

Unmanaged Solutions **ohne** Tracking-Datensatz erscheinen trotzdem in der Liste
(klassifiziert über die Namenskonvention, sonst „Other").

---

## Oberfläche & Navigation

- **Topbar** (dunkel): Brand-Lockup links; rechts ein **Modus-Badge**
  („● Connected" gegen die Umgebung bzw. „● Demo data" im Mock-Modus) sowie die
  Icons **📖 How-To** (Onboarding-Walkthrough) und **? Help** (Feature-Referenz
  pro Bereich).
- **Sidebar** links, gruppiert in:
  - **Manage:** Workbench · Merge · Merge Rules · Release Notes
  - **Validate:** Deployment Readiness · Analyze

---

## Manage

### Workbench

Die zentrale Liste aller Working Solutions.

- **Filter-Chips:** Features / Bugs / Releases / Other (mit Anzahl).
- **Suche:** über Titel, Unique Name und DevOps-ID.
- **Open** und **Tracked** (standardmäßig aktiv): zeigen nur Einträge, deren
  Datensatz noch **aktiv** ist (statecode 0) und die einen Tracking-Datensatz
  besitzen. Wichtig: Der Deployment-Status (z. B. „Merged into Deployment
  Solution") **schließt einen Eintrag nicht** – das tut nur das Deaktivieren des
  Datensatzes. Filter abwählen, um geschlossene/ungetrackte Einträge zu sehen.
- **Owner-Dropdown:** Liste auf einen Owner einschränken.
- **⟳ Refresh** lädt die Liste neu; daneben steht ein „Updated <Zeit>"-Stempel.
- **incl. components:** baut einmalig einen Komponenten-Index über die
  **offenen** Working Solutions, damit die Suche auch Komponenten-Anzeigenamen
  trifft („welche offene Solution enthält ‚SST | Monteur'?"). Treffer erscheinen
  als gelbe Chips an der Zeile.
- **group by work item:** gruppiert die Liste nach DevOps-Nummer; ein
  Amber-Zähler markiert Nummern mit mehreren Solutions.
- **⚠ Scan collisions:** lädt die Komponenten der **offenen** getrackten Working
  Solutions (Releases ausgenommen) und markiert Komponenten, die in **mehr als
  einer** stecken – wer zuletzt deployt, überschreibt die anderen. Betroffene
  Zeilen bekommen einen **⚠ shared**-Chip; das Detail listet die geteilten
  Komponenten und die übrigen Solutions.
- **⟳ Sync with DevOps:** ruft den Cloud Flow auf, der je Working Solution den
  Work-Item-Status aus Azure DevOps aktualisiert (siehe
  [DevOps-Integration](#devops-integration)).

#### Work-Item-Status & „to be completed"

- Jede Zeile zeigt den synchronisierten **DevOps-Work-Item-Status** als Chip
  neben der **#Nummer** – **blau** solange aktiv (New/Active/Resolved …),
  **dezent grau** wenn Closed/Done (Feld `sst_devopsworkitemstatus`).
- Ist ein **offener** Eintrag im Work Item bereits **Closed/Done**, wird er als
  **✓ to be completed** markiert und seine **Mark completed**-Aktion
  hervorgehoben.

### Working Solution anlegen / tracken / verlinken

- **+ New Working Solution:** Dialog mit Typ, DevOps-ID (Feature/Bug), Titel,
  Beschreibung und Publisher; Live-Preview des Unique Name inkl. Duplikat-Prüfung.
  Der **Publisher** ist mit dem Standard-Publisher aus den Workbench Settings
  vorbelegt. Den Typ **Release** dürfen nur Deployment Manager wählen. Auf
  Speichern werden Solution **und** Tracking-Datensatz erzeugt; die Solution ist
  sofort im Maker-Portal sichtbar.
- **Bestehende Solution tracken:** einen **Sol only**-Eintrag öffnen →
  „Create working-solution record" (Typ/Titel/DevOps-ID vorbefüllt).
- **Verwaisten Datensatz neu verlinken:** bei **WS only** bietet das Detail eine
  Suche über alle unverlinkten unmanaged Solutions zum Reparieren der
  Verknüpfung.

### Detail-Ansicht

Ein Klick auf eine Zeile blendet die Details **inline direkt darunter** ein
(erneuter Klick blendet sie aus – so bleibt die Tabelle in voller Breite).

- **Command Bar:** **Open in Maker Portal** (links) sowie **Mark completed** /
  **Delete** und **👤 Assign** (rechts).
- **Metadaten:** Version, Publisher, Owner, Deployment-Status.
- **👤 Assign** (getrackte Einträge): Owner neu zuweisen – „Assign to me" oder
  per Namenssuche.
- **Typ ändern:** über das **✎** am Typ-Badge (Feature / Bug / Release).
- **Components:** Komponenten der Solution, nach Typ in aufklappbaren Gruppen
  (Anzeigenamen aus derselben Quelle wie das Maker-Portal). **Refresh** erzwingt
  ein Neuladen.
- **Merge-Historie** (nur Release-Solutions): siehe [Merge](#merge).
- **Mark completed …** setzt den Deployment-Status auf „Deployment completed"
  (reines Label). Optional kann die unterliegende Solution mitgelöscht werden –
  dann mit 3-Sekunden-**Undo**.
- **Delete …** entfernt nach Bestätigung Datensatz, Solution oder beides – mit
  3-Sekunden-**Undo**, bevor der harte Delete läuft. Komponenten innerhalb einer
  gelöschten Solution bleiben im System. Schlägt der finale Delete serverseitig
  fehl (z. B. weil gerade ein anderer Solution-Import läuft), erklärt ein Banner
  den Grund und der Eintrag taucht wieder auf.

### Merge

Feature-/Bug-Solutions in eine **Release-Solution** zusammenführen.

1. Eine Working Solution vom Typ **Release** als leeren Deployment-Container
   anlegen.
2. **Merge** öffnen. **Schritt 1:** die **Quell**-Feature/Bug-Solutions im
   Multi-Select wählen. **Schritt 2:** die **Release**-Solution als Ziel wählen.
3. **Schritt 3 – Komponenten-Plan:** zeigt den Satz hinzuzufügender Komponenten.
   Mehrfach beigetragene Komponenten werden als **Konflikt** markiert und nur
   einmal angewendet; bereits im Ziel vorhandene werden **übersprungen**.
4. **Merge into deployment solution** klicken.

**Was dahinter passiert:** Pro Komponente ruft die App `AddSolutionComponent`
auf. Das fügt nur die **Mitgliedschaft** der Komponente zur Release-Solution
hinzu – es wird **nichts kopiert oder dupliziert**, beide Solutions referenzieren
dasselbe Objekt. Das Subkomponenten-Verhalten der Quelle wird übernommen,
bereits vorhandene Objekte werden übersprungen → ein erneuter Merge ist immer
gefahrlos.

Danach erhalten die Quellen automatisch den Status **„Merged into Deployment
Solution"** plus Zeitstempel, und es wird eine **Merge-Run**-Zeile am Release
protokolliert. Im Detail der Release-Solution erscheint die **Merge-Historie**
(wann, von wem, Counts, Quell-Solutions); ein Klick auf eine Zeile öffnet ein
Overlay mit den hinzugefügten Komponenten gruppiert nach Typ.

### Merge Rules (nur Deployment Manager)

Optional kann jeder Release einschränken, welche Komponententypen er aufnimmt:

- **Allow-Liste** (`sst_allowedmergetypes`) – leer = alle Typen erlaubt.
- **Exclude-Liste** (`sst_excludedmergetypes`) – darüber angewendet.

Ein Typ ist mergebar, wenn er **(in Allow ODER Allow leer) UND nicht in Exclude**
ist. Verwaltet im eigenen **Merge Rules**-Tab; die Workbench-Detailansicht zeigt
nur eine Read-only-Übersicht. Blockierte Komponenten werden im Plan ausgegraut
und beim Merge als „excluded by merge rules" gezählt.

### Release Notes

Eigener Menüpunkt **📝 Release Notes** (ungated). Release-Solution oben wählen →
zwei Sub-Tabs:

- **Draft** — wird live aus der **Merge-Historie** generiert:
  - **Included solutions:** alle gemergten Quell-Solutions (Display-Namen);
    bei eindeutig auflösbarem Titel zusätzlich der DevOps-**`#`-Work-Item-Link**.
  - **Components:** alle hinzugefügten Komponenten nach Typ gruppiert; **App
    Elements** als Counter zusammengefasst.
  - Umschalter **Markdown | Raw** + **Copy** des aktiven Formats.
  - **Publish** friert den Draft als versionierten Snapshot ein (beide Formate
    gespeichert). Deaktiviert, wenn identisch zum zuletzt veröffentlichten Stand.
    **Publish nur mit Rolle „INT | Deployment Manager"**; Anzeigen/Kopieren offen.
- **History** — alle veröffentlichten Stände (Datum · Autor · Summary); Klick
  öffnet den gespeicherten Stand exakt wie veröffentlicht.

Gespeichert in der Tabelle `sst_releasenote` (Lookup auf die Release-Solution).
Hinweis: Eine Komponente lässt sich nicht einer einzelnen Quell-Solution
zuordnen (der Merge-Log speichert die kombinierte Liste), daher Gruppierung nach
Typ. Die Notes sind **historisch** (was gemergt wurde), nicht der aktuelle
Live-Stand.

---

## Validate (nur Deployment Manager)

Die Validate-Gruppe trennt sauber nach Zeitpunkt:

- **Deployment Readiness** = alles, was **vor** dem Deployment zu prüfen ist.
- **Analyze** = alles **nach** dem Deployment (Compare, Layers, App Sharing).

### Deployment Readiness (Dependency Check)

1. **Release-Solution** und **Ziel-Umgebung** (UAT / PROD) wählen.
2. **Dependency Check** läuft `RetrieveMissingDependencies` und listet jede
   benötigte Komponente, die die Solution **nicht** enthält.

- **Missing in target:** Die Komponente fehlt sowohl in der Solution als auch im
  Ziel → der Import würde scheitern. **Add to Solution** zieht sie direkt in den
  Release. Name-gematchte Typen (Environment Variables, Connection References,
  Web Resources, Canvas Apps) zählen als vorhanden, wenn das Ziel sie unter
  gleichem Namen kennt – auch bei abweichender ID.
- Alles übrige (bereits im Ziel vorhanden oder von der App nicht prüfbar) wird in
  einer Zeile zusammengefasst – dort ist nichts zu tun.
- Der Check **läuft im Hintergrund weiter**, wenn man wegnavigiert (siehe
  [Hintergrund-Aktivität](#hintergrund-aktivität)).

### Analyze (Post-Deployment)

Ein gebündelter Durchlauf der Post-Deployment-Checks für eine Release-Solution.

1. In einer Toolbar-Zeile **Release-Solution**, **Ziel** (UAT / PROD) und die
   gewünschten **Checks** wählen: **Compare**, **Layers**, **App Sharing**.
2. **Analyze** starten. Ein Phasen-Stepper zeigt den Fortschritt.
3. Das Ergebnis erscheint in Tabs: **Summary** plus je ein Tab pro gewähltem
   Check mit der vollen Detailansicht.

Der Lauf **läuft im Hintergrund weiter**, wenn man wegnavigiert.

#### Summary-Dashboard

- **Deployment Risk Score** (0–100, höher = sicherer) mit Band **Low / Medium /
  High Risk**.
- **Severity-Karten** (Critical / High / Medium / Low) – **klickbar als Filter**
  für die Issue-Liste.
- **Issues:** alle Findings nach Kritikalität gruppiert in aufklappbaren
  Sektionen, je mit empfohlener **Action**.
- **Solution Components:** Aufschlüsselung nach Komponententyp.
- **Recommendations:** konkrete nächste Schritte aus den Findings.
- **Environment Readiness:** Kompatibilitäts-Matrix je Bereich plus
  Gesamt-Readiness in %.

#### Compare (ALM)

Vergleicht Cloud Flows, Workflows, Business Rules, Plugin Steps und Scripts über
die Umgebungen (current / UAT / PROD), gematcht über import-stabile IDs, gruppiert
nach Typ.

- **Abweichungs-Tags:** **Missing** (nicht im Ziel), **Status drift** (z. B. Flow
  Draft in PROD, Plugin Step deaktiviert) und **Content drift** (Definition weicht
  von DEV ab). Die Summen-Chips filtern die Matrix.
- **Content drift** braucht den schwereren Content-Durchlauf: in Analyze läuft er
  automatisch; allein über **Check content drift**. Driftende Zeilen erhalten
  einen **⇄ diff**-Link → Side-by-side-Diff **DEV vs. Ziel**.
- Hinweis: Geänderte Datumswerte (`modifiedon`) sind **kein** Drift-Signal (der
  Import überschreibt sie). „?"-Zellen = Umgebung nicht abfragbar (Grund im Banner).

#### Layer Inspector

Prüft **alle** Komponenten der Release-Solution gegen die Solution-Layer-Stacks
im Ziel-Env – dieselbe Sicht wie „See solution layers" im Maker-Portal.

- **Verdict je Komponente:** **Unmanaged over managed** (direkt im Ziel
  angepasst – der unmanaged „Active"-Layer maskiert das Deployment),
  **Unmanaged only**, **Missing** (nicht im Ziel – hier sieht man, ob Plugin
  Assemblies, Custom APIs etc. überhaupt deployed wurden), **Clean**.
- Filter-Chips **Missing** / **Unmanaged layer** schränken die Liste ein.
- Zeilen mit unmanaged Layer bekommen einen **Absprung ins Maker-Portal** des
  Ziel-Env – wo möglich direkt auf die **solution layers**-Seite der Komponente
  (**↗ layers in {env}**), sonst auf die Solution (**↗ solution in {env}**).
  Das **Entfernen** des Active-Layers passiert bewusst im Portal, nicht in der
  App (nicht umkehrbar).
- **Environment Variables und Connection References werden übersprungen** – sie
  tragen per Definition einen Active-Layer (Wert/Connection) und wären sonst nur
  False Positives.
- **⇄ diff** für diffbare Typen (Flows, Workflows, Business Rules, Scripts):
  Side-by-side **DEV vs. Ziel**.

#### App Sharing

Prüft die **Canvas Apps** und **Custom Pages** einer Solution darauf, mit wem sie
in DEV/UAT/PROD geteilt sind (cross-env über den import-stabilen Namen gematcht).

- Solution-Import überträgt **kein** User-Sharing – eine deployte Canvas App
  erreicht niemanden, bis sie im Ziel geteilt wird. Genau diese Lücke
  (**⚠ not shared**) wird oben hervorgehoben.
- Je Zelle: Anzahl **👤 User** und **👥 Teams**; eine Zeile aufklappen zeigt die
  Prinzipale und ihr Zugriffslevel (Read / Read, Write / Co-owner) je Umgebung.
- **Custom Pages** erhalten Zugriff über die Rollen der modellgetriebenen App,
  nicht über direktes Sharing – „nicht geteilt" ist dort normal und kein Mangel.

---

## Hintergrund-Aktivität

Lang laufende Jobs blockieren die Navigation nicht. Sowohl der **Deployment
Readiness**-Check als auch der **Analyze**-Lauf **laufen weiter, wenn man
wegnavigiert**. Unten links erscheint je Job eine **Aktivitäts-Bar** mit:

- Fortschritt (Spinner) bzw. Abschluss (✓) oder Fehler (✕),
- **View** – springt zur ursprünglichen Auswahl/Ansicht zurück,
- **✕** – Bar ausblenden (nach Abschluss).

Laufen beide Jobs gleichzeitig, stapeln sich die Bars.

---

## DevOps-Integration

- **Work-Item-Panel** im Detail (Status, Assignee, Absprung), sobald die
  DevOps-Verbindung aktiv ist. Die Nummer kommt aus dem Unique Name
  (`feature_4711`), einem rein numerischen Namen oder dem Titel.
- **⟳ Sync with DevOps** (Workbench-Toolbar) ruft den Cloud Flow
  *PA | MANUAL | Working Solution | Sync DevOps Work Item Status* auf, der je
  Working Solution `sst_devopsworkitemstatus` aktualisiert. Danach lädt die Liste
  neu und der **to be completed**-Abgleich sowie die **Status-Chips** rechnen mit
  den frischen Status.

---

## Umgebungen

| Schlüssel | Bezeichnung | Rolle |
| --- | --- | --- |
| current | INT-11 · current | Host/DEV – hier läuft die App, „Quelle der Wahrheit" für Vergleiche |
| uat | UAT | Vergleichs-/Prüfziel |
| prod | PROD | Vergleichs-/Prüfziel |

Cross-Env-Zugriff erfolgt über den Microsoft-Dataverse-Konnektor; die Umgebungen
sind aktuell in der App-Konfiguration hinterlegt.

---

## Chips & Begriffe (Glossar)

| Element | Bedeutung |
| --- | --- |
| **Synced / WS only / Sol only** | Welche Teile der Working Solution existieren. |
| **#13388** | Azure-DevOps-Work-Item-Nummer. |
| **Work-Item-Status-Chip** | Synchronisierter DevOps-Status (blau aktiv / grau Closed/Done). |
| **✓ to be completed** | Offener Eintrag, dessen Work Item bereits geschlossen ist. |
| **duplicate link** | Mehrere Datensätze verlinken dieselbe Solution. |
| **⚠ shared** | Komponenten, die mit anderen Working Solutions geteilt sind. |
| **Missing / Status drift / Content drift** | Abweichungen im Compare. |
| **Unmanaged over managed / Unmanaged only / Missing / Clean** | Layer-Verdicts. |
| **Risk Score / Low–Medium–High Risk** | Deployment-Risiko im Analyze-Summary. |

---

## Typischer Ablauf (End-to-End)

1. **Anlegen:** Feature/Bug als Working Solution erstellen → im Maker-Portal wie
   gewohnt entwickeln.
2. **Sammeln:** Eine Release-Solution anlegen und die fertigen Feature/Bugs per
   **Merge** hineinführen (optional über **Merge Rules** eingeschränkt).
3. **Vor dem Deployment:** **Deployment Readiness** gegen das Ziel prüfen und
   fehlende Dependencies per **Add to Solution** ergänzen.
4. **Deployen:** Export/Deployment des Release läuft über die normale Pipeline
   **außerhalb** dieser App – die Console bereitet vor und trackt, deployt aber
   nicht selbst.
5. **Nach dem Deployment:** **Analyze** gegen UAT/PROD laufen lassen (Risk Score,
   Compare, Layers, App Sharing) und Abweichungen abarbeiten – z. B. unmanaged
   Layer im Portal entfernen, Canvas Apps im Ziel teilen.
6. **Abschließen:** Fertige Feature/Bugs per **Mark completed** aus der
   Open-Liste nehmen; **Sync with DevOps** hilft, geschlossene Work Items zu
   erkennen.

---

## Technischer Anhang (für Admins)

- **Typ:** Power Apps **Code App** (React + TypeScript + Vite,
  `@microsoft/power-apps`). Deploy über `power-apps push`.
- **Datenmodell (Auswahl):**
  - `ssid_workingsolution` – Tracking-/Darstellungs-Datensatz (Titel, Typ
    `sst_type_opt`, DevOps-ID `ssid_devopsid`, Deployment-Status
    `ssid_deploymentstatus`, Work-Item-Status `sst_devopsworkitemstatus`,
    Merge-Regeln `sst_allowedmergetypes` / `sst_excludedmergetypes`).
  - `ssid_workbenchsettings` – Konfiguration (u. a. Standard-Publisher).
  - `sst_mergerun` – eine Zeile je Merge (Counts, Quell-Titel, hinzugefügte
    Komponenten als JSON, Ziel-Lookup).
  - Standard-Tabellen: `solution`, `solutioncomponent`,
    `msdyn_solutioncomponentsummary`, `publisher`, `systemuser`, `role`.
- **Merge** nutzt die Dataverse-Action `AddSolutionComponent` (Mitgliedschaft,
  kein Kopieren) und übernimmt das `rootcomponentbehavior` der Quelle.
- **Cross-Env-Daten** kommen über den Dataverse-Konnektor
  (`ListRecordsWithOrganization` mit expliziter Org-URL); Sharing-Daten aus
  `principalobjectaccess` per FetchXML.
- **Rollen-Gate:** Sicherheitsrolle `INT | Deployment Manager` (direkte
  Zuweisung) schaltet Validate + Merge Rules frei.

---

*Diese Seite spiegelt den aktuellen Funktionsstand wider. Bei Feature-Änderungen
bitte zusammen mit den In-App-Texten (How-To / Help) und der README aktuell
halten.*
