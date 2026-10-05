# Roadmap — Arbeitszeiten & Kalender

Vorschläge für den Ausbau nach v1 (Stand 2026-10-05). Nichts davon ist
beauftragt — die Liste ist ein Katalog. Erledigtes wandert nach unten in
„Umgesetzt“, Verworfenes wird gestrichen (Historie im Git-Log). Die
Feature-Nummern folgen der Feature Map im Konzept
(`docs/concepts/work-hours-manager.md`).

**Legende:** ⭐ empfohlen als Nächstes · Aufwand **S** (≤ ½ Tag), **M** (1–2
Tage), **L** (mehrere Tage) · ⚠ braucht vorher eine Entscheidung oder einen
Befund aus der Zielumgebung.

## Empfohlene Reihenfolge

1. **Phase 0 nachholen und Annahmen schließen** — die Exporte aus der README
   („Phase 0 — Discovery“) gegen `rules.ts` prüfen; erst dann hat die
   Herkunft im Kalender Beweiskraft.
2. **Live-Verifikation in Schulz UAT** nach der Akzeptanzliste des Konzepts
   (Einzel-Edit alle Fälle, Vorlage auf drei Testressourcen, Rückgängig,
   Feiertage 2027 Bayern) — Tabelle „Verifiziert (live)“ in der README füllen.
3. **Deployment** nach Rücksprache (`pac code push`, Benutzer-Connection).
4. Danach die v2-Punkte unten, beginnend mit dem Zeitzonenwechsel (2.5) und
   dem Vergleich zweier Ressourcen (1.4).

---

## Absicherung & Betrieb

- [ ] ⭐ ⚠ **Annahmen aus „Offen“ schließen** (S) — UTC-naive Zeitfelder,
      timecode/subcode, `groupdesignator`, Speicherort eines bearbeiteten
      Einzeltags, `UseV2`/`IsEdit`-Serialisierung, Delete-Parameterform,
      Schließungen löschen. Jede Antwort als Fixture (anonymisiert) nach
      `src/fixtures/` und als Test.
- [ ] ⭐ **Live-Verifikation** (M) — Akzeptanzliste des Konzepts in UAT
      durchspielen; Formular der Ressource und Board müssen dasselbe zeigen.
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
- [ ] **Virtualisierung der Wochenansicht** (S) — ab ~100 Ressourcen nur die
      sichtbaren Zeilen rendern (Fensterung wie Translation Studio).
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
- [ ] ⚠ **Schließungen löschen** (S) — je nach Befund aus Phase 0: Custom API,
      `msdyn_DeleteCalendar` auf dem Org-Kalender oder nur Hinweis.

## Transport & Verlauf

- [ ] **3.6 Export/Import eines Kalenders als JSON** (M) — Baum als Datei,
      Import als Massenlauf (Umgebung → Umgebung); Kern mit Schedule Board
      Manager und Setup Transporter teilen.
- [ ] **Lauf-Tabelle `pro_calendarrun`** (M) — Plan, Snapshot und Ergebnis in
      Dataverse statt nur im Browser; `scripts/provision-schema.ps1` wie in
      der Serienplanung.

---

## Umgesetzt

- 2026-10-05 — v1 nach Konzept: Lesen (Liste, Woche/Monat mit Herkunft,
  Inspektor, Diagnose 5.1–5.5), Einzel-Edit mit Vorschau, Massenlauf mit
  Snapshot/Verlauf/Rückgängig, Feiertage mit Regelwerk-Abgleich, Hilfe.
  Mock-first; Live-Verifikation steht aus.
