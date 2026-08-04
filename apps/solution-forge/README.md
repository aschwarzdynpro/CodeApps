# Solution Administration Console

Power Apps **Code App** zum Verwalten von Dataverse-Solutions während der
Feature- und Bug-Entwicklung: Working Solutions anlegen, Komponenten
einsehen, Feature-/Bug-Solutions in eine Deployment Solution mergen,
Release Notes und Timeline pflegen, Releases prüfen (**Deployment
Readiness** vor dem Import, **Analyze** mit Compare / Layer Inspector /
App Sharing danach), Konfigurations-Cockpits (Env Config, Audit Config,
Dual-Write Maps, Import History, User Settings, Process- &
Plugin-Comparer, Plugin Traces), ein **OData Browser** zum freien Durchsehen
der Datenbank je Umgebung — plus der **Configuration Data Transfer
Hub**, der Konfigurationsdaten über mitinstallierte Executor-Cloud-Flows
zwischen Umgebungen transportiert.

## Konzept

Eine **Working Solution** besteht aus zwei Teilen:

1. **Darstellungs-Schicht**: ein Datensatz der Tabelle
   `pro_workingsolution` mit Titel (`pro_name`), dediziertem
   DevOps-ID-Feld (`pro_devopsid`), Typ (`pro_type_opt`: Feature / Bug /
   Release), Owner, Deployment-Status (`pro_deploymentstatus`) und
   Merge-Log-Feldern (`pro_mergeintodeploymentsolution`,
   `pro_lastmergeintodeploymentsolution`).
2. **Echte Solution**: die unmanaged Dataverse-Solution mit den
   Komponenten, verlinkt über `pro_uniquesolutionname`.

