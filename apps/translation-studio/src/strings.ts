import type { CellState, ComponentKind } from './types/translation'

/**
 * Every UI text in one place. The app is German for now; should it ever
 * become multilingual, this is the file to translate (help texts live in
 * `help/helpContent.ts`).
 */

const plural = (n: number, one: string, many: string) => `${n.toLocaleString('de-DE')} ${n === 1 ? one : many}`

export const S = {
  app: {
    title: 'Translation Studio',
    nav: { studio: 'Studio', history: 'Verlauf', setup: 'Einrichtung' },
    help: 'Hilfe',
    helpTitle: 'Hilfe zum aktuellen Bereich',
    modeMock: 'Mock-Daten',
    modeDataverse: 'Dataverse',
    modeMockTitle: 'Kein Power-Apps-Host — fiktive Beispieldaten im Speicher',
    loading: '…',
  },

  scope: {
    solution: 'Solution',
    solutionPlaceholder: 'Solution wählen …',
    groupUnmanaged: 'Unmanaged',
    groupManaged: 'Managed (nur lesen)',
    defaultLabel: 'Default — alle Komponenten der Umgebung',
    defaultWarn:
      'Die Default-Solution enthält alle Komponenten der Umgebung. Export und Matrix können sehr groß werden; besser eine eigene Solution wählen.',
    managedWarn: 'Managed Solution: Übersetzungen nur ansehen. Ändern geht nur in der unmanaged Solution der Quellumgebung.',
    load: 'Übersetzungen laden',
    reload: 'Neu laden',
    loadingExport: 'Exportiere Übersetzungen …',
    discardConfirm: (n: number) => `${plural(n, 'ungespeicherte Änderung', 'ungespeicherte Änderungen')} verwerfen und neu laden?`,
    languages: 'Sprachen',
    loadedInfo: (rows: number, base: string, at: string) => `${plural(rows, 'Beschriftung', 'Beschriftungen')} · Basissprache ${base} · exportiert ${at}`,
    singleLanguage:
      'In dieser Umgebung sind keine weiteren Sprachen installiert — es gibt nichts zu übersetzen. Sprachen aktiviert ein Admin unter Einstellungen → Sprachen.',
    nothingLoaded: 'Solution wählen und „Übersetzungen laden“. Die App exportiert die Übersetzungsdatei der Solution und zeigt, was fehlt.',
    resolving: 'Löse Tabellen- und Komponentennamen auf …',
  },

  kpi: {
    missing: 'fehlt',
    untranslated: 'vermutlich unübersetzt',
    changed: 'geändert',
    ok: 'ok',
    coverage: (pct: number) => `${pct.toLocaleString('de-DE', { maximumFractionDigits: 1 })} % übersetzt`,
  },

  states: {
    missing: 'fehlt',
    untranslated: 'vermutlich unübersetzt',
    changed: 'geändert',
    ok: 'ok',
  } satisfies Record<CellState, string>,

  kinds: {
    table: 'Tabellen',
    column: 'Spalten',
    choice: 'Auswahlwerte',
    form: 'Formulare',
    view: 'Ansichten',
    other: 'Sonstiges',
  } satisfies Record<ComponentKind, string>,

  filter: {
    state: 'Zustand',
    stateAll: 'Alle',
    stateGaps: 'Lücken und Bearbeitetes',
    stateMissing: 'Nur fehlende',
    stateUntranslated: 'Nur vermutlich unübersetzte',
    stateChanged: 'Nur geänderte',
    kinds: 'Typ',
    table: 'Tabelle',
    tableAll: 'Alle Tabellen',
    tableNone: '(ohne Tabelle)',
    text: 'Volltext …',
    reset: 'Filter zurücksetzen',
    count: (shown: number, total: number) => `${shown.toLocaleString('de-DE')} von ${plural(total, 'Zeile', 'Zeilen')}`,
  },

  toolbar: {
    acceptAll: (n: number) => `Vorschläge übernehmen (${n.toLocaleString('de-DE')})`,
    acceptAllTitle: 'Glossar-Vorschläge für alle gefilterten Zeilen übernehmen',
    consistency: (n: number) => `Konsistenz (${n.toLocaleString('de-DE')})`,
    csvExport: (n: number) => `CSV exportieren (${n.toLocaleString('de-DE')})`,
    csvExportTitle: 'Gefilterte Zeilen als CSV — zum Ausfüllen in Excel',
    csvImport: 'CSV einlesen',
    discard: 'Änderungen verwerfen',
    discardConfirm: (n: number) => `${plural(n, 'Änderung', 'Änderungen')} verwerfen?`,
    apply: (n: number) => `Anwenden (${n.toLocaleString('de-DE')})`,
    locked: 'Import läuft — Bearbeiten gesperrt',
    readOnly: 'Nur lesen',
  },

  matrix: {
    type: 'Typ',
    component: 'Komponente',
    column: 'Spalte',
    base: (lang: string) => `${lang} — Basis`,
    empty: 'Keine Zeile passt zum Filter.',
    suggestion: (v: string, n: number) => `Vorschlag aus dem Glossar: „${v}“ (${plural(n, 'Mal', 'Mal')} verwendet) — übernehmen`,
    suggestionAll: (n: number) => `für alle ${n} gleichen Basistexte übernehmen`,
    acknowledge: 'Korrekt so (identisch mit der Basissprache ist hier richtig)',
    unacknowledge: 'Markierung „korrekt so“ entfernen',
    revert: 'Änderung zurücknehmen',
    tooLong: (max: number) => `Länger als ${max} Zeichen — der Import würde scheitern.`,
    cannotClear: 'Eine vorhandene Übersetzung lässt sich hier nicht leeren.',
    acknowledged: 'als korrekt markiert',
  },

  apply: {
    title: 'Änderungen anwenden',
    summary: (n: number, langs: number) => `${plural(n, 'Zelle', 'Zellen')} in ${plural(langs, 'Sprache', 'Sprachen')}`,
    headLanguage: 'Sprache',
    headBefore: 'Vorher',
    headAfter: 'Nachher',
    more: (n: number) => `… und ${n.toLocaleString('de-DE')} weitere`,
    publish: 'Danach veröffentlichen (PublishAllXml)',
    publishHint: 'Ohne Veröffentlichen sind die Texte importiert, aber in den Apps erst nach dem nächsten Publish sichtbar.',
    tableHint:
      'Der Export enthält alle Beschriftungen der Tabellen dieser Solution. Wer Beschriftungen von Komponenten ändert, die nicht in der Solution liegen, macht sie zu Abhängigkeiten der Solution (Microsoft Learn).',
    managed: 'Managed Solution — Import nicht möglich.',
    start: (n: number) => `Importieren (${n.toLocaleString('de-DE')})`,
    cancel: 'Abbrechen',
    close: 'Schließen',
    steps: {
      check: 'Prüfen, ob schon ein Import läuft',
      build: 'Datei bauen (Export + Änderungen)',
      upload: 'Import starten (ImportTranslation)',
      job: 'Importjob',
      publish: 'Veröffentlichen (PublishAllXml)',
    },
    jobProgress: (pct: number) => `${Math.round(pct)} %`,
    jobWaiting: 'warte auf den Importjob …',
    paused: 'pausiert, solange die App im Hintergrund ist',
    running: (id: string) => `Es läuft bereits ein Import (Job ${id.slice(0, 8)}…). Erst wenn er fertig ist, lässt sich ein neuer starten.`,
    unchanged: 'Die Datei ist unverändert — es gibt nichts zu importieren.',
    done: 'Import abgeschlossen.',
    donePublished: 'Import abgeschlossen und veröffentlicht.',
    failed: 'Import fehlgeschlagen.',
    publishFailed: 'Import abgeschlossen, Veröffentlichen fehlgeschlagen:',
    publishNow: 'Jetzt veröffentlichen',
    publishConfirm: 'Alle Anpassungen der Umgebung veröffentlichen (PublishAllXml)? Das betrifft auch Änderungen anderer Personen.',
    logTitle: 'Meldungen des Importjobs',
    logEmpty: 'Keine Fehler oder Warnungen im Protokoll.',
    logDownload: 'Protokoll herunterladen',
    noJob: 'Der Importjob ist nicht auffindbar — Import vermutlich nicht gestartet.',
    reloadAfter: 'Schließen und neu laden',
    privilege:
      'Dir fehlt das Recht zum Importieren von Anpassungen (Rolle System Customizer o. ä.). Die App bleibt im Nur-lesen-Modus; die Änderungen lassen sich als CSV weitergeben.',
  },

  csv: {
    title: 'CSV einlesen',
    hint: 'Eine aus dem Studio exportierte CSV, in Excel ausgefüllt. Leere Zellen bedeuten „unverändert“; die Basissprache wird ignoriert.',
    read: (rows: number) => `${plural(rows, 'Zeile', 'Zeilen')} gelesen`,
    changes: (n: number) => `${plural(n, 'Änderung', 'Änderungen')} gegenüber dem aktuellen Stand`,
    skipped: 'Nicht übernommen',
    take: (n: number) => `In die Matrix übernehmen (${n.toLocaleString('de-DE')})`,
    none: 'Die Datei enthält keine Änderungen gegenüber dem aktuellen Stand.',
    taken: (n: number) => `${plural(n, 'Änderung', 'Änderungen')} aus der CSV übernommen — vor dem Import in der Matrix prüfen.`,
  },

  consistency: {
    title: 'Konsistenz',
    intro: 'Gleicher Basistext, verschiedene Übersetzungen in einer Sprache. Vereinheitlichen setzt alle anderen Varianten auf die gewählte.',
    none: 'Keine Abweichungen — gleiche Basistexte sind überall gleich übersetzt.',
    unify: 'vereinheitlichen',
    show: 'In der Matrix zeigen',
    unified: (n: number) => `${plural(n, 'Zelle', 'Zellen')} vereinheitlicht.`,
  },

  history: {
    title: 'Verlauf',
    intro: 'Die letzten Importe aus diesem Browser (lokal gespeichert, nicht in Dataverse).',
    empty: 'Noch keine Importe.',
    clear: 'Verlauf leeren',
    clearConfirm: 'Lokalen Verlauf löschen?',
    headWhen: 'Zeitpunkt',
    headSolution: 'Solution',
    headChanges: 'Änderungen',
    headResult: 'Ergebnis',
    headPublish: 'Veröffentlicht',
    yes: 'ja',
    no: 'nein',
    status: { succeeded: 'erfolgreich', failed: 'fehlgeschlagen', running: 'lief noch', error: 'Fehler' },
  },

  setup: {
    title: 'Einrichtung',
    intro: 'Prüft, ob die App in dieser Umgebung arbeiten kann. Befehle zum Einrichten stehen in der README.',
    recheck: 'Erneut prüfen',
    checking: 'Prüfe …',
    probeTitle: 'Export testen',
    probeIntro: 'Exportiert die Übersetzungen einer kleinen Solution und zeigt, welche Sprachen installiert sind und über welchen Weg der Export lief.',
    probeRun: 'Export testen',
    probeRoute: 'Weg',
    probeSize: 'Größe',
    probeLanguages: 'Sprachen',
    probeRows: 'Beschriftungen',
    probeSheets: 'Blätter',
    routes: { native: 'native Aktion (Benutzer)', connector: 'Konnektor, ungebundene Aktion', 'connector-bound': 'Konnektor, gebundener Pfad', mock: 'Mock' } as Record<string, string>,
  },

  errors: {
    load: 'Laden fehlgeschlagen:',
    privilegeExport:
      'Dir fehlt das Recht, Anpassungen zu exportieren (Rolle System Customizer o. ä.). Ohne Export kann die App nichts anzeigen.',
  },

  help: {
    title: 'Hilfe',
    search: 'Hilfe durchsuchen …',
    close: 'Hilfe schließen',
    toc: 'Inhalt der Hilfe',
    hits: (n: number, q: string) => `${plural(n, 'Abschnitt', 'Abschnitte')} mit „${q}“`,
    noHits: 'Keine Treffer.',
    nothing: 'Nichts gefunden — anderes Wort versuchen, z. B. „Import“, „CSV“ oder „Vorschlag“.',
  },

  file: {
    drop: 'Datei hierher ziehen',
    other: 'Andere Datei',
    choose: 'Datei wählen',
  },

  common: {
    busy: 'Läuft …',
    cancel: 'Abbrechen',
    ok: 'OK',
    close: 'Schließen',
    yes: 'Ja',
  },
}

export { plural }
