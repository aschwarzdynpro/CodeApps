import { LIMITS, ORG_URL } from '../config'
import type { CalendarEventInfo, CalendarTree, Closure, DeleteCalendarInfo, RawCalendar, Ref, Resource, Slot, TimeOffRequest, WorkHourTemplate } from '../types/calendar'
import { RESOURCE_TYPE_BY_CODE } from '../types/calendar'
import { parseServerDate } from '../utils/dates'
import { buildTree, normalizeCalendar } from '../utils/rules'
import type { CalendarService, SetupCheck } from './calendarService'
import { FV, chunks, errorText, fetchXml, getRow, hasConnector, mapPool, num, odata, orFilter, pick, str, unboundAction, type Row } from './dataverseApi'

/**
 * Dataverse implementation — every read and write through the Dataverse
 * connector with the signed-in user's connection, so the Work Hours
 * actions check the own-calendar privilege for the acting user and the
 * audit shows who changed what.
 *
 * Reads: `bookableresource` (+ category assignments, territories),
 * `msdyn_workhourtemplate`, `calendars(<id>)?$expand=calendar_calendar_rules`
 * one calendar per request (a collection query returns the rules empty —
 * verified live), root rules first, inner calendars only on demand,
 * `msdyn_LoadCalendars`, the organization's closure calendar,
 * `msdyn_timeoffrequest`, booking counts per resource.
 *
 * Writes: `msdyn_SaveCalendar`, `msdyn_DeleteCalendar` (both wrap their
 * JSON in the string parameter `CalendarEventInfo`) and
 * `msdyn_BusinessClosureSave`. Nothing else is ever written.
 */

const RULE_FIELDS =
  'calendarruleid,_calendarid_value,_innercalendarid_value,name,description,pattern,starttime,endtime,duration,effort,timecode,subcode,rank,timezonecode,effectiveintervalstart,effectiveintervalend,extentcode,isselected,issimple,ismodified,isvaried,offset,groupdesignator,createdon,modifiedon'
const RULES_EXPAND = `calendar_calendar_rules($select=${RULE_FIELDS})`

const refOf = (row: Row, key: string): Ref | null => {
  const id = str(row[key])
  return id ? { id, name: str(row[`${key}${FV}`]) ?? id } : null
}

/** Calendars with their rules, one request each (missing calendars are skipped). */
async function readCalendars(ids: string[]): Promise<RawCalendar[]> {
  const unique = [...new Set(ids.map((id) => id.toLowerCase()))]
  const rows = await mapPool(unique, LIMITS.calendarReadConcurrency, (id) => getRow('calendars', id, { select: 'calendarid,name,description,type', expand: RULES_EXPAND }))
  return rows.filter((r): r is Row => r !== null).map(normalizeCalendar)
}

let closureCalendarId: Promise<string | null> | null = null

function businessClosureCalendarId(): Promise<string | null> {
  closureCalendarId ??= odata('organizations', { select: 'businessclosurecalendarid' }).then((rows) => str(rows[0]?.businessclosurecalendarid))
  closureCalendarId.catch(() => {
    closureCalendarId = null
  })
  return closureCalendarId
}

function toClosures(cal: RawCalendar, from: string, to: string): Closure[] {
  const lo = Date.parse(from)
  const hi = Date.parse(to)
  return cal.calendar_calendar_rules
    .map((r) => {
      const start = r.starttime ?? r.effectiveintervalstart
      const minutes = r.duration ?? 0
      const end = start && minutes > 0 ? new Date(Date.parse(start) + minutes * 60_000).toISOString() : r.effectiveintervalend
      return start && end ? { id: r.calendarruleid, name: r.name ?? 'Geschäftsschließung', start: new Date(start).toISOString(), end: new Date(end).toISOString() } : null
    })
    .filter((c): c is Closure => c !== null && Date.parse(c.start) < hi && Date.parse(c.end) > lo)
}

