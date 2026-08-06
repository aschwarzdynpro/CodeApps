# Release Notes — Solution Administration Console

Managed-Solution-Releases von `DynamicsProSolutionAdminConsole` (Export aus dem
Playground-Authoring-Env). Eine Sektion je Release, neueste oben. Import + Nach-
schritte: siehe [`README.md`](README.md).

---

## 1.0.0.19 — 2026-08-06

**Teilbare Links auf einen Arbeitsbereich, dazu eine Feldsuche im
Datensatz-Panel des OData Browsers. Keine Schema-Änderung, keine neuen
Flow-Versionen** — der Import braucht weder `provision-model.ps1` noch ein
erneutes Aktivieren der Executor-Flows.

- **Deeplinks**: `?p=<bereich>` an der Play-URL öffnet den Arbeitsbereich; das
  **🔗 in der Topbar** legt den Link zum gerade offenen Bereich in die
  Zwischenablage, inklusive `&hidenavbar=true` (blendet die Leiste des Players
  aus — die Konsole bringt ihre eigene Navigation mit, und der Platz fehlt
  vertikal ohnehin).
  Die Form folgt aus einer Tatsache, nicht aus Geschmack: Die App läuft im
  iframe des Players, **die Adresszeile gehört also dem Player**. Ein Link
  lässt sich dort nicht ablesen, nur komponieren — daher der Button statt
  einer mitwandernden URL. Gelesen wird er über die dafür vorgesehene
  SDK-Schnittstelle.
  **Gated Bereiche öffnet ein Link erst nach bestandener Rollenprüfung**: Sonst
  landete man auf einer Seite, zu der die Sidebar gar nicht navigiert, und säße
  vor einer leeren Hülle. Bis dahin — und für alle ohne die Rolle — führt der
  Link auf den Standardbereich, wo das Ziel wie gewohnt als gesperrt erscheint.
  Unbekannte Bereichs-Namen degradieren ebenso, statt zu scheitern; die
  Zuordnung ist außerdem groß-/kleinschreibungstolerant, weil Chat- und
  Ticketsysteme URLs gern kleinschreiben.
  ⚠ Erzeugte Links zeigen auf die **kommerzielle Cloud** — der Host-Kontext
  meldet Umgebung und App, aber nicht den Host, von dem geladen wurde.
- **Feldsuche im Datensatz-Panel** (OData Browser → Datensatz → Fields): Eine
  Dataverse-Zeile bringt 30 bis 200 Felder mit; sie zu finden hieß bisher
  scrollen. Gesucht wird über **drei** Achsen, weil nicht vorhersagbar ist,
  welche jemand im Kopf hat: **Anzeigename**, **technischer Name** (mit *und*
  ohne die `_…_value`-Dekoration eines Lookups) und **Inhalt** — und zwar in
  **beiden** Darstellungen, formatiert und roh. Nur eine davon zu prüfen wäre
  eine Falle: Ein Betrag zeigt sich als `€4.200,00`, enthält wegen des
  Trennzeichens also gar kein „4200" — wer die gespeicherte Zahl tippt, fände
  nichts. Umgekehrt findet man `statecode` über „Active", obwohl dort `0` steht.
  Reiner Teilstring, **kein** Zerlegen an Leerzeichen: Ein Feld, das Wörter
  still ver-UNDet, überrascht beim Einfügen eines Werts mit Leerzeichen. Leer
  gefilterte Gruppen verschwinden samt Überschrift, die Suche bleibt beim
  Scrollen oben stehen und wird bei jedem Datensatzwechsel geleert.

---

## 1.0.0.18 — 2026-08-05

**Nur OData Browser. Keine Schema-Änderung, keine neuen Flow-Versionen** —
der Import braucht diesmal weder `provision-model.ps1` noch ein erneutes
Aktivieren der Executor-Flows.

