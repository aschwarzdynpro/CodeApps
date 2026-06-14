# Sales Dashboard GVL — Roadmap

Brainstorming und Priorisierung möglicher Weiterentwicklungen der Code-App
„Sales Dashboard GVL" (Waldmann). Lebendes Dokument — Reihenfolge und Umfang
sind Vorschläge, keine Festlegung.

Legende: **Impact** ● gering · ●● mittel · ●●● hoch — **Aufwand** S klein ·
M mittel · L groß.

---

## 1. Stand heute (Juni 2026)

Bereits umgesetzt:

- **Datenanbindung**: Live-Dataverse (Aktivitäten, Leads, Verkaufschancen,
  Projekte, Angebote, Aufträge, Konten, Benutzer, Territorien) mit
  automatischem Demo-Fallback und Demo-Schalter.
- **Überblick**: KPI-Leiste (6 Kennzahlen), zugleich klickbare Bereichsauswahl.
- **Bereichsansicht**: ein Bereich groß (Diagramm + Tabelle nebeneinander),
  pro Bereich Ansichten (≈ Legacy-SavedQueries), Diagramme (Donut/Säule/
  gestapelt/Funnel), Schnellsuche und Cross-Filter per Diagrammklick.
- **GVL-Filter**: Suchfeld über Territory-Manager; live serverseitige
  Neuabfrage je GVL; Standard = angemeldeter Benutzer.
- **Detail-Modal**: native Datensatzansicht (alle Felder) + Link ins
  Sales-Hub-Formular.
- **Spalten-Konfigurator** je Liste: ein-/ausblenden, verschieben, persistiert.
- **Designs**: Hell / Dunkel / Waldmann (Markenrot).
- **Deep-Links** in die Model-driven App (Sales Hub).

Bekannte Grenzen / technische Schulden (fließen in den Querschnitt ein):

- Harte Kappung bei **2.000 Zeilen/Entität**; KPIs & Diagramme werden
  **clientseitig** auf dem gekappten Bestand berechnet (nicht serverseitig
  aggregiert) → bei großen Datenmengen ungenau.
- „Meine Aktivitäten" filtert live auf **Besitzer** statt Beteiligte
  (activityparty); `hasOpenTasksForMe` ist live noch `false` (keine
  Task-Datenquelle); `statusChangedOn ≈ modifiedon`.
