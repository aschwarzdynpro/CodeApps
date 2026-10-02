import { MicrosoftDataverseService as Dv } from '../generated/services/MicrosoftDataverseService'
import { ORG_URL } from '../config'
import type { Closure, Interval } from '../types/series'
import { str, type Row } from './dataverseCommon'

/**
 * Working time and public holidays, both through the Dataverse connector.
 *
 * - Working time: `msdyn_LoadCalendars` (URS, documented with the work
 *   hours calendar API) returns the slots of resource calendars in a range —
 *   days off and time off simply have no slot.
 * - Holidays: the organization's business closure calendar
 *   (`organization.businessclosurecalendarid`) and its rules — the closures
 *   URS observes, with their names ("Tag der Deutschen Einheit").
 */

function rowsOf(data: unknown): Row[] {
  return (data as { value?: Row[] } | undefined)?.value ?? []
}

/** Calendar id (lower-case) → working slots between two instants. */
export async function loadWorkingTime(calendarIds: string[], from: string, to: string): Promise<Map<string, Interval[]>> {
  const out = new Map<string, Interval[]>()
  if (calendarIds.length === 0) return out
  const res = await Dv.PerformUnboundActionWithOrganization(ORG_URL, 'msdyn_LoadCalendars', {
    LoadCalendarsInput: JSON.stringify({ StartDate: from, EndDate: to, CalendarIds: calendarIds }),
  })
  if (!res.success) throw new Error(res.error?.message ?? 'msdyn_LoadCalendars fehlgeschlagen')
  const raw = str((res.data as Row | undefined)?.CalendarEvents) ?? '{}'
  const events = JSON.parse(raw) as Record<string, { Start?: string; End?: string; Effort?: number }[]>
  for (const [calendarId, slots] of Object.entries(events)) {
    out.set(
      calendarId.toLowerCase(),
      (slots ?? [])
        .filter((s) => s.Start && s.End && (s.Effort === undefined || s.Effort > 0))
        .map((s) => ({ start: new Date(s.Start!).toISOString(), end: new Date(s.End!).toISOString() })),
    )
  }
  return out
}

export async function loadClosures(from: string, to: string): Promise<Closure[]> {
  const org = await Dv.ListRecordsWithOrganization(ORG_URL, 'organizations', undefined, undefined, undefined, undefined, 'businessclosurecalendarid')
  if (!org.success) throw new Error(org.error?.message ?? 'Organisation nicht lesbar')
  const calendarId = str(rowsOf(org.data)[0]?.businessclosurecalendarid)
  if (!calendarId) return []
  const cal = await Dv.ListRecordsWithOrganization(
    ORG_URL,
    'calendars',
    undefined,
    undefined,
    undefined,
    undefined,
    'calendarid',
    `calendarid eq ${calendarId}`,
    undefined,
    'calendar_calendar_rules($select=name,starttime,duration,effectiveintervalstart,effectiveintervalend)',
  )
  if (!cal.success) throw new Error(cal.error?.message ?? 'Kalender der Geschäftsschließungen nicht lesbar')
  const rules = (rowsOf(cal.data)[0]?.calendar_calendar_rules as Row[] | undefined) ?? []
  const lo = Date.parse(from)
  const hi = Date.parse(to)
  return rules
    .map((r) => {
      const start = str(r.starttime) ?? str(r.effectiveintervalstart)
      const minutes = Number(r.duration)
      const end = start && minutes > 0 ? new Date(Date.parse(start) + minutes * 60_000).toISOString() : str(r.effectiveintervalend)
      return start && end ? { name: str(r.name) ?? 'Geschäftsschließung', start: new Date(start).toISOString(), end: new Date(end).toISOString() } : null
    })
    .filter((c): c is Closure => c !== null && Date.parse(c.start) < hi && Date.parse(c.end) > lo)
}