- **Spalten werden nicht mehr als Chip-Liste geführt.** Jede gewählte Spalte
  war ein eigener entfernbarer Chip; bei zwanzig Spalten und Namen wie
  `_pro_package_ref_value` lief das über mehrere Zeilen und schob die Query
  aus dem Bild. Die Liste war ohnehin die **dritte** Darstellung derselben
  Information: Der Button daneben zählt sie, die stets sichtbare Query-Zeile
  zeigt `$select=…` als maßgebliche, editierbare Fassung, und nach dem Lauf
  stehen sie nochmal als Grid-Kopfzeilen da — mit Daten darunter.
  **Einzelne Spalten wirft man jetzt in der Grid-Kopfzeile per ✕ raus**,
  also dort, wo einem beim Lesen auffällt, dass man sie nicht braucht. Der
  Klick auf den Titel sortiert weiter wie bisher.
  Zwei Fälle zeigen bewusst **kein** ✕, weil es dort lügen würde: ohne
  `$select` bestimmt der Server die Spalten (Entfernen müsste erst ein
  `$select` mit allen übrigen erfinden), und bei nur noch einer Spalte
  bedeutet ein leeres `$select` „alle Spalten" — die letzte zu entfernen
  würde die Query also *erweitern*.
- **Copy-Buttons für `$select`, `$filter` und `$expand`** unter der
  Query-Zeile, für die Felder einer „List rows"-Aktion im Cloud Flow. Sie
  kopieren den **nackten, unkodierten** Wert — nicht den Ausschnitt aus der
  URL: Der Konnektor kodiert diese Felder selbst, ein mitkopiertes `%20` oder
  `%27` zerlegt dort jeden Filter. Deaktiviert, wenn der jeweilige Teil leer
  ist (der Tooltip sagt welcher fehlt, statt still `""` zu kopieren) und
  solange die Query-Zeile eine **nicht angewendete** Änderung hat — dann
  hielte der Builder noch die alte Query und gäbe etwas anderes aus als auf
  dem Schirm steht. Der Tooltip zeigt vorab den exakten String.

---

## 1.0.0.17 — 2026-08-05

**Transfer Hub: Delta-Transfers und ein sichtbarer Write Plan. Drei neue
Spalten auf `pro_transferentry` (`pro_deltamode_opt`, `pro_deltafetchxml_txt`,
`pro_deltawatermarks_txt`) — der managed Import bringt sie mit, beim
Skript-Install muss `provision-model.ps1` erneut laufen. Die drei
Executor-Flows sind ebenfalls neu und müssen nach dem Import wieder aktiviert
werden.**

- **Delta-Transfers**: Ein Entry überträgt auf Wunsch nur noch Zeilen, deren
  `modifiedon` seit dem letzten sauberen Lauf liegt. Vier Regeln, jede davon
  gegen einen konkreten Datenverlust:
  - **Ein Wasserstand je Ziel**, nicht je Entry — ein Lauf, der in UAT landet
    und in PROD scheitert, darf PROD diese Zeilen nicht für immer überspringen.
  - **Der Stempel ist die Lesezeit, zwei Minuten zurückdatiert**, nicht die
    Fertigzeit: Zeilen, die während des Laufs geändert werden, muss der nächste
    Lauf noch fangen; die Marge deckt Uhr-Versatz ab. Doppelt übertragen ist
    gratis (es sind Upserts), verloren nicht.
  - **Er rückt nur bei sauberer Zelle vor** — nicht beim Dry Run, nicht bei
    gezogener 5000er-Notbremse, nicht bei Fehlern. Sonst würden ausgerechnet
    die gescheiterten Zeilen beim nächsten Mal übersprungen.
  - **Delta und Orphan-Handling schließen sich aus**, blockierend im Save-Gate
    statt als Warnung: Ein Delta-Set ist unvollständig, also sähe jede
    unveränderte Zielzeile verwaist aus — mit Handling *Delete* leert der
    zweite Lauf die Tabelle.
  Die gefilterte Query baut der Hub vor (`pro_deltafetchxml_txt` mit genau
  einer `__DELTA__`-Lücke), weil der Flow kein XML-Werkzeug hat. Die
  Delta-Bedingung **umschließt** vorhandene Filter in einem neuen
  `<filter type="and">`, statt sich in sie hineinzuhängen — in einem
  `<filter type="or">` des Autors wäre aus „geändert seit X" sonst still
  „geändert seit X ODER sein Filterkriterium" geworden.
  Zwei ehrliche Grenzen stehen in der UI: Delta hebt die **5000er-Grenze
  nicht auf** (das Ziel wird weiter vollständig für den Match-Index gelesen),
  und eine nachträglich erweiterte Query füllt **nicht rückwirkend** auf —
  dafür gibt es **„Reset delta"**.
