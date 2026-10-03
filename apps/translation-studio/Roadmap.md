# Roadmap — Translation Studio

Vorschläge für Erweiterungen (Stand 2026-10-03). Nichts davon ist
beauftragt: Die Liste ist ein Katalog, aus dem einzelne Punkte ausgewählt
und dann umgesetzt werden. Erledigtes wandert nach unten in „Umgesetzt“,
verworfene Ideen werden gestrichen (Historie im Git-Log).

**Legende:**
- ⭐ empfohlen als Nächstes
- Aufwand: **S** (≤ ½ Tag), **M** (1–2 Tage), **L** (mehrere Tage)
- ⚠ braucht vorher eine Entscheidung oder Customizing in der Kundenumgebung

## Empfohlene Reihenfolge

1. **Live-Verifikation in Waldmann DEV.** Die Punkte unter „Offen“ in der
   README klären, vor allem den Weg für `ExportTranslation` und
   `importjob`.
2. **Asynchrone Aktionen**, falls Import oder Publish an den Timeout
   stoßen.
3. **Gezielt veröffentlichen** statt `PublishAllXml`.
4. **E2E-Tests ins Repo.**

---

## Absicherung & Betrieb

- [ ] ⭐ **Live-Verifikation** (S). README „Offen“ Punkt für Punkt in
      Waldmann DEV durchgehen und die Ergebnisse festhalten:
      - Export-Weg und Signatur des generierten Services
      - Antwortform
      - `Default` als Solution
      - Importjob-ID, Lesbarkeit und `data`-Format
      - Typwerte in `Entity Name`, Namensauflösung

      Danach den ersten echten Export (anonymisiert, nur Metadaten) gegen
      `src/fixtures/CrmTranslations.sample.xml` abgleichen.
- [ ] ⭐ **`ImportTranslationAsync` / `PublishAllXmlAsync`** (M). Beide
      liefern eine `AsyncOperationId`. Statt auf einen langen Aufruf zu
      warten, `asyncoperation` (und `importjob`) pollen. Sicher gegen den
      Power-Apps-Timeout von 180 s.
- [ ] **Größengrenze** (S). Größe des Exports messen. Ab einer Schwelle,
      die live zu ermitteln ist, nicht importieren, sondern auf eine
      kleinere Solution verweisen.
- [ ] **E2E-Tests ins Repo** (M). Die Playwright-Abläufe aus der
      Bau-Session (Matrix, CSV-Roundtrip, Import mit Fehlerpfad, Managed,
      Default-Scrollen) als `npm run e2e` gegen den Mock.

## Funktionen

- [ ] ⭐ **Gezielt veröffentlichen** (S). `PublishXml` mit den Tabellen
      der geänderten Beschriftungen statt `PublishAllXml`. Kein
      Mitveröffentlichen fremder Änderungen, schneller.
- [ ] **Markierung „nicht in der Solution“** (M). Über `solutioncomponent`
      zeigen, welche Beschriftungen zu Komponenten außerhalb der Solution
      gehören. Deren Änderung macht sie zu Abhängigkeiten (Microsoft
      Learn). Optional: solche Zeilen ausblenden.
- [ ] **Schnellpfad für Auswahlwerte** (M). `UpdateOptionValue` mit
      `MergeLabels: true` (POST, Konnektor-fähig) für einzelne Werte ohne
      Datei-Roundtrip.
- [ ] **Verlauf in Dataverse** (M) ⚠. Eigene Tabelle
      `pro_translationrun` (Solution, Änderungen je Sprache, Importjob,
      Ergebnis), damit der Verlauf auch für andere Nutzer sichtbar ist.
      Braucht Schema in der Kundenumgebung.
- [ ] **xlsx-Export** (S–M). Zusätzlich zur CSV ein echtes Excel mit
      gesperrten Schlüssel- und Basisspalten und Datenüberprüfung auf 500
      Zeichen.
- [ ] **Maschinelle Übersetzung** (L) ⚠. DeepL oder Azure Translator über
      einen Konnektor, nur als Vorschlag (wie das Glossar). Braucht eine
      Datenschutz-Entscheidung des Kunden.
- [ ] **Glossar über Umgebungen** (M). Übersetzungen einer anderen
      Umgebung (z. B. PROD) als Vorschlagsquelle. Export dort, nur lesen.
- [ ] **Tastaturbedienung der Matrix** (S). Enter springt in die nächste
      Zeile derselben Sprache, Pfeiltasten wechseln die Zelle.
- [ ] **Mehrsprachige Oberfläche** (S). `src/strings.ts` und die Hilfe
      übersetzen, die Sprache kommt aus den Benutzereinstellungen.

## Bewusst nicht vorgesehen

- Bearbeiten der Basissprache.
- Beschriftungen in Canvas Apps, Generative Pages und Flows sowie
  Rollennamen. Sitemap-Bereiche, -Gruppen und -Unterbereiche deckt der
  Dataverse-Export nicht ab.

---

## Umgesetzt

- v1 (2026-10-03, nicht deployt):
  - Scope, Lückenmatrix mit Zuständen und Filtern, KPI-Leiste
  - Glossar-Vorschläge und Konsistenz
  - CSV-Roundtrip, Diff-Vorschau
  - Import mit Importjob-Fortschritt und Publish
  - Verlauf (lokal), Einrichtung mit Export-Test, Hilfe
  - Mock-Modus komplett
