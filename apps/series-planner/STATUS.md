# Status Serienplanung — Übergabe (2026-10-02)

Gebaut auf `feature/series-planner` in einer Remote-Session, am 2026-10-02
nach `main` gemergt (Branch gelöscht); weiter geht es auf `main` mit Claude
Code in VS Code. Fachliches und Einrichtung stehen in der
[README](README.md), hier nur der Stand und die nächsten Schritte.

## Stand

- App komplett gebaut (Commit 82b1090): Serien anlegen, ganze Serie oder
  „diesen und alle folgenden“ bearbeiten, Einzeltermine verschieben,
  umbesetzen, absagen, wiederherstellen; Feiertage, Abwesenheiten und
  Überschneidungen schon in der Planung mit Ausweichtagen; Plan-Vorschau
  (anlegen / ändern / absagen / behalten) vor jedem Schreiben.
- `npm run test` (30 Tests), `npm run lint`, `npm run build` grün — der Build
  nur mit temporären Stubs für `src/generated/`, die wieder gelöscht sind.
- Im Browser gegen den Mock durchgespielt: Serie mit automatisch
  ausgelassenen Terminen (Urlaub, Ostermontag) und Verschieben auf einen
  vorgeschlagenen Tag, Ressource eines Einzeltermins tauschen, „diesen und
  alle folgenden“ mit neuem Zeitfenster, Quartalsserie, Einrichtung.
- **Nicht deployt, nicht gegen echtes Dataverse getestet.**
  `scripts/provision-schema.ps1` ist nicht ausgeführt und nicht
  syntaxgeprüft (kein `pwsh` in der Session).

## Nächste Schritte (Ziel Schulz UAT)

1. `pwsh scripts/provision-schema.ps1 -EnvironmentUrl https://operations-d365-schulz-uat-1-1.crm4.dynamics.com`
   (Az-Login per Device Code). Legt `pro_seriesplan`, die Lookups und
   `msdyn_workorder.pro_occurrence_dat` in der Solution
   `DynamicsProSeriesPlanner` an.
2. Rechte auf `pro_seriesplan` für die Disponenten-Rolle vergeben.
3. `pac code init` und die Datenquellen laut README, Schritt 3 — inklusive
   Dataverse-Connector mit **Benutzer**-Connection — und `.env` mit
   `VITE_ORG_URL`.
4. `npm run build`. Bricht er mit einem Klassennamen ab, den Import in
   `src/services/dataverseSeriesService.ts` an `src/generated/` anpassen
   (die Namen dort sind aus den Entity-Sets abgeleitet, nicht gesehen).
5. `npm run dev` im Host („Local Play“), Tab „Einrichtung“: alles grün?
6. Eine Testserie mit 3–4 Terminen anlegen und prüfen: Arbeitsauftrag mit
   Projekt, Konto und Typ; Ressourcenanforderung mit richtiger Dauer;
   Buchung mit Ressource und Status; Absagen setzt Buchung auf
   „Abgesagt“ und Auftrag auf „Storniert“; Feiertage/Arbeitszeiten werden
   angezeigt.
7. Push in die Umgebung erst nach Rücksprache — Profilwahl, Guard
   (`pac org who` == Ziel-URL) und Push in **einem** Aufruf (Root-`AGENTS.md`).

## Offene Fragen (Details in der README unter „Offen“)

- Schreibpfade über die nativen Datenquellen (`@odata.bind`, auch
  `@odata.bind: null`), `msdyn_LoadCalendars` und der Feiertagskalender über
  den Connector, `top`/`orderBy` der generierten Clients.
- Projektaufgabe am Auftrag: nur der zugewiesene Nutzer darf sie setzen, und
  ihre Termine überschreiben das Zeitfenster — eventuell nur das Projekt
  setzen.
- Zeiteinträge: entstehen sie bei Schulz automatisch aus der Buchung?
- Regionale Feiertage greifen nur über den Ressourcenkalender.

## Hinweise

- `power.config.json`, `src/generated/` und `.env` sind gitignored; ohne
  `src/generated/` bricht der Build. Nie Stubs dafür committen.
- Neue Service-Methoden immer auch in `mockSeriesService.ts` nachziehen —
  ohne Host läuft die App auf dem Mock.
- Commits: `feat(series-planner): …` / `fix(series-planner): …`, deutscher
  Betreff. Kein PR ohne Aufforderung.
