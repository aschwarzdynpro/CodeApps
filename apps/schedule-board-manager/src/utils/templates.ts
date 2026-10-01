import { escapeHtml, templateVariables, truthy, type Helper } from './handlebarsLite'
import type { Json } from './settingsModel'

/**
 * The schedule board's HTML templates and what the preview needs to know
 * about them.
 *
 * - Booking template (`SlotMetadataCollection[].SlotTemplate`) and booking
 *   alert template (`BookingAlertTemplate`): HTML with `{field}` placeholders.
 *   A field is a column of the base table or a path over N:1 relationship
 *   schema names, e.g. `{msdyn_msdyn_workorder_bookableresourcebooking_WorkOrder.msdyn_name}`.
 * - Resource cell template (`msdyn_configuration`, type 192350001): Handlebars,
 *   values come from the Retrieve Resources Query.
 *
 * Sources: MS Learn "Edit the schedule board booking template", "Schedule
 * board tab settings", "Customize the schedule board with a custom resource
 * attribute", "Add crew information to resource cells".
 */

// ---------------------------------------------------------------------------
// Product defaults
// ---------------------------------------------------------------------------

/** Booking template when none is set (MS Learn, booking template). */
export const DEFAULT_BOOKING_TEMPLATE = '<div>{SchedulableEntityDisplayName} - {name}<br />Duration: <strong class="bold">{duration}</strong></div>'

/** Booking alert template when none is set (MS Learn, tab settings). */
export const DEFAULT_ALERT_TEMPLATE = `<b class="bold">Subject: </b>{msdyn_msdyn_bookingalert_msdyn_bookingalertstatus_BookingAlert.subject}<br />
<b class="bold">Due: </b>{msdyn_nexttimetoshow}<br />
<b class="bold">Description: </b><br />
{msdyn_msdyn_bookingalert_msdyn_bookingalertstatus_BookingAlert.description}`

/**
 * Starting point for a new resource cell template: the structure of the
 * Microsoft sample (custom resource attribute) without its cost indicator.
 * Not the product row itself — that one is copied from the environment.
 */
export const STARTER_CELL_TEMPLATE = `<div class='resource-card-wrapper {{iif ResourceCellSelected "resource-cell-selected" ""}} {{iif ResourceUnavailable "resource-unavailable" ""}} {{iif IsMatchingAvailability "availability-match" ""}}'>
  {{#if imagepath}}
  <img class='resource-image' src='{{client-url}}{{imagepath}}' />
  {{else}}
  <div class='resource-image unknown-resource'></div>
  {{/if}}
  <div class='resource-info'>
    <div class='resource-name primary-text ellipsis' title='{{name}}'>{{name}}</div>
    <div class='secondary-text ellipsis'>
      {{#if (eq (is-sa-grid-view) false) }}
      <div class='booked-duration'>{{BookedDuration}}<div class='fo-sch-clock'></div></div>
      <div class='booked-percentage'>{{BookedPercentage}}%</div>
      {{/if}}
    </div>
    {{#if (eq (is-sa-grid-view) false) }}
    <div class='matching-indicator'></div>
    {{/if}}
  </div>
  {{#if (eq (is-sa-grid-view) false) }}
  {{> resource-map-pin-template this }}
  {{/if}}
</div>`

/** Base table of the `{field}` paths per template kind. */
export const TEMPLATE_BASE_ENTITY = {
  booking: 'bookableresourcebooking',
  alert: 'msdyn_bookingalertstatus',
} as const

/** Placeholders the board fills that are not columns. */
export const SPECIAL_BOOKING_FIELDS: { path: string; label: string }[] = [
  { path: 'SchedulableEntityDisplayName', label: 'Anzeigename der geplanten Tabelle (z. B. Arbeitsauftrag)' },
]

// ---------------------------------------------------------------------------
// `{field}` templates (booking, booking alert)
// ---------------------------------------------------------------------------

