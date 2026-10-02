# Roadmap — Schedule Board Manager

Vorschläge für Erweiterungen und Optimierungen (Stand 2026-10-02). Nichts
davon ist beauftragt — die Liste ist ein Katalog, aus dem einzelne Punkte
ausgewählt und dann umgesetzt werden. Erledigtes wandert nach unten in
„Umgesetzt“, verworfene Ideen werden gestrichen (Historie im Git-Log).

**Legende:** ⭐ empfohlen als Nächstes · Aufwand **S** (≤ ½ Tag), **M** (1–2
Tage), **L** (mehrere Tage) · ⚠ braucht vorher eine Entscheidung oder
Customizing in der Kundenumgebung.

## Empfohlene Reihenfolge

1. **UAT-Verifikation und Diagnose-Seite** — die offenen Punkte aus der
   README einmal sauber gegen echtes Dataverse prüfen, bevor neue Funktionen
   darauf aufsetzen.
2. **PROD-Deployment mit Deploy-Skript** — Voraussetzung dafür, dass Boards
   per Export/Import nach PROD kommen.
3. **Board-Gesundheitscheck** und **Konfigurationen verwalten** — räumen
   das auf, was die bisherigen Werkzeuge sichtbar gemacht haben (tote
   Ansichten, ungenutzte Konfigurationen, Filter ohne Wirkung).
4. **E2E-Tests ins Repo** — die Playwright-Abläufe gibt es schon, sie liegen
   nur außerhalb des Repos.

---

## Absicherung & Betrieb

- [ ] ⭐ **UAT-Verifikation der offenen Punkte** (S) — die Liste unter
      „Offen“ in der README Punkt für Punkt in UAT durchspielen (Lookup leeren,
      `GrantAccess`/`RevokeAccess` über den Connector, Besitzerwechsel,
      Datensatzsuche für Filterwerte, `savedquery`/`userquery` nach ID …) und
      das Ergebnis in der README festhalten. Ein Teil ist durch die bisherige
      Nutzung schon belegt (Metadaten, Live-Suche, Designer-Vorschau im Host).
- [ ] ⭐ **Diagnose-Seite** (M) — ein Menüpunkt, der beim Öffnen nur lesend
      prüft, was die App braucht, und je Punkt grün/rot zeigt: Org-URL gesetzt,
      Dataverse-Connector erreichbar, `principalobjectaccess` lesbar,
      `EntityDefinitions` lesbar, Rechte des angemeldeten Benutzers auf
      `msdyn_scheduleboardsetting` und `msdyn_configuration` (Lesen, Schreiben,
      Anlegen, Löschen, Zuweisen, Freigeben). Spart bei jeder neuen Umgebung
      und jedem neuen Nutzer die Fehlersuche.
- [ ] **Rechte vorab prüfen statt scheitern** (M) — über
      `RetrieveUserPrivileges` bzw. `RetrievePrincipalAccess` je Board
      ermitteln, was der Nutzer darf, und Buttons (Löschen, Besitzer ändern,
      Freigeben, Konfiguration speichern) deaktivieren mit Hinweis statt erst
      beim Klick eine Dataverse-Fehlermeldung zu zeigen.
- [ ] **Verständliche Fehlermeldungen** (S) — häufige Dataverse-Fehler
      (fehlendes Privileg `prvAssign…`/`prvShare…`, Datensatz gelöscht,
      Duplikat) auf deutsche Klartexte abbilden; die Originalmeldung bleibt
      ausklappbar.
- [ ] **Echte Concurrency-Prüfung** (M) — heute vergleicht die App die
      `versionnumber` vor dem PATCH (kleines Zeitfenster). Mit `If-Match`
      (ETag) wäre es atomar; der generierte Client kann das nicht, der
      Dataverse-Connector (`UpdateRecordWithOrganization`) eventuell schon —
      erst prüfen.
- [ ] ⚠ **Verlauf zentral statt im Browser** (M) — Sicherungen liegen heute
      im `localStorage` (nur dieser Browser, max. 10). Zentral bräuchte eine
      eigene Tabelle (z. B. `…_boardsnapshot` mit Board, Zeitpunkt, Benutzer,
      Inhalt als JSON) oder Notizen am Board, falls die Tabelle Notizen
      zulässt. Entscheidung: Customizing in der Kundenumgebung ja/nein.
