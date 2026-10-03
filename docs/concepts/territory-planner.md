# Konzept — Territory Planner (Gebietsplanung)

Stand 2026-10-03. Konzept aus dem Brainstorming (Idee 9), gedacht für eine
eigenständige Claude-Session. Zielordner: `apps/territory-planner/`.
Der Kickoff-Prompt steht am Ende.

## Problem

Vertriebsgebiete werden über Postleitzahlbereiche definiert und einem
Gebietsverkaufsleiter (GVL) zugeordnet. In Dataverse sind das Zeilen in
Tabellen; niemand sieht auf einer Karte, welches Gebiet wo liegt, wo
Bereiche sich überlappen oder Lücken lassen („weiße Flecken"), und wie viel
Kunden und Potenzial ein GVL trägt. Umverteilungen (neuer GVL, Elternzeit,
Gebietsschnitt) werden in Excel geplant und danach händisch in Zeilen
übersetzt, Fehler fallen Monate später auf.

## Ausgangslage bei Waldmann (aus `apps/sales-dashboard/`)

Waldmann hat das Modell schon; die App baut darauf auf und erfindet keine
eigenen Tabellen:

| Tabelle | Relevante Spalten (bekannt) | Rolle |
| --- | --- | --- |
| `territory` | `name`, `managerid` (→ GVL), `parentterritoryid`, `wal_application_opt` (Anwendung/Produktlinie), `wal_country_ref`, `wal_salesoffice_ref`, `wal_sellergroup_ref`, `wal_team_id`, `wal_representative_id`, `wal_customercenter_id`, `wal_refresh_status_opt`, `wal_last_territory_refresh_dat` | Gebiet; „GVL" = Manager eines Territory (so auch der GVL-Filter im Sales Dashboard) |
| `wal_postalcoderange` | **Spalten noch unbekannt** (Tabelle „Postal Code Range" in Sales Hub); erwartet: PLZ von/bis oder Präfix, Land, Anwendung, Lookup auf `territory` | Zuordnung PLZ → Gebiet |
| `account` | `address1_postalcode`, `address1_city`, `address1_country`, `wal_areasalesmanager_id`, `wal_keyaccountmanager_id`, ggf. `territoryid` | Kunden je Gebiet |
| `wal_project` | `wal_zippostalcode_txt`, `wal_postalcodeinstallation_txt`, `wal_projectpotential_cur`, `_wal_areasalesmanager_id_value`, `statuscode`, `wal_last_territory_refresh_dat` | Potenzial je Gebiet |
| `quote`, `salesorder` | `wal_territory_ref`, `totalamount` | Angebots-/Auftragswert je Gebiet |
| `opportunity` | `wal_last_territory_refresh_dat` | Hinweis auf bestehenden Refresh-Mechanismus |

`wal_refresh_status_opt` und `wal_last_territory_refresh_dat` deuten auf
einen **bestehenden Prozess** (Flow/Plugin), der Datensätze anhand der
PLZ-Bereiche neu stempelt. **Erste Aufgabe der Session:** Metadaten von
`wal_postalcoderange` und diesen Prozess ermitteln (`EntityDefinitions`
mit `$expand=Attributes`, `workflow`-Tabelle nach Namen, Beispielzeilen
per `pac env fetch`), bevor die Schreiblogik entsteht. Die App **ersetzt
diesen Prozess nicht**, sie pflegt die Bereiche und stößt ihn höchstens an.

## Nutzer und Nutzen

- **Vertriebsleitung**: plant Gebietsschnitte auf der Karte, sieht vorher
  die Folgen (Kunden, Potenzial je GVL), speichert in einem Lauf.
- **GVL**: sieht sein Gebiet, seine Kunden und Projekte auf der Karte
  (read-only).
- **Admin**: Hygiene-Report (Überlappungen, Lücken, Bereiche ohne Gebiet,
  Gebiete ohne Manager).

## Was die App kann (v1)

1. **Karte**: Deutschland als Choropleth der PLZ-Gebiete, eingefärbt nach
   Gebiet bzw. GVL; Umschalter **Anwendung** (`wal_application_opt`), weil
   Gebiete je Produktlinie verschieden geschnitten sind. Zoom/Pan, Hover
   mit PLZ, Ort, Gebiet, GVL, Kundenzahl, Potenzial; Klick wählt, Shift
   oder Lasso wählt mehrere. Zwei Ebenen: 2-stellig für den Überblick,
   5-stellig beim Hineinzoomen.
2. **Seitenleiste je Gebiet**: Manager, Anwendung, Land, KPIs (Kunden,
   offenes Projektpotenzial, Auftragswert laufendes Jahr), Liste der
   Kunden/Projekte mit Deep-Link ins Formular, Bereiche des Gebiets als
   Liste (von–bis).
3. **Hygiene-Report**: PLZ ohne Gebiet (weiße Flecken, auf der Karte
   schraffiert), PLZ in mehreren Bereichen (Konflikt, rot), Bereiche mit
   ungültigen Grenzen, Gebiete ohne Manager, Kunden deren GVL nicht zum
   Gebiet ihrer PLZ passt (Drift).
4. **Umplanen**: Auswahl von PLZ-Gebieten → „Gebiet zuweisen" → die App
   rechnet die minimalen von–bis-Bereiche je Gebiet neu (pure function) →
   **Vorschau**: Diff der `wal_postalcoderange`-Zeilen (anlegen, ändern,
   löschen) plus KPI-Delta je GVL vorher/nachher → **Anwenden** mit
   Ergebnis je Zeile, danach Hinweis/Trigger für den bestehenden Refresh.
5. **Szenarien**: ungespeicherte Planung als JSON lokal sichern, laden,
   zwei Szenarien im KPI-Vergleich nebeneinander (v1 lokal, v2 Tabelle).
6. **Einrichtung/Diagnose**: Org-URL, Konnektor, Tabellen lesbar, Rechte
   auf `wal_postalcoderange` (Lesen/Schreiben), Geometrie geladen.

Bewusst nicht in v1: andere Länder als Deutschland (Architektur sieht eine
Geometriedatei je Land vor, `wal_country_ref` ist der Schlüssel), Routen-
oder Fahrzeit-Logik, Kunden einzeln umhängen (das macht der Refresh),
Auto-Optimierung von Gebieten.

## Technischer Weg

- **Geometrie ohne Kartendienst**: PLZ-Polygone Deutschland aus offenen
  Daten (OSM-basierte PLZ-Gebiete, ODbL; Quelle und Lizenz in der README
  nennen), mit mapshaper vereinfacht zu TopoJSON: 2-stellig (~100
  Flächen, wenige hundert KB) und 5-stellig (~8.200 Flächen, Ziel ≤ 3 MB,
  ggf. je 2-stelliger Region nachgeladen). Als statische Assets im Bundle,
  Rendering als **SVG mit d3-geo** (feste Mercator-Projektion auf DE).
  Keine Tile-Server: kein externer Netzwerkzugriff aus dem Power-Apps-Host,
  keine CSP-Frage, offline demobar. Ein Aufbereitungs-Skript
  (`scripts/build-geometry.mjs`) dokumentiert den Weg von Rohdaten zu
  Assets; Rohdaten nicht ins Repo.
- **Zuordnung** als pure functions mit Vitest: `expandRanges` (Bereiche →
  Map PLZ → Gebiet, mit Konflikt- und Lückenliste), `rebuildRanges`
  (Zuordnung → minimale von–bis-Bereiche je Gebiet/Anwendung/Land),
  `diffRanges` (alt/neu → anlegen/ändern/löschen), `kpiDelta`.
- **KPIs serverseitig aggregiert** über den Konnektor als FetchXML mit
  `aggregate="true"`, gruppiert nach PLZ (Kunden: count; Projekte: sum
  Potenzial, nur offene; Aufträge: sum `totalamount` im Jahr). Niemals die
  Kundentabelle komplett laden; Aggregat-Limit (50.000 Zeilen) und
  Row-Cap sichtbar machen, wie im Audit Explorer.
- **Lesen** über native Datenquellen (`territory`, `wal_postalcoderange`,
  `systemuser`) und den Konnektor (`ListRecordsWithOrganization` für
  Metadaten und FetchXML-Aggregate). **Schreiben** nur auf
  `wal_postalcoderange` über die native Datenquelle als angemeldeter
  Nutzer (Rechte greifen pro Person, Audit zeigt wer). Pro Zeile ein
  Ergebnis, sequentiell mit Fortschritt, Abbruch bei erstem Fehler
  optional.
- Konnektor als **Benutzer-Connection**. GVL ohne Schreibrecht sehen den
  Planungsmodus deaktiviert mit Hinweis (Rechte-Probe wie in der Roadmap
  des Schedule Board Managers beschrieben; wenn nicht ohne GET-Function
  machbar, Fehler beim ersten Schreiben in Klartext abbilden).
- Repo-Muster: Fluent UI v9, Service-Interface + Dataverse + Mock
  (synthetische Gebiete, Bereiche und PLZ-KPIs mit Seed-PRNG, keine
  echten Personen oder Kunden), Hilfe-Panel, `power.config.json`,
  `src/generated/`, `.env` gitignored. Beachte den Generator-Hinweis aus
  `apps/sales-dashboard/README.md` (für `account` wurden keine Typen
  emittiert, Modell handgeschrieben).

## Leitplanken

- Die App schreibt **nur** `wal_postalcoderange`; Kunden, Projekte,
  Angebote werden nie direkt umgehängt.
- Jede Änderung geht durch Vorschau mit Zeilen-Diff **und** KPI-Delta.
- Bereiche, die der Nutzer nicht angefasst hat, bleiben byteidentisch
  (kein „Normalisieren" fremder Zeilen).
- Konflikte (PLZ in zwei Bereichen) werden gezeigt, nicht stillschweigend
  aufgelöst; Anwenden mit offenem Konflikt braucht eine bewusste Wahl.
- Konkurrenz: `versionnumber` vor dem Schreiben prüfen (Muster Schedule
  Board Manager), bei Abweichung abbrechen und neu laden.
- Deutsche UI, Zahlen und Währung de-DE als FormattedValue bzw. `Intl`.

## Akzeptanz

- Waldmann DEV: Karte zeigt die realen Bereiche; der Hygiene-Report nennt
  Lücken/Konflikte, die eine Stichprobe gegen die Tabelle bestätigt.
- Umplanung von drei PLZ-Gebieten von GVL A nach B erzeugt den erwarteten
  Zeilen-Diff (Split eines Bereichs in zwei plus ein neuer), KPI-Delta
  stimmt mit einer Advanced-Find-Zählung überein; nach Anwenden sind die
  Zeilen so in Dataverse.
- Karte mit 8.200 Flächen bleibt flüssig (Hover ohne Ruckeln), Bundle ohne
  Geometrie unter 1 MB, Geometrie lazy.
- Mock-Modus zeigt alles inklusive Umplanung; Vitest, build, lint grün.

## Zielumgebung

**Waldmann D365 DEV** (`https://waldmann-dev.crm4.dynamics.com`, Env
`33146d71-4fe8-e1d7-af2f-f80fe968fc47`, pac-Profil `Waldmann` = SP,
Browser-Test als `AAD_ADM_HSO_Schwarz@waldmann.onmicrosoft.com`,
Publisher-Prefix `wal`). Fakten in `AGENTS.md` (Abschnitt Waldmann),
`apps/sales-dashboard/README.md` und `apps/my-day/README.md`. Nur Deutsch
als UI, obwohl die Umgebung drei Sprachen hat (Vertriebsleitung ist
deutsch); Strings zentral, damit das später lokalisierbar ist.

## Kickoff-Prompt

```text
Lies zuerst AGENTS.md im Repo-Root, dann docs/concepts/territory-planner.md
(das Konzept, verbindlich). Zur Orientierung an den Mustern lies
apps/sales-dashboard/README.md (Waldmann-Datenmodell, Generator-Hinweis,
Demo-Daten mit Seed) und die generierten Modelle unter
apps/sales-dashboard/src/generated/models/ (TerritoriesModel, AccountsModel,
Wal_projectsModel), apps/schedule-board-manager/README.md plus dessen
src/services/ (Metadaten über den Konnektor, Mock, versionnumber-Prüfung,
Hilfe-Panel) und apps/series-planner/README.md (Einrichtungsseite, pure
functions mit Vitest). Für Konnektor-Grenzen und FetchXML-Aggregate lies in
apps/solution-forge/CLAUDE.md die Gotchas #4 und #8.

Aufgabe: Lege die neue Code App apps/territory-planner/ („Gebietsplanung")
an und setze v1 aus dem Konzept um. Vorgehen:
1. Offene Fakten zuerst: Die Spalten von wal_postalcoderange und der
   bestehende Refresh-Prozess (wal_refresh_status_opt,
   wal_last_territory_refresh_dat) sind unbekannt. Formuliere die genauen
   Prüfbefehle für mich (pac env fetch mit FetchXML, EntityDefinitions-
   Abfrage, workflow-Suche) und baue bis zur Antwort gegen ein klar
   markiertes Annahmen-Modell (Von-PLZ, Bis-PLZ, Land, Anwendung, Lookup
   territory), das in einer einzigen Mapping-Datei liegt.
2. Scaffold nach docs/SETUP.md (Vite-Template, Fluent UI v9, d3-geo,
   topojson-client, Vitest, ESLint wie schedule-board-manager);
   power.config.json, src/generated/ und .env gitignored, .env.example mit
   VITE_ORG_URL.
3. Geometrie: Skript scripts/build-geometry.mjs, das aus einer offenen
   PLZ-Gebiete-Quelle (Quelle und ODbL-Lizenz in der README) TopoJSON für
   2-stellig und 5-stellig erzeugt; Assets lazy laden; Rohdaten nicht ins
   Repo. Falls der Download in deiner Session nicht geht, dokumentiere den
   Befehl und arbeite mit einer kleinen synthetischen Testgeometrie weiter.
4. Mock-first: Service-Interface, Dataverse- und Mock-Implementierung
   (synthetische Gebiete, Bereiche, PLZ-KPIs mit Seed-PRNG; keine echten
   Personen oder Kunden), pure functions expandRanges, rebuildRanges,
   diffRanges, kpiDelta mit Vitest inklusive Konflikt- und Lückenfällen.
5. UI: SVG-Karte mit Choropleth, Anwendung-Umschalter, Hover, Auswahl,
   Seitenleiste mit KPIs und Listen, Hygiene-Report, Umplanen mit
   Zeilen-Diff und KPI-Delta, Anwenden mit Ergebnis je Zeile, Szenarien
   lokal, Einrichtungsseite, Hilfe-Panel. UI Deutsch, Strings zentral.
6. README (Problem, Datenmodell mit Annahmen-Markierung, Geometrie-Quelle,
   Einrichtung mit pac-/power-apps-Befehlen für Waldmann DEV,
   Deployment-Stand, Offen), Roadmap.md, Eintrag in apps/README.md.
Regeln: npm run build, lint und test grün; Conventional Commits mit Scope
territory-planner auf Branch feature/territory-planner; kein Push und kein
Deployment ohne Rückfrage; pac/az-Logins nur per Device Code und nur auf
meine Anweisung — was du remote nicht prüfen kannst, dokumentiere als
konkrete Befehle für mich. Die App schreibt ausschließlich
wal_postalcoderange. Melde dich mit Zwischenständen, wenn das Scaffold
steht, wenn die Karte mit Mock-Daten läuft und wenn die Umplanung im Mock
komplett ist.
```