/** `{name}` or `{rel.rel.field}`, not part of `{{…}}`. */
const FIELD = /(?<!\{)\{([A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*)\}(?!\})/g

/** Field paths in order of first use. */
export function fieldPlaceholders(template: string): string[] {
  const out: string[] = []
  for (const m of template.matchAll(FIELD)) if (!out.includes(m[1])) out.push(m[1])
  return out
}

/** Replaces each `{field}` with its HTML-escaped value. */
export function renderFieldTemplate(template: string, value: (path: string) => string): string {
  return template.replace(FIELD, (_, path: string) => escapeHtml(value(path)))
}

export type TemplateSource = 'own' | 'inherited' | 'product'

/**
 * Which `{field}` template applies: the board's own, the Default board's or
 * the product default. A stored empty string means "not set"; an own
 * template the user cleared in this session stays own (and editable).
 */
export function resolveTemplate(
  draft: Json | undefined,
  saved: Json | undefined,
  inherited: Json | undefined,
  product: string,
): { source: TemplateSource; text: string } {
  const own = typeof draft === 'string' && (draft.trim() !== '' || draft !== saved) ? draft : null
  const fromDefault = typeof inherited === 'string' && inherited.trim() !== '' ? inherited : null
  return { source: own !== null ? 'own' : fromDefault !== null ? 'inherited' : 'product', text: own ?? fromDefault ?? product }
}

// ---------------------------------------------------------------------------
// Resource cell template (Handlebars)
// ---------------------------------------------------------------------------

/** Variables the board puts into every resource cell. */
export const CELL_BUILTINS: { name: string; label: string; sample: unknown }[] = [
  { name: 'name', label: 'Name der Ressource', sample: 'Mara Lindqvist' },
  { name: 'imagepath', label: 'Bildpfad (leer = Platzhalterbild)', sample: '' },
  { name: 'BookedDuration', label: 'Gebuchte Dauer im Zeitraum', sample: '6:30' },
  { name: 'BookedPercentage', label: 'Auslastung in Prozent', sample: 81 },
  { name: 'ResourceCellSelected', label: 'Zelle ausgewählt', sample: false },
  { name: 'ResourceUnavailable', label: 'Ressource nicht verfügbar', sample: false },
  { name: 'IsMatchingAvailability', label: 'Passt zur Verfügbarkeitssuche', sample: false },
]

/** Flags the preview varies per row instead of taking them from the sample values. */
export const CELL_STATE_FLAGS = ['ResourceCellSelected', 'ResourceUnavailable', 'IsMatchingAvailability']

/**
 * The URS helpers the Microsoft samples use. Anything else is reported as
 * unknown by the renderer instead of being imitated.
 */
export function ursHelpers(opts: { saGridView: boolean }): Record<string, Helper> {
  return {
    iif: (cond, a, b) => (truthy(cond) ? a : b),
    eq: (a, b) => a === b || (typeof a !== typeof b && a !== null && b !== null && String(a) === String(b)),
    // Relative image paths stay relative — the sandboxed preview loads nothing from the org.
    'client-url': () => '',
    'is-sa-grid-view': () => opts.saGridView,
  }
}

export const URS_HELPER_NAMES = ['iif', 'eq', 'client-url', 'is-sa-grid-view']

/** Product partials, drawn as a placeholder. */
export const URS_PARTIALS: Record<string, string> = {
  'resource-map-pin-template': "<div class='resource-map-pin' title='Kartenpin (Produkt-Partial)'></div>",
}

/** Variables a cell template reads from the resource (helpers excluded). */
export function cellVariables(template: string): string[] {
  return templateVariables(template, URS_HELPER_NAMES)
}

/**
 * Sample values are typed in as text; Handlebars tests truthiness, so
 * "false", "0" and "" have to become real falsy values.
 */
export function parseSample(text: string): unknown {
  const t = text.trim()
  if (t === 'true') return true
  if (t === 'false') return false
  if (t === 'null') return null
  if (/^-?\d+(\.\d+)?$/.test(t)) return Number(t)
  return text
}

export function formatSample(v: unknown): string {
  if (v === null || v === undefined) return ''
  return String(v)
}

// ---------------------------------------------------------------------------
// Checks
// ---------------------------------------------------------------------------

export type TemplateKind = 'booking' | 'alert' | 'cell'

export interface TemplateLint {
  level: 'error' | 'warn' | 'info'
  message: string
}

/** Static checks — what the board ignores or rejects, as far as documented. */
export function lintTemplate(template: string, kind: TemplateKind): TemplateLint[] {
  const out: TemplateLint[] = []
  if (/<script\b/i.test(template)) out.push({ level: 'error', message: 'JavaScript wird in Vorlagen nicht unterstützt — <script> entfernen.' })
  if (/\son[a-z]+\s*=/i.test(template)) out.push({ level: 'error', message: 'Event-Handler wie onclick werden nicht ausgeführt (kein JavaScript in Vorlagen).' })
  if (/javascript:/i.test(template)) out.push({ level: 'error', message: '„javascript:“-Links werden nicht ausgeführt.' })

  if (kind === 'cell') {
    if (fieldPlaceholders(template).length > 0) {
      out.push({ level: 'warn', message: 'Einfache Klammern {feld} sind Syntax der Buchungsvorlage — die Zellvorlage erwartet {{feld}}.' })
    }
  } else if (template.includes('{{')) {
    out.push({ level: 'warn', message: 'Doppelte Klammern {{…}} sind Handlebars-Syntax der Zellvorlage — hier gilt {feld}.' })
  }

  if (kind === 'booking' && (/<style\b/i.test(template) || /\bclass\s*=\s*["'][^"']*\bfa\b/i.test(template))) {
    out.push({
      level: 'info',
      message:
        'CSS-Blöcke und Font-Awesome-Icons beschreibt Microsoft nur zusammen mit „Disable Sanitizing HTML Templates = Ja“ (Scheduling-Parameter). Ohne die Einstellung kann das Board sie entfernen.',
    })
  }
  if (/\bclass\s*=\s*["'][^"']*\bfa-/i.test(template)) {
    out.push({ level: 'info', message: 'Font-Awesome-Icons (Version 4) zeigt die Vorschau als Ersatzzeichen.' })
  }
  return out
}

// ---------------------------------------------------------------------------
// Sample values
// ---------------------------------------------------------------------------

export interface SampleContext {
  /** Display name of the scheduled table, e.g. "Arbeitsauftrag". */
  entityLabel?: string
  /** Table of a plain column (view previews); booking templates default to the booking. */
  entity?: string
  /** Booking duration in minutes. */
  durationMinutes?: number
}

const SAMPLE_BY_FIELD: Record<string, string> = {
  duration: '120',
  starttime: '01.10.2026 08:30',
  endtime: '01.10.2026 10:30',
  msdyn_estimatedarrivaltime: '01.10.2026 09:00',
  msdyn_estimatedtravelduration: '30',
  msdyn_actualtravelduration: '25',
  msdyn_nexttimetoshow: '01.10.2026 07:45',
  msdyn_time: '01.10.2026 07:30',
  bookingstatus: 'Geplant',
  resource: 'Mara Lindqvist',
  msdyn_resourcerequirement: 'Anforderung Heizungswartung',
  msdyn_workorder: 'WO-00042',
  msdyn_workordertype: 'Wartung',
  msdyn_primaryincidenttype: 'Jahreswartung',
  msdyn_priority: 'Hoch',
  msdyn_serviceaccount: 'Contoso Haustechnik',
  msdyn_billingaccount: 'Contoso Haustechnik',
  msdyn_systemstatus: 'Geplant',
  msdyn_substatus: 'Material bestellt',
  msdyn_instructions: 'Zugang über den Hof, Schlüssel beim Hausmeister.',
  subject: 'Techniker verspätet sich',
  description: 'Kunde informiert, neuer Termin 10:30 Uhr.',
  address1_city: 'Hamburg',
  msdyn_city: 'Hamburg',
  address1_line1: 'Am Sandtorkai 1',
  msdyn_address1: 'Am Sandtorkai 1',
  address1_postalcode: '20457',
  msdyn_postalcode: '20457',
  telephone1: '+49 40 1234567',
  emailaddress1: 'service@contoso.example',
  ownerid: 'Jonas Feldmann',
  statuscode: 'Aktiv',
  statecode: 'Aktiv',
  createdon: '30.09.2026 16:12',
  modifiedon: '30.09.2026 16:40',
  msdyn_fromdate: '01.10.2026',
  msdyn_todate: '03.10.2026',
  msdyn_duration: '120',
  msdyn_effort: '2',
  resourcetype: 'Benutzer',
  msdyn_organizationalunit: 'Service Nord',
  msdyn_latitude: '53.5413',
  msdyn_longitude: '9.9846',
  timezone: 'W. Europe Standard Time',
}

/** Sample primary name by what a table or lookup stands for (most specific first). */
function nameFor(what: string): string | null {
  const w = what.toLowerCase()
  if (w.includes('workorder')) return 'WO-00042'
  if (w.includes('requirement')) return 'Anforderung Heizungswartung'
  if (w.includes('account')) return 'Contoso Haustechnik'
  if (w.includes('project')) return 'Projekt Nordhafen'
  if (w.includes('incidenttype')) return 'Jahreswartung'
  if (w.includes('organizationalunit')) return 'Service Nord'
  if (w.includes('bookingalert')) return 'Techniker verspätet sich'
  if (w.includes('booking')) return 'Wartung Heizungsanlage'
  if (w.includes('resource')) return 'Mara Lindqvist'
  return null
}

/**
 * A plausible value for a template or view field. A `name` takes its
 * meaning from the last relationship hop — its lookup part, e.g.
 * `…_msdyn_workorder_ServiceAccount` → account — or, for a plain column,
 * from the table (`ctx.entity`); a root `name` in a booking template is the
 * booking's name.
 */
export function sampleFor(path: string, ctx: SampleContext = {}): string {
  const segments = path.split('.')
  const field = segments[segments.length - 1]
  const lower = field.toLowerCase()

  if (lower === 'schedulableentitydisplayname') return ctx.entityLabel ?? 'Arbeitsauftrag'
  if (lower === 'duration' && ctx.durationMinutes !== undefined) return String(ctx.durationMinutes)
  if (lower === 'name' || lower === 'msdyn_name' || lower === 'fullname') {
    if (segments.length > 1) {
      const hop = segments[segments.length - 2]
      return nameFor(hop.slice(hop.lastIndexOf('_') + 1)) ?? 'Beispielname'
    }
    return nameFor(ctx.entity ?? 'bookableresourcebooking') ?? 'Beispielname'
  }
  if (SAMPLE_BY_FIELD[lower] !== undefined) return SAMPLE_BY_FIELD[lower]
  if (/(date|time)$/.test(lower) || (/on$/.test(lower) && /(created|modified|scheduled)/.test(lower))) return '01.10.2026 08:30'
  return `‹${field}›`
}
