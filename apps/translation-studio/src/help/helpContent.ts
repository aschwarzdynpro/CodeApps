/**
 * Content of the help panel. Plain data so it can be searched and kept in
 * step with the app without touching layout code. Inline markup in strings:
 * **fett** and `code`. Section ids are used as deep links (`openHelp(id)`).
 * Update with every visible change.
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
  {
    id: 'ueberblick',
    group: 'Einstieg',
    title: 'Überblick',
    summary: 'Was das Translation Studio macht und woher die Daten kommen.',
    blocks: [
      {
        p: 'Dataverse pflegt Beschriftungen — Tabellen- und Spaltennamen, Auswahlwerte, Formular- und Ansichtsnamen — **je installierter Sprache**. Fehlt eine Übersetzung, sehen Nutzer der anderen Sprache den Text der Basissprache. Das Studio zeigt, **was fehlt**, lässt die Lücken direkt füllen und spielt sie mit einem Klick zurück.',
      },
      {
        p: 'Die Daten kommen aus dem Standard-Übersetzungsexport von Dataverse („Übersetzungen exportieren“): eine Zip-Datei mit `CrmTranslations.xml`. Das Studio liest sie, zeigt sie als Matrix und importiert dieselbe Datei mit deinen Änderungen wieder („Übersetzungen importieren“). Es ändert nichts an den Metadaten vorbei an diesem Weg.',
      },
      { h: 'Aufbau' },
      {
        table: {
          head: ['Bereich', 'Wofür'],
          rows: [
            ['**Studio**', 'Solution wählen, laden, Lücken sehen und füllen, Vorschläge übernehmen, CSV austauschen, anwenden.'],
            ['**Verlauf**', 'Die letzten Importe aus diesem Browser.'],
            ['**Einrichtung**', 'Prüft Konnektor, Rechte, Importjobs und testet den Export.'],
            ['**Hilfe**', 'Diese Seite.'],
          ],
        },
      },
      {
        tip: 'Ohne Power-Apps-Host (lokal mit `npm run dev`) läuft die App mit fiktiven Mock-Daten in Englisch, Deutsch und Französisch — Badge „Mock-Daten“ oben rechts. Ein Import wird dort simuliert.',
      },
    ],
  },
  {
    id: 'laden',
    group: 'Studio',
    title: 'Solution wählen und laden',
    summary: 'Welche Beschriftungen in der Matrix landen.',
    blocks: [
      {
        steps: [
          'Oben eine **Solution** wählen. Unmanaged Solutions lassen sich bearbeiten, managed nur ansehen.',
          '**Übersetzungen laden** exportiert die Übersetzungsdatei der Solution. Das dauert je nach Größe Sekunden bis Minuten.',
          'Unter „Sprachen“ die Zielsprachen an- oder abwählen. Die Basissprache ist immer dabei und nie editierbar.',
        ],
      },
      {
        p: 'Der Export enthält **alle Beschriftungen der Tabellen** in der Solution — auch Formulare und Spalten, die selbst nicht in der Solution liegen (so exportiert Dataverse). Die Typen (Tabellen, Spalten, Auswahlwerte …) wählst du danach im Filter.',
      },
      {
        warn: '**Default** steht für alle Komponenten der Umgebung. Der Export kann sehr groß werden und an Grenzen von Konnektor oder Browser stoßen — besser eine eigene Solution.',
      },
      {
        p: 'Ist in der Umgebung nur eine Sprache installiert, zeigt das Studio statt einer leeren Matrix den Hinweis „keine weiteren Sprachen installiert“. Sprachen aktiviert ein Admin in den Einstellungen der Umgebung.',
      },
    ],
  },
  {
    id: 'matrix',
    group: 'Studio',
    title: 'Lückenmatrix',
    summary: 'Zeilen, Spalten, Zustände und Bearbeiten.',
    blocks: [
      {
        p: 'Jede Zeile ist eine Beschriftung: **Typ** (Tabelle, Spalte, Auswahlwert, Formular, Ansicht, Sonstiges), **Komponente** (Tabelle und Name, soweit auflösbar), **Spalte** (welcher Text: Anzeigename, Beschreibung, Mehrzahl …), der Text der **Basissprache** und je Zielsprache eine Zelle.',
      },
      {
        table: {
          head: ['Zustand', 'Bedeutung'],
          rows: [
            ['**fehlt** (rot)', 'Zielsprache leer, Basistext vorhanden.'],
            ['**vermutlich unübersetzt** (gelb)', 'Gleicher Text wie in der Basissprache. Eine Vermutung: „Status“ ist auch Deutsch. Mit ✓ als „korrekt so“ markieren — die Markierung gilt pro Solution in diesem Browser.'],
            ['**geändert** (blau)', 'Du hast die Zelle bearbeitet; noch nicht importiert. ↶ nimmt die Änderung zurück.'],
            ['**ok**', 'Übersetzt.'],
          ],
        },
      },
      {
        list: [
          'In eine Zelle klicken und tippen; **Enter** oder Verlassen der Zelle übernimmt, **Esc** verwirft.',
          'Texte über 500 Zeichen lehnt der Import ab — die Zelle wird rot und nicht übernommen.',
          'Eine vorhandene Übersetzung lässt sich nicht leeren: ob eine leere Zelle beim Import „löschen“ oder „unverändert“ bedeutet, ist nicht dokumentiert.',
          'Die Matrix zeigt nur die sichtbaren Zeilen und kommt so auch mit zehntausenden Beschriftungen zurecht.',
        ],
      },
      { h: 'Kennzahlen' },
      {
        p: 'Die Leiste über der Matrix zeigt je Sprache, wie viel übersetzt ist, und die Zahl der fehlenden, vermutlich unübersetzten und geänderten Zellen. Ein Klick auf eine Zahl setzt den Zustandsfilter.',
      },
    ],
  },
  {
    id: 'filter',
    group: 'Studio',
    title: 'Filter',
    summary: 'Zustand, Typ, Tabelle und Volltext.',
    blocks: [
      {
        list: [
          '**Zustand**: Alle, Lücken und Bearbeitetes (fehlt, vermutlich unübersetzt, geändert — Standard; eine gefüllte Zeile bleibt so sichtbar), nur fehlende, nur vermutlich unübersetzte, nur geänderte. Es zählt jede gewählte Sprache.',
          '**Typ**: Tabellen, Spalten, Auswahlwerte, Formulare, Ansichten, Sonstiges — Knöpfe an/aus.',
          '**Tabelle**: aus den Metadaten der Umgebung aufgelöst. Beschriftungen ohne bekannte Tabelle stehen unter „(ohne Tabelle)“.',
          '**Volltext**: sucht in allen Texten, Schlüsseln, Tabellen- und Komponentennamen; mehrere Wörter grenzen ein.',
        ],
      },
      { tip: 'CSV-Export und „Vorschläge übernehmen“ wirken auf die **gefilterten** Zeilen.' },
    ],
  },
  {
    id: 'vorschlaege',
    group: 'Studio',
    title: 'Glossar-Vorschläge und Konsistenz',
    summary: 'Übersetzungen, die es woanders schon gibt.',
    blocks: [
      {
        p: 'Ist derselbe Basistext an anderer Stelle schon übersetzt, zeigt die Zelle einen **Vorschlag** (💡). Ein Klick übernimmt ihn; „×n“ übernimmt ihn für alle n Lücken mit demselben Basistext in dieser Sprache. Gibt es mehrere Übersetzungen, gewinnt die häufigste.',
      },
      {
        p: '**Vorschläge übernehmen** in der Werkzeugleiste übernimmt alle Vorschläge der gefilterten Zeilen auf einmal. Übernommene Vorschläge sind normale Änderungen (blau) — vor dem Import ansehen.',
      },
      {
        p: '**Konsistenz** listet Basistexte, die in einer Sprache verschieden übersetzt sind (z. B. „Notes“ = „Notizen“ und „Anmerkungen“). „vereinheitlichen“ setzt alle anderen Varianten auf die gewählte; „In der Matrix zeigen“ filtert auf den Basistext.',
      },
      { warn: 'Vorschläge und die Markierung „vermutlich unübersetzt“ werden **nie** automatisch geschrieben — nur, was du übernimmst.' },
    ],
  },
  {
    id: 'csv',
    group: 'Studio',
    title: 'CSV-Roundtrip mit der Fachabteilung',
    summary: 'Lücken als Datei verschicken, ausgefüllt zurückspielen.',
    blocks: [
      {
        steps: [
          'Filter setzen, z. B. „Nur fehlende“ und Typ „Spalten“.',
          '**CSV exportieren** — Semikolon, UTF-8, öffnet sich direkt in Excel. Erste Spalte `Schlüssel` nicht ändern.',
          'Die Fachabteilung füllt die Sprachspalten aus. Leere Zellen bedeuten „unverändert“, die Basisspalte wird ignoriert.',
          '**CSV einlesen** zeigt, was sich ändert, und was nicht übernommen wird (unbekannte Schlüssel, Basissprache, über 500 Zeichen).',
          '„In die Matrix übernehmen“ — die Zellen erscheinen als geändert. Dann wie gewohnt **Anwenden**.',
        ],
      },
      { tip: 'Texte, die mit `=`, `+`, `-` oder `@` beginnen, bekommen beim Export ein `\'` vorangestellt, damit Excel sie nicht als Formel liest. Beim Einlesen wird es wieder entfernt.' },
    ],
  },
  {
    id: 'anwenden',
    group: 'Studio',
    title: 'Anwenden: Import, Fortschritt, Veröffentlichen',
    summary: 'Wie die Änderungen nach Dataverse kommen.',
    blocks: [
      {
        steps: [
          '**Anwenden** zeigt die Vorschau: nur die geänderten Zellen, Anzahl je Sprache, vorher/nachher.',
          '**Importieren** prüft, ob schon ein Import läuft, baut die Datei (der Export plus deine Änderungen — keine Zeile entfernt, nichts umsortiert) und startet den Import.',
          'Der Fortschritt des Importjobs wird alle zwei Sekunden gelesen; im Hintergrund pausiert die Abfrage. Solange der Import läuft, ist das Bearbeiten gesperrt.',
          'Danach wird veröffentlicht (**PublishAllXml**), wenn der Haken gesetzt ist. Ohne Veröffentlichen sind die Texte importiert, aber erst nach dem nächsten Publish sichtbar — „Jetzt veröffentlichen“ holt das nach.',
          'Das Ergebnis zeigt die Meldungen des Importjobs; das Protokoll lässt sich herunterladen. „Schließen und neu laden“ exportiert neu, die Matrix zeigt dann den Stand aus Dataverse.',
        ],
      },
      {
        warn: 'Veröffentlichen betrifft **alle** unveröffentlichten Anpassungen der Umgebung, auch die anderer Personen.',
      },
      {
        p: 'Ändern sich Beschriftungen von Komponenten, die nicht in der Solution liegen (z. B. ein anderes Formular derselben Tabelle), werden diese laut Microsoft zu Abhängigkeiten der Solution.',
      },
      { tip: 'Eine unveränderte Datei wird nie importiert, die Basissprache nie geschrieben.' },
    ],
  },
  {
    id: 'verlauf',
    group: 'Weitere Bereiche',
    title: 'Verlauf',
    summary: 'Die letzten Importe aus diesem Browser.',
    blocks: [
      {
        p: 'Jeder Import landet mit Zeitpunkt, Solution, Änderungen je Sprache, Ergebnis, Importjob-ID und Veröffentlicht ja/nein im Verlauf — lokal in diesem Browser, die letzten 25. Ein anderer Browser oder eine andere Person sieht ihn nicht.',
      },
    ],
  },
  {
    id: 'einrichtung',
    group: 'Weitere Bereiche',
    title: 'Einrichtung und Diagnose',
    summary: 'Ob die App in dieser Umgebung arbeiten kann.',
    blocks: [
      {
        table: {
          head: ['Prüfung', 'Was dahinter steckt'],
          rows: [
            ['Org-URL gesetzt', 'Die Adresse der Umgebung, beim Bauen der App festgelegt.'],
            ['Dataverse-Konnektor', 'Verbindung mit deinem Benutzerkonto; liest Solutions, Importjobs und Metadaten.'],
            ['Native Aktionen', 'ExportTranslation, ImportTranslation, PublishAllXml direkt gegen Dataverse. Fehlen sie, versucht die App den Konnektor.'],
            ['Solutions lesbar', 'Liste für die Auswahl.'],
            ['Basissprache', 'Aus der Organisation; sonst die erste Sprachspalte der Datei.'],
            ['Importjobs lesbar', 'Für den Fortschritt beim Import.'],
          ],
        },
      },
      {
        p: '**Export testen** exportiert eine kleine Solution und zeigt Weg, Größe, installierte Sprachen und Anzahl der Beschriftungen.',
      },
    ],
  },
  {
    id: 'rechte',
    group: 'Weitere Bereiche',
    title: 'Rechte und Grenzen',
    summary: 'Wer was darf, was die App nicht kann.',
    blocks: [
      {
        list: [
          'Export und Import brauchen das Recht, Anpassungen zu exportieren bzw. zu importieren (Rolle **System Customizer** oder höher). Fehlt es beim Import, schaltet die App auf „Nur lesen“ — die Lücken lassen sich dann als CSV an jemanden mit Rechten weitergeben.',
          'Alles läuft mit **deinem** Benutzerkonto, nicht mit einem Dienstkonto.',
          'Managed Solutions sind nur lesbar.',
          'Nicht im Studio: maschinelle Übersetzung, Bearbeiten der Basissprache, Texte in Canvas Apps, Generative Pages und Flows, Rollennamen. Sitemap-Bereiche, -Gruppen und -Unterbereiche deckt der Dataverse-Export nicht ab.',
        ],
      },
    ],
  },
  {
    id: 'faq',
    group: 'Weitere Bereiche',
    title: 'Häufige Fragen',
    summary: 'Wenn etwas nicht wie erwartet läuft.',
    blocks: [
      { h: 'Nach dem Import sehe ich die Übersetzung nicht.' },
      { p: 'Wurde veröffentlicht? Ohne Publish bleibt der alte Text sichtbar. Außerdem den Browser-Cache der App neu laden und die Sprache in den persönlichen Optionen prüfen.' },
      { h: 'Die Tabelle-Spalte ist leer.' },
      { p: 'Die Namen kommen aus den Metadaten der Umgebung. Für Auswahlwerte und einige Typen gibt die Datei keine Tabelle her; dann hilft der Volltext.' },
      { h: '„Es läuft bereits ein Import“' },
      { p: 'Dataverse verarbeitet einen Import nach dem anderen. Warten, bis der andere Job fertig ist (Maker-Portal → Solutions → Verlauf).' },
      { h: 'Ein Text ist „vermutlich unübersetzt“, ist aber richtig.' },
      { p: 'Mit ✓ als „korrekt so“ markieren. Die Markierung bleibt in diesem Browser für diese Solution erhalten.' },
    ],
  },
]

/** Help section for an area of the app. */
export const HELP_FOR: Record<string, string> = {
  studio: 'matrix',
  history: 'verlauf',
  setup: 'einrichtung',
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
