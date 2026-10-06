# Roadmap — Arbeitszeiten & Kalender

Vorschläge für den Ausbau nach v1 (Stand 2026-10-06). Nichts davon ist
beauftragt — die Liste ist ein Katalog. Erledigtes wandert nach unten in
„Umgesetzt“, Verworfenes wird gestrichen (Historie im Git-Log). Die
Feature-Nummern folgen der Feature Map im Konzept
(`docs/concepts/work-hours-manager.md`).

**Legende:** ⭐ empfohlen als Nächstes · Aufwand **S** (≤ ½ Tag), **M** (1–2
Tage), **L** (mehrere Tage) · ⚠ braucht vorher eine Entscheidung oder einen
Befund aus der Zielumgebung.

## Empfohlene Reihenfolge

1. **Restliche Live-Tests** in NAAF-Backup: Nachtschicht, Rechtefehler,
   `IsEdit` mit fremder Zeitzone, `UseV2` aus (README „Offen“).
2. **Ladezeit der Liste** messen und ggf. Wurzelregeln cachen (unten).
3. Danach die v2-Punkte unten, beginnend mit dem Zeitzonenwechsel (2.5) und
   dem Vergleich zweier Ressourcen (1.4).

---

## Absicherung & Betrieb

- [ ] ⭐ ⚠ **Restliche Live-Tests** (S) — Nachtschicht, Rechtefehler (Konto
      ohne Kalenderrecht), `IsEdit` mit anderer `TimeZoneCode`, `UseV2` aus.
- [ ] ⭐ ⚠ **Ladezeit der Liste** (M) — 850 Kalender × 1 Abruf; Cache der
      Wurzelregeln im Browser, Änderungsprobe per
      `calendars?$select=calendarid,modifiedon` (prüfen, ob `modifiedon` des
      Kalenders bei Regeländerungen steigt).
- [ ] **Virtualisierung der Wochenansicht und der Liste** (M) — ab
      `LIMITS.virtualizeFrom` nur sichtbare Zeilen, Popover erst beim Klick.
- [ ] **Paging** (S) — `odata()` folgt `@odata.nextLink` nicht (> 5.000
      Zeilen werden abgeschnitten); `$skiptoken` gibt der Konnektor her.
- [ ] **Rückgängig robuster** (M) — nach jedem Schritt Baum lesen und den
      Unterschied zum Snapshot speichern; heute fehlt die Fortsetzungsregel,
      die der Server ohne „bestehende beenden“ anlegt.
- [ ] **Teilweise geschriebene Speicherungen** (S) — scheitert der zweite
      Aufruf (Nachtschicht), sagen, was schon geschrieben ist.
- [ ] **Kapazitätsfilter-Blätter** (S) — TimeCode-3-Blätter beim Bearbeiten
      erhalten oder warnen.
- [ ] **Rechte-Check auf der Einrichtungsseite** (S) — Lesen/Schreiben auf
      `calendar`, `bookableresource`, `msdyn_workhourtemplate`, Eigenkalender-
      Recht, Erreichbarkeit aller vier Actions je Konto.
- [ ] **E2E-Abläufe ins Repo** (S) — die Playwright-Skripte der Session
      (Lesen, Editor, Massenlauf, Feiertage) liegen außerhalb des Repos; als
      `npm run e2e` gegen den Mock aufnehmen.
- [ ] **Native Dataverse-Actions** (M) — sobald Actions in Code Apps GA sind,
      `dataverseActions`-Pfad in `dataverseCalendarService.ts` umstellen
      (Muster Translation Studio: `pa app add dataverse-api`), Konnektor als
      Fallback behalten.

## Lesen & Diagnose

- [ ] **1.4 Vergleich zweier Ressourcen** (M) — zwei Bäume nebeneinander,
      Unterschiede je Wochentag und Zeitspanne; Einstieg für „gleich wie …“.
