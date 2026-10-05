# Ideen v3 — zehn weitere Code Apps (Oktober 2026)

Brainstorming vom 2026-10-05, im Stil von [`Ideas_v2.md`](Ideas_v2.md). Alle
Ideen folgen dem Muster des Repos: Dataverse-zentrierte Werkzeuge für Admins,
Consultants und Fachadmins, bei denen Maker Portal und model-driven UI
versagen — Service-Interface + Mock, Diff-Vorschau vor jedem Schreiben,
Verlauf, Zielumgebung wählbar. Bewusst **nicht** enthalten, weil schon da
oder in der Roadmap der Admin Console: Solution-ALM, Audit, Übersetzungen,
Schedule Boards, Serienplanung, Gebietsplanung, Rollen-Analyse, Plugin
Traces, Job Monitor, Env-Config, Layer-Inspektor, Dual-Write.

## Was die Recherche beisteuert

- **Code-Apps-Roadmap 2026:** Konnektoren per CLI (GA Juli 2026), Dataverse
  **Actions und Functions** sowie Datei-/Bild-Up-/Download in Preview —
  damit werden `Merge`, `RetrieveDuplicates`, Kalender-Operationen und
  Preisberechnungen aus einer Code App erreichbar. **Kein Offline** für
  Code Apps, ohne ETA — alle Ideen unten sind reine Online-Werkzeuge.
  ([Release Plan 2026 Wave 1](https://learn.microsoft.com/en-us/power-platform/release-plan/2026wave1/power-apps/planned-features),
  [Code Apps April 2026](https://powerappsguide.com/blog/post/code-apps-office-hours-april-2026),
  [Code Apps Mai 2026](https://powerappsguide.com/blog/post/code-apps-may-2026))
- **Was Admins heute in XrmToolBox tun:** SQL 4 CDS (Bulk-Updates),
  FetchXML Builder, Data Transporter (Konfigurationsdaten zwischen
  Umgebungen, Lookups erhalten), Attribute Manager, Export to Excel. Die
  Ideen 5, 8 und 10 holen genau diese Handgriffe in eine freigegebene,
  auditierte Web-App ohne Desktop-Tool.
  ([Community Tools](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/community-tools),
  [XrmToolBox-Favoriten](https://databear.com/xrmtoolbox-power-platform-dataverse-tools/))
- **Field-Service-Schmerz:** Scheduling verteilt sich auf Board, Assistant,
  RSO und Agent, jede Schicht mit eigener „Admin-Steuer" (Booking Setup
  Metadata, Buchungsstatus, Scopes, Rollen); häufigste Ursache für
  „Ressource fehlt" sind fehlende Arbeitszeiten, falsche Filter und
  Rollen. Ideen 6, 7 und 8 setzen dort an.
  ([Missing resources](https://learn.microsoft.com/en-us/troubleshoot/dynamics-365/field-service/scheduling/schedule-board-missing-resources),
  [Scheduling problems explained](https://fieldcamp.ai/ai-dispatcher/microsoft/scheduling-problems/))

---

## 1. Automation Map — „Was passiert, wenn ich speichere?"

**Problem:** Pro Tabelle wirken klassische Workflows, Business Rules,
Power-Automate-Flows, Plugin-Steps und Formular-JavaScript nebeneinander;
niemand sieht die Reihenfolge, und Support-Fragen enden im Raten.

**Use Cases:**
1. **Ereignis-Timeline** je Tabelle × Message (Create/Update/Delete/Assign):
   Pre-Validation → Pre-Operation → Post-Operation, sync/async, Rang,
   Filter-Attribute, Owner, aktiv/inaktiv.
2. **Spalten-Rückwärtssuche:** „Wer schreibt/liest `wal_projectpotential_cur`?"
   über Filter-Attribute, Flow-Trigger-Spalten, Business-Rule-XAML.
3. **Hygiene-Report:** deaktivierte Steps, Flows mit Owner ohne Lizenz/
   verlassen, Workflows ohne Trigger, doppelte Trigger auf derselben Spalte.
4. **Export** als Markdown-Dokumentation pro Tabelle (Übergabe-Doku).

**Datenmodell:** `sdkmessageprocessingstep` (+ `sdkmessagefilter`,
`plugintype`, `pluginassembly`), `workflow` (`category` 0 Workflow, 2
Business Rule, 5 Modern Flow, 6 Desktop Flow; `triggeroncreate`,
`triggeronupdateattributelist`, `primaryentity`, `statecode`, `clientdata`
für Flow-Trigger), `systemform` (Event-Handler aus `formxml`), `webresource`.

**Leitplanken:** Alles read-only per FetchXML über den Dataverse-Konnektor,
Metadaten ~15 min cachen. Flow-Trigger-Parsing (`clientdata`-JSON) als pure
function mit Tests; `formxml`-Parser ebenso. Verbindung zur Admin Console:
dieselbe Zielumgebungs-Wahl wie die Operate-Gruppe.

**Warum Code App:** Timeline-Rendering mit Einrückung, Rückwärtssuche über
geparste JSON/XML-Blobs — in Canvas/MDA nicht darstellbar.
**Ziel:** Playground, dann Schulz INT-11.

---

## 2. Offboarding & Ownership Assistant

**Problem:** Verlässt ein Mitarbeiter die Firma, bleiben Datensätze,
persönliche Ansichten, Dashboards, Flows, Connections, Warteschlangen und
Teamzugehörigkeiten hängen. Das Admin-Center kann Datensätze umhängen,
sonst nichts; der Rest wird vergessen und fällt Monate später auf.

**Use Cases:**
1. **Inventar pro Person:** alles, was an `systemuserid` hängt, nach
   Objekttyp gezählt (Datensätze je Tabelle, `userquery`, `userform`,
   `userqueryvisualization`, Flows, Queue-Mitgliedschaften, Teams, Rollen,
   offene Aktivitäten).
2. **Übergabe-Plan:** Ziel-Besitzer je Objekttyp (Datensätze → Team,
   Ansichten → Kollege, Flows → Service-Konto), Vorschau, Ausführung mit
   Fortschritt und Einzelergebnis, Protokoll.
3. **Rückwärts:** „Welche Datensätze gehören deaktivierten Benutzern?"
   (Hygiene-Report über alle Tabellen mit Owner).
4. **Onboarding-Spiegel:** Rollen/Teams/Queues eines Vorbilds auf einen
   neuen Benutzer übertragen (Vorschau + Delta).

**Datenmodell:** `systemuser`, `team`, `teammembership`, `systemuserroles`,
`queue`/`queuemembership`, `userquery`, `userform`, `userquerydashboard`,
`workflow` (Owner), `connection`, plus dynamisch alle Tabellen mit
`ownerid` (aus Metadaten `OwnershipType = UserOwned`).

**Leitplanken:** Umhängen über `Assign`/`ownerid`-Update **nativ als
angemeldeter Admin** (Privilegien greifen, Audit zeigt wen). Batches à 50,
sequentiell, wiederaufnehmbar; Kaskaden (Assign-Verhalten der Beziehungen)
vorab aus den Metadaten anzeigen. Persönliche Ansichten lassen sich nur per
`Assign` übergeben, nicht teilen — klar beschriften.

**Warum Code App:** Mehrstufiger Plan mit Vorschau, Fortschritt und
Wiederaufnahme über Dutzende Objekttypen. **Ziel:** Waldmann DEV (SP-Profil),
Schulz.

---

## 3. View Doctor — Ansichten und Formulare aufräumen

**Problem:** Nach Jahren hat jede Tabelle 30 System-Ansichten, hunderte
persönliche Ansichten und Formulare, die niemand mehr nutzt; Spalten
zeigen auf gelöschte Felder, Filter auf inaktive Benutzer.

**Use Cases:**
1. **Inventar** je Tabelle: System-/persönliche Ansichten, Formulare,
   Diagramme mit Besitzer, Freigaben, „in welcher App sichtbar", zuletzt
   geändert.
2. **Defekt-Scan:** `layoutxml`/`fetchxml` gegen die Metadaten prüfen —
   nicht existierende Spalten, gelöschte Lookups, Filter auf gelöschte
   Werte, Sortierung auf nicht sortierbare Spalten.
3. **Duplikat-Finder:** Ansichten mit identischem FetchXML/Layout (auch
   persönlich vs. System), Vorschlag „zusammenlegen".
4. **Aktionen:** persönliche Ansicht zu System-Ansicht befördern, Spalte
   in n Ansichten gleichzeitig hinzufügen/entfernen/umbenennen (Bulk mit
   Diff), deaktivieren, löschen.

**Datenmodell:** `savedquery`, `userquery`, `systemform`, `savedqueryvisualization`,
`appmodulecomponent`, `principalobjectaccess` (Freigaben), Metadaten
(`EntityDefinitions` + Attributes).

**Leitplanken:** XML-Parser und -Patcher als pure functions mit Tests;
Schreiben nur auf unmanaged bzw. mit Layer-Warnung (Synergie mit dem
Layer-Inspektor); nach Änderungen `PublishXml` je Tabelle gebündelt.

**Warum Code App:** Bulk-XML-Edits mit Vorschau, Kreuzvergleich über
hunderte Ansichten. **Ziel:** Waldmann DEV (Nähe zu Translation Studio,
das `savedquery`/`systemform` schon liest).

---

## 4. Choice Manager — globale Auswahllisten über Umgebungen

**Problem:** Globale Optionssätze wachsen in DEV, UAT und PROD
auseinander; neue Werte bekommen falsche Option-Value-Präfixe (Repo-Wissen:
`pro` 45500, `wal` 956980), Verwendungen sind unsichtbar, und Translation
Studio deckt nur Beschriftungen ab, nicht Werte und Reihenfolge.

**Use Cases:**
1. **Katalog** aller globalen und lokalen Choices mit Werten, Labels je
   Sprache, Farbe, Reihenfolge, Solution-Zugehörigkeit.
2. **Cross-Env-Diff** DEV/UAT/PROD: fehlende Werte, abweichende Labels,
   andere Reihenfolge — side-by-side, exportierbar.
3. **Verwendungsanalyse:** welche Spalten nutzen die Choice, welche
   Ansichten/Business Rules/Flows filtern auf einen bestimmten Wert
   (wichtig, bevor man einen Wert entfernt).
4. **Pflege mit Präfix-Wächter:** Wert hinzufügen/umbenennen/umsortieren
   mit Vorschau; der Wert wird aus dem Publisher-Präfix der Ziel-Solution
   vorgeschlagen; `InsertOptionValue`/`UpdateOptionValue`/`OrderOption`
   als Dataverse-Actions.

**Datenmodell:** Metadaten `GlobalOptionSetDefinitions`, `EntityDefinitions/
Attributes` (Picklist/MultiSelect), `solutioncomponent` (Typ 9), `savedquery`,
`workflow` (Verwendung in Filtern).

**Leitplanken:** Schreiben nur in der Entwicklungsumgebung (Managed-Schutz
in UAT/PROD), Label-Pflege an Translation Studio delegieren, keine
Löschung von Werten mit Verwendungen ohne Bestätigung und Treffer-Liste.

**Warum Code App:** Matrix Wert × Sprache × Umgebung mit Diff — das Maker
Portal zeigt eine Umgebung und eine Sprache. **Ziel:** Waldmann DEV ↔ COPY.

---

## 5. Price List Manager — Preislisten pflegen, kopieren, vergleichen

**Problem:** Jahrespreisrunden laufen in Excel: Preisliste exportieren,
Prozentsatz drauf, re-importieren, Fehler bei Währung/Einheit/Rabattlisten.
Field Service und Sales teilen sich das Modell; das Standard-UI kann
weder kopieren noch vergleichen.

**Use Cases:**
1. **Grid** aller Preislistenpositionen einer Liste (Produkt, Einheit,
   Betrag, Methode, Rabattliste) mit Suche, Filter, Inline-Edit.
2. **Preisrunde:** Liste kopieren mit Regel (+x %, Rundung, Gültigkeit),
   Vorschau alt/neu je Position, anlegen; alte Liste zum Stichtag beenden.
3. **Vergleich** zweier Preislisten (fehlende Produkte, Preisabweichungen
   in %), Export CSV.
4. **Hygiene:** Produkte ohne Preis in der Standard-Liste, Positionen mit
   abweichender Einheitengruppe, überlappende Gültigkeiten, Preislisten
   ohne Zuordnung zu Konten/Gebieten.
5. **Field Service:** Ressourcen-Kategorie-Preise (`msdyn_resourcecategorypricelevel`)
   und Buchungs-Setup-Preise in derselben Liste pflegen.

**Datenmodell:** `pricelevel`, `productpricelevel`, `product`, `uom`/`uomschedule`,
`discounttype`, `transactioncurrency`, FS: `msdyn_resourcecategorypricelevel`,
`msdyn_bookingsetupmetadata` (Default-Preisliste).

**Leitplanken:** Schreiben per Batch mit Einzelergebnis; Vorschau als
Pflicht; Aktive Produkte vs. `statecode` beachten; Währungs-Umrechnung
anzeigen, nie rechnen.

**Warum Code App:** Excel-artiges Grid mit Regel-Vorschau und Diff.
**Ziel:** Waldmann DEV (Sales), Schulz UAT (Field Service).

---

## 6. Capacity & Skills Planner (Field Service)

**Problem:** Dispositionsleitung sieht Auslastung nur Board-Tag für
Board-Tag; Qualifikationen (Characteristics), Zertifikatsablauf und
Gebietsabdeckung je Ressource stehen in Formularen, nie in einer Matrix.
Die Serienplanung legt Termine an, aber niemand prüft vorher die
Kapazität des Quartals.

**Use Cases:**
1. **Auslastungs-Heatmap** Ressource × Woche (gebuchte Stunden / verfügbare
   Stunden aus Arbeitszeiten minus Abwesenheiten), Drilldown auf Buchungen.
2. **Skill-Matrix** Ressource × Characteristic mit Bewertung und
   Ablaufdatum; Lücken je Gebiet/Team, Ablauf in 90 Tagen.
3. **Bedarfsvorschau:** offene Arbeitsaufträge und geplante Serien
   (Synergie Serienplanung) gegen Kapazität je Woche und Skill.
4. **Was-wäre-wenn:** Ressource hinzufügen/entfernen, Arbeitszeit ändern
   → Heatmap neu.

**Datenmodell:** `bookableresource`, `bookableresourcebooking`,
`bookableresourcecharacteristic`, `characteristic`, `ratingmodel`/`ratingvalue`,
`bookableresourcecategoryassn`, `calendar`/`calendarrule` (Arbeitszeiten),
`msdyn_timeoffrequest`, `msdyn_workorder` (+ Anforderungen
`msdyn_resourcerequirement`), `territory`.

**Leitplanken:** Verfügbarkeit aus Kalenderregeln ist das harte Stück —
Berechnung als pure function (`expandCalendarRules(rules, range)`) mit
Tests, bevorzugt aber die Action `msdyn_RetrieveResourceAvailability`
sobald Actions in Code Apps GA sind. Read-only in v1.

**Warum Code App:** Heatmap, Matrix, Was-wäre-wenn im Client.
**Ziel:** Schulz UAT (dort liegen Serienplanung und Boards).

---

## 7. Work Hours & Calendar Manager

**Problem:** Arbeitszeiten, Geschäftsschließungen und Feiertagskalender
leben in `calendar`/`calendarrule`, dem unverständlichsten Datenmodell der
Plattform. Fehlende Arbeitszeiten sind laut Microsoft-Troubleshooting die
häufigste Ursache für „Ressource fehlt auf dem Board"; Massenänderungen
(neues Schichtmodell für 40 Ressourcen) gibt es nicht.

**Use Cases:**
1. **Kalender-Ansicht je Ressource:** effektive Arbeitszeit pro Tag, mit
   Herkunft (Vorlage, Ausnahme, Abwesenheit, Schließung).
2. **Vorlagen anwenden:** Arbeitszeitvorlage auf n Ressourcen setzen,
   Vorschau der Delta-Tage, ausführen (`msdyn_SaveCalendar`/
   `SetWorkHours`-Actions bzw. `calendarrule`-Writes).
3. **Feiertage:** Geschäftsschließungen je Land/Bundesland aus einer
   Liste anlegen (Jahreswechsel in zwei Klicks), bestehende Einträge
   vergleichen, Lücken für nächstes Jahr melden.
4. **Diagnose:** Ressourcen ohne Arbeitszeit im Zeitraum X, Zeitzone
   weicht vom Standort ab, inaktive Ressourcen mit Buchungen.

**Datenmodell:** `calendar`, `calendarrule`, `bookableresource`
(`calendarid`, `timezone`), `msdyn_workhourtemplate`, `msdyn_timeoffrequest`,
Geschäftsschließungen (`calendar` der Organisation), `businessunit`.

**Leitplanken:** Kalender-Writes ausschließlich über die Actions, nie
`calendarrule` roh anlegen (Inner-Calendar-Fallen); jede Massenaktion mit
Vorschau, Batch, Einzelergebnis und „Rückgängig"-Paket (Snapshot der
Regeln vor dem Lauf). Synergie: Serienplanung liest dieselben Daten.

**Warum Code App:** Kalender-Visualisierung mit Herkunfts-Overlay plus
Massenänderung mit Vorschau. **Ziel:** Schulz UAT.

---

## 8. Field Service Setup Transporter

**Problem:** Vorfalltypen mit Service-Tasks, Buchungs-Setup-Metadaten,
Buchungsstatus, Arbeitsauftragstypen, Ressourcen-Kategorien, Steuern und
Merkmale sind Konfigurationsdaten, keine Solution-Komponenten. Zwischen
DEV, UAT und PROD werden sie per Hand nachgebaut oder per XrmToolBox
Data Transporter, mit kaputten Lookups.

**Use Cases:**
1. **Inventar** je Konfigurationsfamilie mit Abhängigkeiten (Vorfalltyp →
   Service-Tasks → Merkmale → Produkte).
2. **Cross-Env-Diff** zweier Umgebungen je Familie: fehlend, abweichend,
   verwaist.
3. **Transfer** mit ID-Zuordnung (ID, dann Name, Zeile für Zeile
   änderbar) — dasselbe Muster wie der Board-Import im Schedule Board
   Manager; Vorschau, Anlegen/Aktualisieren/Überspringen, Protokoll.
4. **Paket-Export** als JSON für Git/Review, Re-Import später.

**Datenmodell:** `msdyn_incidenttype`, `msdyn_incidenttypeservicetask`,
`msdyn_servicetasktype`, `msdyn_incidenttypecharacteristic`,
`msdyn_incidenttypeproduct`/`-service`, `msdyn_bookingsetupmetadata`,
`bookingstatus`, `msdyn_workordertype`, `msdyn_workordersubstatus`,
`bookableresourcecategory`, `characteristic`, `msdyn_priority`,
`msdyn_taxcode`.

**Leitplanken:** Reihenfolge der Familien aus einem Abhängigkeitsgraphen
(topologisch), niemals Zeilen mit offenen Lookups schreiben; Ziel
schreibt nativ als Admin; Diff und Mapping als pure functions mit Tests.
Schedule Board Manager und dieses Werkzeug könnten denselben
`transfer`-Kern teilen (gemeinsames Paket unter `apps/_shared` wäre ein
erster Schritt zu Code-Teilung im Monorepo).

**Warum Code App:** Mapping-UI mit Diff über mehrere Tabellen, ohne
Desktop-Tool. **Ziel:** Schulz INT-11 → UAT.

---

## 9. Duplicate & Merge Workbench

**Problem:** Die Dataverse-Duplikaterkennung findet nur exakte Treffer
nach starren Regeln; Vertrieb pflegt Firmen dreimal mit Tippfehlern.
Zusammenführen geht nur Paar für Paar im Formular, ohne Übersicht, welche
Felder gewinnen.

**Use Cases:**
1. **Cluster-Suche** über `account`/`contact`/`lead` mit konfigurierbaren
   Regeln (normalisierter Name, Domain der E-Mail, PLZ + Straße,
   USt-ID, Telefon-Normalform), Fuzzy-Score im Client, Cluster-Liste mit
   Begründung.
2. **Merge-Tisch:** Cluster side-by-side, Feld für Feld den Gewinner
   wählen (Regeln: jüngster Wert, nicht leer, Master), Vorschau der
   betroffenen Kinder (Aktivitäten, Opportunities, Projekte), Ausführen
   über die `Merge`-Action.
3. **Whitelist:** „kein Duplikat"-Paare merken (eigene Tabelle
   `pro_duplicateexclusion`), damit sie nicht wieder auftauchen.
4. **Report:** Duplikatsquote je Besitzer/Gebiet, Entwicklung über Zeit.

**Datenmodell:** `account`, `contact`, `lead`, `duplicaterule` (bestehende
Regeln anzeigen), eigene Tabelle `pro_duplicateexclusion`; Kinder über
Beziehungsmetadaten.

**Leitplanken:** Kandidaten serverseitig vorfiltern (Blocking-Key z. B.
erste 3 Zeichen + PLZ), Fuzzy nur im Block; `Merge` nativ als Benutzer;
immer Vorschau mit Kinderzahl; Mock-Daten auf `pro`-Präfix, keine echten
Firmen.

**Warum Code App:** Fuzzy-Matching und Merge-Tisch brauchen eigene Logik
und dichte UI. **Ziel:** Playground (Demo), später Waldmann DEV.

---

## 10. Grid Studio — Massenbearbeitung mit Diff und Rückgängig

**Problem:** „Setz bei diesen 400 Projekten den GVL um" heißt heute:
Excel-Export, bearbeiten, Import mit Fehlerliste — oder SQL 4 CDS auf
einem Admin-Laptop ohne Vorschau und ohne Spur, wer was geändert hat.

**Use Cases:**
1. **Quelle wählen:** Ansicht, FetchXML (mit Builder-Light) oder
   eingefügte GUID-Liste; Spalten frei dazunehmen.
2. **Editierbares Grid:** Inline-Edit, Spalten-Fill-Down, Formelartig
   („= Feld A + ' ' + Feld B", Lookup per Suche), Einfügen aus Excel mit
   Spalten-Mapping.
3. **Vorschau & Ausführen:** Diff je Zelle alt/neu, Validierung gegen
   Metadaten (Pflicht, Länge, Choice-Werte), Batches, Einzelergebnis.
4. **Rückgängig:** Snapshot der geänderten Zellen vor dem Lauf als
   „Änderungspaket" (lokal + optional als Tabellenzeile), Wiederherstellen
   per Klick; Querverweis auf den Audit Explorer („zeige diesen Lauf").

**Datenmodell:** dynamisch — Metadaten für Spaltentypen, jede Tabelle als
Ziel; optional `pro_changeset` für Paket-Ablage.

**Leitplanken:** Writes nativ als Benutzer (Privilegien), Row-Cap (z. B.
2.000) mit klarer Anzeige, Pflichtvorschau, kein Löschen in v1. Formel-
Engine als pure function mit Tests; Lookup-Setzen über `/entityset(id)`-
Bindung.

**Warum Code App:** Spreadsheet-Grid, Formeln, Diff, Undo — das Herz ist
Client-State. **Ziel:** Playground; einsetzbar überall.

---

## Alternativen, die es nicht in die Zehn geschafft haben

- **Data Quality Cockpit** (Regeln je Tabelle, Score je Besitzer) — gute
  Idee, aber zu nah an Hygiene-Reports in 3, 5, 7 und 9; als gemeinsamer
  Baustein („Findings-Liste mit Direkt-Aktion") denkbar.
- **Metadaten-Schema-Diff DEV/UAT/PROD** — überschneidet sich mit Compare
  und Layer-Inspektor der Admin Console.
- **Pipeline-Kanban, Lead-Wizard, Angebotsvergleich** — bleiben
  Gen-Page-Kandidaten (siehe `AGENTS.md`).

## Empfohlene Reihenfolge

1. **Grid Studio (10)** — generisch, sofort in jedem Tenant nützlich, kein
   fachliches Modell nötig; liefert Grid, Diff und Batch-Kern für 3, 5
   und 8.
2. **Work Hours & Calendar Manager (7)** — konkreter Schulz-Schmerz,
   ergänzt Serienplanung und Boards; danach **Capacity Planner (6)** auf
   derselben Kalender-Logik.
3. **Automation Map (1)** — read-only, kleines Risiko, großer Doku-Nutzen
   für die Admin-Console-Zielgruppe.
4. **Field Service Setup Transporter (8)** — zieht den Import-Kern aus dem
   Schedule Board Manager heraus; erster Schritt zu geteiltem Code.
5. Rest nach Kundenbedarf: Price List (5) und Choice Manager (4) für
   Waldmann, Offboarding (2) überall, View Doctor (3) und Merge Workbench
   (9) als Demo-Stücke für den Playground.
