/**
 * Content of the help panel. Plain data so it can be searched and kept in
 * step with the app without touching layout code. Inline markup in strings:
 * **fett** and `code`. Section ids are used as deep links (`HELP_FOR`).
 */

export type HelpBlock = { p: string } | { h: string } | { list: string[] } | { steps: string[] } | { tip: string } | { warn: string } | { table: { head: string[]; rows: string[][] } }

export interface HelpSection {
  id: string
  group: string
  title: string
  summary: string
  blocks: HelpBlock[]
}

export const HELP_SECTIONS: HelpSection[] = [
  {
    id: 'ueberblick',
    group: 'Einstieg',
    title: 'Überblick',
    summary: 'Was die App macht und wie sie aufgebaut ist.',
    blocks: [
      {
        p: 'Die App zeigt und pflegt die **Arbeitszeiten, Pausen, Abwesenheiten und Geschäftsschließungen**, die das Schedule Board und die Serienplanung nutzen. Dahinter steht das Kalendermodell von Dataverse: ein Kalender je Ressource, darin Regeln mit Rang, Muster und Zeitzone.',
      },
      {
        table: {
          head: ['Bereich', 'Wofür'],
          rows: [
            ['**Ressourcen**', 'Liste mit Facetten und Befunden; Kalender als Woche (alle gefilterten Ressourcen) oder Monat (eine Ressource). Jeder Tag zeigt, woher seine Stunden kommen.'],
            ['**Vorlagen**', 'Arbeitszeitvorlagen mit ihren Regeln — bearbeiten wie eine Ressource, auf viele Ressourcen anwenden.'],
            ['**Feiertage**', 'Geschäftsschließungen des Jahres sehen, anlegen, löschen; Abgleich mit einem Regelwerk (DE Bund und Länder, AT, CH).'],
            ['**Diagnose**', 'Fünf Befunde über alle Ressourcen: ohne Arbeitszeit, auslaufende Regeln, Zeitzonen, inaktive mit Buchungen, ohne Kalender.'],
            ['**Läufe**', 'Verlauf der Massenaktionen mit Rückgängig.'],
            ['**Einrichtung**', 'Was die Umgebung bereitstellt (Konnektor, Org-URL, Actions).'],
          ],
        },
      },
      { h: 'Zwei Wahrheiten' },
      {
        p: 'Die **Slots** (`msdyn_LoadCalendars`) sind die Arbeitszeit, wie der Server sie rechnet — mit Abwesenheiten und Schließungen verrechnet. Die **Regeln** erklären sie: Wiederholung, Einzeltag, Pause, Abwesenheit. Ist die Action nicht erreichbar, rechnet die App aus den Regeln und sagt das oben in einem Hinweis.',
      },
      { tip: 'Rechts oben zeigt die App „Dataverse“ oder „Mock-Daten“. Bei „Mock-Daten“ läuft sie ohne Power-Apps-Umgebung mit erfundenen Beispieldaten — nichts davon wird gespeichert.' },
    ],
  },
  {
    id: 'ressourcen',
    group: 'Einstieg',
    title: 'Ressourcenliste',
    summary: 'Suchen, filtern, auswählen, Stunden und Befunde lesen.',
    blocks: [
      {
        list: [
          'Suche und Facetten (**Org-Einheit, Kategorie, Gebiet**) grenzen die Liste und den Wochenkalender gleichzeitig ein. Jedes Wort der Suche muss in Name, Org-Einheit, Kategorie oder Gebiet vorkommen.',
          '„Inaktive zeigen“ blendet deaktivierte Ressourcen ein, „Nur mit Befunden“ reduziert auf das, was die Diagnose meldet.',
          '**Stunden** sind die Netto-Arbeitszeit im sichtbaren Zeitraum (Woche oder Monat); ein Tooltip nennt die Kapazität, wenn sie abweicht (Effort ≠ 1).',
          'Der **Name** öffnet die Details der Ressource (Regel-Inspektor rechts); die **Checkbox** wählt sie für eine Massenaktion.',
          'Das Abzeichen in **Befunde** zählt die Diagnosebefunde der Ressource; der erste steht daneben, alle im Tooltip.',
        ],
      },
    ],
  },
  {
    id: 'kalender',
    group: 'Lesen',
    title: 'Kalender und Herkunft',
    summary: 'Wochen- und Monatsansicht, der 24-Stunden-Balken, das Tages-Popover.',
    blocks: [
      {
        p: 'Jede Zelle ist ein **24-Stunden-Balken** in der Anzeige-Zeitzone (oben in der Toolbar umschaltbar). Blau ist Arbeitszeit, grau eine Pause, gelb Abwesenheit, schraffiert Nicht-Arbeit, der rote Strich oben eine Geschäftsschließung. Schraffierte Arbeitszeit bedeutet Kapazität ≠ 1.',
      },
      { h: 'Das Popover' },
      {
        p: 'Ein Klick auf eine Zelle zeigt jedes Segment mit Zeitspanne, Art und **Herkunft**: Wiederholung, Einzeltag, Pause, Abwesenheit mit Grund, Nicht-Arbeit, Feiertag der Ressource, Schließung. „Regel“ springt in den Inspektor. Unten steht, ob die Arbeitszeit aus `msdyn_LoadCalendars` oder aus den Regeln stammt.',
      },
      {
        table: {
          head: ['Tag ohne Arbeitszeit', 'Bedeutung'],
          rows: [
            ['**Kein Arbeitstag**', 'Der Wochentag ist in keiner Wiederholung.'],
            ['**Regel ausgelaufen**', 'Die passende Wiederholung hat ein Enddatum vor diesem Tag und keine Nachfolgerin.'],
            ['**Regel beginnt später**', 'Alle Wiederholungen starten erst nach diesem Tag.'],
            ['**Keine Arbeitszeitregel**', 'Der Kalender hat keine Arbeitszeit-Regel.'],
            ['**Abwesenheit / Nicht-Arbeit / Geschäftsschließung**', 'Ein Einzeltag, ein Feiertag aus der Feiertagsliste der Ressource oder die Organisation nimmt den Tag.'],
          ],
        },
      },
      { tip: 'Die Monatsansicht zeigt die Ressource, deren Details offen sind. Woche und Monat teilen sich Zeitraum und Filter.' },
    ],
  },
  {
    id: 'inspektor',
    group: 'Lesen',
    title: 'Regel-Inspektor',
    summary: 'Der Kalenderbaum: Wurzelregel, innerer Kalender, Blattregeln.',
    blocks: [
      {
        p: 'Dataverse speichert jedes Kalenderereignis als **Wurzelregel** im Kalender der Ressource, die auf einen **inneren Kalender** zeigt; dessen **Blattregeln** sind die Zeiten (Arbeit, Pause). Die API nennt den inneren Kalender `InnerCalendarId`.',
      },
      {
        list: [
          'Gespeichert sind drei Formen: **wöchentliche Wiederholung** (Rang 2), **Feiertagsliste** der Ressource (Rang 1) und **Einzeltag** (Rang 0). Der kleinere Rang gewinnt für den ganzen Tag: ein Einzeltag schlägt den Feiertag, der Feiertag die Woche. Ob eine Regel wiederkehrt, liest die App am Muster, nicht am Rang. Die Liste lädt nur die Wurzelregeln; Zeiten und innere Kalender kommen beim Öffnen im Inspektor.',
          '„Je Wochentag verschieden“ sind mehrere Wurzelregeln mit gemeinsamem `groupdesignator`; der Inspektor zeigt sie als Gruppe.',
          'Ein Klick auf einen Block zeigt seine **Felder** (IDs, Muster, Gültigkeit, Zeitzone, `extentcode`) und auf Wunsch das **Roh-JSON** der Zeilen.',
          'Weicht die Zeitzone einer Regel von der Ressource ab, trägt der Block ein gelbes Abzeichen (Befund „Zeitzone Regel ≠ Ressource“).',
          'Verwaiste innere Kalender und nicht interpretierbare Regeln stehen unter dem Baum.',
        ],
      },
    ],
  },
  {
    id: 'bearbeiten',
    group: 'Ändern',
    title: 'Arbeitszeit bearbeiten',
    summary: 'Anlegen, ändern, Einzeltag, beenden, löschen — immer mit Vorschau.',
    blocks: [
      {
        p: 'Die App schreibt **nur über die Actions** `msdyn_SaveCalendar` und `msdyn_DeleteCalendar` — nie direkt in die Regeltabelle. Jeder Dialog hat einen **Vorschau**-Tab: die betroffenen Tage mit Vorher und Nachher, dazu die Aufrufe an die API.',
      },
      { h: 'Aktionen im Inspektor' },
      {
        table: {
          head: ['Aktion', 'Was passiert'],
          rows: [
            ['**Arbeitszeit anlegen**', 'Einmal, wöchentlich (Wochentage, optional Ende) oder je Wochentag verschieden; Zeiten als Arbeit/Pause, Kapazität, Zeitzone der Regel, Geschäftsschließungen beachten.'],
            ['**Abwesenheit / Nicht-Arbeit anlegen**', 'Ganztägig über n Tage oder mit Uhrzeit; Abwesenheit mit Grund. Keine Wiederholung (API-Grenze).'],
            ['**Bearbeiten**', 'Die ganze Wiederholung oder „dieser und folgende ab Datum“ — dann endet die alte am Vortag und eine neue beginnt.'],
            ['**Einzeltag …**', 'Ein Tag einer Wiederholung bekommt eigene Zeiten (Einzeltag, schlägt die Wiederholung), die Wiederholung bleibt.'],
            ['**Beenden**', 'Setzt das Enddatum der Wiederholung.'],
            ['**Löschen**', 'Entfernt die ganze Wiederholung mit allen Blattregeln; „je Wochentag verschieden“ komplett.'],
          ],
        },
      },
      { h: 'Grenzen der API, die der Editor umsetzt' },
      {
        list: [
          'Ein Ereignis liegt innerhalb eines Tages: eine **Nachtschicht** wird als zwei Regeln gespeichert (der zweite Teil am Folgetag, bei Wiederholungen mit um einen Tag verschobenen Wochentagen).',
          '**Pausen** dürfen in der Arbeitszeit liegen; der Editor schneidet sie heraus. Pausen allein gibt es nicht.',
          '**Abwesenheit und Nicht-Arbeit wiederholen sich nicht** — mehrere Tage als Ganztag oder je Tag anlegen; für Betriebsferien die Massenaktion.',
          'Ein **einzelner Tag lässt sich nicht aus einer Wiederholung löschen** — stattdessen einen Nicht-Arbeit-Tag anlegen.',
          'Das Enddatum wird so gesendet, dass der gewählte Tag der letzte ist (die API nimmt Zeiten bis 08:00 als Vortag).',
        ],
      },
      { warn: 'Fehlt das Recht zum Ändern, meldet die Action einen Rechtefehler; die App schaltet dann auf „Nur lesen“ (Abzeichen oben rechts) bis zum Neuladen.' },
    ],
  },
  {
    id: 'massenlauf',
    group: 'Ändern',
    title: 'Massenaktion und Rückgängig',
    summary: 'Vorlage auf viele Ressourcen, Abwesenheit für viele, Verlauf, Rückgängig.',
    blocks: [
      {
        steps: [
          'Ressourcen in der Liste **auswählen** (Checkboxen, max. 50 je Lauf) und „Massenaktion …“ klicken — oder an einer Vorlage „Auf Ressourcen anwenden“.',
          '**Aktion** wählen: Vorlage ab Stichtag (optional bestehende Wiederholungen am Vortag beenden) oder Abwesenheit/Nicht-Arbeit mit Datum, Tagen, Grund.',
          'Die **Vorschau** zeigt je Ressource Stunden pro Woche vorher/nachher, die Zahl der Regeln und Hinweise; übersprungen wird, wer keinen Kalender hat.',
          '**Ausführen** schreibt Ressource für Ressource, mit Fortschritt; „Abbrechen“ stoppt nach der laufenden Ressource. Ein Fehler stoppt den Lauf — alles davor ist geschrieben, der Rest nicht.',
        ],
      },
      { h: 'Rückgängig' },
      {
        p: 'Jeder Lauf beginnt mit einem **Snapshot** der betroffenen Kalender. „Rückgängig“ unter **Läufe** ist ein normaler Lauf mit Vorschau: er löscht, was der Lauf angelegt hat, stellt beendete Wiederholungen auf ihr altes Ende und legt gelöschte Regeln neu an (mit neuen IDs). Der Verlauf liegt im Browser (die letzten 20) — „JSON herunterladen“ sichert ihn.',
      },
      { tip: '„Bestehende Wiederholungen beenden“ aus: der Server nimmt den alten Regeln ab dem Stichtag die Wochentage der Vorlage weg; Wochentage, die die Vorlage nicht hat, laufen mit den alten Zeiten weiter.' },
    ],
  },
  {
    id: 'feiertage',
    group: 'Ändern',
    title: 'Feiertage und Schließungen',
    summary: 'Schließungen des Jahres, Regelwerk, fehlende anlegen.',
    blocks: [
      {
        p: 'Geschäftsschließungen gelten für die **ganze Organisation** (Kalender hinter `organization.businessclosurecalendarid`). Ressourcen, deren Regeln Schließungen beachten, haben an diesen Tagen keine Arbeitszeit — so sieht es auch die Serienplanung.',
      },
      {
        list: [
          '**Neue Schließung**: Name, erster Tag, Anzahl Tage — ganztägig in der Anzeige-Zeitzone, geschrieben über `msdyn_BusinessClosureSave`.',
          '**Abgleich**: das gewählte Regelwerk (Deutschland bundesweit oder ein Bundesland, Österreich, Schweiz) gegen die Schließungen des Jahres — vorhanden, fehlt, anderer Name, nur teilweise. Fehlende markieren und in einem Schritt anlegen.',
          'Schließungen außerhalb des Regelwerks (Betriebsferien, Brückentage) und doppelt belegte Tage sind markiert.',
          '**Löschen** ist in der API nicht dokumentiert; die App versucht es über `msdyn_DeleteCalendar`. Lehnt der Server ab, bleibt das Admin-Center.',
        ],
      },
      { tip: 'Den Jahreswechsel nicht vergessen: das nächste Jahr wählen, Regelwerk prüfen, fehlende anlegen — sonst plant die Serienplanung auf den 3. Oktober.' },
    ],
  },
  {
    id: 'diagnose',
    group: 'Prüfen',
    title: 'Diagnose',
    summary: 'Die fünf Befunde und was dahinter steckt.',
    blocks: [
      {
        table: {
          head: ['Befund', 'Bedeutung', 'Was tun'],
          rows: [
            ['**Ohne Arbeitszeit im Zeitraum**', 'Keine Arbeitszeit in den nächsten 60 Tagen — die häufigste Ursache für „Ressource fehlt auf dem Board“.', 'Arbeitszeit anlegen oder Vorlage anwenden.'],
            ['**Regel endet bald / ist ausgelaufen**', 'Eine Wiederholung endet in 90 Tagen (Warnung; Hinweis, wenn eine Nachfolgerin anschließt) oder endete ohne Nachfolgerin (Fehler).', 'Enddatum ändern („Bearbeiten“) oder neue Regel.'],
            ['**Zeitzone Regel ≠ Ressource**', 'Regeln stehen in einer anderen Zeitzone als die Ressource; auf dem Board verschiebt sich die Arbeitszeit.', 'Regel mit der richtigen Zeitzone neu anlegen (v2: Zeitzonenwechsel mit Migration).'],
            ['**Inaktiv, aber mit Buchungen**', 'Deaktivierte Ressource hat Buchungen nach heute.', 'Buchungen umplanen oder Ressource reaktivieren.'],
            ['**Ohne Kalender / ohne Regeln**', 'Kein Kalender (Fehler) oder Kalender ohne Regel (Warnung); verwaiste innere Kalender als Hinweis.', 'Arbeitszeit anlegen.'],
          ],
        },
      },
      { p: '„Im Kalender zeigen“ öffnet die Ressource mit dem betroffenen Block im Inspektor. Die Kacheln filtern die Liste.' },
    ],
  },
  {
    id: 'zeitzonen',
    group: 'Hintergrund',
    title: 'Zeitzonen und UseV2',
    summary: 'Anzeige-Zeitzone, Zeitzone der Regel, Überlappungslogik.',
    blocks: [
      {
        list: [
          'Jede Regel hat eine **Zeitzone** (Dataverse-Code, z. B. 110 = Berlin); ihre Uhrzeiten gelten dort. Die Ressource hat ebenfalls eine Zeitzone — beides sollte gleich sein (Befund 5.3).',
          'Die **Anzeige-Zeitzone** in der Toolbar bestimmt nur die Darstellung; Sommerzeit rechnet die App über die Systemzeitzonen.',
          'Im Editor ist die Zeitzone der Regel Pflicht und mit der Zeitzone der Ressource vorbelegt.',
        ],
      },
      { h: 'UseV2' },
      {
        p: '**UseV2** wird bei jedem Speichern mitgeschickt (Schalter in der Toolbar). Gemessen in NAAF-Backup mit UseV2: legt man eine Wiederholung an, die sich mit einer bestehenden überschneidet, endet die alte am Vortag und läuft nur mit ihren übrigen Wochentagen weiter — an den gemeinsamen Wochentagen gelten ab dann allein die neuen Zeiten (keine Mischung). Einzeltage mit Arbeitszeit und Feiertage schlagen die Wiederholung für den ganzen Tag; Nicht-Arbeit und Abwesenheit schneiden nur ihre Zeitspanne heraus.',
      },
    ],
  },
  {
    id: 'einrichtung',
    group: 'Hintergrund',
    title: 'Einrichtung und Grenzen',
    summary: 'Was die Umgebung braucht, was die App bewusst nicht tut.',
    blocks: [
      {
        list: [
          'Die App braucht den **Dataverse-Konnektor** mit einer Benutzer-Connection und die **Org-URL** (`VITE_ORG_URL` beim Build); Details in der README unter „Einrichtung“.',
          'Alle Aufrufe laufen mit den Rechten des angemeldeten Nutzers; die Actions prüfen bei Benutzer-Ressourcen das Eigenkalender-Recht.',
          'Die App schreibt **nie** `calendarrule`-Zeilen und fasst Blattregeln nie direkt an.',
          'Abwesenheitsanträge (`msdyn_timeoffrequest`) werden nur gelesen und als Herkunft gezeigt; genehmigen oder anlegen geschieht in Field Service.',
        ],
      },
    ],
  },
  {
    id: 'faq',
    group: 'Hintergrund',
    title: 'Häufige Fragen',
    summary: 'Kurze Antworten auf das, was beim Pflegen von Arbeitszeiten auffällt.',
    blocks: [
      { h: 'Warum ist Dienstag 13 Uhr frei?' },
      { p: 'Zelle anklicken: das Popover nennt Pause, Abwesenheit, Einzeltag, Schließung oder eine ausgelaufene Regel. „Regel“ springt in den Inspektor.' },
      { h: 'Die Ressource fehlt auf dem Schedule Board.' },
      { p: 'Diagnose öffnen: „Ohne Arbeitszeit im Zeitraum“ oder „Regel endet bald / ist ausgelaufen“. Meist fehlt schlicht die Arbeitszeit, nicht ein Recht oder Filter.' },
      { h: 'Kann ich einen Tag aus der Wiederholung löschen?' },
      { p: 'Nein, die API kann das nicht. Stattdessen einen Nicht-Arbeit-Tag oder eine Abwesenheit anlegen — er schlägt die Wiederholung an diesem Tag.' },
      { h: 'Was ist der Unterschied zwischen Abwesenheit und Nicht-Arbeit?' },
      { p: 'Beides nimmt die Zeit aus der Arbeitszeit. Abwesenheit hat einen Grund und steht für Urlaub oder Krankheit; Nicht-Arbeit ist neutral (Schulung, Werkstatt).' },
      { h: 'Die Stunden stimmen nicht mit dem Board überein.' },
      { p: 'Prüfen, ob oben der Hinweis „msdyn_LoadCalendars nicht erreichbar“ steht — dann rechnet die App aus den Regeln. Sonst Anzeige-Zeitzone und die Zeitzone der Regeln vergleichen.' },
    ],
  },
]

/** View → section the help opens at. */
export const HELP_FOR: Record<string, string> = {
  resources: 'ressourcen',
  templates: 'bearbeiten',
  holidays: 'feiertage',
  diagnostics: 'diagnose',
  runs: 'massenlauf',
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

/** Sections containing every word of the query. */
export function searchHelp(query: string, sections: HelpSection[] = HELP_SECTIONS): HelpSection[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  if (words.length === 0) return sections
  return sections.filter((s) => {
    const text = sectionText(s)
    return words.every((w) => text.includes(w))
  })
}
