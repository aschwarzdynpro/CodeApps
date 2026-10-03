# Roadmap — Translation Studio

Vorschläge für Erweiterungen (Stand 2026-10-03, ergänzt um das Code-Review
vom selben Tag). Nichts davon ist
beauftragt: Die Liste ist ein Katalog, aus dem einzelne Punkte ausgewählt
und dann umgesetzt werden. Erledigtes wandert nach unten in „Umgesetzt“,
verworfene Ideen werden gestrichen (Historie im Git-Log).

**Legende:**
- ⭐ empfohlen als Nächstes
- Aufwand: **S** (≤ ½ Tag), **M** (1–2 Tage), **L** (mehrere Tage)
- ⚠ braucht vorher eine Entscheidung oder Customizing in der Kundenumgebung

## Empfohlene Reihenfolge

1. **Vor dem ersten Live-Test** (zusammen etwa ein Tag):
   - ~~Fehlerbehebungen aus dem Review~~ (erledigt, siehe „Umgesetzt“)
   - Entwurf automatisch sichern
   - Bearbeiten bei großen Dateien flüssig machen
2. **Live-Verifikation in Waldmann DEV.** Die Punkte unter „Offen“ in der
   README klären, vor allem den Weg für `ExportTranslation` und
   `importjob`.
3. **Bedienung:** „korrekt so“ je Basistext, Tastaturfluss, Spaltennamen
   im Klartext.
4. **Qualitätsprüfungen** und **Terminologieliste** als nächster
   Funktionsschritt.
5. **Asynchrone Aktionen**, falls Import oder Publish an den Timeout
   stoßen; **gezielt veröffentlichen** statt `PublishAllXml`.

---

## Performance

Gemessen an einer synthetischen Datei mit 60.000 Beschriftungen (19,7 MB
XML, Node):

| Schritt | Zeit |
| --- | --- |
| Parsen | 995 ms |
| `applyEdits` (eine Änderung) | 51 ms |
| `findGaps` | 61 ms |
| Glossar-Vorschläge | 149 ms |
| Konsistenz-Report | 85 ms |
| Volltext-Filter | 42 ms |
| CSV-Export (alle Zeilen) | 315 ms |

- [ ] ⭐ **Bearbeiten flüssig machen** (S–M). Jede übernommene Zelle rechnet
      alles neu, bei dieser Größe etwa 400 ms Verzögerung. Abhilfe:
      - Vorschläge und Konsistenz über `useDeferredValue` rechnen; den
        Konsistenz-Report erst beim Öffnen des Dialogs.
      - Den Zeilenindex je Datei cachen (`WeakMap`), statt ihn in
        `applyEdits` bei jeder Änderung neu aufzubauen.

      Ziel: deutlich unter 100 ms.
- [ ] **Parsen im Web Worker** (M). Ein echter Default-Export einer
      D365-Umgebung mit Sales und Field Service ist ein Vielfaches größer
      und blockiert den Browser. Dazu eine Größengrenze mit dem Hinweis auf
      eine kleinere Solution.
- [ ] **Namensauflösung cachen und parallelisieren** (S). Pro Org und
      Sitzung cachen, 3–4 Anfragen parallel. Bisher liest jedes Laden
      (auch das Neuladen nach einem Import) alle `EntityDefinitions` neu
      und holt Attribute je zehn Tabellen nacheinander.

## Bedienung

- [ ] ⭐ **Entwurf automatisch sichern** (S). Ungespeicherte Änderungen je
      Org und Solution lokal sichern und beim nächsten Laden „Entwurf
      wiederherstellen“ anbieten (wie im Schedule Board Manager). Heute ist
      die Arbeit weg, wenn der Tab schließt oder der Host neu lädt.
- [ ] ⭐ **„Korrekt so“ je Sprache und Basistext** (S), statt je Zelle und
      Solution. Im Mock sind 27 von 198 deutschen Beschriftungen
      „vermutlich unübersetzt“ (Name, Status, Region, Information, Diesel
      …). Dazu eine Bulk-Aktion für alle gleichen.
- [ ] **Tastaturfluss** (S). Enter springt in die nächste Zeile derselben
      Sprache, ein Kürzel übernimmt den Vorschlag.
- [ ] **Spaltennamen im Klartext** (S): „Anzeigename“, „Pluralname“,
      „Beschreibung“ statt `LocalizedName` usw. Für geänderte Zellen den
      Exporttext als Tooltip.
- [ ] **Sortieren und Filter „mit Vorschlag“** (S). Sortieren nach Tabelle,
      Komponente oder Basistext; Filter „nur Lücken mit Vorschlag“.
- [ ] **Barrierefreiheit** (S). Rolle `gridcell` für die Zellen; die
      Eingabe-Labels nennen den Basistext statt nur „DisplayName 1036“.
- [ ] **Hängende Verlaufseinträge** (S). Beim Start Einträge mit Status
      „lief noch“ aus `importjob` nachziehen, falls der Browser während
      eines Imports geschlossen wurde.

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

- [ ] ⭐ **Qualitätsprüfungen** (M) als eigener Zustand oder Filter:
      - Leerzeichen am Anfang oder Ende
      - Platzhalter (`{0}`) in Display Strings
      - Satzzeichen, die in der Basis da sind und hier fehlen (`:`, `?`)
      - abweichende Zeilenumbrüche
      - viel länger als die Basis (wird auf Formularen abgeschnitten)
      - Großschreibung

      Findet Fehler, die der Lückenfilter nicht sieht.
- [ ] **Terminologieliste** (M) ⚠. Kundenbegriffe, z. B. „Account“ →
      „Firma“ bei Waldmann, als CSV oder Tabelle. Dient als Quelle für
      Vorschläge und als Regelprüfung („Konto“ ist hier falsch).
- [ ] **Vergleich und Transport zwischen Umgebungen** (M–L), z. B.
      DEV → TEST/PROD, ohne Solution-Deployment. Der Konnektor liest mit
      beliebiger Org-URL. Geht nur, wenn der Export über den Konnektor
      läuft (siehe README „Offen“).
- [ ] **Abdeckung im Zeitverlauf** (M). Je Solution und Sprache
      Momentaufnahmen speichern und den Fortschritt zeigen.

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

- Fehlerbehebungen aus dem Review (2026-10-03):
  - **Kein doppelter Import.** Für Aktionen mit Wirkung (Import, Publish)
    probiert `callAction` den nächsten Weg nur noch, wenn der vorige
    nachweislich nicht existiert („No HTTP resource“, 404 …). Nie nach
    einem Timeout oder Abbruch, bei dem der Aufruf schon gelaufen sein
    kann (`mayTryNextRoute`, Vitest).
  - **Ladefolge.** Ergebnisse eines älteren Ladevorgangs, auch die
    Namensauflösung, überschreiben keinen neueren mehr.
  - **Sperre.** Nach einem Importlauf wird das Studio immer entsperrt; ein
    unerwarteter Fehler erscheint als Ergebnis statt als hängender Dialog.
  - **Spät erscheinender Importjob.** Nach einem gescheiterten
    Import-Aufruf liest `runImport` den Job noch dreimal, damit dessen
    Protokoll nicht verloren geht.

- v1 (2026-10-03, nicht deployt):
  - Scope, Lückenmatrix mit Zuständen und Filtern, KPI-Leiste
  - Glossar-Vorschläge und Konsistenz
  - CSV-Roundtrip, Diff-Vorschau
  - Import mit Importjob-Fortschritt und Publish
  - Verlauf (lokal), Einrichtung mit Export-Test, Hilfe
  - Mock-Modus komplett
