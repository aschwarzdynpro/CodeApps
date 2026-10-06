import { Tab, TabList, type TableRowId } from '@fluentui/react-components'
import { useDeferredValue, useMemo, useState } from 'react'
import { S } from '../../strings'
import type { CalendarTree, Closure, Finding, Resource, Slot, TimeOffRequest } from '../../types/calendar'
import { sumRange } from '../../utils/resolve'
import { resolveResource } from '../../utils/resourceResolution'
import { EMPTY_FILTER, filterResources, type ResourceFilter } from '../../utils/resourceFilter'
import type { VisibleRange } from '../../utils/range'
import { MonthGrid } from '../calendar/MonthGrid'
import { WeekGrid, type WeekRow } from '../calendar/WeekGrid'
import type { DayActions } from '../calendar/DayPopover'
import { ResourceFilters } from './ResourceFilters'
import { ResourceGrid, type ResourceRow } from './ResourceGrid'
import { Btn } from '../ui'

interface Props {
  resources: Resource[]
  trees: Record<string, CalendarTree>
  slots: Record<string, Slot[]> | null
  closures: Closure[]
  timeOff: TimeOffRequest[]
  findings: Record<string, Finding[]>
  range: VisibleRange
  mode: 'week' | 'month'
  viewerTz: string
  today: string
  useV2: boolean
  selected: Set<TableRowId>
  onSelect: (ids: Set<TableRowId>) => void
  focusedId: string | null
  onFocus: (id: string) => void
  onShowRule: (resourceId: string, innerCalendarId: string) => void
  tab: 'list' | 'calendar'
  onTab: (tab: 'list' | 'calendar') => void
  dayActionsFor: (resourceId: string) => DayActions | null
  onRun: (() => void) | null
}

/** Resource list + calendar (week: all filtered resources; month: the focused one). */
export function ResourcesView(p: Props) {
  // The input stays urgent (a Transition on a controlled text input drops keystrokes); the expensive filtering follows deferred.
  const [filter, setFilter] = useState<ResourceFilter>(EMPTY_FILTER)
  const deferredFilter = useDeferredValue(filter)

  // Resolving every filtered resource day by day is the expensive part (850 × 7 days live) — only when its inputs change.
  const { resources, findings, trees, slots, closures, timeOff, viewerTz, useV2 } = p
  const { focusFrom, focusTo } = p.range
  const filtered = useMemo(() => filterResources(resources, deferredFilter, findings), [resources, deferredFilter, findings])
  const resolved = useMemo(() => {
    const src = { trees, slots, closures, timeOff, viewerTz, useV2 }
    return new Map(filtered.map((r) => [r.id, resolveResource(r, src, focusFrom, focusTo)]))
  }, [filtered, trees, slots, closures, timeOff, viewerTz, useV2, focusFrom, focusTo])

  const rows = useMemo(
    () =>
      filtered.map((r): ResourceRow => {
        const sums = sumRange(resolved.get(r.id)!.days)
        return { resource: r, tree: r.calendarId ? (trees[r.calendarId.toLowerCase()] ?? null) : null, findings: findings[r.id] ?? [], hours: sums.workHours, capacityHours: sums.capacityHours }
      }),
    [filtered, resolved, trees, findings],
  )

  const focused = p.resources.find((r) => r.id === p.focusedId) ?? null

  return (
    <div className="resources">
      <div className="resources__bar">
        <TabList size="small" selectedValue={p.tab} onTabSelect={(_, d) => p.onTab(d.value as 'list' | 'calendar')} aria-label={S.resources.tabs.list}>
          <Tab value="list">{S.resources.tabs.list}</Tab>
          <Tab value="calendar">{S.resources.tabs.calendar}</Tab>
        </TabList>
        <ResourceFilters resources={p.resources} filter={filter} onChange={setFilter} />
        {p.selected.size > 0 ? (
          <span className="resources__selection">
            {S.resources.selected(p.selected.size)}{' '}
            <button type="button" className="linklike" onClick={() => p.onSelect(new Set())}>
              {S.resources.clearSelection}
            </button>
            {p.onRun ? (
              <Btn small kind="primary" className="ml-6" onClick={p.onRun}>
                {S.runs.start}
              </Btn>
            ) : null}
          </span>
        ) : null}
      </div>
      <div className="resources__body">
        {p.resources.length === 0 ? (
          <p className="empty">{S.resources.emptyEnv}</p>
        ) : p.tab === 'list' ? (
          rows.length === 0 ? (
            <p className="empty">{S.resources.empty}</p>
          ) : (
            <ResourceGrid rows={rows} selected={p.selected} onSelect={p.onSelect} focusedId={p.focusedId} onFocus={p.onFocus} rangeLabel={p.mode === 'week' ? S.toolbar.week : S.toolbar.month} />
          )
        ) : p.mode === 'week' ? (
          <WeekGrid
            from={p.range.from}
            to={p.range.to}
            rows={filtered.map((r): WeekRow => {
              const res = resolved.get(r.id)!
              return { resource: r, days: res.days, fromSlots: res.fromSlots, hours: sumRange(res.days).workHours }
            })}
            today={p.today}
            focusedId={p.focusedId}
            onFocus={p.onFocus}
            onShowRule={p.onShowRule}
            actionsFor={p.dayActionsFor}
          />
        ) : (
          (() => {
            const res = focused ? resolveResource(focused, p, p.range.from, p.range.to) : null
            return <MonthGrid resource={focused} days={res?.days ?? []} focusFrom={p.range.focusFrom} focusTo={p.range.focusTo} today={p.today} fromSlots={res?.fromSlots ?? false} onShowRule={(inner) => focused && p.onShowRule(focused.id, inner)} actions={focused ? p.dayActionsFor(focused.id) : null} />
          })()
        )}
      </div>
    </div>
  )
}