- **Write Plan im Entry-Dialog**: Welche Spalte geschrieben, welche als
  Referenz gebunden und welche mit welcher Begründung übersprungen wird, stand
  bisher nur im Rezept für den Executor. Jetzt zeigt der Dialog es an — gespeist
  aus **derselben Berechnung**, die auch gespeichert wird, damit Anzeige und
  Executor-Rezept nicht auseinanderlaufen können. Die Hinweise sind der
  eigentliche Gewinn: eine **fallengelassene Referenz** (polymorpher Lookup,
  unauflösbares Ziel) lässt die Zeile ohne ihren Bezug im Ziel landen, während
  der Lauf Erfolg meldet; je Lookup sagt der Dialog, ob die Zieltabelle von
  **keinem**, einem **inaktiven** oder einem **später laufenden** Entry
  übertragen wird. Ein **leerer Plan blockiert das Speichern**.
- **Fix — Zeilenenden sind kein Inhalts-Drift**: Dieselbe Web Resource mit LF
  in der einen und CRLF in der anderen Umgebung wurde als kompletter Drift
  gemeldet und im Diff vollständig eingefärbt. Hash und Diff laufen jetzt über
  normalisierten Text (BOM entfernt, CRLF/CR → LF). **Nicht** normalisiert
  werden Trailing Spaces, Leerzeilen und Einrückung — das sind Änderungen.
  Nebenbefund mitbehoben: der Hash lief über das rohe Base64, der Diff über den
  dekodierten Text.
- **Fix — Lesbarkeit**: Der Bestätigen-Button eines PROD-Transfer-Laufs trug
  dunkelroten Text auf brand-lila Fläche. Jetzt ein durchgehend roter
  Destruktiv-Button.

---

## 1.0.0.16 — 2026-08-04

**Security-Ausbau: Role Comparer, eingefrorene Baselines und
Security-Konzept-Dokument. Neue Tabelle `pro_securitysnapshot` (9. Tabelle).**

- **Role Comparer** (Validate, gated, lazy): dieselbe Sicherheitsrolle über alle
  konfigurierten Umgebungen als Matrix — je Zelle Privilegienzahl,
  managed/unmanaged und wie viele Privilegien gegenüber der Baseline-Umgebung
  abweichen. **Match über den Rollen-NAMEN**, nicht die GUID (die überlebt nur
  sauberen Transport); Name gleich + ID verschieden ⇒ Badge „rebuilt".
  Scope-Vorauswahl: standardmäßig nur Custom-Rollen, optional auf die
  Rollen-Komponenten einer Release-Solution eingeschränkt. Read-only —
  eine driftende Rolle wird transportiert, nicht im Ziel repariert.
