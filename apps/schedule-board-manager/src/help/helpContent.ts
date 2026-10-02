/**
 * Content of the help panel. Plain data so it can be searched and kept in
 * step with the app without touching layout code. Inline markup in strings:
 * **fett** and `code`. Section ids are used as deep links (`openHelp(id)`).
 */

export type HelpBlock =
  | { p: string }
  | { h: string }
  | { list: string[] }
  | { steps: string[] }
  | { tip: string }
  | { warn: string }
  | { table: { head: string[]; rows: string[][] } }

export interface HelpSection {
  id: string
  group: string
  title: string
  /** One line under the title and in search results. */
  summary: string
  blocks: HelpBlock[]
}

export const HELP_SECTIONS: HelpSection[] = [
  // -------------------------------------------------------------------------
  {
    id: 'ueberblick',
    group: 'Einstieg',
    title: 'Überblick',
    summary: 'Was die App macht und wie sie aufgebaut ist.',
    blocks: [
      {
        p: 'Der Schedule Board Manager verwaltet die **Tabs des Schedule Boards** (Universal Resource Scheduling). Jeder Tab, den Disponenten oben im Schedule Board sehen, ist ein Datensatz „Schedule Board Setting“ — in der App heißt er **Board**.',
      },
      {
        p: 'Mit der App kopierst, bearbeitest, vergleichst und überträgst du Boards, ohne JSON von Hand zu ändern. Jede Änderung zeigt vor dem Speichern genau, was sich ändert.',
      },
      { h: 'Aufbau des Bildschirms' },
      {
        table: {
          head: ['Bereich', 'Wofür'],
          rows: [
            ['**Boards**', 'Liste aller Boards links, rechts das gewählte Board mit seinen Reitern (Bearbeiten, Darstellung, JSON, Filterlayout, Besitzer & Freigaben, Verlauf).'],
            ['**Vergleichen**', 'Zwei Boards Feld für Feld gegenüberstellen.'],
            ['**Mehrere anpassen**', 'Einstellungen eines Boards auf andere übertragen oder den Besitzer mehrerer Boards ändern.'],
            ['**Importieren**', 'Ein exportiertes Board einlesen — auch aus einer anderen Umgebung.'],
            ['**Hilfe**', 'Diese Seite. Das „?“ neben den Board-Reitern öffnet sie direkt beim passenden Abschnitt.'],
          ],
        },
      },
      { h: 'Woraus ein Board besteht' },
      {
        list: [
          '**Spalten** — Name, Freigabe, Reihenfolge, Farben, Ansichten für Tooltips und Details, Schedule-Assistant-Einstellungen.',
          '**Settings** — ein JSON mit Zeitskala, Arbeitszeit, Zeilenhöhen, Zeitzone, den Schedule-Typen (Buchungsvorlagen und Ansichten je Buchungsart) und den Anforderungsbereichen.',
          '**Drei Konfigurationen** — Filterlayout (linker Filterbereich), Ressourcenzellen-Vorlage (Darstellung der Ressourcen) und Ressourcenabfrage (welche Ressourcen erscheinen). Das sind eigene Datensätze, die sich **mehrere Boards teilen** können.',
          '**Gespeicherte Filterwerte** — was Disponenten mit „Als Standard speichern“ im Filter hinterlegt haben.',
        ],
      },
      {
        tip: 'Rechts oben zeigt die App „Dataverse“ oder „Mock-Daten“. Bei „Mock-Daten“ läuft sie ohne Power-Apps-Umgebung mit Beispieldaten — nichts davon wird gespeichert.',
      },
    ],
  },
  // -------------------------------------------------------------------------
  {
    id: 'board-liste',
    group: 'Einstieg',
    title: 'Board-Liste & Aktionen',
    summary: 'Boards finden, sortieren, kopieren, aktivieren, löschen, exportieren.',
    blocks: [
      { h: 'Liste' },
      {
        list: [
          'Die Zahl vor dem Namen ist die **Position des Tabs** im Schedule Board.',
          'Darunter stehen Freigabe (Jeder, Nur ich, Bestimmte Personen, System), ggf. „Inaktiv“ und der Besitzer.',
          'Die Suche oben filtert nach Board-Name und Besitzer.',
        ],
      },
      { h: 'Reihenfolge der Tabs ändern' },
      {
        steps: [
          '„Reihenfolge ändern“ klicken.',
          'Boards mit den Pfeilen verschieben.',
          '„Reihenfolge speichern“ — geschrieben werden nur die Boards, deren Position sich geändert hat.',
        ],
      },
      { h: 'Aktionen oben am Board' },
      {
        table: {
          head: ['Aktion', 'Was passiert'],
          rows: [
            ['**Kopieren**', 'Legt ein neues Board mit allen Spalten, Settings, Filterwerten **und den drei Konfigurationen** an. Im Dialog: Name, Freigabe, „Als letzten Tab einsortieren“ und — bei „Bestimmte Personen“ — „Datensatz-Freigaben des Originals übernehmen“. Besitzer der Kopie bist du. Eine Kopie ist nie ein System-Board.'],
            ['**Deaktivieren / Aktivieren**', 'Ein deaktiviertes Board verschwindet als Tab aus dem Schedule Board, bleibt aber erhalten.'],
            ['**Löschen**', 'Endgültig. Wer das Board später vielleicht braucht, exportiert es vorher oder deaktiviert es nur.'],
            ['**Export**', 'Lädt eine Datei `<Board>.board.json` herunter — mit allen Konfigurationen und den Namen aller Bezüge. Siehe „Export & Import“.'],
            ['**Formular**', 'Öffnet den Datensatz in der Dynamics-Oberfläche.'],
          ],
        },
      },
      { h: 'Geschützte Boards' },
      {
        list: [
          '**System-Boards** (Freigabe „System“ sowie Standard, Ressourcennutzung, Buchungen verwalten) bringt URS mit. Sie lassen sich nicht löschen, deaktivieren oder umbenennen; ihr Besitzer bleibt SYSTEM.',
          'Die **„Erste öffentliche Ansicht“** setzt URS voraus — sie lässt sich nicht löschen.',
          'Geschützte Boards tragen das Abzeichen „geschützt“; der Grund steht im Tooltip.',
        ],
      },
    ],
  },
  // -------------------------------------------------------------------------
  {
    id: 'bearbeiten',
    group: 'Ein Board',
    title: 'Bearbeiten',
    summary: 'Alle Einstellungen eines Boards im Formular.',
    blocks: [
      {
        p: 'Das Formular folgt der Microsoft-Beschreibung der Board-Einstellungen. Die Abschnitte lassen sich auf- und zuklappen:',
      },
      {
        table: {
          head: ['Abschnitt', 'Inhalt'],
          rows: [
            ['**Allgemein**', 'Board-Name, Freigabe, Reihenfolge.'],
            ['**Board-Ansicht**', 'Zeitskala (stündlich bis monatlich), Zeitzone, Zeitauflösung, Arbeitszeit und Arbeitstage, Zeilenhöhen und Anzahl je Zeitskala, Schalter wie „Stornierte Buchungen ausblenden“ oder „Reisedauer anzeigen“.'],
            ['**Farben**', 'Auslastungsfarben und die Farbe der aktuellen Zeitlinie.'],
            ['**Schedule Assistant**', 'Farben und Icons für verfügbar / teilweise / nicht verfügbar, Standard-Suche, nicht verfügbare Ressourcen ausblenden.'],
            ['**Karte**', 'Ansichten für Tooltips und Details auf der Karte.'],
            ['**Sonstiges**', 'Ressourcen pro Seite, Anforderungen pro Seite, Buchungswarnungs-Ansicht und -Vorlage, die **drei Konfigurationen** (Filterlayout, Ressourcenzellen-Vorlage, Ressourcenabfrage).'],
            ['**Eigene Web-Ressource**', 'Zusätzlicher Tab mit einer eigenen Web-Ressource im unteren Bereich.'],
            ['**Schedule-Typen**', 'Je Buchungsart (z. B. Keine, Termin, Arbeitsauftrag, Projekt): Tooltip-, Detail- und Anforderungsansichten sowie die Buchungsvorlage.'],
            ['**Anforderungsbereiche**', 'Die Reiter im unteren Bereich: Titel und Ansicht je Reiter, hinzufügen, sortieren, entfernen; Standard-Bereiche ausblenden.'],
          ],
        },
      },
      { h: '„nicht gesetzt“ und geerbte Werte' },
      {
        p: 'Viele Einstellungen sind am Board gar nicht gespeichert. Dann gilt der Wert des **Standard-Boards** (Default) oder der Produkt-Standard. Das Formular zeigt den geerbten Wert als Hinweis unter dem Feld. Wählst du „nicht gesetzt“, wird der Eintrag am Board entfernt — das Board erbt dann wieder.',
      },
      {
        tip: 'Geänderte Felder sind farbig markiert. Unbekannte Einträge im Settings-JSON (z. B. von neueren URS-Versionen) bleiben beim Speichern unverändert erhalten.',
      },
      {
        warn: 'Ein ungespeicherter Entwurf geht verloren, wenn du ein anderes Board wählst oder oben zu Vergleichen, Mehrere anpassen oder Importieren wechselst. Die Hilfe kannst du jederzeit öffnen — sie liegt über der App.',
      },
    ],
  },
  // -------------------------------------------------------------------------
  {
    id: 'speichern',
    group: 'Ein Board',
    title: 'Speichern & Konflikte',
    summary: 'Wie Änderungen geschrieben werden und was bei einem Konflikt passiert.',
    blocks: [
      {
        steps: [
          'Sobald du etwas änderst, erscheint unten die Leiste „N ungespeicherte Änderungen“.',
          '„Vorschau & Speichern“ zeigt jede geänderte Einstellung mit altem und neuem Wert.',
          '„Speichern“ schreibt **nur die geänderten Felder**. Der bisherige Stand landet vorher im Verlauf.',
          '„Verwerfen“ setzt alles auf den gespeicherten Stand zurück.',
        ],
      },
      { h: 'Konflikt' },
      {
        p: 'Das Schedule Board speichert selbst Einstellungen, sobald ein Disponent z. B. die Zeitskala umstellt. Hat sich das Board seit dem Laden geändert, speichert die App **nicht**, sondern meldet einen Konflikt. Mit „Entwurf exportieren und neu laden“ sicherst du deine Änderungen als Datei, lädst den aktuellen Stand und überträgst sie erneut.',
      },
      { h: 'Was eigene Speicherleisten hat' },
      {
        list: [
          '**Filterlayout** und **Ressourcenzellen-Vorlage** sind eigene Datensätze. Sie werden getrennt gespeichert („Für N Boards speichern“) — die Zahl zeigt, wie viele Boards die Änderung betrifft.',
          'Alles andere (Formular, Darstellung, JSON) landet in **einem** Entwurf je Board.',
        ],
      },
    ],
  },
  // -------------------------------------------------------------------------
  {
    id: 'darstellung',
    group: 'Ein Board',
    title: 'Darstellung',
    summary: 'Buchungskachel, Ressourcenzelle, Tooltips, Farben und Warnung mit Live-Vorschau.',
    blocks: [
      {
        p: 'Hier gestaltest du alles, was Disponenten im Board sehen, und siehst sofort eine Vorschau. Die Vorschau ist eine **Annäherung** mit Beispielwerten — Schriften und Abstände des echten Boards können leicht abweichen.',
      },
      { h: 'Eigen, geerbt oder Standard' },
      {
        list: [
          '**Eigene Vorlage** — am Board gespeichert, direkt bearbeitbar.',
          '**Geerbt vom Default-Board** oder **Produkt-Standard** — nur lesbar. „Als eigene Vorlage bearbeiten“ übernimmt sie ins Board.',
          '„Eigene Vorlage entfernen“ löscht sie am Board — es erbt dann wieder.',
        ],
      },
      { h: 'Buchungskachel' },
      {
        p: 'Der Text in der Buchung im Board, je **Schedule-Typ** (oben links wählen). Zwei Arten zu bearbeiten:',
      },
      {
        list: [
          '**Baukasten** (Standard): Jede Zeile der Kachel ist eine Zeile im Editor. Felder erscheinen als blaue Chips mit lesbarem Namen, Text als kleines Eingabefeld. „B“ schaltet fett, ✕ entfernt ein Feld. Rechts je Zeile: Text hinzufügen, nach oben/unten, löschen. „Zeile hinzufügen“ legt eine neue Zeile an.',
          '**HTML**: die Vorlage als Text — für alles, was der Baukasten nicht kann (Bilder, eigene Stile, verschachtelte Elemente). Solche Vorlagen öffnen automatisch als HTML.',
          '**Felder einfügen**: Liste unter dem Editor. Ein Klick hängt das Feld an die markierte Zeile (im HTML-Modus: an die Cursorposition). Über die Pfeil-Einträge („Ressource → bookableresource“) gehst du in verknüpfte Tabellen, z. B. Arbeitsauftrag → Kunde → Name.',
          'Rechts: Dauer und Statusfarbe der Beispielbuchung, „Inhalt abschneiden wie im Board“ und die **Beispielwerte**, die du überschreiben kannst, um lange Texte zu testen.',
        ],
      },
      {
        tip: 'Die Vorlage wirkt nur in der Stundenansicht. Tag, Woche und Monat zeigen Buchungen vereinfacht. Microsoft unterstützt in Buchungsvorlagen nur Systemtabellen — eigene Tabellen werden markiert.',
      },
      { h: 'Ressourcenzelle' },
      {
        list: [
          'Wie eine Ressource links im Board dargestellt wird (Bild, Name, Auslastung …). Die Vorlage ist eine **eigene Konfiguration**, oft von mehreren Boards genutzt — oben steht, welche.',
          'Vorschau in den Zuständen normal, ausgewählt und nicht verfügbar; der Schalter „Schedule-Assistant-Ansicht“ zeigt die Ergebnisliste des Schedule Assistant.',
          '„Variablen einfügen“ listet die Werte des Boards und die zusätzlichen Werte aus der Ressourcenabfrage.',
          'Speichern wirkt auf **alle** Boards dieser Vorlage. Für Änderungen nur an einem Board zuerst „Als Kopie nur für dieses Board …“.',
          'Eigener Verlauf: der Stand vor jedem Speichern (in diesem Browser).',
        ],
      },
      { h: 'Tooltips & Details' },
      {
        p: 'Alle Stellen, an denen das Board eine **Ansicht** anzeigt: Tooltip und Detailbereich einer Buchung, Detailbereich und Kartenpin-Tooltip einer Anforderung, die Schedule-Assistant-Liste, Kartenpins von Ressourcen und Organisationseinheiten. Links die Stelle wählen, rechts die Ansicht — die Vorschau zeigt deren Spalten mit Beispielwerten. Ansichten selbst änderst du in der Dynamics-Anpassung.',
      },
      { h: 'Farben' },
      {
        p: 'Auslastungsfarben (nicht gebucht, teilweise, voll, überbucht, außerhalb der Arbeitszeit), aktuelle Zeitlinie und Schedule-Assistant-Farben — mit Vorschau der Tagesansicht, der Stundenansicht und der Verfügbarkeitsanzeige. Schraffierte Felder sind nicht gesetzt; dann gilt der Produkt-Standard. Buchungen selbst färbt das Board nach **Buchungsstatus**, nicht nach diesen Farben.',
      },
      { h: 'Buchungswarnung' },
      { p: 'Text einer Buchungswarnung im Detailbereich — bearbeitbar wie die Buchungskachel (Baukasten oder HTML).' },
    ],
  },
  // -------------------------------------------------------------------------
  {
    id: 'json',
    group: 'Ein Board',
    title: 'JSON',
    summary: 'Settings und Filterwerte als Rohtext.',
    blocks: [
      {
        p: 'Für alles, was Formular und Darstellung nicht abdecken: das Settings-JSON und die gespeicherten Filterwerte als Text. Nur **gültiges JSON** wird in den Entwurf übernommen; solange der Text ungültig ist, zeigt das Abzeichen „Ungültig“ den Fehler und der Entwurf behält den letzten gültigen Stand.',
      },
      {
        warn: 'Unbekannte Schlüssel nur ändern, wenn klar ist, was das Board damit macht. Gespeichert wird über dieselbe Leiste und Vorschau wie im Formular.',
      },
    ],
  },
  // -------------------------------------------------------------------------
  {
    id: 'filterlayout',
    group: 'Ein Board',
    title: 'Filterlayout',
    summary: 'Die Felder im linken Filterbereich des Boards.',
    blocks: [
      {
        p: 'Das Filterlayout bestimmt, welche Filterfelder Disponenten links im Board sehen (z. B. Rollen, Teams, Niederlassung). Es ist eine **eigene Konfiguration**: Oben steht ihr Name und welche Boards sie nutzen.',
      },
      {
        warn: 'Teilen sich mehrere Boards das Layout, wirkt jede Änderung auf alle. Für Änderungen nur an diesem Board zuerst „Als Kopie nur für dieses Board …“ — die App legt eine Kopie an und weist sie dem Board zu.',
      },
      { h: 'Felder' },
      {
        table: {
          head: ['Spalte', 'Bedeutung'],
          rows: [
            ['**Beschriftung (label-id)**', 'Text über dem Feld. Steht dort ein Ressourcenschlüssel wie `ScheduleAssistant.West.Roles`, zeigt die App darunter den Anzeigetext („Rollen“).'],
            ['**Key**', 'Name, unter dem die Auswahl an die Ressourcenabfrage geht. Muss eindeutig sein.'],
            ['**Typ**', 'Datensätze einer Tabelle, Auswahlwerte einer Spalte, Merkmale, Sortierung …'],
            ['**Tabelle / Spalte**', 'Woher die Auswahl kommt. Tabellen werden beim Tippen vorgeschlagen.'],
            ['**Mehrfach**', 'Mehrere Werte gleichzeitig wählbar.'],
          ],
        },
      },
      {
        p: 'Mit den Pfeilen änderst du die Reihenfolge, der Papierkorb entfernt ein Feld. Gruppen (zweispaltige Bereiche) lassen sich nur im Reiter **XML** bearbeiten.',
      },
      { h: 'Warum ein Feld „nichts filtert“' },
      {
        p: 'Ein Filterfeld wirkt erst, wenn die **Ressourcenabfrage** des Boards seinen Key auswertet (`$input/<Key>`). Fehlt das, steht unter dem Key „Nicht in der Ressourcenabfrage — filtert nichts.“ Das Feld erscheint dann im Board, ändert aber nichts an der Ressourcenliste. Den Reiter **Ressourcenabfrage** kannst du nur lesen; ergänzt wird die Abfrage in Dynamics.',
      },
      { h: 'Feld hinzufügen' },
      {
        steps: [
          'Oben stehen die Filter, die die Ressourcenabfrage auswertet, aber im Layout noch fehlen. „Übernehmen“ füllt alles vor.',
          'Sonst: Art (Datensätze, Auswahlwerte, Merkmale), Key, Beschriftung, Tabelle und ggf. Spalte selbst eintragen.',
          '„Mehrfachauswahl“ nach Bedarf, dann „Hinzufügen“.',
          'Unten „Vorschau & Speichern“ — der Dialog zeigt jede Änderung und wie viele Boards sie betrifft.',
        ],
      },
      {
        tip: 'Änderst du den Key eines Feldes, passen die gespeicherten Filterwerte der Disponenten nicht mehr — sie stehen noch unter dem alten Key.',
      },
      { p: 'Der Reiter **Verlauf** enthält den Stand des Layouts vor jedem Speichern (in diesem Browser).' },
    ],
  },
  // -------------------------------------------------------------------------
  {
    id: 'freigaben',
    group: 'Ein Board',
    title: 'Besitzer & Freigaben',
    summary: 'Wer ein Board sieht und wem es gehört.',
    blocks: [
      { h: 'Freigabe des Boards' },
      {
        table: {
          head: ['Freigabe', 'Wer sieht das Board'],
          rows: [
            ['**Jeder**', 'Alle Benutzer des Schedule Boards.'],
            ['**Nur ich**', 'Nur der Besitzer.'],
            ['**Bestimmte Personen**', 'Besitzer sowie die Benutzer und Teams, für die das Board freigegeben ist (Liste in diesem Reiter).'],
            ['**System**', 'Von URS mitgebrachte Boards — nicht änderbar.'],
          ],
        },
      },
      { p: 'Die Freigabe stellst du unter Bearbeiten → Allgemein um.' },
      { h: 'Besitzer ändern' },
      {
        steps: [
          'Neben dem Besitzer „Ändern“ klicken.',
          'Person oder Team suchen und „Auswählen“.',
          'Die App zeigt „Bisher → Neu“ und die Folgen; „Besitzer ändern“ bestätigt.',
        ],
      },
      {
        list: [
          'Bei „Nur ich“ wandert das Board in die Liste des neuen Besitzers — der bisherige sieht es nicht mehr.',
          'Freigaben bleiben bestehen. Filterlayout, Zellvorlage und Ressourcenabfrage behalten ihren Besitzer.',
          'Zugriffsteams können nichts besitzen und erscheinen in dieser Suche nicht.',
          'Mehrere Boards auf einmal: Mehrere anpassen → Besitzer ändern.',
        ],
      },
      { h: 'Freigeben' },
      {
        list: [
          'Die Suche startet ab 2 Zeichen von selbst. Mehrere Wörter grenzen ein: „jör bus“ findet Jörn Busch. Gesucht wird in Name und E-Mail.',
          'Stufe wählen — **Lesen** oder **Lesen & Bearbeiten** — und „Freigeben“.',
          'Bei bestehenden Freigaben lässt sich die Stufe ändern oder die Freigabe entfernen.',
        ],
      },
      {
        tip: 'Freigaben wirken nur bei „Bestimmte Personen“. Bei „Jeder“ oder „Nur ich“ zeigt der Reiter einen Hinweis.',
      },
    ],
  },
  // -------------------------------------------------------------------------
  {
    id: 'verlauf',
    group: 'Ein Board',
    title: 'Verlauf',
    summary: 'Frühere Stände eines Boards wiederherstellen.',
    blocks: [
      {
        p: 'Vor jedem Speichern legt die App den bisherigen Stand ab — beim normalen Speichern („Vor dem Speichern“), bei „Mehrere anpassen“ und beim Import. Es bleiben die **letzten 10** Stände je Board.',
      },
      {
        list: [
          '„Als Entwurf laden“ übernimmt den Stand in den Entwurf. Prüfen, dann normal speichern.',
          '„Export“ lädt den Stand als JSON herunter.',
        ],
      },
      {
        warn: 'Der Verlauf liegt **nur in diesem Browser**. Ein anderer Browser, ein anderer Rechner oder ein Kollege sieht ihn nicht; Browserdaten löschen entfernt ihn. Für eine dauerhafte Sicherung „Export“ verwenden.',
      },
    ],
  },
  // -------------------------------------------------------------------------
  {
    id: 'vergleichen',
    group: 'Mehrere Boards',
    title: 'Vergleichen',
    summary: 'Zwei Boards Feld für Feld.',
    blocks: [
      {
        steps: [
          'Board A und Board B wählen (⇄ tauscht die Seiten).',
          'Die Tabelle zeigt jede abweichende Einstellung — Spalten, Konfigurationen und jeden Wert im Settings-JSON.',
          'Mit den Bereichs-Reitern (Spalten, Konfigurationen, Settings, Filter) und der Suche eingrenzen.',
          '„Von A nach B übertragen …“ öffnet „Mehrere anpassen“ mit A als Vorlage, B als Ziel und den abweichenden Feldern vorausgewählt.',
        ],
      },
    ],
  },
  // -------------------------------------------------------------------------
  {
    id: 'mehrere',
    group: 'Mehrere Boards',
    title: 'Mehrere anpassen',
    summary: 'Einstellungen übertragen und Besitzer für mehrere Boards ändern.',
    blocks: [
      { h: 'Einstellungen übertragen' },
      {
        steps: [
          '**Vorlage** wählen — das Board, dessen Einstellungen übernommen werden.',
          '**Was übertragen?** ankreuzen: Konfigurationen, einzelne Bereiche des Settings-JSON (z. B. Arbeitszeit, Schedule-Typen), gespeicherte Filterwerte, Spalten.',
          '**Ziel-Boards** ankreuzen.',
          '„Vorschau“ zeigt je Board, was sich ändert. Boards ohne Änderung werden übersprungen.',
          '„Auf N Board(s) anwenden“ schreibt. Jedes Board wird vorher im Verlauf gesichert; das Ergebnis steht je Board in der Liste.',
        ],
      },
      {
        tip: 'Übertragen wird immer der ganze gewählte Bereich: Kreuzt du „Schedule-Typen“ an, bekommt das Ziel alle Schedule-Typen der Vorlage.',
      },
      { h: 'Besitzer ändern' },
      {
        steps: [
          'Boards ankreuzen (System-Boards fehlen, sie gehören SYSTEM).',
          'Neuen Besitzer suchen und „Auswählen“.',
          'Die Tabelle zeigt bisher/neu; Boards, die schon dem neuen Besitzer gehören, werden übersprungen.',
          '„N Boards an … übergeben“.',
        ],
      },
    ],
  },
  // -------------------------------------------------------------------------
  {
    id: 'transfer',
    group: 'Mehrere Boards',
    title: 'Export & Import',
    summary: 'Ein Board in eine andere Umgebung bringen (z. B. UAT → PROD).',
    blocks: [
      { h: 'Exportieren' },
      {
        p: '„Export“ am Board lädt eine Datei `<Board>.board.json`. Sie enthält das Board, **jede verknüpfte Konfiguration mit Inhalt** und zu jeder ID einen Namen (Ansichten, Schedule-Typen, Zeitzone, Datensätze in gespeicherten Filtern). Nicht enthalten: Freigaben, Besitzer, Verlauf.',
      },
      { h: 'Importieren' },
      {
        steps: [
          'In der Zielumgebung „Importieren“ öffnen und die Datei auf die Fläche ziehen oder „Datei wählen“.',
          '**Ziel**: als neues Board anlegen (Name, Freigabe) oder ein bestehendes ersetzen (Name, Reihenfolge, Freigabe und Besitzer bleiben).',
          '**Konfigurationen**: je Konfiguration „Vorhandene verwenden“, „Neu anlegen“, „Vorhandene mit Datei-Inhalt überschreiben“ oder „Leer lassen“. Bei vorhandenen zeigt die App, ob der Inhalt gleich ist, und kann beide Inhalte vergleichen.',
          '**Ansichten, Schedule-Typen, Zeitzone, Filterwerte**: die App ordnet zu — erst über die ID, dann über den Namen. Jede Zuordnung lässt sich ändern.',
          '„Vorschau & Importieren“ fasst zusammen (beim Ersetzen mit allen Änderungen), „Importieren“ schreibt.',
        ],
      },
      {
        table: {
          head: ['Status', 'Bedeutung'],
          rows: [
            ['gleiche ID', 'Gibt es hier unter derselben ID — typisch für Standardansichten und URS-Konfigurationen.'],
            ['über den Namen gefunden', 'Andere ID, aber eindeutig gleicher Name.'],
            ['fehlt — wird entfernt', 'Kein Gegenstück. Ein Ansichtsfeld wird geleert, ein Anforderungsbereich bzw. Schedule-Typ ohne Gegenstück fällt weg, ein Filterwert wird entfernt.'],
            ['nicht prüfbar', 'Die Tabelle konnte nicht gelesen werden (Rechte) — die ID bleibt unverändert.'],
          ],
        },
      },
      {
        warn: '„Überschreiben“ ändert eine Konfiguration für **alle** Boards, die sie nutzen — die App zeigt sie an. Der vorherige Stand landet im Verlauf der Konfiguration.',
      },
      {
        tip: 'Für den Import muss die App in der Zielumgebung installiert sein. Dateien aus der ersten Version des Exports lassen sich lesen, aber nur über IDs zuordnen — besser neu exportieren.',
      },
    ],
  },
  // -------------------------------------------------------------------------
  {
    id: 'begriffe',
    group: 'Wissen',
    title: 'Begriffe',
    summary: 'Die wichtigsten Begriffe kurz erklärt.',
    blocks: [
      {
        table: {
          head: ['Begriff', 'Erklärung'],
          rows: [
            ['**Board**', 'Ein Tab im Schedule Board (Datensatz „Schedule Board Setting“).'],
            ['**Standard-Board (Default)**', 'Das mitgelieferte Board „Standard“. Was ein anderes Board nicht selbst setzt, erbt es von hier.'],
            ['**Schedule-Typ**', 'Eine Buchungsart (Booking Setup), z. B. Keine, Termin, Arbeitsauftrag, Projekt. Jeder hat eigene Buchungsvorlage und Ansichten.'],
            ['**Konfiguration**', 'Ein eigener Datensatz für Filterlayout, Ressourcenzellen-Vorlage oder Ressourcenabfrage — von mehreren Boards nutzbar.'],
            ['**Ressourcenabfrage**', 'Bestimmt, welche Ressourcen das Board zeigt, und wertet die Filterfelder aus (`$input/<Key>`).'],
            ['**Filterlayout**', 'Die Felder im linken Filterbereich.'],
            ['**Ressourcenzellen-Vorlage**', 'Darstellung einer Ressource in der linken Spalte (Handlebars-Vorlage).'],
            ['**Buchungsvorlage**', 'Text in einer Buchung in der Stundenansicht, mit Platzhaltern `{feld}`.'],
            ['**Anforderungsbereich**', 'Reiter im unteren Bereich des Boards mit offenen Anforderungen.'],
            ['**Schedule Assistant**', 'Ressourcensuche für eine Anforderung („Buchen“).'],
            ['**Gespeicherte Filterwerte**', 'Mit „Als Standard speichern“ im Filter hinterlegte Auswahl.'],
          ],
        },
      },
    ],
  },
  // -------------------------------------------------------------------------
  {
    id: 'rechte',
    group: 'Wissen',
    title: 'Voraussetzungen & Rechte',
    summary: 'Was die App braucht, damit alles funktioniert.',
    blocks: [
      {
        p: 'Die App arbeitet immer **mit deinen Rechten** in Dynamics. Was du dort nicht darfst, kann auch die App nicht.',
      },
      {
        table: {
          head: ['Aktion', 'Benötigtes Recht'],
          rows: [
            ['Boards ansehen', 'Lesen auf Schedule Board Settings und Konfigurationen'],
            ['Bearbeiten, Kopieren, Löschen', 'Schreiben, Erstellen bzw. Löschen auf Schedule Board Settings'],
            ['Filterlayout, Zellvorlage, Import', 'Schreiben/Erstellen auf Konfigurationen'],
            ['Besitzer ändern', 'Zuweisen auf Schedule Board Settings'],
            ['Freigeben', 'Freigeben auf Schedule Board Settings'],
          ],
        },
      },
      {
        list: [
          '**Freigaben, Tabellenauswahl und Import** laufen über die Dataverse-Verbindung. Beim ersten Start fragt Power Apps nach dieser Verbindung — sie muss mit deinem eigenen Konto angelegt sein.',
          'Fehlen Rechte, zeigt die App die Meldung von Dynamics. Es wird nie stillschweigend etwas „scheinbar“ gespeichert.',
        ],
      },
    ],
  },
  // -------------------------------------------------------------------------
  {
    id: 'faq',
    group: 'Wissen',
    title: 'Häufige Fragen',
    summary: 'Wenn etwas nicht so aussieht wie erwartet.',
    blocks: [
      { h: 'Ich sehe meine Änderung im Schedule Board nicht.' },
      {
        p: 'Das Schedule Board liest seine Einstellungen beim Öffnen — das Schedule Board neu laden (F5). Stellt ein Disponent danach im Board selbst etwas um (z. B. die Zeitskala), speichert das Board diesen Wert und er ersetzt deinen.',
      },
      { h: 'Beim Speichern kommt „zwischenzeitlich geändert“.' },
      { p: 'Jemand — oft das Schedule Board selbst — hat das Board seit dem Laden gespeichert. Siehe „Speichern & Konflikte“.' },
      { h: 'Ein neues Filterfeld erscheint, filtert aber nicht.' },
      { p: 'Die Ressourcenabfrage wertet den Key nicht aus. Siehe „Filterlayout“ → „Warum ein Feld nichts filtert“.' },
      { h: 'Die Vorschau sieht anders aus als im Board.' },
      {
        p: 'Die Vorschau bildet das Board nach, ist aber kein Abbild: Board-eigene Stile und Icons stehen außerhalb des Boards nicht zur Verfügung. Inhalt, Reihenfolge, Fettdruck und Zeilenumbrüche stimmen; Schrift und Abstände können leicht abweichen.',
      },
      { h: 'Der Baukasten ist ausgegraut.' },
      { p: 'Die Vorlage enthält HTML, das der Baukasten nicht verlustfrei abbilden kann. Sie lässt sich weiter im HTML-Modus bearbeiten.' },
      { h: 'Freigaben lassen sich nicht laden.' },
      { p: 'Meist fehlt die Dataverse-Verbindung oder das Leserecht. Siehe „Voraussetzungen & Rechte“.' },
      { h: 'Ich habe versehentlich etwas gespeichert.' },
      { p: 'Reiter Verlauf → „Als Entwurf laden“ → speichern. Für Filterlayout und Zellvorlage gibt es einen eigenen Verlauf im jeweiligen Bereich.' },
    ],
  },
]