- [ ] **Änderungshistorie aus dem Dataverse-Audit** (M) — falls Auditing für
      `msdyn_scheduleboardsetting` aktiv ist: im Reiter „Verlauf“ zeigen, wer
      wann was geändert hat (auch Änderungen direkt im Schedule Board).
      Logik und Darstellung lassen sich aus `apps/audit-explorer` übernehmen.

## Umgebungen & Transfer

- [ ] ⭐ **PROD-Deployment + Deploy-Skript** (S–M) — `scripts/deploy-env.ps1`
      nach dem Muster von solution-forge: Registry UAT/PROD (Env-ID, App-ID,
      Org-URL), schreibt `power.config.json` und `.env` für das Ziel, Build →
      Profil wählen → Guards → `pac code push` in einem Aufruf, Erfolg nur bei
      „App pushed successfully“. PROD nur auf ausdrückliche Anweisung.
- [ ] ⭐ **Mehrere Boards in einem Paket** (M) — z. B. alle SST-Boards auf
      einmal exportieren; gemeinsam genutzte Konfigurationen stehen nur einmal
      im Paket und werden beim Import nur einmal angelegt oder zugeordnet.
- [ ] **Direkter Transfer ohne Datei** (L) — Quellumgebung über den
      Dataverse-Connector (`…WithOrganization`) lesen, Zuordnung und Import wie
      heute, nur ohne Download/Upload. Läuft mit den Rechten des Nutzers in
      beiden Umgebungen. Vorher klären, ob die Connection beide Orgs erreicht.
- [ ] **Umgebungsvergleich (Drift)** (M) — „Vergleichen“ mit einem Board aus
      einer anderen Umgebung (Datei oder direkt): zeigt, wo UAT und PROD
      auseinanderlaufen, mit derselben Diff-Tabelle wie heute.
- [ ] **Freigaben optional im Paket** (S–M) — Datensatz-Freigaben über
      E-Mail-Adresse bzw. Teamnamen exportieren und beim Import zuordnen
      (Benutzer-IDs sind je Umgebung verschieden).
- [ ] **Als CMT-Paket exportieren** (M) — Schema + `data.xml` für das
      Configuration Migration Tool erzeugen, damit Boards in eine
      Pipeline/ALM-Strecke passen (`pac data import`), mit denselben IDs.

## Pflege & Aufräumen

- [ ] ⭐ **Board-Gesundheitscheck** (M) — eine Ansicht über alle Boards mit
      Befunden: Ansichten, die es nicht mehr gibt; Konfigurationen, auf die
      ein Board zeigt, die aber gelöscht oder inaktiv sind; Filterfelder ohne
      `$input`-Bedingung in der Ressourcenabfrage („filtert nichts“);
      Schedule-Typen ohne passendes Booking Setup; doppelte Tab-Positionen;
      „Nur ich“-Boards von deaktivierten Benutzern. Die Bausteine gibt es
      schon (`collectRefs`, `queryAnalysis`, `protectionOf`).
- [ ] ⭐ **Konfigurationen verwalten** (M) — eigene Ansicht aller
      `msdyn_configuration`-Zeilen (Filterlayouts, Zellvorlagen,
      Ressourcenabfragen, SA-Layouts) mit Typ, Nutzung durch Boards,
      Umbenennen, Kopieren, Vergleichen und Löschen verwaister Zeilen
      (geschützt: URS-Standardkonfigurationen).
- [ ] **Boards von deaktivierten Benutzern übernehmen** (S) — Filter in
      „Besitzer ändern“ (Mehrere anpassen): alle Boards, deren Besitzer
      deaktiviert ist, auf einen Blick und gesammelt neu zuweisen.
- [ ] **Mehrere Boards aktivieren/deaktivieren und freigeben** (S) — weitere
      Modi unter „Mehrere anpassen“, z. B. zehn Boards auf einmal für ein Team
      freigeben.
- [ ] **Reihenfolge per Drag & Drop** (S) — statt der Pfeile in der
      Board-Liste.

## Editor & Darstellung

- [ ] ⭐ **Ressourcenabfrage ergänzen** (M) — wenn das Filterlayout warnt
      „Nicht in der Ressourcenabfrage — filtert nichts“: Assistent, der die
      passende `$input/<Key>`-Bedingung als UFX-Schnipsel vorschlägt (Tabelle,
      Spalte, Operator aus dem Feldtyp), mit Diff und eigenem Speichern —
      bzw. als Kopie nur für dieses Board.
- [ ] **Vorschau mit echten Daten** (M) — statt Beispielwerten eine echte
      Buchung bzw. Ressource auswählen und deren Werte (inkl. verknüpfter
      Datensätze) in Kachel, Tooltip und Zellvorlage einsetzen.
