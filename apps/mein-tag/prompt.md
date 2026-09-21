Baue eine Generative Page "Mein Tag" für die model-driven App Sales Hub.

Zweck: Eine Vertriebsmitarbeiterin sieht auf einem Screen, was heute ansteht
und was still liegt — statt drei Ansichten (Aktivitäten, Opportunities, Leads)
nacheinander zu öffnen.

Datenquellen (Dataverse, vorhandene Standardtabellen):
- activitypointer — meine offenen Aktivitäten (Aufgaben, E-Mails, Anrufe, Termine)
- opportunity — meine offenen Opportunities
- lead — meine offenen Leads
- usersettings — Datumsformat des angemeldeten Benutzers

Laden:
- Drei Abfragen parallel, jeweils `_ownerid_value eq <angemeldeter Benutzer>
  and statecode eq 0`. Aktivitäten nach scheduledend, Opportunities und Leads
  nach modifiedon aufsteigend. Ein einziger State-Update nach Promise.all.
- Kein Nachladen beim Ändern der Filter — alles wird clientseitig gebuckelt.

Aktivitäten (linke, breite Spalte):
- Vier Tabs mit Zähler: Heute, Überfällig, Demnächst, Ohne Termin. Bucket aus
  scheduledend, Fallback scheduledstart; Aktivitäten ohne beides landen in
  "Ohne Termin".
- Sortierbares DataGrid mit festen Spaltenbreiten: Betreff, Typ (Badge aus dem
  FormattedValue von activitytypecode), Bezug (FormattedValue von
  _regardingobjectid_value), Fällig (Datum + Uhrzeit, überfällig rot),
  Priorität (Hoch als roter Badge), Öffnen.
- Klick auf eine Zeile oder "Öffnen" öffnet den Datensatz per
  Xrm.Navigation.openForm mit entityName = activitytypecode und der activityid.

Stillstand (rechte Spalte, zwei Karten):
- "Stille Opportunities" und "Stille Leads": alle offenen Datensätze, deren
  modifiedon mindestens N Tage zurückliegt, absteigend nach Stilltagen.
- N wählbar über ein Dropdown im Header: 7, 14 (Standard), 30 Tage.
- Opportunity-Karte zeigt Name, Kunde, Phase (stepname, sonst salesstage),
  geschätzten Wert als FormattedValue (Währung kommt vom Server, nie
  hartkodiert) und Abschlussdatum. Lead-Karte zeigt Name aus firstname +
  lastname, Firma oder Thema, Lead-Qualität als Badge.
- Badge "N Tage still", ab dem Doppelten des Schwellwerts rot.
- Klick öffnet den Datensatz per openForm.

KPI-Leiste oben: Heute fällig, Überfällig, Stille Opportunities, Stille Leads.
Aktualisieren-Button verwirft den Cache und lädt neu.

Verhalten:
- Datumsangaben immer über dateformatstring/dateseparator aus usersettings.
- Kein Dialog, kein Overlay; das Dropdown bekommt den mountNode der Seite.
- Responsiv: ab 1024px Aktivitäten und Stillstand nebeneinander, darunter
  untereinander; ab 768px die KPI-Kacheln zweispaltig.
- UI-Texte auf Deutsch.

Bewusst nicht enthalten: Aktivitäten direkt aus der Seite abschließen. Das
erfordert updateRow auf der konkreten Aktivitätstabelle (task, email, …)
mit den passenden Statuswerten und kommt als eigener Schritt.
