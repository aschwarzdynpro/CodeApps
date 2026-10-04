Baue eine Generative Page "Account 360" für die model-driven App "Accounts App"
(pro_AccountsApp) im ASC SFA CS Playground.

Zweck: Ein Vertriebsmitarbeiter sieht zu einem Account auf einem Screen
Stammdaten, Kontakte, Aufgaben und Adressen, ohne Formular, Unterraster und
zugehörige Ansichten nacheinander zu öffnen. Kleine Pflegeschritte (Aufgabe
anlegen, Aufgabe erledigen, Adresse anlegen) gehen direkt auf der Seite.

Datenquellen (Dataverse):
- account — alle Accounts für die Liste; Stammdaten des gewählten Accounts
- task — offene Aufgaben mit Bezug auf einen Account (Zähler in der Liste);
  alle Aufgaben des gewählten Accounts
- contact — aktive Kontakte, deren übergeordneter Kunde der Account ist
- pro_customaddress — Custom Addresses (Lookup pro_account)
- pro_elasticdemo — Elastic-Demo-Datensätze (Lookup pro_account)
- usersettings — Datumsformat des angemeldeten Benutzers

Layout:
- Links eine Account-Liste mit Suche (Name, Nummer, Ort), Schaltern "Nur meine"
  (Besitzer = angemeldeter Benutzer) und "Inaktive zeigen". Pro Account
  Avatar, Name, Nummer · Ort, Badge mit offenen Aufgaben und roter Badge mit
  überfälligen. Die Auswahl fällt auf den ersten sichtbaren Account zurück.
- Rechts der gewählte Account: Kopf mit Name, Nummer, Branche, Inaktiv-Badge
  und "Im Formular öffnen". Darunter Stammdaten als Raster (Telefon, E-Mail,
  Website, Adresse, Hauptkontakt, übergeordneter Account, Branche, Umsatz,
  Mitarbeiter, Besitzer, geändert am) und die Beschreibung.
- KPI-Leiste: Kontakte, offene Aufgaben, überfällig (rot ab 1), Adressen.
- Tabs mit Zähler: Aufgaben, Kontakte, Adressen, Elastic Demo.
  - Aufgaben: sortierbares DataGrid (Betreff, Fällig am — überfällig rot,
    Priorität — Hoch als roter Badge, Status, Besitzer, Aktionen). Schalter
    "Erledigte zeigen". "Neue Aufgabe" öffnet ein Inline-Formular (Betreff,
    Fällig am, Priorität) und legt die Aufgabe mit Bezug auf den Account an.
    "Erledigt" setzt statecode 1 / statuscode 5.
  - Kontakte: DataGrid mit Name (Hauptkontakt als Badge, steht oben),
    Position, E-Mail, Telefon, Öffnen.
  - Adressen: Inline-Eingabe "Neue Adresse" legt eine pro_customaddress am
    Account an; Liste mit Bezeichnung und Anlagedatum.
  - Elastic Demo: Liste der Datensätze.
- Hauptkontakt öffnet das Kontaktformular; der übergeordnete Account wird in
  der Liste ausgewählt, wenn er dort sichtbar ist, sonst im Formular geöffnet.

Laden:
- Liste und Aufgaben-Zähler einmal beim Öffnen, je Abfrage einzeln
  abgefangen; fehlende Zähler sind nur eine Warnung.
- Details pro Account in fünf parallelen Abfragen, je Account gecacht; fällt
  eine verknüpfte Tabelle aus, zeigt die Seite den Rest und nennt sie.
- Nach jedem Schreiben werden Liste und Details des Accounts neu geladen,
  ohne Spinner. "Aktualisieren" verwirft alle Caches.

Formular-Modus:
- Die Seite akzeptiert pageInput.recordId und pageInput.entityName. Kommt sie
  aus einem Account-Formular (entityName "account"), zeigt sie nur KPIs und
  Tabs für diesen Datensatz plus "Aktualisieren", keine Liste, keinen Kopf und
  keine Stammdaten. Ohne recordId (neuer Datensatz) erscheint der Hinweis,
  den Account erst zu speichern.
- Optionaler statischer Eingabewert data.tab wählt den ersten Tab.
- Im Formular wächst die Seite mit ihrem Inhalt; das Formular scrollt.

UI-Texte deutsch (Umgebung hat nur en-US), Datumsformat aus den
Dataverse-Benutzereinstellungen.
