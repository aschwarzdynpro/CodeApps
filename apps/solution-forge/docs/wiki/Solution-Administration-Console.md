[[_TOC_]]

# Solution Administration Console

Die **Solution Administration Console** (intern früher „Solution Forge") ist eine
Power Apps **Code App**, mit der Dataverse-Solutions während der Feature- und
Bug-Entwicklung verwaltet werden: Working Solutions anlegen und tracken,
Komponenten einsehen, Feature-/Bug-Solutions in eine Release-Solution **mergen**
und Releases **vor** und **nach** dem Deployment prüfen (Dependencies, Compare,
Layers, App Sharing).

Über die reine Solution-Verwaltung hinaus bündelt die App **Validierungs-Cockpits**
(Environment-Config, Audit-Config, Dual-Write-Maps, Import-Historie) und
**Betriebs-Ansichten** über eine gewählte Umgebung (Plugin-Traces, Job-/
Flow-Monitor, Security-Role-Analyzer).

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
| **Host-Umgebung** | DEV („current") — die Umgebung, in der die App installiert ist |
| **Vergleichsziele** | UAT, PRD |
| **Start** | Über das Maker-Portal bzw. den App-Player der Host-Umgebung |

Die App kennt zwei Berechtigungsstufen:

- **Offen für alle Anwender:** **Workbench**, **Merge**, **Release Notes**
  (Ansehen/Kopieren), **Timeline** sowie in der **Operate**-Gruppe **Plugin
  Traces** und **Job Monitor** (lesend).
- **Nur mit der Deployment-Manager-Rolle** (der in den Workbench Settings
  konfigurierten Sicherheitsrolle, direkt am eigenen Benutzer zugewiesen):
  die gesamte **Validate**-Gruppe (**Deployment Readiness**, **Analyze** inkl.
  Compare/Layers/App Sharing, **Env Config**, **Audit Config**, **Dual-Write
  Maps**, **Import History**), **Merge Rules**, der **Role Analyzer** sowie alle
  **schreibenden** Aktionen (Release-Notes **Publish**, Trace-Level umschalten,
  Jobs bulk-canceln/-retrien, **Core Roles** anlegen).

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
   `pro_workingsolution` mit Titel, Typ (Feature / Bug / Release), Owner,
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
  - **Manage:** Workbench · Merge · Merge Rules · Release Notes · Timeline
  - **Validate:** Deployment Readiness · Analyze · Env Config · Audit Config ·
    Dual-Write Maps · Import History
  - **Operate:** Plugin Traces · Job Monitor · Role Analyzer

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
  trifft („welche offene Solution enthält ‚Sales | Invoice'?"). Treffer erscheinen
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
  **dezent grau** wenn Closed/Done (Feld `pro_devopsworkitemstatus`).
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

- **Allow-Liste** (`pro_allowedmergetypes`) – leer = alle Typen erlaubt.
- **Exclude-Liste** (`pro_excludedmergetypes`) – darüber angewendet.

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
  - **Inkrementell:** Nach dem ersten Publish zeigt der Draft nur noch, was
    **seit der letzten veröffentlichten Release Note** gemergt wurde (mit „seit"-
    Datum); ist nichts Neues da, gibt es nichts zu veröffentlichen.
  - Umschalter **Markdown** (gerendert) **| Raw** (Rohtext) + **Copy** des
    aktiven Formats (Markdown-Tab kopiert die Markdown-Quelle).
  - **Publish** friert den Draft als versionierten Snapshot ein (beide Formate
    gespeichert). **Publish nur mit der Deployment-Manager-Rolle**;
    Anzeigen/Kopieren offen.
- **History** — alle veröffentlichten Stände (Datum · Autor · Summary); Klick
  öffnet den gespeicherten Stand exakt wie veröffentlicht.

Gespeichert in der Tabelle `pro_releasenote` (Lookup auf die Release-Solution).
Hinweis: Eine Komponente lässt sich nicht einer einzelnen Quell-Solution
zuordnen (der Merge-Log speichert die kombinierte Liste), daher Gruppierung nach
Typ. Die Notes sind **historisch** (was gemergt wurde), nicht der aktuelle
Live-Stand.

### Timeline

Eigener Menüpunkt **🕘 Timeline** (ungated). Zeigt „was ging wann wohin" für
**eine** Release-Solution auf einer einzigen Zeitachse: ihre **Merge-Runs** (mit
Counts und Quell-Solutions), ihre veröffentlichten **Release Notes** (mit
Version) und ihre **Imports** in jede konfigurierte Umgebung (über den Unique
Name gematcht, Badge nach Ergebnis eingefärbt). Ereignistypen per Chips
ein-/ausblenden; nicht lesbare Umgebungen degradieren zu einem Hinweis. Reine
Visualisierung vorhandener Daten – kein eigener Datenpfad.

---

## Validate (nur Deployment Manager)

Die Validate-Gruppe trennt sauber nach Zeitpunkt:

- **Deployment Readiness** = alles, was **vor** dem Deployment zu prüfen ist.
- **Analyze** = alles **nach** dem Deployment (Compare, Layers, App Sharing).

### Deployment Readiness (Dependency Check)

1. **Release-Solution** und **Ziel-Umgebung** (UAT / PRD) wählen.
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

1. In einer Toolbar-Zeile **Release-Solution**, **Ziel** (UAT / PRD) und die
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
die Umgebungen (DEV / UAT / PRD), gematcht über import-stabile IDs, gruppiert
nach Typ.

- **Abweichungs-Tags:** **Missing** (nicht im Ziel), **Status drift** (z. B. Flow
  Draft in PRD, Plugin Step deaktiviert) und **Content drift** (Definition weicht
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
in DEV/UAT/PRD geteilt sind (cross-env über den import-stabilen Namen gematcht).

- Solution-Import überträgt **kein** User-Sharing – eine deployte Canvas App
  erreicht niemanden, bis sie im Ziel geteilt wird. Genau diese Lücke
  (**⚠ not shared**) wird oben hervorgehoben.
- Je Zelle: Anzahl **👤 User** und **👥 Teams**; eine Zeile aufklappen zeigt die
  Prinzipale und ihr Zugriffslevel (Read / Read, Write / Co-owner) je Umgebung.
- **Custom Pages** erhalten Zugriff über die Rollen der modellgetriebenen App,
  nicht über direktes Sharing – „nicht geteilt" ist dort normal und kein Mangel.

### Env Config

Das **Environment-Variable- & Connection-Reference-Cockpit** zeigt die Config
**aller konfigurierten Umgebungen nebeneinander**, über den Namen gematcht, und
markiert die klassischen Deployment-Lücken: eine Env Var **ohne Wert** (und ohne
Default) in einer Umgebung, eine **ungebundene** Connection Reference und eine
Einstellung, die in einer Umgebung vorhanden, in einer anderen **fehlt**
(Transport-Lücke). Secrets werden maskiert, ein Default-Fallback wird markiert.
Read-only.

- Beide Abschnitte (Environment Variables, Connection References) sind
  standardmäßig eingeklappt und nach Anzeigename sortiert; die **Suche** filtert
  beide, ein **Counter-Chip** (z. B. „4 env vars without a value") schränkt die
  Tabellen auf genau diese Zeilen ein.
- Das geladene Bild ist **pro Session gecacht** – **Refresh** liest neu (die
  „Updated …"-Zeit zeigt die Aktualität). Optional eine **Release-Solution**
  wählen, um das Cockpit auf deren Env Vars & Connection References einzugrenzen.
- Beim Aufklappen von **Connection References** wird zusätzlich gezählt, **wie
  viele Cloud Flows** jede Referenz in der Host-Umgebung nutzen (Chip „N flows" –
  0 = verwaiste Referenz), getrennt nach aktiven/inaktiven Flows; ein Klick auf
  eine Zeile listet die Flows mit Deep-Link in Power Automate.

### Audit Config

Der **Audit-Configuration-Analyzer** zeigt die Auditing-Einstellungen einer
gewählten Umgebung: den **Org-Hauptschalter** und die Aufbewahrungsdauer sowie
je Tabelle/Spalte `IsAuditEnabled`. Eine Tabelle protokolliert nur Historie,
wenn **Org-Auditing UND die Tabelle** an sind – die **Effective**-Spalte
markiert eine Tabelle, die für Audit konfiguriert ist, während der Org-Schalter
aus ist. Eine Tabelle aufklappen zeigt die auditierten Spalten. Read-only.

### Dual-Write Maps

Das **Dual-Write-Table-Maps**-Cockpit listet die **Custom (unmanaged)**
Dual-Write-Table-Maps der aktuellen Umgebung – eine Zeile je Map in ihrer
**aktuellen (höchsten) Version**, mit **Source → Target Table** und Sync-Richtung
(↔ / → / ←) sowie der Anzahl älterer Versions-Datensätze. Ein Klick öffnet ein
Overlay, das das Mapping rendert: je Leg Quell- ↔ Ziel-Schema und eine
**Feld-Mapping-Tabelle** mit Richtung (↔ bidirektional, → zum Ziel, ← zur Quelle),
Value-Map-Transforms, Lookup-aufgelösten Zielen und einer Markierung
system-generierter (Integration-Key-)Felder. Umschalter **Hide system-generated**
und **Show raw JSON**. Read-only.

### Import History

Die **Solution Import History** listet die `importjob`-Zeilen einer gewählten
Umgebung – gestartet, Solution, Status, Fortschritt, Dauer, Publisher (aus der
importierten Solution aufgelöst, da der Import-User meist das System ist). Die
Liste ist auf die **neuesten 100** begrenzt, daher wird **serverseitig**
eingegrenzt: ein **Status-Chip** (z. B. *Failed* → die letzten 100
fehlgeschlagenen Importe), eine **Solution-Namens-Suche** und ein **Picker über
die Release-Solutions**. Eine Zeile aufklappen lädt und parst das Import-Log:
**fehlende-Dependency-Fehler werden zu einer präzisen Tabelle** – links die im
Ziel fehlende Komponente (Typ, Name, Quell-Solution → zuerst installieren),
rechts die importierte Komponente, die sie braucht (Typ, Name, Parent). Weitere
Fehler/Warnungen darunter, dedupliziert. Read-only.

---

## Operate

Die **Operate**-Gruppe bietet Laufzeit-Einblicke in **eine** Umgebung. Jedes
Feature startet mit einem **Target-environment**-Picker (Host / UAT / PRD …);
alle **Reads** laufen gegen jede davon (über den Konnektor), **Writes**
(Trace-Level umschalten, Jobs canceln/retrien) nur gegen die **Host-Umgebung** –
bei anderer Auswahl werden sie read-only. Die Auswahl ist über die drei Features
geteilt. **Plugin Traces** und **Job Monitor** sind für alle offen (destruktive
Aktionen zusätzlich Deployment-Manager-gated); der **Role Analyzer** ist als
Ganzes gated.

### Plugin Traces

Ein brauchbares Frontend über `plugintracelog`.

- **Trace stream:** pollt alle 15 s (pausiert bei verstecktem Browser-Tab) mit
  serverseitigen Filtern – Zeitfenster, Plugin-Typ, Message, Entity, sync/async,
  nur-Exceptions, opt-in Message-Text-Suche (≤ 24 h). Zeilen sind nach Ergebnis
  eingefärbt: **grün** bei Erfolg, **rot mit ⚠** bei echter Exception
  (`exceptiondetails`).
- Eine Zeile aufklappen zeigt den lazy geladenen **Message-Block** (Find-in-Text,
  Copy) und bei Fehlern den **Exception-details**-Block; der schwere Payload wird
  im Stream nie geladen.
- **⛓ Chain** öffnet die Korrelations-Timeline: alle Traces der Request-Kette,
  nach Tiefe eingerückt, Balkenlänge ∝ Dauer.
- **Performance** aggregiert die Dauer je Plugin × Message (Count / avg / p95≈ /
  max); ein Klick springt zurück in den vorgefilterten Stream.
- Der **Trace level** (oben rechts) zeigt `organization.plugintracelogsetting`;
  Umschalten braucht die Deployment-Manager-Rolle und läuft als angemeldeter
  User („All" warnt vor Log-Wachstum). Die Plattform prunt Traces – ein Explorer,
  kein Archiv.

### Job Monitor

- **Health:** „Ist das Async-Processing gesund?" auf einen Blick –
  fehlgeschlagene Jobs (24 h), Waiting-Backlog mit der ältesten wartenden
  Operation, gesampelte Flow-Fehlerrate und die Watchdog-Lampen. Jede Kachel
  führt in ihren Detail-Tab.
- **System jobs:** durchsucht `asyncoperation` mit erzwungenem Rückblick-Fenster
  und Status-/Typ-/Namensfiltern. Deployment Manager können **bulk-canceln /
  -retrien** (max. 50 je Batch, sequenziell, Ergebnis je Job) – Writes als
  angemeldeter User.
- **Flows:** listet **alle** Cloud Flows (ohne Cap), filterbar nach Name und nach
  **Release-Solution** (die Flows, die deren Komponenten sind). „Load failure
  rates" sampelt die jüngsten Runs je Flow. Ein Flow öffnet seine Runs im **Side
  Pane**; ein Run zeigt ein **Popup mit dem vollen Run-Datensatz** plus „Open run
  ↗" in Power Automate.
- **Watchdog:** vergleicht je Heartbeat-Definition (erwartetes Intervall + Grace)
  gegen den letzten Beat – 🔴 überfällig / nie geschlagen, ⚪ inaktiv. Die
  überwachten Tabellen sind konfigurierbar.
- **Trends:** fehlgeschlagene Jobs je Tag über 7 / 30 Tage (serverseitige
  Aggregate).

### Role Analyzer (read-only)

Arbeitet auf einem ~15 min gecachten Snapshot des Security-Modells; Rollen werden
auf ihrer **Root-Kopie** aggregiert (`parentrootroleid` – BU-Kopien fallen
zusammen).

- **Matrix:** Rolle × Tabelle × Privileg mit den klassischen Tiefen (User / BU /
  Parent:Child / Organization).
- **Diff:** zwei Rollen nebeneinander, nur Deltas, als Markdown oder CSV
  exportierbar.
- **User rights:** effektive Tabellen-Privilegien eines Users, aggregiert aus
  direkten + Team-Rollen (tiefste Tiefe gewinnt) – mit Herkunftspfad je Grant
  („Rolle X ← Team Y").
- **Reverse lookup:** „Wer darf Delete auf account?" → alle User/Teams mit ihrem
  Pfad.
- **Hygiene:** Rollen ohne jede Zuweisung und User über einem
  Rollen-Zähler-Schwellwert.
- **Field security:** das Spalten-Pendant zur Matrix – Field Security Profiles
  mit ihren gesicherten Spalten (Read / Create / Update / read-unmasked) und wem
  sie zugewiesen sind, plus eine spaltenzentrierte Sicht („wer darf gesicherte
  Spalte X lesen/ändern?"). Markiert Profile ohne Zuweisung und Spalten, auf die
  kein Profil Read gewährt.
- **Team & BU map:** ein interaktives Org-Chart der Business-Unit-Hierarchie mit
  den rollen-vergebenden Teams je BU. Ziehen = Pan, Wheel = Zoom, Teilbaum
  einklappen. Ein Klick auf BU/Team zeigt dessen Rollen und Mitglieder; im
  **Trace user**-Modus werden die BU und Teams eines Users hervorgehoben samt der
  über Team-Mitgliedschaft geerbten Rollen.
- **Core roles** (schreibend, nur Host-Umgebung): analysiert die **Custom
  (unmanaged)** Rollen auf Privilegien, die ≥ 2 von ihnen teilen, und schlägt je
  geteiltem Rollen-Set eine konsolidierte **Core Role** vor. Name vergeben, eine
  **Working Solution** wählen und **Create core role** – die Rolle wird in dieser
  Solution angelegt, die konsolidierten Privilegien vergeben (tiefste Tiefe
  gewinnt) und, falls opt-in, die Duplikate aus den Quell-Rollen entfernt (die
  dann ebenfalls in die Solution wandern). Mitglieder mit nur einer Quell-Rolle
  brauchen die neue Core Role, um ihren Zugriff zu behalten.

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
  Working Solution `pro_devopsworkitemstatus` aktualisiert. Danach lädt die Liste
  neu und der **to be completed**-Abgleich sowie die **Status-Chips** rechnen mit
  den frischen Status.

---

## Umgebungen

| Schlüssel | Bezeichnung | Rolle |
| --- | --- | --- |
| dev | DEV | Host/„current" – hier läuft die App, „Quelle der Wahrheit" für Vergleiche |
| uat | UAT | Vergleichs-/Prüfziel |
| prd | PRD | Vergleichs-/Prüfziel |

Cross-Env-Zugriff erfolgt über den Microsoft-Dataverse-Konnektor; die Umgebungen
werden in der Tabelle **Environment Config** (`pro_environmentconfig`) gepflegt
(siehe [Installation & Konfiguration](Installation-und-Konfiguration.md)).

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
| **⚠ not shared** | Canvas App im Ziel mit niemandem geteilt (App Sharing). |
| **N flows** | Anzahl Cloud Flows, die eine Connection Reference nutzen – 0 = verwaist (Env Config). |
| **Effective** | Tabelle für Audit konfiguriert, aber Org-Audit aus (Audit Config). |
| **grün / rot ⚠** | Plugin-Trace erfolgreich bzw. mit Exception (Plugin Traces). |
| **🔴 / ⚪** | Watchdog: Heartbeat überfällig / inaktiv (Job Monitor). |

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
5. **Nach dem Deployment:** **Analyze** gegen UAT/PRD laufen lassen (Risk Score,
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
  - `pro_workingsolution` – Tracking-/Darstellungs-Datensatz (Titel, Typ
    `pro_type_opt`, DevOps-ID `pro_devopsid`, Deployment-Status
    `pro_deploymentstatus`, Work-Item-Status `pro_devopsworkitemstatus`,
    Merge-Regeln `pro_allowedmergetypes` / `pro_excludedmergetypes`).
  - `pro_workbenchsettings` – Konfiguration (u. a. Standard-Publisher,
    Deployment-Manager-Rollenname).
  - `pro_environmentconfig` – die konfigurierten Umgebungen (DEV/UAT/PRD).
  - `pro_mergerun` – eine Zeile je Merge (Counts, Quell-Titel, hinzugefügte
    Komponenten als JSON, Ziel-Lookup).
  - `pro_releasenote` – veröffentlichte Release-Notes-Snapshots.
  - Standard-Tabellen: `solution`, `solutioncomponent`,
    `msdyn_solutioncomponentsummary`, `publisher`, `systemuser`, `role`.
  - Read-only-Quellen der Validate-/Operate-Cockpits (alle über den Konnektor):
    `importjob` (Import History); `asyncoperation` + Cloud Flows (Job Monitor);
    `plugintracelog` + `organization` (Plugin Traces); `environmentvariable-`
    `definitions`/`-values` + `connectionreference` (Env Config);
    `EntityDefinitions` + `organization` (Audit Config); `msdyn_dualwriteentitymap`
    (Dual-Write Maps); `role`/`privilege` + `fieldsecurityprofile`/`fieldpermission`
    (Role Analyzer).
- **Merge** nutzt die Dataverse-Action `AddSolutionComponent` (Mitgliedschaft,
  kein Kopieren) und übernimmt das `rootcomponentbehavior` der Quelle.
- **Cross-Env-Daten** kommen über den Dataverse-Konnektor
  (`ListRecordsWithOrganization` mit expliziter Org-URL); Sharing-Daten aus
  `principalobjectaccess` per FetchXML. **Reads** laufen cross-env als
  Konnektor-Identität, **schreibende** Operate-Aktionen (Trace-Level,
  Job-Cancel/-Retry, Core-Role-Anlage) nur gegen die **Host-Umgebung** und als
  angemeldeter Benutzer.
- **Rollen-Gate:** die in den Workbench Settings konfigurierte
  Deployment-Manager-Rolle (direkte Zuweisung) schaltet Validate +
  Merge Rules frei.

---

*Diese Seite spiegelt den aktuellen Funktionsstand wider. Bei Feature-Änderungen
bitte zusammen mit den In-App-Texten (How-To / Help) und der README aktuell
halten.*