Beim Anlegen erzeugt die App beides; der Unique Name folgt weiterhin der
Konvention (`feature_<id>` / `bug_<id>` / `deploy_<name>`). Unmanaged
Solutions **ohne** Darstellungs-Datensatz erscheinen weiterhin in der
Liste (Klassifizierung über die Namenskonvention, sonst „Other").
Findet sich zur Row keine echte Solution, wird das im Detail markiert
(Komponenten/Merge/Compare sind dann deaktiviert).

Nach einem Merge setzt die App auf den Quell-Datensätzen automatisch
`pro_mergeintodeploymentsolution`, den Zeitstempel und den
Deployment-Status „Merged into Deployment Solution". Zusätzlich wird je
Merge eine **Historien-Zeile** in der Tabelle `pro_mergerun` geschrieben
(Counts, Quell-Solutions und die hinzugefügten Komponenten als kompaktes
JSON in einer Multiline-Spalte — keine Kind-Tabelle). Im Detail einer
Release-Solution erscheint sie als **Merge-Historie**-Tabelle; ein Klick auf
eine Zeile öffnet ein Overlay mit den hinzugefügten Komponenten gruppiert
nach Typ.

## Features

- **Self-Provisioning Wizard** (Reference › **Environment Setup**): geführtes
  Erst-Setup für eine neue Umgebung. Startet die App ohne Konfiguration, blendet
  der Wizard **hart blockierend** vor und legt die nötigen **Datensätze** an
  (`pro_workbenchsettings` + je Umgebung `pro_environmentconfig`) — die Tabellen
  selbst kommen aus der Managed Solution / `installer/provision-model.ps1`. Er
  unterstützt den Anwender maximal: bietet die per Konnektor **erreichbaren
  Environments** zur Auswahl (`GetOrganizations`), füllt die Environment-ID der
  aktuellen Umgebung automatisch, schlägt Publisher (`getDefaultPublisher`) und
  Deployment-Manager-Rolle vor und macht ADO/Flow-Definition optional. Pflicht:
  Environments, Publisher, Rolle; alles andere überspringbar. Speichern ist ein
  **idempotenter Upsert** (kein Duplikat bei Re-Run), lädt die Config live nach
  (kein Reload) und dieselbe Ansicht dient im Edit-Modus zum Nachpflegen.
- **Navigation**: linke Sidebar, gruppiert in **Manage** (Workbench, Merge,
  Merge Rules, Release Notes, Timeline, Data Transfer), **Validate**
  (Deployment Readiness, Analyze, Env Config, Audit Config, Dual-Write Maps,
  Import History, User Settings, Process Comparer, Plugin Comparer,
  Role Comparer),
  **Operate** (Plugin Traces, OData Browser, Role Analyzer) und **Reference**
  (Links, Environment Setup). Die Gruppen sind **aufklappbar und es ist immer
  genau eine offen** — 21 Einträge passen sonst nicht auf einen
  Notebook-Bildschirm. Welche offen ist, folgt automatisch dem aktiven
  Menüpunkt (auch bei Sprüngen aus der ActivityBar); ein Klick auf einen
  Gruppen-Header schaut in eine andere Gruppe hinein, ein Klick auf einen
  Eintrag lässt die Auswahl wieder dem aktiven Punkt folgen. Zugeklappte
  Gruppen zeigen die Anzahl ihrer Einträge. Im **Icon-Modus** (☰) sind alle
  Einträge sichtbar — dort gibt es keine Header zum Aufklappen.
  Gated-Einträge
  (Schloss) brauchen die Rolle **„INT | Deployment Manager"**; Workbench,
  Merge, Release Notes, Timeline, Plugin Traces und Links stehen allen
  offen. Compare, Layer Inspector und App Sharing sind Tabs **innerhalb von
  Analyze**; die Release-Solution wird dort einmal oben gewählt und über die
  Checks geteilt. (**Dual-Write Maps** erscheint nur, wenn Dual-Write in der
  Umgebung installiert ist — Metadaten-Probe beim Start.)
- **Analyze (Solution Analysis)**: Dashboard-Überblick für eine Release-Solution.
  Ein Klick auf **Run Analysis** lässt Dependencies, Compare (inkl. Content
  Drift), Layers und App Sharing in einem Durchlauf gegen das Ziel-Env (UAT/PROD)
  laufen und verdichtet das Ergebnis zu: einem **Deployment Risk Score** (0–100,
  Gauge + Low/Medium/High-Risk-Band), Severity-Karten (Critical/High/Medium/Low),
  einer **Key-Issues**-Tabelle, einer **Komponenten-Übersicht** nach Typ,
  abgeleiteten **Recommendations** und einer **Environment-Readiness**-Matrix
  (Kompatibilität je Bereich + Gesamt-Readiness in %). At-a-glance-Ergänzung zu
  den fokussierten Einzel-Tabs; nutzt denselben Orchestrator wie der ALM
  Detective (`runInvestigation`) plus eine reine Ableitungs-Schicht
  (`analysisModel.ts`) — kein eigener Datenpfad, Mock-Fallback inklusive.
- **Env Config** (Validate, gated) — **Environment Variable & Connection
  Reference Cockpit**: `environmentvariabledefinition` + `environment
  variablevalue` und `connectionreference` über **alle konfigurierten
  Umgebungen** (DEV/UAT/PROD) side-by-side, gematcht über den import-stabilen
  Schema-/Logical-Name. Flaggt die typischen Deploy-Lücken: **kein Wert** (und
  kein Default) in einer Umgebung, **ungebundene** Connection Reference und
  **Transport-Lücken** (Setting in einem Env vorhanden, im anderen nicht).
  Secrets werden maskiert, Default-Fallback markiert. Read-only über den
  Konnektor je Umgebung; Mock-Fallback mit eingebauten Beispiel-Lücken.
  **Bedienung:** Suchfeld (filtert beide Sektionen nach Namen), zwei
  **ein-/ausklappbare** Sektionen (zugeklappt by default, nach Anzeigename
  sortiert) und **klickbare Counter-Chips** als Filter (z. B. „4 env vars ohne
  Wert" → zeigt genau diese Zeilen). Das geladene Bild wird **für die Session
  gecacht** (kein Re-Fetch bei jedem Tab-Wechsel; Refresh + „Updated"-Zeit).
  Ein **Release-Solution-Filter** beschränkt das Cockpit auf die Env Vars &
  Connection References, die Komponenten dieser Solution im Host-Env sind
  (`solutioncomponent`, Typen 380/381/10064); Wechsel/Reset löst Re-Fetch aus.
  Je Connection Reference zeigt ein **„N flows"-Counter-Chip**, wie viele Cloud
  Flows sie im Host-Env nutzen (aus `workflow.clientdata` geparst, lazy beim
  Aufklappen; 0 = verwaiste Referenz), **aufgeteilt in aktive/inaktive** Flows
  (`workflow.statecode`). **Klick auf die Referenz-Zeile** listet die Flows
  darunter, je mit **Deep-Link** in Power Automate
  (`flowDetailsUrl`/`workflowidunique`).
- **Audit Config** (Validate, gated) — **Audit-Konfiguration** einer
  wählbaren Umgebung: der Org-Master-Schalter (`organization.isauditenabled`)
  + Retention (`auditretentionperiodv2`) und je **Tabelle/Spalte**
  `IsAuditEnabled` aus den `EntityDefinitions`-Metadaten. Eine Tabelle
  auditiert nur **effektiv**, wenn Org-Auditing UND die Tabelle an sind — der
  Analyzer flaggt „configured but off" und weist darauf hin, wenn eine
  auditierte Tabelle keine markierte Spalte hat (nur Record-Shell). Spalten
  werden beim Aufklappen lazy geladen. Read-only über den Konnektor
  (Metadaten); Mock-Fallback. Synergie mit der Audit-Explorer-App im Monorepo.
- **Dual-Write Maps** (Validate, gated) — die **Custom (unmanaged) Dual-Write
  Table Maps** der Current Environment aus `msdyn_dualwriteentitymap` (jede
  gespeicherte Version = eigener Record ⇒ **Gruppierung nach Name, aktuelle =
  höchste Version**, plus Zähler älterer Versionen). Liste: Name, aktuelle
  Version, **Quell- → Zieltabelle mit Richtung** (aus dem Mapping der aktuellen
  Version — Env-Chips AX/CRM + Richtungspfeil ↔/→/←, `overallDirection`),
  geändert am. Die Mappings der aktuellen Versionen werden dafür in einer
  zweiten, gechunkten Query nachgeladen (nur die aktuellen, nicht alle
  Versions-Records). **Klick auf ein Mapping** öffnet
  ein Overlay, das die `msdyn_mapping`-Definition aufbereitet: je Leg
  Source ↔ Destination-Schema und eine **Field-Mapping-Tabelle** mit
  Sync-Richtung (↔ bidirektional / → to destination / ← to source),
  Value-Map-Transforms, Lookup-aufgelösten Zielen und einem Tag auf
  system-generierten (Integration-Key-)Feldern; Toggles „Hide system-generated"
  und „Show raw JSON", **Feld-Suchfeld** (filtert Quell-/Ziel-Feld und
  Lookup-Entity über alle Legs), Overlay auf **80vh** gedeckelt (Body
  scrollt). Der **Menüpunkt erscheint nur**, wenn
  `msdyn_dualwriteentitymap` in der Umgebung existiert (EntityDefinitions-
  Probe, Session-Cache, fail-open). Parser = pure function mit Vitest.
  Read-only über den Konnektor (FetchXML, SP); Session-Cache; Mock-Fallback.
- **Import History** (Validate, gated) — **Solution-Import-Historie** einer
  wählbaren Umgebung aus der `importjob`-Tabelle: Start, Solution, Status
  (Succeeded/Failed/Running), Fortschritts-Balken, Dauer, **Publisher** (aus
  der importierten Solution aufgelöst — der Import-User ist meist der System-
  Account und nicht aussagekräftig), Kontext. Toolbar (Suche, Release-Picker,
  Status-Chips, Counter, Refresh) in einer Zeile. Zeile aufklappen lädt das
  Import-Log-XML (`importjob.data`) lazy
  und parst es strukturiert: Manifest-Verdict (UniqueName/Version/Fehlertext)
  und — der Kern — **Missing-Dependency-Fehler als präzise Tabelle**
  (`<MissingDependencies>`-Knoten): links die im Ziel **fehlende** Komponente
  (Typ, Name, Herkunfts-Solution = „install first"), rechts die importierte
  Komponente, die sie **braucht** (Typ, Name, Parent). Sonstige
  Failure/Warning-Results dedupliziert darunter. Das schwere XML wird nie in
  der Liste geladen; Parser ist eine pure function mit Tests. Die Liste ist auf
  die neuesten 100 begrenzt ⇒ **serverseitige Suche** (FetchXML): **Status-Chip**
  (z. B. Failed → die 100 neuesten fehlgeschlagenen Importe), **Solution-Namen-
  Suche** und ein **Picker über die Release-Solutions**.
- **User Settings** (Validate, gated) — per-Env-Inventar der **persönlichen
  Einstellungen** aller aktivierten User (`usersettings`): kompakte Liste
  (User, Login, Zeitzone, Währung, UI-Sprache; Suche/Sortierung, App-User
  ausblendbar), Env-Picker zum Quervergleich. **Klick auf einen User** öffnet
  den Detail-Dialog (General · Formats · Email · Privacy · Languages) mit
  **Live-Preview** der Formatfelder; Deployment Manager können **editieren +
  speichern** (Diff-Write, Confirm, PROD extra-stark) und per **„Copy to
  users…"** die angezeigten Einstellungen gruppenweise auf mehrere Ziel-User
  ausrollen (seriell, Progress + per-User-Ergebnis). Reads/Writes über den
  Konnektor (SP).
- **Process Comparer** (Validate, gated) — **alle Prozessarten** einer
  Release-Solution (Cloud Flows, klassische Workflows, Business Rules,
  Actions, Business Process Flows) als **Status-Matrix über die
  Umgebungen** (import-stabile ID-Matches, Drift-Highlight je Zelle,
  Prozessart-Icons, Gruppierung nach Typ oder konfigurierbarer **Area**).
  **Definition-Modus**: Soll-Zustand aus einer konfigurierbaren
  Definitionstabelle (Workbench Settings) → Drift = Ist ≠ Soll inkl. Host.
  Je Zelle **Owner-Anzeige**, **Turn on/off** (Confirm, PROD extra-stark)
  und ↗-Deeplink (Cloud Flows); **Bulk-Aktionen** über Zeilen-Checkboxen
  (Activate/Deactivate/Change owner, seriell mit Progress). Ergebnis und
  Lauf überleben Tab-Wechsel (Hintergrund-Balken).
- **Plugin Comparer** (Validate, gated) — dasselbe für die **Plugin-Steps**
  der Release-Solution, je mit **Assembly-Version** pro Umgebung;
  Enable/Disable je Zelle (Confirm, PROD extra-stark).
- **Role Comparer** (Validate, gated, lazy geladen) — „sind die
  Sicherheitsrollen heil angekommen?". **Scope zuerst:** standardmäßig nur
  **Custom-Rollen** (die ~250 managed OOB-Rollen sind ausgeblendet, Checkbox
  holt sie zurück); zusätzlich lässt sich oben eine **Release-Solution**
  wählen (`SolutionSelect` wie im Process Comparer), dann bleiben nur deren
  Rollen-Komponenten (componenttype 20) übrig. Eine Rolle, die in einer
  Umgebung managed und in einer anderen unmanaged ist, bleibt in jedem Fall
  sichtbar — das ist ein Befund, kein Rauschen. Darunter die Rollen über
  **alle konfigurierten Umgebungen** als Matrix; je Zelle die Privilegienzahl,
  managed/unmanaged und — wo vorhanden — **wie viele Privilegien diese
  Umgebung anders vergibt** als die Baseline (Baseline = Host, sonst die erste
  Umgebung, die die Rolle hat; die Baseline-Zelle selbst zeigt keine Zahl).
  **Match über den Namen**, nicht über die
  ID — eine Rollen-GUID überlebt nur sauberen Solution-Transport (Gotcha #7);
  Name gleich + ID verschieden ⇒ Badge **„rebuilt"** (von Hand nachgebaut
  statt transportiert; sieht heute richtig aus, driftet morgen still und wird
  von keinem Import aktualisiert). Filter-Chips mit Counts: **privilege
  drift**, **missing / target-only**, **rebuilt**, **managed state**. Klick
  auf eine Zeile öffnet den **Drilldown**: jede Tabelle × Aktion, die die
  Rolle irgendwo gewährt, mit der Tiefe je Umgebung (U/BU/P/O), Schalter „nur
  Unterschiede", darunter die Misc-Privilegien. Eine **nicht lesbare
  Umgebung** zeigt „?" und fließt in **keinen** Befund ein — sie wird nie als
  „identisch" gewertet. **Read-only mit Absicht:** eine driftende Rolle
  gehört transportiert; sie im Ziel zu editieren erzeugt genau den unmanaged
  Layer, den der Layer Inspector anschließend meldet.
  **Baseline-Modus:** „❄ Freeze current state" (Deployment Manager) friert die
  Rollen im aktuellen Scope als benannten Snapshot ein (`pro_securitysnapshot`,
  nativ als angemeldeter User gespeichert, `createdby` = „frozen by").
  Schaltet man „Compare against" von *Live state* auf einen Snapshot um, ändert
  sich die Frage von „stimmen die Umgebungen überein?" zu **„was hat sich seit
  dem Einfrieren geändert?"** — jede Umgebung wird gegen **ihr eigenes**
  eingefrorenes Ich geprüft. Zeilen tragen dann **changed / new / gone since
  freeze**, die Zelle zählt die seither geänderten Privilegien. Eine vom
  Baseline nicht erfasste Umgebung erscheint als „not in baseline", nie als
  unverändert. Der Payload liegt als kompaktes JSON in einer Spalte; passt er
  nicht, wird das Einfrieren **abgelehnt** (mit Hinweis, den Scope zu
  verkleinern) statt gekürzt zu speichern.
  **Sub-Tab „Document":** rendert einen eingefrorenen Baseline als
  **Security-Konzept-Dokument** — Umgebungs-Übersicht, je Rolle die
  Privilegien-Matrix der Referenz-Umgebung (Host), Misc-Privilegien und ein
  Hinweis, welche Umgebung wie stark abweicht. Wählt man einen **zweiten
  Baseline**, steht davor das Kapitel **„Changes since …"**: hinzugekommene und
  entfernte Rollen sowie je Umgebung jedes verschobene Privileg mit alter und
  neuer Tiefe — der Audit-Nachweis. Markdown/Raw, Copy, Download. Es wird
  **nichts gespeichert**; das Dokument ist jederzeit aus dem Snapshot
  reproduzierbar. **Die dokumentierten Umgebungen sind per Chips wählbar** —
  die erste verbliebene ist die Referenz, deren Matrix gedruckt wird; die
  Auswahl greift überall (Rollen, die nur in einer abgewählten Umgebung
  existieren, fallen raus, und das Änderungs-Kapitel meldet keine Änderungen
  aus abgewählten Umgebungen). Das Dokument benennt selbst, was ein Baseline
  **nicht** abdeckt (BU-Baum, Teams, Field Security, Audit-Konfig) **und
  welche Umgebungen bewusst ausgelassen wurden**, damit „fehlt" nicht als
  „unauffällig" gelesen wird.
  **Der Scope entscheidet, was geladen wird:** der Vergleich läuft zweiphasig
  — erst je Umgebung die billige Rollenliste, dann der teure Privilegien-Sweep
  **nur für die Rollen im Scope** (bei 286 Rollen, von denen wenige custom
  sind, spart das den Großteil der Abfragen; der Assignment-Graph aus
  User/Teams/BUs wird gar nicht erst geladen). Ändert man den Scope nach einem
  Lauf, weist ein Hinweis darauf hin, dass neu verglichen werden muss — die
  übrigen Rollen sind nicht geladen. Kein eigener Datenpfad
  — orchestriert `roleAnalyzerService.loadModel` je Umgebung (Muster ALM
  Detective) und nutzt dessen ~15-Minuten-Cache; die Logik liegt in der pure
  function `utils/roleCompare.ts` (Vitest).
- **Timeline** (Manage) — **Release-Timeline**: „was ging wann wohin" für
  eine gewählte Release-Solution als vertikaler Zeitstrahl (neueste zuerst):
  **Merge-Runs** (`pro_mergerun`, mit Counts + Quell-Solutions),
  **veröffentlichte Release Notes** (`pro_releasenote`, mit Version) und
  **Importe** (`importjob` je konfigurierter Umgebung, Match über den
  Unique Name; Env-Badge grün/blau/rot nach Succeeded/Running/Failed).
  Filter-Chips je Event-Art mit Counts; Umgebungen, die nicht lesbar sind,
  degradieren zu einem Hinweis statt die Timeline zu blocken. Reine
  Visualisierung vorhandener Daten (Builder `buildReleaseTimeline` als pure
  function mit Tests) — kein neuer Datenpfad.
- **Data Transfer** (Manage, gated) — **Configuration Data Transfer Hub**:
  deklarative **Transfer-Pakete** für Konfigurationsdaten, ausgeführt von
  **mitinstallierten Cloud Flows** (Executor Parent+Child + Scheduler,
  `installer/deploy-executor-flow.ps1`) — nie in der App-Session selbst.
  Paket = Name + Ziel-Umgebungen (Multi-Select aus der Env-Registry) +
  Reihenfolge; Eintrag = Quell-Umgebung → Quell-Tabelle (durchsuchbarer
  Metadaten-Picker) → Filter & Spalten per **System-View** oder **FetchXML**
  (pretty-printed im Editor, Validierung, durchsuchbarer Spalten-Picker,
  **Daten-Preview** + aktualisierbare Row-Count-Spalte; Zeilen-Klick öffnet
  den Editor, der Query-Zellen-Tooltip zeigt das ausführbare Fetch), dazu
  **Record-Matching** (GUID-Upsert oder fachliche Match-Spalten, max. 5)
  und **Orphan-Handling** (Ignore/Deactivate/Delete — Scope ist beidseitig
  die Query des Eintrags: nur Zielzeilen, die die Query zurückgibt, können
  Orphans werden). Views werden als **FetchXML-Snapshot** gespeichert
  (self-contained, „⟳" re-snapshottet). **▶ Run** bietet zwei Achsen:
  **✍ Transfer | 🧪 Dry run** (Simulation — der Executor partitioniert, zählt
  und loggt, schreibt aber nichts; das Log zeigt, was passiert *wäre*,
  Summary-Präfix „DRY RUN — would be:") und **Run now** (Queued,
  Webhook-Executor startet in Sekunden) | **Run later** über den eingebauten
  Datums-Picker (Scheduled; Scheduler-Flow promotet fällige Runs).
  Zusätzlich kann ein Paket **automatisch wiederkehren** (Zeitplan
  **Daily/Weekly** im Paket-Dialog, erster Termin per Picker; Uhrzeit und
  Wochentag stecken im Termin) — der Scheduler queued fällige Pakete und
  schreibt den nächsten Termin fort, ohne verpasste Läufe nachzuholen.
  Während ein Run Queued/Running ist, ist die Paket-Konfiguration
  **gesperrt**. Die Runs-Karte zeigt Status (inkl. 🧪-Marker für
  Simulationen), Zeiten, eine live tickende **Duration**-Spalte und die
  Summary; das Ergebnis-Log füllt sich **live während der Ausführung**
  (Klick → strukturiertes Subgrid je Entry × Target). **Zeilen-Limit:** ein
  FetchXML-Read über den Konnektor liefert max. 5000 Zeilen; erreicht Quelle
  oder Ziel diese Grenze, schreibt der Executor **gar nichts** und meldet den
  Cap als Fehler (ein abgeschnittenes Set würde sonst Orphans erfinden und
  im Delete-Modus Zielzeilen löschen). Persistenz in
  `pro_transferpackage`/`pro_transferentry`/`pro_transferrun` (Host, native
  Writes als User); Quell-Env-Reads über den Konnektor. Contract + Executor-
  Interna: `docs/transfer-hub-contract.md`.
- **Links** (Reference) — statische **Linksammlung** der ständig gebrauchten
  URLs als **Matrix** (eine Zeile je Link-Art, **je Umgebung eine Spalte**):
  System-App, OData/Web API, Diagnostics, classic Advanced Settings / Rollen /
  Systemaufträge, Maker & Power Automate und die Power-Platform-Admin-Seiten
  (Hub/Settings/Backup) — plus ein **globaler** Block (Admin Center, Capacity,
  Release Planner, Service Health). Alles rein
  aus der Env-Konfiguration abgeleitet: **kein Datenpfad, kein Connector, kein
  Gating**; Links öffnen in neuem Tab, Copy-Button je Zeile. Ein paar
  Admin-Center-Deeplinks sind best-effort (SPA-Slugs) und so gekennzeichnet.
  Builder `utils/envLinks.ts` als pure function mit Tests.
- **App-Shell** (Dynamics-365-Stil): durchgehende **dunkle Topbar** mit
  Brand-Lockup links und Utility-Cluster rechts (Lauf-Modus-Badge —
  „Connected" / „Demo data" aus `usePower().mode` —, How-To & Help als Icons),
  darunter eine **full-height-Sidebar** (sticky) plus full-width-Content.
- **In-App-Anleitungen**: in der Topbar rechts **How-To** (Onboarding-Walk-
  through für neue Kollegen — Solutions anlegen, was dabei passiert, mergen und
  was dahintersteckt; `HowToPanel`) und **Help** (Feature-Referenz pro Tab;
  `HelpPanel`), beide als Overlay.
- **Kollisions-Radar**: „Scan collisions" lädt die Komponenten der **offenen**
  getrackten Working Solutions (ohne Releases) und markiert Komponenten,
  die in **mehr als einer** offenen Working Solution stecken — wer zuletzt
  deployt, überschreibt. Betroffene Solutions bekommen einen ⚠-Chip; die
  Detail-Ansicht listet die geteilten Komponenten und mit wem.
- **Workbench**: Liste aller Working Solutions mit Typ-Filter (Feature /
  Bug / Deployment), Suche über Titel, Unique Name und ADO-ID. Mit dem
  Schalter **incl. components** durchsucht die Suche zusätzlich die
  Komponenten-Anzeigenamen der **offenen** Working Solutions („welche
  enthalten ‚SST | Monteur'?") — dafür wird beim Aktivieren einmalig ein
  Komponenten-Index über die offenen Working Solutions aufgebaut; Treffer
  werden als Chips an der Solution angezeigt. Beide Funktionen sind damit auf
  den aktiven Satz beschränkt (nicht alle Solutions der Umgebung).
- **Anlegen**: Dialog mit Typ, ADO-ID, Titel, Beschreibung, Publisher und
  Live-Preview des Unique Name inkl. Duplikat-Prüfung. Die Solution wird
  real in Dataverse erzeugt und ist sofort im Maker-Portal sichtbar.
- **Detail**: Klick auf eine Zeile blendet die Details **inline direkt unter
  dem Eintrag** ein (Fade-in); erneuter Klick auf dieselbe Zeile blendet sie
  wieder aus — so bleibt die Tabelle über die volle Breite. **Command Bar**
  mit den Aktionen (Open in Maker Portal links,
  Mark completed / Delete als Icons rechts), Metadaten, Komponenten der
  Solution gruppiert nach Typ in aufklappbaren Gruppen (Anzeigenamen via
  `msdyn_solutioncomponentsummary`, derselben Quelle wie im Maker-Portal),
  Deep-Link **Open in Maker Portal** (Environment-ID kommt zur Laufzeit aus dem
  Host-Kontext) sowie ein Azure-DevOps-Link zum Work Item.
- **„To be completed"-Check**: Beim Laden wird je offener Working Solution der
  synchronisierte DevOps-Work-Item-Status (`pro_devopsworkitemstatus`) geprüft;
  ist er *Closed/Done*, wird der Eintrag in der Liste als **„to be completed"**
  markiert und die Mark-completed-Aktion hervorgehoben (abgeleitetes Flag,
  nicht persistiert).
- **Sync with DevOps**: Button in der Workbench-Toolbar ruft den Cloud Flow
  *PA | MANUAL | Working Solution | Sync DevOps Work Item Status* auf (Power-
  Apps-Trigger, via `power-apps add-flow` generierter Service → `shared_logic-
  flows`). Während der Laufzeit eine In-Progress-Anzeige; nach Abschluss
  `reload()`, sodass der „to be completed"-Abgleich gegen die frisch
  synchronisierten Status neu rechnet.
- **Offen/Geschlossen**: Der **Open-Filter** richtet sich nach dem `statecode`
  des Working-Solution-Records (0 = offen, 1 = geschlossen) — der
  Deployment-Status (z. B. „Merged into Deployment Solution") spielt dafür
  **keine** Rolle. Inaktive Records werden mitgeladen und nur vom Open-Toggle
  ausgeblendet.
- **Owner zuweisen**: In der Detail-Ansicht eines getrackten Eintrags
  reassignt **👤 Assign** den Record-Owner — „Assign to me" oder per
  Namenssuche einen User wählen (`assignOwner` setzt `ownerid@odata.bind`;
  `searchUsers` über `SystemusersService`).
- **Mark completed**: aktive getrackte Einträge auf
  `pro_deploymentstatus = Deployment completed` (500870003) setzen **und den
  Record schließen** (`statecode` 1) — beides in einem Update, damit der
  Eintrag auch tatsächlich aus dem „Open"-Filter verschwindet (der liest den
  statecode, nicht das Label). Im Dialog wird gefragt, ob die unterliegende
  Solution gelöscht werden soll; falls ja, läuft das (wie beim Delete) über das
  3-Sekunden-Undo — Statuswechsel und Solution-Delete werden erst nach Ablauf
  committed, Undo lässt beides aus.
- **Reopen** (↺, nur bei geschlossenen Einträgen sichtbar): macht das
  rückgängig — `statecode` zurück auf 0 und das Status-Label auf „None", der
  Eintrag taucht wieder unter „Open" auf.
- **Löschen mit Undo**: Eintrag entfernen (Record, Solution oder beides) mit
  3-Sekunden-Restore-Fenster, bevor der harte Delete läuft.
- **Merge**: Deployment Solution als Ziel wählen, Feature-/Bug-Solutions
  ankreuzen, Komponenten-Plan prüfen (Konflikte markiert, Duplikate werden
  übersprungen) und mergen (`AddSolutionComponent` je Komponente).
- **Merge-Regeln je Release** (optional): zwei Multi-Select-Choices am
  Release-Record (Optionswerte = `componenttype`-Codes) — **Allow-Liste**
  `pro_allowedmergetypes` (leer = alle) und **Exclude-Liste**
  `pro_excludedmergetypes`. Mergebar ist ein Typ, wenn (Allow leer ODER drin)
  UND nicht in Exclude. Verwaltet im eigenen **Merge-Rules**-Tab
  (Deployment-Manager-gated, Allow-/Exclude-Chips je Release); die
  Workbench-Detailansicht zeigt nur eine **Read-only-Übersicht**. Blockierte
  Komponenten werden im Plan ausgegraut und beim Merge als „excluded by merge
  rules" gezählt. Das App-Array `MERGEABLE_COMPONENT_TYPES` spiegelt die
  Choice-Optionen.
- **Release Notes**: Eigener Menüpunkt; je **Release-Solution** werden aus der
  **Merge-Historie** Release Notes generiert — enthaltene Quell-Solutions (mit
  DevOps-`#`-Link, wenn der Titel eindeutig auflösbar ist) und alle
  hinzugefügten Komponenten nach Typ (App Elements als Counter). Umschalter
  **Markdown | Raw** + Copy. **Publish** friert den aktuellen Draft als
  versionierten Snapshot ein (Tabelle `pro_releasenote`, beide Formate
  gespeichert) — nur Deployment Manager; Anzeigen/Kopieren offen.
  **Inkrementell:** nach dem ersten Publish listet der Draft nur noch, was
  **seit der letzten veröffentlichten Release Note** gemergt wurde (Cutoff =
  `createdon` der letzten Note; nichts Neues ⇒ Publish deaktiviert).
  **History**-Tab listet alle veröffentlichten Stände (Datum · Autor · Summary)
  zum Wiederabruf.
- **Compare** (Tab in Analyze): Release-Solution wählen → Cloud Flows, Workflows,
  Business Rules, Plugin Steps und Scripts werden über **DEV / UAT / PROD**
  verglichen, gruppiert nach Typ in aufklappbaren Sektionen. Abweichungen
  sind markiert und filterbar: *Missing* (nicht im Ziel) und *Status drift*
  (z. B. Flow Draft in PROD, Plugin Step deaktiviert). Cross-Env-Zugriff
  über den Microsoft-Dataverse-Konnektor (`ListRecordsWithOrganization`,
  läuft mit den Rechten des angemeldeten Benutzers in der jeweiligen
  Umgebung). Umgebungen aktuell hart in `config.ts` (`ENVIRONMENTS`).
  Hinweis: `modifiedon` wird bewusst nicht als Drift-Signal gewertet
  (Solution-Import überschreibt es). **Unmanaged Layer, die Existenz aller
  übrigen Komponenten-Typen und der Definitions-Diff** sind in den
  **Layer Inspector** gewandert.
- **Deployment Readiness (Dependency Check)**: Release-Solution gegen UAT/PROD prüfen
  (`RetrieveMissingDependencies`) — listet benötigte Komponenten, die weder
  in der Solution noch im Ziel vorhanden sind (Import würde scheitern),
  inkl. **Add to Solution** je fehlender Komponente. Name-gematchte Typen
  (EnvVars, Connection References, Web Resources, Canvas Apps) zählen als
  vorhanden, wenn das Ziel sie unter gleichem Namen kennt.
- **Layer Inspector** (Tab in Analyze): **alle** Komponenten einer Release-Solution gegen die
  Layer-Stacks im Ziel-Env (UAT/PROD) prüfen (virtuelle Tabelle
  `msdyn_componentlayer`, eine Abfrage pro Komponente). Verdict je Komponente:
  **unmanaged „Active"-Layer über managed** (direkte Customization, maskiert
  Deployments), **unmanaged-only**, **Missing** (= Existenz-Check: zeigt, ob
  Plugin Assemblies, Custom APIs etc. überhaupt deployed sind) oder *clean*.
  **Environment Variables (380/381) und Connection References (10064) werden
  übersprungen** — sie tragen per Definition einen Active-Layer (Wert bzw.
  Connection) und wären sonst nur False Positives (`LAYER_IGNORED_TYPES`).
  Ergebnisse erscheinen **pro Komponententyp, sobald die Sektion fertig ist**
  (Rest lädt im Hintergrund); Sektionen sind aufklappbar. Zwei Filter-Chips
  über der Liste (**Missing** / **Unmanaged layer**) blenden die Ergebnisse
  auf die jeweilige Kategorie ein. Für diffbare Typen
  (Flows/Workflows/Business Rules/Scripts) ein **⇄ diff DEV vs. Ziel**
  (Side-by-side). Klassische Typnamen statisch gemappt, solution-aware Typen
  dynamisch aus `solutioncomponentdefinition`; Typen ohne Layer-Daten bleiben
  „No layer data". Zeilen mit unmanaged Layer
  bekommen einen Absprung ins Maker-Portal des Ziel-Environments: für
  Tabellen, Canvas Apps, Custom Pages, Cloud Flows, Workflows/BPF/Actions,
  Web Resources, Plugin Assemblies, Plugin Steps und Custom APIs (inkl.
  Request-/Response-Parameter) direkt auf die **solution layers**-Seite der
  Komponente (**↗ layers in {env}**), sonst auf die Solution
  (**↗ solution in {env}**) →
  Komponente wählen → „Advanced → See solution layers". Die Ziel-Env-Solution-
  ID wird per `uniquename` aufgelöst (IDs divergieren je Env); die Maker-Route
  je Typ baut `config.makerLayerPath` (Canvas App vs. Custom Page über
  `canvasapptype`, Cloud Flow vs. Process über Workflow-`category` — dafür je
  ein Bulk-Lookup auf `canvasapps`/`workflows`). Entity-Sub-Komponenten
  (Forms/Views/Columns/Business Rules) brauchen die Tabellen-ID in der Route
  und fallen vorerst auf die Solution-Objektliste zurück, ebenso ungemappte
  Typen. Das Entfernen passiert bewusst im Portal, nicht in der App (nicht
  umkehrbar). Eine in-app-Variante über `BulkRemoveActiveCustomizations` wäre
  technisch möglich, liefert aber keinen Erfolgs-Payload und ist destruktiv
  cross-env (`RemoveActiveCustomizations` ist im Web API gar nicht erreichbar —
  nur SOAP); Details in CLAUDE.md gotcha #8.
- **App Sharing** (Tab in Analyze): Canvas Apps und Custom Pages einer Solution daraufhin
  prüfen, mit wem sie in DEV/UAT/PROD geteilt sind. Solution-Import
  überträgt **kein** User-Sharing — eine deployte Canvas App erreicht
  niemanden, bis sie im Ziel geteilt wird; genau diese Lücke wird oben
  hervorgehoben. Cross-Env-Match über den import-stabilen `canvasapp.name`;
  die Prinzipale kommen aus der Sharing-Tabelle `principalobjectaccess`
  (per FetchXML über `ListRecordsWithOrganization`, gefiltert auf
  `objectid`), je Umgebung über den bereits verdrahteten Konnektor — keine
  neue Data Source. (Der direkte Weg `RetrieveSharedPrincipalsAndAccess`
  scheidet aus: der Konnektor kann nur POST-Actions cross-env aufrufen,
  keine GET-Functions.) Custom Pages (`canvasapptype 2`) erhalten Zugriff
  über die Rollen der modellgetriebenen App, nicht über direktes Sharing —
  „nicht geteilt" ist dort normal.
- **ALM Detective** *(derzeit aus dem Menü ausgeblendet — Code/Service bleiben
  für die Reaktivierung erhalten)*: Pre-Deployment-Audit, das die ausgewählten ALM-Checks
  (Dependency Check, Compare inkl. Content Drift, Layer Inspector, App
  Sharing) phasenweise gegen eine Release-Solution laufen lässt und die
  Ergebnisse zu **einem nach Kritikalität sortierten Bericht** bündelt.
  Ein Phasen-Stepper zeigt den Fortschritt je Check; Findings sind nach
  Severity gruppiert/filterbar (Critical: fehlende Dependency; High:
  unmanaged Layer über managed Komponente, Canvas App nicht geteilt;
  Medium: Status-/Content-Drift; Low: Missing in Target, unmanaged-only,
  Lookup-Fehler). Kompakter als die Einzelseiten — für die volle Tiefe den
  jeweiligen Feature-Tab öffnen. Der Detective orchestriert nur die
  vorhandenen Services (kein eigener Datenpfad).
- **Operate-Gruppe** (Betriebssicht; im Menü **Plugin Traces**,
  **OData Browser** und **Role Analyzer**). Der **Role Analyzer ist seit dem
  2026-08-04 wieder angeschlossen** — als Fundament der Security-Konzept-
  Features — und wird als einziger Workspace **bei Bedarf nachgeladen**
  (`React.lazy`, eigener Chunk ~62 kB / 18 kB gzip). Damit ist er zurück, ohne
  den Erststart zu belasten. Er war zugleich die Live-Probe, ob der
  Code-Apps-Player zur Laufzeit geholte Chunks ausliefert — **sie ist am
  2026-08-04 an INT-11 geglückt**, womit Lazy-Loading für die übrigen
  Workspaces freigegeben ist (siehe Roadmap). Scheitert ein Nachladen doch
  einmal, zeigt `LazyWorkspace` eine erklärende Meldung statt eines weißen
  Bildschirms.
  **Der Job Monitor bleibt abgeklemmt** (kein Import, kein Render-Block) — er
  gehört nicht zum Security-Konzept; sein Code liegt unverändert im Repo
  (`JobMonitor.tsx` + `jobMonitorService`-Trio + `utils/heartbeat.ts`, weiter
  Vitest-getestet), der Wiederanschluss steht als Kommentar an der
  `Operate`-Gruppe in `App.tsx`. Der Job-Monitor-Abschnitt unten ist daher
  **Doku für den Wiederanschluss**, nicht für den aktuellen Funktionsumfang. **Zielumgebung wählbar:** oben sitzt ein **Target-Environment-
  Picker**, der aus dem konfigurierten `ENVIRONMENTS`-Set wählt (dev/uat/prod
  bzw. was der Installer nach `pro_environmentconfig` schreibt) — Default ist
  die Host-Umgebung. **Reads laufen cross-env** über den Konnektor; **native
  Writes** (Trace-Level-Switch, Job-Cancel/Retry) treffen technisch nur die
  Host-Umgebung, daher sind sie bei ausgewählter Fremdumgebung deaktiviert
  (mit „read-only here"-Hinweis).
  - **🧵 Plugin Traces** — Explorer über `plugintracelog`: Polling-**Stream**
    (15 s, pausiert bei verstecktem Browser-Tab) mit Server-Filtern
    (Zeitfenster, TypeName, Message, Entity, sync/async, nur Exceptions,
    Opt-in-Volltext ≤ 24 h); Zeile aufklappen lädt den **MessageBlock** lazy
    (Suche-im-Text, Copy) — im Stream wird das schwere Payload nie geladen.
    **⛓ Chain** öffnet die **Correlation-Timeline** (Einrückung nach `depth`,
    Balken ∝ Duration). **Performance**-Sub-Tab: serverseitige
    Duration-Aggregate je Plugin × Message (count/avg/p95≈/max), Klick →
    vorgefilterter Stream. **Trace-Level**-Steuerung
    (`organization.plugintracelogsetting`, 0/1/2) mit Confirm-Warnung bei
    „All" — Umschalten nur für Deployment Manager, läuft als angemeldeter
    User (natives `organization`-Update).
  - **🗄️ OData Browser** *(gated)* — freies Durchsehen der Datenbank je
    Umgebung über die Dataverse Web API: Tabelle wählen (Liste + Suche aus
    `EntityDefinitions`, Systemtabellen zuschaltbar), Spalten per Picker
    (nicht selektierbare Spalten sind ausgegraut samt Grund — abgeleitet,
    virtuell, Datei/Bild; **Lookups werden automatisch als `_x_value`**
    gewählt), `$top` und Seitengröße setzen, **▶ Run**. Ergebnis als
    dichtes Grid mit **Sortierung per Spaltenkopf**, **Formatted values**
    (Choice-Labels, Lookup-Namen — umschaltbar auf die Rohwerte), Lookup-
    Zellen mit Zieltabellen-Chip, langen Werten im Overlay, **Load more**
    über den Paging-Cursor des Servers und **Copy URL** (echte
    `/api/data/v9.2/…`-URL). **Filter-Builder** mit typabhängigen Operatoren
    (contains nur auf Text, `LastXDays` nur auf Datum, „is the current user"
    nur auf Lookups), Choice-Werten als Label-Dropdown (aus `stringmap`) und
    verschachtelten and/or-Gruppen; **Mehrfach-Sortierung** (Header-Klick,
    Shift-Klick ergänzt); **∑ Count** über ein FetchXML-Aggregat (Dataverse
    deckelt bei 50 000). Die **Query-Zeile ist editierbar** und bidirektional
    an den Builder gekoppelt: was der Builder nicht modellieren kann (z. B.
    Lambdas `roles/any(...)`), bleibt **wörtlich stehen** und wird als
    „advanced filter" markiert statt umgeschrieben — Count schaltet sich dort
    ab, weil es einen Raw-Filter nicht nach FetchXML übersetzen kann.
    **⚠ Alle Reads laufen als Konnektor-SP**, nicht
    als angemeldeter User — die Ergebnisse ignorieren also bewusst die
    persönliche RLS/Field Security des Betrachters (deshalb gated, deshalb
    der Banner). Die Query-Zeile hat **IntelliSense** (Strg+Space erzwingt sie):
    Entity-Sets — auch über den Anzeigenamen, „Firma" findet `accounts` —,
    Spalten je Query-Option (Lookups automatisch als `_x_value`),
    Sortierrichtung, typrichtige Operatoren, Choice-Werte mit Label,
    `Microsoft.Dynamics.CRM.*`-Funktionen samt Signatur-Hinweis und
    Navigation Properties für `$expand`. Darunter **Prüf-Chips**
    (unbekannte Spalte, Lookup ohne `_value`, `$top`-Cap) — sie warnen, sie
    blockieren nicht, weil Metadaten veralten können.
    **Klick auf eine Zeile öffnet den Datensatz** (alle Spalten, ohne
    `$select` — das Panel soll zeigen, was wirklich gespeichert ist),
    gruppiert in Identity/Data/References/System. **Lookups sind überall
    klickbar** und führen zum Zielsatz, mit Zurück-Pfad; der Tab **Related**
    listet die 1:N-Beziehungen und springt per „Browse" in die Kindtabelle,
    vorgefiltert auf den Elternsatz — als **normale Query**, nicht per
    `$expand`, damit Paging, Filter und Sortierung erhalten bleiben. Tab
    **JSON** mit Copy. **Historie** (letzte 25 je Umgebung) und **gespeicherte
    Queries** mit Namen liegen pro Umgebung im Browser; **Export** als CSV
    (RFC 4180, UTF-8-BOM für Excel) oder JSON. Ein zweiter Reiter fährt
    **FetchXML** direkt (Tabelle aus `<entity name>`, eine Seite à max. 5000
    Zeilen — der Konnektor pagt dort nicht), und die **Metadaten-Sets**
    (`EntityDefinitions`, `GlobalOptionSetDefinitions`,
    `RelationshipDefinitions`) stehen im Tabellen-Picker, um das Schema selbst
    zu durchsuchen. **Read-only**; Details laut
    [`docs/odata-browser-plan.md`](docs/odata-browser-plan.md).
  - **📡 Job Monitor** *(aus der App entfernt — Code im Repo)* — „Ist die Async-Verarbeitung gesund?" in < 10 s:
    **Health**-Kacheln (Failed 24 h, Waiting-Backlog + älteste wartende Op,
    Flow-Fehlerquote als gekennzeichnetes Sample, Watchdog-Ampeln; jede
    Kachel klickt in ihren Detail-Tab), **System jobs**
    (`asyncoperation`-Explorer mit erzwungenem Zeitfenster, Status-Chips,
    Bulk-**Cancel/Retry** ≤ 50/Batch sequentiell mit Einzel-Ergebnis — nur
    Deployment Manager, schreibt als User), **Flows** (**alle** Cloud Flows
    ohne Limit, filterbar per Name und **Release-Solution** = deren
    Komponenten; gesampelte Fehlerquote; Runs je Flow in einem **Side Pane**,
    Klick auf einen Run öffnet ein **Popup mit dem vollständigen `flowrun`-Record**
    + Deep-Link „Open run"), **Watchdog**
    (Heartbeat-Soll/Ist je Definition, pure function `evaluateHeartbeat`,
    Tabellen konfigurierbar via `config.ts → WATCHDOG_TABLES`) und
    **Trends** (Failed-Jobs/Tag 7/30 d, serverseitige Aggregate).
  - **🛡 Role Analyzer** *(gated; wird bei Bedarf nachgeladen)* — arbeitet auf einem ~15 min gecachten
    Snapshot des Security-Modells, Rollen aggregiert auf `parentrootroleid`
    (BU-Kopien kollabieren): **Matrix** (Rolle × Tabelle × Privileg mit
    Depth-Badges U/BU/P/O), **Diff** (zwei Rollen, nur Deltas, Export
    Markdown/CSV), **User rights** (effektive Rechte aus direkten +
    Team-Rollen, tiefste Depth gewinnt, mit Herkunftspfad), **Reverse
    lookup** („Wer kann Delete auf account?" → User/Teams mit Pfad),
    **Hygiene** (Rollen ohne Zuweisung, User mit > N Rollen) und
    **Core roles** (schreibend, nur Host-Env): analysiert die
    **custom (unmanaged)** Rollen auf Privilegien, die in ≥ 2 Rollen
    vorkommen, und schlägt je geteiltem Rollen-Set eine konsolidierte
    **Core-Rolle** vor (tiefste Depth gewinnt). **Automatismus:** Rollenname
    + Working Solution wählen → das System legt die Rolle in der Solution an
    (`AddSolutionComponent`, Rollen-Komponententyp 20), gewährt die
    Privilegien (`AddPrivilegesRole`) und entfernt optional die Duplikate aus
    den Quell-Rollen (`RemovePrivilegeRole`; die betroffenen Rollen kommen
    dann ebenfalls in die Solution). Transparenter per-Step-Report; Mitglieder
    einer Quell-Rolle brauchen danach die Core-Rolle, um ihren Zugriff zu
    behalten. (Matrix/Diff/User rights/Reverse/Hygiene bleiben read-only; nur
    Core roles schreibt.) Der **Role DeDuplicator** (Entflechten doppelter
    Rechtezuordnungen) steht auf der Roadmap. **Team & BU map** (read-only):
    interaktives **Org-Chart** (Inline-SVG, Pan/Zoom, aufklappbar) der
    Business-Unit-Hierarchie mit den **Rollen-vergebenden Teams** je BU als
    Pills; Klick auf BU/Team öffnet ein Detail-Panel (Rollen, Mitglieder), ein
    **Trace-Modus** hebt für einen gewählten User seine BU + Teams hervor und
    listet die **per Team vererbten Rollen** (Toggle blendet Default-/Access-
    Teams ein). **Field security** (read-only): das Spalten-Level-Pendant zur
    Matrix — **Field Security Profiles** (`fieldsecurityprofile` +
    `fieldpermission`) mit gesicherten Spalten (Read/Create/Update/Unmasked)
    und Zuweisungen (User/Teams über `systemuserprofiles`/`teamprofiles`);
    umschaltbar auf eine **spaltenzentrierte** Sicht („wer darf Spalte X
    lesen/ändern?"). Flags: Profil ohne Prinzipale, Spalte ohne Read-Grant
    (nur Admins). *(System-Administratoren umgehen Field Security.)*

## Architektur

Die UI hängt nur am Interface `SolutionService` in
[`src/services/solutionService.ts`](src/services/solutionService.ts):

- `listSolutions()` – unmanaged Solutions (Tabelle `solution`), klassifiziert
  über die Unique-Name-Konvention (`src/utils/naming.ts`)
- `listPublishers()` – Publisher-Auswahl für den Anlage-Dialog
- `createWorkingSolution()` – legt die Solution in Dataverse an
  (`publisherid@odata.bind`)
- `listComponents(solutionId)` – Anzeigenamen aus der virtuellen Tabelle
  `msdyn_solutioncomponentsummary`, gejoint mit `solutioncomponent` für das
  `rootcomponentbehavior` (Fallback auf die Roh-Tabelle, falls die Summary
  nichts liefert)
- `mergeIntoDeployment(target, sources)` – `AddSolutionComponent` pro
  Komponente, bereits vorhandene Objekte werden übersprungen; schreibt
  anschließend eine `pro_mergerun`-Historien-Zeile
- `listMergeRuns(targetRecordId)` – Merge-Historie einer Release-Solution
  (`pro_mergerun`-Zeilen, neueste zuerst; hinzugefügte Komponenten aus dem
  JSON-Feld geparst)

Implementierungen:

- `dataverseSolutionService.ts` – echte Impl., **fällt automatisch auf Mock
  zurück**, solange kein Power-Platform-Host bzw. `src/generated/` fehlt.
- `mockSolutionService.ts` + `mockData.ts` – In-Memory-Beispieldaten; auch
  Anlage und Merge funktionieren offline.

Das **Env-Config-Cockpit** folgt demselben Interface+Impl-Muster
(`envConfigService` / `dataverse…` + `mock…`) und liest **jede konfigurierte
Umgebung** über den Konnektor (`ListRecordsWithOrganization` mit `$select`,
wie Compare/Sharing) — kein solution- oder host-gebundener Datenpfad, keine
neuen Data Sources nötig. Die **Operate-Features** haben jeweils ihr eigenes
Interface + Impl-Paar nach demselben Muster (Dataverse-Impl fällt auf Mock zurück, offline voll
demobar): `traceService` / `jobMonitorService` / `roleAnalyzerService` mit
`dataverse…`- und `mock…`-Implementierungen. Ihre **Reads laufen komplett
über den vorhandenen Dataverse-Konnektor** als FetchXML-Passthrough gegen die
aktuelle Umgebung (`src/services/currentEnvQuery.ts`, inkl. Paging und
Aggregaten) — dadurch brauchen sie **keine neuen nativen Data Sources zum
Lesen** (wichtig: Intersects wie `roleprivileges` sind ohnehin nur per
FetchXML erreichbar; Identität ist die Konnektor-Connection/SP).
**Schreibpfade** (Trace-Level umschalten, Job-Cancel/Retry) gehen dagegen
über die nativen Data Sources `organization` und `asyncoperation` und laufen
als angemeldeter User — Dataverse erzwingt die Privilegien pro Person und der
Audit zeigt, wer gehandelt hat. Pure functions mit Vitest-Tests:
`utils/heartbeat.ts` (`evaluateHeartbeat`) und `utils/privileges.ts`
(Bitmasken-/Depth-Decoder) — `npm test`.

## Lokal starten

```bash
npm install
npm run dev      # http://localhost:3000 — läuft standalone mit Mock-Daten
```

## An die Umgebung anbinden

```bash
pac auth create --environment <ENV-ID>
power-apps init --display-name "Solution Administration Console" --environment-id <ENV-ID>

pac code add-data-source -a dataverse -t solution
pac code add-data-source -a dataverse -t publisher
pac code add-data-source -a dataverse -t solutioncomponent
pac code add-data-source -a dataverse -t msdyn_solutioncomponentsummary
# Operate-Gruppe (nur Schreibpfade — Reads laufen über den Konnektor):
pac code add-data-source -a dataverse -t asyncoperation   # Job-Cancel/Retry
pac code add-data-source -a dataverse -t organization     # Trace-Level-Switch
```

> **Achtung beim Nachgenerieren:** Sobald die Action
> `AddSolutionComponent` eingebunden ist, schlägt jedes weitere
> `pac code add-data-source` fehl („The JSON does not represent a valid
> data source") — die CLI kann das Action-Schema beim Reprocessing nicht
> lesen. Deshalb **immer über das Wrapper-Skript gehen**, das den
> Workaround (Schema beiseite legen + `addsolutioncomponent`-Block in
> `dataSourcesInfo.ts` wiederherstellen) automatisch erledigt:
>
> ```powershell
> ./scripts/add-data-source.ps1 -a dataverse -t <tabelle>
> ```

`src/services/dataverseSolutionService.ts` importiert die generierten
Services **statisch** und setzt voraus, dass alle vier Generatoren gelaufen
sind — ohne `src/generated/` schlägt der Build fehl. Die Mapper sind an die
generierten Modelle (`SolutionsModel`, `SolutioncomponentsModel`,
`PublishersModel`) gebunden; nach einem erneuten Generieren mit anderen
Shapes die SELECT-Listen und Mapper dort nachziehen.

### Merge support

Der Merge nutzt die Dataverse-Action **AddSolutionComponent**
(`power-apps add-dataverse-api`, bereits eingebunden). Das
`rootcomponentbehavior` der Quelle wird übernommen: Tabellen, die nur als
Shell bzw. ohne Subkomponenten in der Feature-Solution stecken, landen
genauso im Deployment-Ziel.

Eine Komponente, die im Ziel schon liegt, wird übersprungen — **außer** die
Quelle trägt mehr als das Ziel: Führt das Ziel eine Tabelle als Shell und
die Quelle sie mit allen Subkomponenten, wird der vorhandene Eintrag
**hochgestuft** statt übersprungen (`MergeResult.widened`, im Banner als
„tables upgraded to include all subcomponents"). Ohne das gingen die
Spalten, Formulare und Views dieser Quelle still verloren. Die Regel steht
als pure function in `utils/mergePlan.ts` (`decideMergeAction`, Vitest);
aufgeweitet wird nur, nie verengt — Dataverse degradiert eine bestehende
Zeile ohnehin nicht.

### Azure DevOps anbinden

Die Detail-Ansicht zeigt pro Solution ein Work-Item-Panel (Status,
Assignee, Absprung). Die Nummer kommt aus dem Unique Name
(`feature_4711`), einem rein numerischen Unique Name oder dem Titel
(„Assembly App V2 | 11941").

Angebunden über den offiziellen **Azure-DevOps-Konnektor** (bereits
verdrahtet): `dataverseSolutionService.getWorkItem()` ruft die generierte
Operation `ListWorkItems` auf und mappt `System_State` /
`System_AssignedTo` / `System_Title`. Einrichtung in einer neuen
Umgebung:

1. In [make.powerapps.com](https://make.powerapps.com) → Connections →
   **New connection** → *Azure DevOps* → mit dem DevOps-Konto anmelden.
2. `pac connection list` → Connection-ID notieren.
3. ```bash
   pac code add-data-source -a shared_visualstudioteamservices -c <connection-id>
   ```
   (vorher das `AddSolutionComponent`-Schema beiseite legen, siehe
   „Achtung beim Nachgenerieren").

Organisation/Projekt stehen in [`.env`](.env) (zur Build-Zeit
eingebacken, lokal via `.env.local` überschreibbar):

```
VITE_ADO_ORG_URL=https://dev.azure.com/SchulzD365
VITE_ADO_PROJECT=D365UO
VITE_ENVIRONMENT_ID=<env-id>   # Fallback für Maker-Links außerhalb des Hosts
```

Andere Benutzer der App werden beim ersten Start aufgefordert, ihre
eigene Azure-DevOps-Verbindung zu bestätigen (Standard-Verhalten von
Konnektor-Connections in Code Apps).

## Roadmap (Denkrichtung)

- **Service-Principal-Auth** für beide Konnektoren — konkreter
  Umsetzungsplan in [`TODO.md`](TODO.md).

- **DevOps weiterdenken**: Anlage einer Working Solution direkt aus einem
  zugewiesenen Work Item, Status-Chips in der Solution-Liste.
- **Release-Zug**: Versions-Bump und Export der Deployment Solution nach
  dem Merge, Status-Tracking pro Sprint.

## Build & Deploy

```bash
npm run build    # tsc -b && vite build
npm run lint
power-apps push  # veröffentlicht in die Umgebung
```