const parseIds = (data: unknown): string[] => {
  const raw = pick(data, 'InnerCalendarIds')
  if (Array.isArray(raw)) return raw.map(String)
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw) as unknown
      return Array.isArray(parsed) ? parsed.map(String) : [raw]
    } catch {
      return [raw]
    }
  }
  return []
}

/**
 * The documentation's examples pass booleans as strings (`"IsEdit":"true"`),
 * the parameter table says Boolean. We send booleans; when the server
 * answers with a deserialization error we retry once with strings and keep
 * the form that worked (README "Offen").
 */
let booleanForm: 'boolean' | 'string' = 'boolean'
const DESERIALIZE = /deserializ|not correctly formatted|expecting state/i

function stringifyBooleans(info: object): object {
  return JSON.parse(JSON.stringify(info, (_k, v) => (typeof v === 'boolean' ? String(v) : v)))
}

async function calendarAction(action: string, info: object): Promise<Row | null> {
  const send = (form: typeof booleanForm) => unboundAction(action, { CalendarEventInfo: JSON.stringify(form === 'string' ? stringifyBooleans(info) : info) })
  try {
    return await send(booleanForm)
  } catch (err) {
    if (!DESERIALIZE.test(errorText(err))) throw err
    const other = booleanForm === 'boolean' ? 'string' : 'boolean'
    const data = await send(other)
    booleanForm = other
    return data
  }
}

