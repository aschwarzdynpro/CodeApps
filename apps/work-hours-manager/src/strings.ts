import type { FindingKind, OriginKind, ResourceType, SegmentKind, WorkHourKind } from './types/calendar'

/**
 * Every UI text in one place (German). Help texts live in
 * `help/helpContent.ts`. Pure functions in `utils/` take their labels from
 * here too, so the wording stays consistent between calendar, inspector
 * and diagnostics.
 */

const plural = (n: number, one: string, many: string) => `${n.toLocaleString('de-DE')} ${n === 1 ? one : many}`

export const S = {
  app: {
    title: 'Arbeitszeiten & Kalender',
    nav: { resources: 'Ressourcen', templates: 'Vorlagen', holidays: 'Feiertage', diagnostics: 'Diagnose', runs: 'Läufe' },
    navLabel: 'Bereiche',
    help: 'Hilfe',
    helpTitle: 'Hilfe zum aktuellen Bereich',
    modeMock: 'Mock-Daten',
    modeDataverse: 'Dataverse',
    modeMockTitle: 'Kein Power-Apps-Host — fiktive Beispieldaten im Speicher',
    loading: 'Lade …',
    readOnly: 'Nur lesen',
    readOnlyTitle: 'Speichern wurde wegen fehlender Berechtigung abgelehnt — die App zeigt nur noch an.',
  },

  toolbar: {
    range: 'Zeitraum',
    week: 'Woche',
    month: 'Monat',
    today: 'Heute',
    prev: 'Zurück',
    next: 'Weiter',
    viewerZone: 'Anzeige-Zeitzone',
    search: 'Suchen …',
    useV2: 'UseV2 (mehrere Wiederholungen parallel)',
  },

  kinds: {
    work: 'Arbeitszeit',
    break: 'Pause',
    nonwork: 'Nicht-Arbeit',
    timeoff: 'Abwesenheit',
    closure: 'Geschäftsschließung',
    unknown: 'Unbekannt',
  } satisfies Record<WorkHourKind, string>,

  segments: {
    work: 'Arbeitszeit',
    break: 'Pause',
    timeoff: 'Abwesenheit',
    nonwork: 'Nicht-Arbeit',
    closure: 'Schließung',
  } satisfies Record<SegmentKind, string>,

  origins: {
    recurrence: 'Wiederholung',
    occurrence: 'Einzeltag',
    break: 'Pause',
    timeoff: 'Abwesenheit',
    nonwork: 'Nicht-Arbeit',
    closure: 'Schließung',
    slot: 'Arbeitszeit (Regel unbekannt)',
  } satisfies Record<OriginKind, string>,

  reasons: {
    none: '',
    timeoff: 'Abwesenheit',
    closure: 'Geschäftsschließung',
    nonwork: 'Nicht-Arbeit',
    noRule: 'Keine Arbeitszeitregel',
    ruleEnded: 'Regel ausgelaufen',
    ruleNotStarted: 'Regel beginnt später',
    weekdayOff: 'Kein Arbeitstag',
  },

  resourceTypes: {
    generic: 'Generisch',
    contact: 'Kontakt',
    user: 'Benutzer',
    equipment: 'Ausrüstung',
    account: 'Firma',
    crew: 'Team',
    facility: 'Einrichtung',
    pool: 'Pool',
  } satisfies Record<ResourceType, string>,

  rules: {
    weekly: 'Wöchentlich',
    daily: 'Täglich',
    once: 'Einmal',
    allDay: 'ganztägig',
    varied: 'je Wochentag verschieden',
    openEnd: 'ohne Ende',
    from: 'ab',
    until: 'bis',
    capacity: 'Kapazität',
    rank0: 'Rang 0 — wöchentliche Wiederholung',
    rank1: 'Rang 1 — Einzeltag/Abwesenheit, schlägt Rang 0',
    root: 'Wurzelregel',
    inner: 'Innerer Kalender',
    leaf: 'Blattregel',
    orphan: 'Verwaister innerer Kalender',
    unparsed: 'Nicht interpretierbare Regel',
    ends: (date: string) => `endet ${date}`,
    ended: (date: string) => `endete ${date}`,
    pauseAt: (range: string) => `Pause ${range}`,
    describeEmpty: 'Regel ohne Blattregeln',
    tz: 'Zeitzone',
    zoneMismatch: (rule: string, resource: string) => `Regel in ${rule}, Ressource in ${resource}`,
  },

  findings: {
    noWorkingTime: 'Ohne Arbeitszeit im Zeitraum',
    ruleEnding: 'Regel endet bald / ist ausgelaufen',
    timeZoneMismatch: 'Zeitzone Regel ≠ Ressource',
    inactiveWithBookings: 'Inaktiv, aber mit Buchungen',
    noCalendar: 'Ohne Kalender / ohne Regeln',
    orphanInnerCalendar: 'Verwaister innerer Kalender',
  } satisfies Record<FindingKind, string>,

  findingDetails: {
    noWorkingTime: (from: string, to: string) => `Keine Arbeitszeit zwischen ${from} und ${to}.`,
    ruleEndsIn: (days: number, date: string) => `Wiederholung endet in ${plural(days, 'Tag', 'Tagen')} (${date}); danach keine Arbeitszeit aus dieser Regel.`,
    ruleEnded: (date: string) => `Wiederholung endete am ${date}.`,
    tzMismatch: (rule: string, resource: string) => `Regel in ${rule}, Ressource in ${resource} — die Arbeitszeit verschiebt sich auf dem Board.`,
    inactiveWithBookings: (n: number, date: string) => `${plural(n, 'Buchung', 'Buchungen')} nach dem ${date}.`,
    noCalendar: 'Die Ressource hat keinen Kalender.',
    noRules: 'Der Kalender enthält keine Regeln.',
    orphan: (n: number) => `${plural(n, 'innerer Kalender', 'innere Kalender')} ohne Wurzelregel.`,
  },

  holidays: {
    national: 'bundesweit',
    regional: 'regional',
    optional: 'nur in Teilen des Landes',
    status: { ok: 'vorhanden', missing: 'fehlt', nameDiffers: 'anderer Name', partial: 'nur teilweise' },
    extra: 'nicht im Regelwerk',
    duplicate: 'doppelt',
  },

  plural,
} as const
