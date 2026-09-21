Baue eine Generative Page "My Day" für die model-driven App Sales Hub in der
Waldmann-Umgebung D365 DEV.

Zweck: Eine Vertriebsmitarbeiterin sieht auf einem Screen, was heute ansteht
und welche ihrer Datensätze Aufmerksamkeit brauchen — statt sieben Ansichten
nacheinander zu öffnen.

Datenquellen (Dataverse):
- appointment, task, wal_projecttask — meine offenen Termine, Aufgaben und
  Projektaufgaben (wal_projecttask ist eine Custom Activity)
- lead — meine offenen Leads
- wal_project — offene Projekte, in denen ich Besitzer, Gebietsverkaufsleiter
  (GVL), Key Account Manager (KAM) oder Projektleiter bin
- wal_projectinquiry — offene Projektanfragen mit denselben Rollen plus
  Verantwortlicher
- msdyn_workorder — offene Workorders (Field Service), in denen ich Besitzer
  oder Projektleiter bin; Completed/Posted/Canceled zählen nicht als offen
- usersettings — Datumsformat des angemeldeten Benutzers

Laden:
- Sieben Abfragen parallel, jede einzeln abgefangen: fällt eine Tabelle aus
  (z. B. fehlende Leserechte), zeigt die Seite die anderen und nennt die
  fehlende in einer Warnung. Ein einziger State-Update nach dem Sammeln.
- Termine nach scheduledstart, Aufgaben nach scheduledend, Projekte nach
  Nachfassdatum, Workorders nach Einsatzdatum sortiert.
- Kein Nachladen beim Ändern der Filter — alles wird clientseitig gebuckelt.

Aktivitäten (linke, breite Spalte):
- Vier Tabs mit Zähler: Heute, Überfällig, Demnächst, Ohne Termin. Ein Termin
  zählt an seinem Beginn (scheduledstart), eine Aufgabe an ihrem Ende
  (scheduledend, Fallback scheduledstart).
- Dropdown daneben filtert nach Typ: Alle, Termine, Aufgaben, Projektaufgaben.
  Die Tab-Zähler folgen dem Typfilter.
- Sortierbares DataGrid mit festen Spaltenbreiten: Betreff, Typ (Badge mit
  Icon; bei Projektaufgaben die Kategorie, bei Terminen der Ort darunter),
  Bezug (FormattedValue von _regardingobjectid_value), Fällig (Datum +
  Uhrzeit, überfällig rot), Priorität (Hoch als roter Badge), Öffnen.
- Klick auf eine Zeile oder "Öffnen" öffnet den Datensatz per
  Xrm.Navigation.openForm in seiner konkreten Tabelle.

Meine Datensätze (rechte Spalte, vier Tabs mit Zähler):
- Leads: Name aus firstname + lastname, Firma oder Thema, Statusgrund,
  Lead-Qualität als Badge.
- Projekte: Projektnummer · Bezeichnung, Endkunde · Ort, Potential als
  FormattedValue, Nachfassdatum (rot wenn überschritten), Entscheidungsdatum,
  Statusgrund als Badge, meine Rolle(n) als Outline-Badges (GVL, KAM, PL,
  Besitzer).
- Projektanfragen: Thema, Kunde · Ort, Potential, Wiedervorlage und Frist
  (rot wenn überschritten), Statusgrund, Rollen.
- Workorders: Workorder-Nummer · Zusammenfassung, Servicekunde · Projekt,
  Unterstatus, Einsatzdatum (sonst Wunschtermin), Systemstatus als Badge,
  Rollen.
- Badge "N Tage still" ab dem Schwellwert (Header-Dropdown: 7 / 14 / 30
  Tage, Standard 14), ab dem Doppelten rot. Schalter "Nur stille" reduziert
  die Listen auf die stillen Datensätze.
- Klick öffnet den Datensatz per openForm.

KPI-Leiste oben: Heute fällig, Überfällig, Leads, Projekte, Projektanfragen,
Workorders. Aktualisieren-Button verwirft den Cache und lädt neu.

Verhalten:
- Drei UI-Sprachen (en-US, de-DE, fr-FR) aus einem Übersetzungswörterbuch,
  gewählt nach userSettings.languageId. Beschriftungen aus Dataverse
  (Statusgründe, Kategorien, Lookups) kommen als FormattedValue vom Server.
- Datumsangaben immer über dateformatstring/dateseparator aus usersettings;
  Nur-Datum-Spalten ("yyyy-MM-dd") als lokales Datum parsen, nie als UTC.
- Kein Dialog, kein Overlay; beide Dropdowns bekommen den mountNode der Seite.
- Responsiv: ab 1024px Aktivitäten und Datensätze nebeneinander, darunter
  untereinander; KPI-Kacheln 6 → 3 → 2 Spalten.

Bewusst nicht enthalten: Aktivitäten direkt aus der Seite abschließen. Das
erfordert updateRow auf der konkreten Aktivitätstabelle mit den passenden
Statuswerten und kommt als eigener Schritt.