export const dataverseCalendarService: CalendarService = {
  source: 'dataverse',

  async listResources() {
    const rows = await odata('bookableresources', {
      select: 'bookableresourceid,name,resourcetype,timezone,_calendarid_value,_msdyn_organizationalunit_value,statecode,_userid_value,msdyn_displayonscheduleboard',
      orderBy: 'name',
      annotations: true,
    })
    const ids = rows.map((r) => String(r.bookableresourceid))
    const categories = new Map<string, Ref[]>()
    const territories = new Map<string, Ref[]>()
    for (const part of chunks(ids, 25)) {
      const [cats, terrs] = await Promise.all([
        odata('bookableresourcecategoryassns', { select: '_resource_value,_resourcecategory_value', filter: orFilter('_resource_value', part), annotations: true }).catch(() => [] as Row[]),
        odata('msdyn_resourceterritories', { select: '_msdyn_resource_value,_msdyn_territory_value', filter: orFilter('_msdyn_resource_value', part), annotations: true }).catch(() => [] as Row[]),
      ])
      for (const c of cats) {
        const rid = String(c._resource_value).toLowerCase()
        const ref = refOf(c, '_resourcecategory_value')
        if (ref) categories.set(rid, [...(categories.get(rid) ?? []), ref])
      }
      for (const t of terrs) {
        const rid = String(t._msdyn_resource_value).toLowerCase()
        const ref = refOf(t, '_msdyn_territory_value')
        if (ref) territories.set(rid, [...(territories.get(rid) ?? []), ref])
      }
    }
    return rows.map(
      (r): Resource => ({
        id: String(r.bookableresourceid),
        name: str(r.name) ?? '(ohne Namen)',
        type: RESOURCE_TYPE_BY_CODE[num(r.resourcetype) ?? 0] ?? 'generic',
        timeZoneCode: num(r.timezone) ?? 110,
        calendarId: str(r._calendarid_value),
        orgUnit: refOf(r, '_msdyn_organizationalunit_value'),
        active: num(r.statecode) === 0,
        categories: categories.get(String(r.bookableresourceid).toLowerCase()) ?? [],
        territories: territories.get(String(r.bookableresourceid).toLowerCase()) ?? [],
        userId: str(r._userid_value),
        displayOnScheduleBoard: r.msdyn_displayonscheduleboard !== false,
      }),
    )
  },

  async listTemplates() {
    const rows = await odata('msdyn_workhourtemplates', { select: 'msdyn_workhourtemplateid,msdyn_name,msdyn_description,msdyn_calendarid,statecode', orderBy: 'msdyn_name' })
    return rows.map(
      (r): WorkHourTemplate => ({
        id: String(r.msdyn_workhourtemplateid),
        name: str(r.msdyn_name) ?? '(ohne Namen)',
        description: str(r.msdyn_description),
        calendarId: str(r.msdyn_calendarid),
        active: num(r.statecode) === 0,
      }),
    )
  },

  async getTrees(calendarIds, depth = 'full') {
    const outer = await readCalendars(calendarIds)
    if (depth === 'roots') return Object.fromEntries(outer.map((cal) => [cal.calendarid.toLowerCase(), buildTree(cal, [], false)]))
    const innerIds = [...new Set(outer.flatMap((c) => c.calendar_calendar_rules.map((r) => r._innercalendarid_value).filter((x): x is string => !!x)))]
    const inner = innerIds.length ? await readCalendars(innerIds) : []
    const innerById = new Map(inner.map((c) => [c.calendarid.toLowerCase(), c]))
    const out: Record<string, CalendarTree> = {}
    for (const cal of outer) {
      const mine = cal.calendar_calendar_rules.map((r) => (r._innercalendarid_value ? innerById.get(r._innercalendarid_value.toLowerCase()) : undefined)).filter((c): c is RawCalendar => !!c)
      out[cal.calendarid.toLowerCase()] = buildTree(cal, mine)
    }
    return out
  },

  async loadSlots(calendarIds, from, to) {
    const out: Record<string, Slot[]> = {}
    if (calendarIds.length === 0) return out
    for (const part of chunks(calendarIds, 50)) {
      const data = await unboundAction('msdyn_LoadCalendars', { LoadCalendarsInput: JSON.stringify({ StartDate: from, EndDate: to, CalendarIds: part }) })
      const raw = pick(data, 'CalendarEvents')
      const events = (typeof raw === 'string' ? (JSON.parse(raw) as unknown) : raw) as Record<string, { CalendarId?: string; InnerCalendarId?: string; Start?: string; End?: string; Effort?: number; TimeCode?: number }[]> | null
      for (const [calendarId, slots] of Object.entries(events ?? {})) {
        // Start/End arrive as WCF dates (`/Date(1791176400000)/`), not ISO; holidays come along as TimeCode 2 — only TimeCode 0 is working time.
        out[calendarId.toLowerCase()] = (slots ?? []).filter((s) => s.TimeCode === undefined || s.TimeCode === 0).flatMap((s) => {
          const start = parseServerDate(s.Start)
          const end = parseServerDate(s.End)
          return start && end ? [{ calendarId, innerCalendarId: s.InnerCalendarId ?? null, start, end, effort: typeof s.Effort === 'number' ? s.Effort : 1 }] : []
        })
      }
      for (const id of part) out[id.toLowerCase()] ??= []
    }
    return out
  },

  async loadClosures(from, to) {
    const calendarId = await businessClosureCalendarId()
    if (!calendarId) return []
    const [cal] = await readCalendars([calendarId])
    return cal ? toClosures(cal, from, to) : []
  },

  async loadTimeOff(resourceIds, from, to) {
    const out: TimeOffRequest[] = []
    for (const part of chunks(resourceIds, 25)) {
      const rows = await odata('msdyn_timeoffrequests', {
        select: 'msdyn_timeoffrequestid,msdyn_name,msdyn_starttime,msdyn_endtime,_msdyn_resource_value,_msdyn_approvedby_value,statecode',
        filter: `${orFilter('_msdyn_resource_value', part)} and msdyn_starttime lt ${to} and msdyn_endtime gt ${from}`,
        annotations: true,
      })
      out.push(
        ...rows.map(
          (r): TimeOffRequest => ({
            id: String(r.msdyn_timeoffrequestid),
            name: str(r.msdyn_name) ?? 'Abwesenheit',
            resourceId: String(r._msdyn_resource_value),
            start: new Date(String(r.msdyn_starttime)).toISOString(),
            end: new Date(String(r.msdyn_endtime)).toISOString(),
            approvedBy: refOf(r, '_msdyn_approvedby_value'),
            active: num(r.statecode) === 0,
          }),
        ),
      )
    }
    return out
  },

  async countBookingsAfter(resourceIds, date) {
    const out: Record<string, number> = Object.fromEntries(resourceIds.map((id) => [id, 0]))
    for (const part of chunks(resourceIds, 50)) {
      const xml = `<fetch aggregate="true"><entity name="bookableresourcebooking"><attribute name="bookableresourcebookingid" alias="n" aggregate="count"/><attribute name="resource" alias="r" groupby="true"/><filter><condition attribute="starttime" operator="ge" value="${date}"/><condition attribute="statecode" operator="eq" value="0"/><condition attribute="resource" operator="in">${part.map((id) => `<value>${id}</value>`).join('')}</condition></filter></entity></fetch>`
      const rows = await fetchXml('bookableresourcebookings', xml)
      for (const r of rows) {
        const rid = str(r.r) ?? str(r._r_value)
        const match = rid ? resourceIds.find((id) => id.toLowerCase() === rid.toLowerCase()) : undefined
        if (match) out[match] = num(r.n) ?? 0
      }
    }
    return out
  },

  async saveCalendar(info: CalendarEventInfo) {
    const data = await calendarAction('msdyn_SaveCalendar', info)
    return parseIds(data)
  },

  async deleteCalendar(info: DeleteCalendarInfo) {
    const data = await calendarAction('msdyn_DeleteCalendar', info)
    return parseIds(data)
  },

  async saveClosure(name, start, end) {
    await unboundAction('msdyn_BusinessClosureSave', { Name: name, Start: start, End: end })
    closureCalendarId = null
  },

  async deleteClosure(closure) {
    // Unverified (README "Offen"): the Work Hours API documents no delete for closures. We try the
    // documented delete action against the closure calendar; when the server refuses, the UI points
    // to the admin center.
    const calendarId = await businessClosureCalendarId()
    if (!calendarId) throw new Error('Kalender der Geschäftsschließungen nicht gefunden.')
    await unboundAction('msdyn_DeleteCalendar', { CalendarEventInfo: JSON.stringify({ EntityLogicalName: 'calendar', CalendarId: calendarId, InnerCalendarId: closure.id }) })
  },

  async checkSetup(): Promise<SetupCheck[]> {
    const checks: SetupCheck[] = []
    checks.push({ label: 'Dataverse-Konnektor', ok: hasConnector(), detail: hasConnector() ? 'MicrosoftDataverseService in src/generated' : 'Konnektor fehlt — pac code add-data-source -a shared_commondataserviceforapps' })
    checks.push({ label: 'Org-URL', ok: !!ORG_URL, detail: ORG_URL || 'VITE_ORG_URL nicht gesetzt (.env)' })
    if (!hasConnector() || !ORG_URL) return checks
    try {
      const rows = await odata('bookableresources', { select: 'bookableresourceid', top: 1 })
      checks.push({ label: 'Ressourcen lesbar', ok: true, detail: rows.length ? 'bookableresource lesbar' : 'Keine Ressourcen sichtbar' })
    } catch (err) {
      checks.push({ label: 'Ressourcen lesbar', ok: false, detail: errorText(err) })
    }
    try {
      const id = await businessClosureCalendarId()
      checks.push({ label: 'Geschäftsschließungen', ok: !!id, detail: id ? `Kalender ${id}` : 'organization.businessclosurecalendarid leer' })
    } catch (err) {
      checks.push({ label: 'Geschäftsschließungen', ok: false, detail: errorText(err) })
    }
    try {
      await unboundAction('msdyn_LoadCalendars', { LoadCalendarsInput: JSON.stringify({ StartDate: new Date().toISOString(), EndDate: new Date(Date.now() + 86_400_000).toISOString(), CalendarIds: [] }) })
      checks.push({ label: 'msdyn_LoadCalendars', ok: true, detail: 'Action über den Konnektor erreichbar' })
    } catch (err) {
      checks.push({ label: 'msdyn_LoadCalendars', ok: false, detail: errorText(err) })
    }
    return checks
  },
}
