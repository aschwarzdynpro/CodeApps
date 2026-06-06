import { useMemo, useState } from 'react'
import './App.css'
import { usePower } from './PowerProvider'
import { useApprovals } from './hooks/useApprovals'
import { StatsHeader } from './components/StatsHeader'
import { FilterBar, type CategoryFilter } from './components/FilterBar'
import { BulkActionBar } from './components/BulkActionBar'
import { ApprovalRow } from './components/ApprovalRow'
import { ApprovalDetail } from './components/ApprovalDetail'
import type { ApprovalDecision } from './types/approval'
import { PRIORITY_ORDER } from './utils/format'

function App() {
  const { mode } = usePower()
  const { approvals, loading, error, busy, decide } = useApprovals()

  const [filter, setFilter] = useState<CategoryFilter>('All')
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [activeId, setActiveId] = useState<string | null>(null)

  const pending = useMemo(
    () => approvals.filter((a) => a.status === 'Pending'),
    [approvals],
  )

  const counts = useMemo(() => {
    const c = {
      All: pending.length,
      Leave: 0,
      PurchaseOrder: 0,
      Invoice: 0,
      Expense: 0,
      Access: 0,
    } as Record<CategoryFilter, number>
    for (const a of pending) c[a.category]++
    return c
  }, [pending])

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    return pending
      .filter((a) => filter === 'All' || a.category === filter)
      .filter(
        (a) =>
          !q ||
          a.title.toLowerCase().includes(q) ||
          a.requester.name.toLowerCase().includes(q),
      )
      .sort(
        (a, b) =>
          PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority] ||
          new Date(a.dueOn).getTime() - new Date(b.dueOn).getTime(),
      )
  }, [pending, filter, search])

  const active = approvals.find((a) => a.id === activeId) ?? null

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const runDecision = async (ids: string[], decision: ApprovalDecision, comment?: string) => {
    await decide(ids, decision, comment)
    setSelected((prev) => {
      const next = new Set(prev)
      ids.forEach((id) => next.delete(id))
      return next
    })
    if (activeId && ids.includes(activeId)) setActiveId(null)
  }

  return (
    <div className="app">
      <header className="app-header">
        <div>
          <h1>Approval Cockpit</h1>
          <p className="subtitle">
            One inbox for approvals across every system.
          </p>
        </div>
        <span className={`mode-badge mode-${mode}`}>
          {mode === 'power-platform' ? 'Power Platform' : 'Local · mock data'}
        </span>
      </header>

      <StatsHeader approvals={approvals} />

      <FilterBar
        active={filter}
        counts={counts}
        onChange={setFilter}
        search={search}
        onSearchChange={setSearch}
      />

      <div className="layout">
        <main className="list">
          {loading && <div className="state">Loading approvals…</div>}
          {error && <div className="state state--error">{error}</div>}
          {!loading && !error && visible.length === 0 && (
            <div className="state">🎉 Nothing pending here — inbox zero.</div>
          )}
          {visible.map((a) => (
            <ApprovalRow
              key={a.id}
              approval={a}
              selected={selected.has(a.id)}
              active={a.id === activeId}
              onToggle={toggle}
              onOpen={setActiveId}
            />
          ))}
        </main>

        <ApprovalDetail
          key={active?.id ?? 'none'}
          approval={active}
          busy={busy}
          onApprove={(id, c) => runDecision([id], 'approve', c)}
          onReject={(id, c) => runDecision([id], 'reject', c)}
          onClose={() => setActiveId(null)}
        />
      </div>

      <BulkActionBar
        count={selected.size}
        busy={busy}
        onApprove={() => runDecision([...selected], 'approve')}
        onReject={() => runDecision([...selected], 'reject')}
        onClear={() => setSelected(new Set())}
      />
    </div>
  )
}

export default App