- [ ] **Vorschau des Filterbereichs** (M) — das Filterlayout so darstellen,
      wie der Disponent es links im Board sieht (Reihenfolge, Beschriftungen,
      Mehrfachauswahl), direkt neben der Feldtabelle.
- [ ] **Schedule-Assistant-Konfigurationen im Formular** (M) — SA-Filterlayout
      (`192350003`) und SA-Einschränkungen (`192350004`) wie das Filterlayout
      bearbeiten; heute nur über den JSON-Reiter bzw. als Inline-Kopie.
- [ ] **Plausibilitätsprüfung vor dem Speichern** (S) — z. B. Arbeitszeit
      Beginn < Ende, Zeilenhöhen und Seitengrößen in sinnvollen Grenzen,
      Ansicht passt zur Tabelle des Feldes; Warnungen in der Speichern-Vorschau.
- [ ] **Rückgängig/Wiederholen im Entwurf** (S) — Strg+Z über alle Reiter,
      solange nicht gespeichert ist.
- [ ] **Beschriftungen in Benutzersprache** (M) — `label-id`-Schlüssel
      (z. B. `ScheduleAssistant.West.Roles`) heute über eine feste Liste
      übersetzt; vollständig wäre es über die Ressourcen-Webressourcen von URS
      in der Sprache des Benutzers.
- [ ] **Neues Board aus Vorlage** (M) — geführter Assistent: Name, Team,
      Filter-Voreinstellung, Freigabe → Board aus einem „Blueprint“-Board
      erzeugen (wie Kopieren, aber mit den typischen Anpassungen in einem
      Schritt).

## Technik & Qualität

- [ ] ⭐ **E2E-Tests ins Repo** (S–M) — die Playwright-Abläufe aus der
      Entwicklung (Live-Suche, Besitzer, Export/Import, Designer, schmale
      Breiten) als `e2e/` mit `npm run e2e` gegen den Mock-Modus; laufen vor
      jedem Deployment.
- [ ] **Bundle verkleinern** (S) — Reiter „Darstellung“ und „Importieren“
      per `React.lazy` nachladen; das Bundle liegt bei ~940 kB (≈260 kB gzip),
      der Großteil wird beim Start nicht gebraucht.
- [ ] **Komponententests für die Designer** (M) — Vitest mit jsdom für
      `CellTemplateDesigner`, `ViewsDesigner`, `ImportView` (Zuordnung ändern,
      Aktion wählen), damit UI-Umbauten nicht nur per Hand geprüft werden.
- [ ] **UI-Wrapper für andere Code Apps** (S) — `components/ui.tsx` (Btn,
      Select, SuggestInput, FilePicker) als dokumentiertes Muster in
      `docs/SETUP.md` aufnehmen, damit neue Apps gleich mit Fluent UI v9
      starten.
- [ ] **Barrierefreiheit prüfen** (S) — Tastaturbedienung der Board-Liste,
      Fokus nach Dialogen, Kontraste der Statusfarben in den Vorschauen.

---

## Umgesetzt

Kurzform; Details in der README und im Git-Log.

- **Basis:** Board-Liste, Kopieren inkl. der drei Konfigurations-Lookups,
  Aktivieren/Deaktivieren, Löschen mit Schutzregeln, Reihenfolge, Export.
- **Editor:** Formular nach MS-Field-Mapping, Roh-JSON, Diff-Vorschau beim
  Speichern, Konfliktprüfung, lokaler Verlauf.
- **Vergleichen & Mehrere anpassen:** Feldvergleich, Einstellungen auf
  mehrere Boards übertragen, Besitzer für mehrere Boards ändern.
- **Freigaben:** über den Dataverse-Connector mit Benutzer-Connection,
  Live-Suche (mehrere Wörter), Besitzer ändern.
- **Filterlayout-Editor:** Felder bearbeiten, Vorschläge aus der
  Ressourcenabfrage, Tabellen-/Spaltenauswahl, „Kopie nur für dieses Board“.
- **Export/Import zwischen Umgebungen:** Paket mit Konfigurationen und Namen,
  Zuordnung per ID und Name, neues Board oder ersetzen.
- **Darstellung:** Designer mit Live-Vorschau für Buchungskachel,
  Ressourcenzelle, Tooltips, Farben, Buchungswarnung; Layout passt sich der
  verfügbaren Breite im Power-Apps-Host an.
- **Modern Controls:** Oberfläche auf Fluent UI v9.