/** Help section for an area of the app (top navigation or board tab). */
export const HELP_FOR: Record<string, string> = {
  boards: 'board-liste',
  compare: 'vergleichen',
  bulk: 'mehrere',
  import: 'transfer',
  edit: 'bearbeiten',
  design: 'darstellung',
  json: 'json',
  filter: 'filterlayout',
  sharing: 'freigaben',
  history: 'verlauf',
}

/** All text of a section, lower-cased, for the search. */
export function sectionText(s: HelpSection): string {
  const parts: string[] = [s.title, s.summary, s.group]
  for (const b of s.blocks) {
    if ('p' in b) parts.push(b.p)
    else if ('h' in b) parts.push(b.h)
    else if ('list' in b) parts.push(...b.list)
    else if ('steps' in b) parts.push(...b.steps)
    else if ('tip' in b) parts.push(b.tip)
    else if ('warn' in b) parts.push(b.warn)
    else parts.push(...b.table.head, ...b.table.rows.flat())
  }
  return parts.join(' ').replace(/\*\*|`/g, '').toLowerCase()
}

/** Sections containing every word of the query (all sections for an empty query). */
export function searchHelp(query: string, sections: HelpSection[] = HELP_SECTIONS): HelpSection[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  if (words.length === 0) return sections
  return sections.filter((s) => {
    const text = sectionText(s)
    return words.every((w) => text.includes(w))
  })
}