- **Rollenmodell offen** („vorerst für alle") — aus der ersten Anforderung
  bewusst vertagt.
- **MDA-Einbettung** (CSP-Freigabe + Web-Resource + Sitemap) noch nicht final.
- Keine **automatisierten Tests**; `.power/dataSourcesInfo` ist gitignored
  (muss je Worktree regeneriert werden — war Ursache eines Demo-Fallback-Bugs).

---

## 2. Offene Produktentscheidungen (vor H2 zu klären)

Diese Punkte bestimmen mehrere Features und sollten früh entschieden werden:

1. **Rollen / Sichtbarkeit** — Wer sieht was? Nur eigene GVL-Daten, das eigene
   Team, oder alles? Bestimmt Team-Ansicht, Security und Default-Verhalten.
2. **Manager-/Team-Sicht** — Soll ein übergeordneter Vertriebsleiter mehrere
   GVL **aggregiert** sehen und vergleichen? (In der ersten Runde bewusst
   zurückgestellt.)
3. **Read-only vs. Schreiben** — Soll man aus dem Dashboard heraus handeln
   (Aktivität anlegen, Phase/Nachfasstermin ändern) oder bleibt es reine
   Auswertung mit Sprung ins Formular?
4. **Zielvorgaben** — Gibt es Soll-/Quota-Daten je GVL/Monat? Wenn ja, woher
   (Dataverse-Tabelle, Excel)? Grundlage für Forecast/Soll-Ist.
5. **Mengengerüst** — Wie viele Datensätze je GVL/Monat realistisch? Treibt die
   Entscheidung serverseitige Aggregation/Paging.

---

## 3. Horizont 1 — Quick Wins (jetzt)

Hoher Nutzen, baut direkt auf dem Bestehenden auf.

| Feature | Nutzen | Impact | Aufwand |
| --- | --- | --- | --- |
| **Excel-/CSV-Export** der aktuellen Liste | „Mal eben mitnehmen"/weiterverarbeiten — Top-Wunsch im Vertrieb | ●●● | S |
| **Globale Filterleiste** (Zeitraum, Region/Territory, Anwendung `wal_application`, Status) statt nur pro Kachel | gezieltes Eingrenzen über alle Bereiche | ●●● | M |
| **MDA-Einbettung fertigstellen** (CSP + Web-Resource + Sitemap) | Dashboard im gewohnten Sales-Hub-Menü | ●●● | S–M |
| **Drag&Drop** im Spalten-Konfigurator (statt nur ↑/↓) | komfortableres Umsortieren | ● | S |
| **Überfällig-/Aging-Hinweise** (überfällige Nachfass-/Entscheidungstermine farblich) | nichts geht unter | ●● | S |
| **„Aktualisiert vor X Min." + Auto-Refresh-Option** | Vertrauen in Aktualität | ● | S |
| **Persistente Standardansicht** (zuletzt gewählter Bereich/GVL merken) | weniger Klicks pro Sitzung | ● | S |
| **Leerzustände & Fehlermeldungen** verfeinern (z. B. „GVL hat keine Daten") | Klarheit statt leerer Tabelle | ● | S |

---

## 4. Horizont 2 — Ausbau (als Nächstes)

Spürbarer fachlicher Mehrwert, mittlerer Aufwand.

| Feature | Nutzen | Impact | Aufwand |
| --- | --- | --- | --- |
| **Forecast/Pipeline gewichtet** (Wahrscheinlichkeit × Wert nach Prognosekategorie, Commit/Best Case/Pipeline) | Kern-Vertriebssteuerung | ●●● | M |
| **Soll-Ist / Zielerreichung** je GVL (Monat/Quartal) | Steuerung gegen Ziele | ●●● | M (braucht Zieldaten) |
| **Trend über Zeit** (Auftragseingang/Angebotswert als Linien-/Säulenverlauf, rollierende Monate) | Entwicklung statt nur Vormonatsdelta | ●● | M |
| **Conversion-Funnel** Leads → Chancen → Angebote → Aufträge inkl. Quoten | Wo versickert die Pipeline? | ●● | M |
| **Konto-360** (Klick auf Kunde → alle Chancen/Angebote/Aufträge/Projekte/Aktivitäten) | Kundengespräch vorbereiten | ●●● | M |
| **Team-/Manager-Sicht** (mehrere GVL aggregiert, Ranking, Drill-down) | Führungssicht (s. Entscheidung #2) | ●●● | M–L |
| **Gespeicherte persönliche Ansichten/Filter** | wiederkehrende Auswertungen | ●● | M |
| **Inline-Aktionen** (Nachfasstermin setzen, Phase ändern, Aktivität anlegen) via Dataverse-Schreibzugriff | aus Auswertung wird Arbeitsoberfläche (s. Entscheidung #3) | ●●● | M–L |
| **Aktivitäten-Agenda** (Heute/Diese Woche, Kalenderblick) | Tagesplanung | ●● | M |

---

## 5. Horizont 3 — Strategisch (später)

Größere Investitionen / höhere Reife.

| Feature | Nutzen | Impact | Aufwand |
| --- | --- | --- | --- |
| **Proaktive Hinweise/Alerts** (Deals diese Woche, Ziel in Gefahr, überfällige Tasks) | von „nachschauen" zu „erinnert werden" | ●●● | M–L |
| **KI-Zusammenfassung** „Was ist diese Woche wichtig?" (Copilot/Azure OpenAI über die geladenen Daten) | Verdichtung & Empfehlung | ●● | L |
| **Mobile/Teams-tauglich** (responsives Layout, Teams-Tab, Power Apps mobil) | Vertrieb ist unterwegs | ●●● | L |
| **Geplante E-Mail-Digests** (täglich/wöchentlich je GVL) | Reichweite ohne App-Öffnen | ●● | M (Flow) |
| **Projekt-Timeline/Gantt** + Gewinn/Verlust-Analyse (Waldmann-Projektgeschäft) | Projektpipeline steuern | ●● | L |
| **Mehrsprachigkeit (DE/EN)** + ggf. Mehrwährung | internationaler Einsatz | ●● | M–L |
| **Karten-/Regionssicht** (Umsatz/Pipeline je Territory auf Landkarte) | regionale Steuerung | ● | L |

---

## 6. Querschnitt / Fundament (laufend, parallel)

Nicht „sichtbare Features", aber Voraussetzung für Skalierung, Sicherheit und
Wartbarkeit:

- **Serverseitige Aggregation** (FetchXML-Aggregate/Dataverse) für KPIs &
  Diagramme → korrekt jenseits der 2.000-Zeilen-Kappung; **Paging/virtualisierte
  Tabelle** für große Listen.
- **Rollenbasierter Zugriff** an Dataverse-Security ausgerichtet (Entscheidung #1);
  ggf. Field-Level-Security berücksichtigen.
- **ALM**: Solution-Verpackung, saubere Dev/Test/Prod-Umgebungen, Pipelines;
  `.power`-Generierung reproduzierbar machen (Onboarding/CI).
- **Telemetrie** (Application Insights): Nutzung, Performance, Fehler.
- **Tests**: Unit-Tests für `utils/aggregate` & `utils/format`, Komponententests
  (Spalten-Konfig, GVL-Filter), optional E2E.
- **Datenqualität live**: activityparty für „Meine Aktivitäten", Task-Datenquelle
  für Projektaufgaben, echtes `statusChangedOn` (Audit), PSP-Element via
  Projekt-Join.
- **Barrierefreiheit & Performance-Budget** als Dauer-Kriterien.

---

## 7. Vorgeschlagene Sequenz

1. **Sofort**: MDA-Einbettung abschließen + Excel-Export + globale Filterleiste
   (sichtbarer Nutzen, kleiner/mittlerer Aufwand).
2. **Parallel starten**: serverseitige Aggregation als Fundament (entkoppelt die
   Genauigkeit von der Zeilenkappung) — bevor Forecast/Trends gebaut werden.
3. **Dann**: Produktentscheidungen #1–#4 klären → Forecast/Soll-Ist + Konto-360.
4. **Wenn Team-Sicht gewünscht**: Rollenmodell + aggregierte Manager-Sicht.
5. **Später**: Alerts/KI/Mobile je nach Resonanz aus 1–4.

---

*Pflegehinweis: Bei Umsetzung eines Punkts hier abhaken/verschieben und im
`docs/`-Bereich (HANDOVER/IDEAS) referenzieren.*
