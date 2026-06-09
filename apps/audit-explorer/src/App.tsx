import { useMemo, useState } from 'react'
import './App.css'
import { usePower } from './PowerProvider'
import { useAudit } from './hooks/useAudit'
import { KpiCards } from './components/KpiCards'
import { FilterBar } from './components/FilterBar'
import { Timeline } from './components/Timeline'
import { BarChart } from './components/BarChart'
import { EventList } from './components/EventList'
import { EventDetail } from './components/EventDetail'
import { Breadcrumb } from './components/Breadcrumb'
import type { AuditOperation } from './types/audit'
import { countBy, withinRange } from './utils/format'

type View =
  | { level: 'overview' }
  | { level: 'list'; by: 'table' | 'user'; value: string }

function App() {
  const { mode } = usePower()
  const { events, loading, error } = useAudit()

  const [view, setView] = useState<View>({ level: 'overview' })
  const [selectedId, setSelectedId] = useState<string | null>(null)

  // Global filters — persist as you drill in and out.
  const [rangeDays, setRangeDays] = useState<number>(30)
  const [operation, setOperation] = useState<AuditOperation | 'All'>('All')
  const [search, setSearch] = useState('')

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return events
      .filter((e) => withinRange(e, rangeDays))
      .filter((e) => operation === 'All' || e.operation === operation)
      .filter(
        (e) =>
          !q ||
          e.tableName.toLowerCase().includes(q) ||
          e.recordName.toLowerCase().includes(q) ||
          e.user.name.toLowerCase().includes(q),
      )
  }, [events, rangeDays, operation, search])

  const tableData = useMemo(
    () => countBy(filtered, (e) => e.tableName),
    [filtered],
  )
  const userData = useMemo(
    () =>
      countBy(filtered, (e) => e.user.name).map((u) => ({
        ...u,
        badge: events.find((e) => e.user.name === u.key)?.user.initials,
      })),
    [filtered, events],
  )

  const listEvents = useMemo(() => {
    if (view.level !== 'list') return []
    return filtered.filter((e) =>
      view.by === 'table' ? e.tableName === view.value : e.user.name === view.value,
    )
  }, [filtered, view])

  const selectedEvent = events.find((e) => e.id === selectedId) ?? null

  const goOverview = () => {
    setView({ level: 'overview' })
    setSelectedId(null)
  }
  const openList = (by: 'table' | 'user', value: string, eventId?: string) => {
    setView({ level: 'list', by, value })
    setSelectedId(eventId ?? null)
  }

  return (
    <div className="app">
      <header className="app-header">
        <div>
          <h1>Audit Explorer</h1>
          <p className="subtitle">
            Dataverse audit history — dashboard with drill-down.
          </p>
        </div>
        <span className={`mode-badge mode-${mode}`}>
          {mode === 'power-platform' ? 'Power Platform' : 'Local · mock data'}
        </span>
      </header>

      <FilterBar
        rangeDays={rangeDays}
        onRangeChange={setRangeDays}
        search={search}
        onSearchChange={setSearch}
      />

      {loading && <div className="state">Loading audit data…</div>}
      {error && <div className="state state--error">{error}</div>}

      {!loading && !error && view.level === 'overview' && (
        <>
          <KpiCards
            events={filtered}
            activeOperation={operation}
            onOperationToggle={(op) =>
              setOperation((prev) => (prev === op ? 'All' : op))
            }
          />
          <Timeline events={filtered} />
          <div className="chart-grid">
            <BarChart
              title="Events by table"
              data={tableData}
              onSelect={(t) => openList('table', t)}
            />
            <BarChart
              title="Most active users"
              data={userData}
              color="#8a5cf6"
              onSelect={(u) => openList('user', u)}
            />
          </div>
          <section className="card">
            <h3 className="card-title">Recent activity</h3>
            <EventList
              events={filtered.slice(0, 8)}
              activeId={null}
              onOpen={(id) => {
                const ev = events.find((e) => e.id === id)
                if (ev) openList('table', ev.tableName, id)
              }}
            />
          </section>
        </>
      )}

      {!loading && !error && view.level === 'list' && (
        <>
          <Breadcrumb
            items={[
              { label: 'Overview', onClick: goOverview },
              { label: `${view.by === 'table' ? '' : '👤 '}${view.value}` },
            ]}
          />
          <div className="layout">
            <EventList
              events={listEvents}
              activeId={selectedId}
              onOpen={setSelectedId}
              showTable={view.by === 'user'}
            />
            {selectedEvent ? (
              <EventDetail event={selectedEvent} />
            ) : (
              <aside className="card detail detail--empty">
                Select an event to see the field-level changes.
              </aside>
            )}
          </div>
        </>
      )}
    </div>
  )
}

export default App