- [ ] **5.6 Überlappende Rang-0-Regeln** (S) — gemischte V1/V2-Bäume als
      Befund melden und das erwartete Verhalten erklären (Logik liegt in
      `resolve.ts` bereits).
- [ ] **5.7 Abwesenheitsanträge genehmigt, aber ohne Regel** (S) —
      `msdyn_timeoffrequest` mit `msdyn_approvedby` gegen Rang-1-Blöcke
      abgleichen.
- [ ] **Kapazitäts-Heatmap** (M) — Effort je Tag/Team als Farbskala; Übergang
      zu Idee 6 (Capacity & Skills Planner).

## Bearbeiten

- [ ] ⚠ **2.5 Zeitzone der Ressource und ihrer Regeln ändern** (M) — alle
      Regeln mit neuer `TimeZoneCode` neu schreiben (Save mit IsEdit), die
      Ressource selbst per Update; vorher Befund 5.3 live prüfen.
- [ ] **3.3 Wiederholung für n Ressourcen beenden/verlängern** (S) — Plan-Art
      „Ende setzen“ auf der vorhandenen `end`-Intent.
- [ ] **3.4 Kapazität oder Schließungsbeachtung umstellen** (S) — Plan-Art
      „Edit in place“ mit geänderten `Effort`/`ObserveClosure`.
- [ ] **Pausen-Vorlagen im Editor** (S) — „Standardpause 12:00–12:30“ per
      Klick einfügen.

## Feiertage

- [ ] **4.4 Regionale Feiertage als Abwesenheit je Ressource** (M) — Regelwerk
      je Gebiet/Org-Einheit wählen, fehlende Tage als Nicht-Arbeit auf die
      Ressourcen des Gebiets schreiben (Massenlauf).
- [ ] **Kantonale Regelwerke Schweiz, Augsburger Friedensfest** (S) — in
      `holidays.ts` ergänzen.

## Transport & Verlauf

- [ ] **3.6 Export/Import eines Kalenders als JSON** (M) — Baum als Datei,
      Import als Massenlauf (Umgebung → Umgebung); Kern mit Schedule Board
      Manager und Setup Transporter teilen.
- [ ] **Lauf-Tabelle `pro_calendarrun`** (M) — Plan, Snapshot und Ergebnis in
      Dataverse statt nur im Browser; `scripts/provision-schema.ps1` wie in
      der Serienplanung.

---

## Umgesetzt

- 2026-10-06 — Review-Runde: beim Bearbeiten/Beenden bleibt die Zeitzone der
  Regel; `ObserveClosure` nur, solange keine Feiertagsliste da ist (Befund
  „Feiertagsliste mehrfach“); Schließungen nur bei Ressourcen mit
  Feiertagsliste; Wiederholung gedrosselter Lesezugriffe, nicht lesbare
  Kalender einzeln gemeldet; Slots/Abwesenheiten/Kategorien parallel, Woche
  aus der Diagnose-Abfrage; Liste und Diagnose memoisiert; Lauf-Plan beim
  Ausführen eingefroren; Warnung, wenn der Verlauf nicht gespeichert wird.
- 2026-10-06 — Live-Verifikation: Lesen in Schulz UAT, Schreiben in
  NAAF-Backup (alle Editor-Fälle, Vorlage auf 3 Ressourcen + Rückgängig,
  Schließungen anlegen/löschen über `msdyn_BusinessClosureDelete`),
  Abgleich der Diagnose mit dem Schedule Board; Deployment UAT + NAAF.

- 2026-10-05 — v1 nach Konzept: Lesen (Liste, Woche/Monat mit Herkunft,
  Inspektor, Diagnose 5.1–5.5), Einzel-Edit mit Vorschau, Massenlauf mit
  Snapshot/Verlauf/Rückgängig, Feiertage mit Regelwerk-Abgleich, Hilfe.
  Mock-first; Live-Verifikation steht aus.
