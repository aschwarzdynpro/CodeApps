Baue eine Generative Page "Approval Cockpit" für eine model-driven App.

Zweck: Genehmigerinnen und Genehmiger sehen in einer einzigen Ansicht alle
Power-Automate-Genehmigungen, die ihnen offen zugewiesen sind — statt sie in
Teams, Outlook und dem Genehmigungscenter zusammenzusuchen.

Datenquellen (Dataverse, vorhandene Standardtabellen — keine neuen Tabellen anlegen):
- msdyn_flow_approvalrequest — eine Zeile je Genehmiger; das persönliche Postfach
- msdyn_flow_approval — die Genehmigung selbst (Titel, Details, Priorität, Fristen)
- usersettings — Datumsformat des angemeldeten Benutzers

Laden:
- Zuerst die eigenen Requests: Filter `_ownerid_value eq <angemeldeter Benutzer>
  and statecode eq 0`, absteigend nach createdon.
- Dann die zugehörigen Approvals über einen gechunkten `or`-Filter auf
  msdyn_flow_approvalid. Keine org-weite Abfrage der Approval-Tabelle.
- Requests ohne passende Approval werden verworfen.

Inhalt der Seite:
- KPI-Leiste mit vier Kacheln: Offen, Überfällig, Fällig in 7 Tagen,
  Dringend/Wichtig.
- Filterzeile: Volltextsuche über Titel, Details, Kategorie und Ersteller;
  Dropdown für Priorität; Dropdown für Fälligkeit (Alle / Überfällig /
  Fällig in 7 Tagen).
- Liste als sortierbares DataGrid mit festen Spaltenbreiten und Resizing:
  Genehmigung, Priorität (als Badge), Erstellt von, Fällig, Datensatz-Link.
  Überfällige Fälligkeitsdaten rot einfärben.
- Klick auf eine Zeile öffnet rechts ein Detail-Pane (kein Dialog, kein Overlay)
  mit Titel, Priorität, Zuweisungsdatum, Fälligkeit, Ersteller, Kategorie,
  Antwortoptionen, dem vollständigen Details-Freitext und einem Link auf den
  zugehörigen Datensatz aus msdyn_flow_approval_itemlink.
- Aktualisieren-Button, der den Cache verwirft und neu lädt.
- Leerzustände unterscheiden: "nichts zugewiesen" vs. "Filter trifft nichts".

Verhalten:
- Datumsangaben immer über dateformatstring/dateseparator aus usersettings
  formatieren, niemals hartkodiert.
- Priorität ist ein Optionset (192350000 Dringend, 192350001 Wichtig,
  192350002 Mittel, 192350003 Niedrig); Anzeige über den FormattedValue,
  Sortierung über den numerischen Wert.
- Es gibt kein strukturiertes Antragsteller-Feld. Zeige "Erstellt von" aus
  _createdby_value und den Details-Freitext — erfinde keinen Requester.
- Responsiv: ab 1024px Breite Liste und Detail nebeneinander, darunter
  untereinander; ab 768px die KPI-Kacheln zweispaltig.
- UI-Texte auf Deutsch.

Bewusst nicht enthalten: Genehmigen und Ablehnen direkt aus der Seite. Das
erfordert den Approvals-Connector bzw. einen Flow und wird als eigener Schritt
ergänzt, sobald das Connector-Binding gegen die Zielumgebung ermittelt ist.