- **Baselines einfrieren** (`pro_securitysnapshot`): der Ist-Zustand als
  benannter Snapshot; „Compare against" prüft danach jede Umgebung gegen **ihr
  eigenes eingefrorenes Ich** („was hat sich seit dem Audit geändert?") mit den
  Verdikten changed / new / gone since freeze.
- **Security-Konzept-Dokument** (Sub-Tab „Document"): Baseline als lesbares
  Dokument — Umgebungen, je Rolle die Privilegien-Matrix, Abweichungen. Zweiter
  Baseline wählbar ⇒ Kapitel „Changes since …" mit jedem verschobenen Privileg.
  Umgebungen einzeln ab-/anwählbar; Markdown- und Text-Export.
- **Role Analyzer wieder in der App** (Operate) — lädt aber **erst auf Klick**
  („Analyze"), damit das Öffnen nicht die falsche Umgebung zieht. Damit sind
  auch Core Role Extractor, Team-&-BU-Map und Field-Level Security wieder
  erreichbar.
- **Solution Import History**: bei fehlenden Abhängigkeiten zeigt die Tabelle
  jetzt auch den **Parent der fehlenden Komponente** (welche Tabelle eine View
  oder ein Formular gehört) — vorher stand der Parent nur auf der
  abhängigen Seite.
- **Fix:** „Mark completed" schließt den Working-Solution-Record jetzt wirklich
  (`statecode`), vorher blieb der Eintrag trotz Status-Label unter „Open"
  stehen. Neue **Reopen**-Aktion (↺) macht das rückgängig.
- **UI:** Sidebar-Gruppen sind aufklappbar (21 Menüpunkte passten nicht mehr auf
  einen Notebook-Bildschirm), **Data Transfer** ist von Manage nach **Operate**
  gewandert, Erklärtexte liegen hinter einem ⓘ neben dem Seitentitel.
- **Bundle:** Role Analyzer und Role Comparer werden **bei Bedarf nachgeladen**
  (`React.lazy`) — im Player verifiziert, dass zur Laufzeit geholte Chunks
  ausgeliefert werden.

Datenmodell-Änderung: `installer/provision-model.ps1` legt zusätzlich
`pro_securitysnapshot` an (idempotent, bestehende Tabellen werden übersprungen).

## 1.0.0.14 — 2026-07-25

**Fix — Transfer-Executor-Flows sind beim Kunden aktivierbar und im Designer lesbar.**

In 1.0.0.13 hatten die drei Executor-Flows (Execute Package / Execute Cell /
Scheduler) die **Host-URL der Authoring-Umgebung fest im `organization`-Parameter
eingebacken**. Beim Import in eine ANDERE Umgebung zeigte der Wert auf eine
fremde, für die dortige Connection unerreichbare Org → Aktivierung (Maker
„Turn on" wie auch Managed-Import) scheiterte an
`GetMetadataForGetEntityWithOrganization … 401 … "The response is not in a JSON
format."`, und der Designer rendere die Flows nur teilweise (~14 von 35 Actions).

- **Host-Operationen nutzen jetzt `organization: "current"`** (löst gegen die
  eigene Umgebung der gebundenen Connection auf) → portabel über Umgebungen,
  Designer rendert vollständig, Turn-on validiert normal, Run-Only konfigurierbar.
- Die echten cross-env-Operationen des Child-Flows (Quelle lesen, Ziel schreiben)
  behalten die dynamische Ziel-URL als Runtime-Ausdruck — ein *non-foldable* Wert,
  der den Design-Zeit-Schema-Check überspringt.
- Verifiziert: Aktivierung + Dry-Run + echter Update-Write im Playground;
  Managed-Import + Aktivierung in einer Fremd-Umgebung bestätigt.
- Doku/Skripte nachgezogen (`activate-flows.ps1`, Release-README): der Maker-
  „Turn on"-Button ist nicht mehr als gesperrt beschrieben.

Sonst funktional identisch zu 1.0.0.13.

---

## 1.0.0.13 — 2026-07-24

Erster dokumentierter Release — **Gesamtstand, stark verkürzt.** Power Apps
**Code App** (React 19) zur Verwaltung von Dataverse-Solutions über den ALM-Zyklus,
mit dem `pro_`-Datenmodell (8 Tabellen), 3 Transfer-Executor-Flows und 1 Security Role.

**Neu in diesem Release**
- ⭐ **Self-Provisioning Wizard** (Reference › „Environment Setup"): geführtes
  Erst-Setup, blendet beim Start ohne Konfiguration hart blockierend vor und legt
  die Steuer-Datensätze an (`pro_workbenchsettings` + je Umgebung
  `pro_environmentconfig`). Bietet erreichbare Umgebungen zur Auswahl, liest
  Organization-/Environment-ID automatisch, schlägt Publisher/Rolle vor;
  freie Environment-Keys (DEV/TEST/UAT/QS/INT/PAR/PROD), idempotenter Upsert.

**Funktionsumfang (Überblick)**
- **Manage:** Workbench (Working Solutions anlegen/tracken/mergen), Merge (Plan,
  Konfliktmarkierung, Historie), Merge Rules, Release-Notes-Generator, Release
  Timeline, Configuration Data Transfer Hub (deklarative Transfer-Pakete mit
  Executor-Flows, Dry-Run, Zeitplan).
- **Validate:** Deployment Readiness (Dependency Check), Analyze-Dashboard (Risk
  Score), Env Config Cockpit (EnvVars/Connection References cross-env), Audit-
  Config-Analyzer, Dual-Write-Table-Maps, Import History, User Settings, Process
  Comparer, Plugin Comparer.
- **Operate:** Plugin Trace Explorer (Job Monitor / Role Analyzer als Preview).
- **Reference:** Environment Links, Environment Setup (Wizard).

**Technik:** Cross-Env-Reads über den Dataverse-Konnektor (Service Principal),
Writes nativ als angemeldeter User; Laufzeit-Konfiguration data-driven aus
`pro_workbenchsettings` / `pro_environmentconfig`.

**Import-Nachschritte:** Connection Reference der Executor-Flows binden + die 3
Flows aktivieren, `pro_*`-Rechte/Security-Role zuweisen, Code App ggf. zur
App-Liste hinzufügen (Details in [`README.md`](README.md)).
