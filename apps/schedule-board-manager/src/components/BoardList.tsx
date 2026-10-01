import { useState } from 'react'
import { SHARE_TYPE, SHARE_TYPE_LABEL, type BoardSummary } from '../types/board'

interface Props {
  boards: BoardSummary[]
  selectedId: string | null
  onSelect: (id: string) => void
  onSaveOrder: (updates: { id: string; order: number }[]) => Promise<void>
}

export function ShareBadge({ shareType }: { shareType: number }) {
  return <span className={`badge badge--share-${shareType}`}>{SHARE_TYPE_LABEL[shareType] ?? shareType}</span>
}

export function BoardList({ boards, selectedId, onSelect, onSaveOrder }: Props) {
  const [query, setQuery] = useState('')
  const [ordering, setOrdering] = useState<BoardSummary[] | null>(null)
  const [saving, setSaving] = useState(false)

  const list = ordering ?? boards
  const q = query.trim().toLowerCase()
  const visible = ordering ? list : list.filter((b) => !q || b.name.toLowerCase().includes(q) || b.ownerName.toLowerCase().includes(q))

  const move = (i: number, to: number) => {
    if (!ordering || to < 0 || to >= ordering.length) return
    const next = ordering.slice()
    const [item] = next.splice(i, 1)
    next.splice(to, 0, item)
    setOrdering(next)
  }

  const saveOrder = async () => {
    if (!ordering) return
    // Keep the existing base so system boards with order 0 stay in front.
    const base = Math.min(...boards.map((b) => b.order))
    const updates = ordering
      .map((b, i) => ({ id: b.id, order: base + i }))
      .filter((u) => boards.find((b) => b.id === u.id)?.order !== u.order)
    setSaving(true)
    try {
      await onSaveOrder(updates)
      setOrdering(null)
    } finally {
      setSaving(false)
    }
  }

  return (
    <aside className="sidebar">
      <div className="sidebar__head">
        <input
          className="input"
          placeholder="Board oder Besitzer suchen …"
          value={query}
          disabled={ordering !== null}
          onChange={(e) => setQuery(e.target.value)}
        />
        {ordering ? (
          <div className="sidebar__order-actions">
            <button className="btn btn--small" onClick={() => setOrdering(null)} disabled={saving}>
              Abbrechen
            </button>
            <button className="btn btn--small btn--primary" onClick={saveOrder} disabled={saving}>
              {saving ? 'Speichert …' : 'Reihenfolge speichern'}
            </button>
          </div>
        ) : (
          <button className="btn btn--small btn--ghost" onClick={() => setOrdering(boards.slice())}>
            Reihenfolge ändern
          </button>
        )}
      </div>
      <ul className="board-list">
        {visible.map((b, i) => {
          const isSystem = b.shareType === SHARE_TYPE.system
          return (
            <li key={b.id}>
              <button
                className={`board-item${b.id === selectedId ? ' board-item--active' : ''}${b.active ? '' : ' board-item--inactive'}`}
                onClick={() => onSelect(b.id)}
              >
                <span className="board-item__order">{ordering ? i + 1 : b.order}</span>
                <span className="board-item__main">
                  <span className="board-item__name">{b.name}</span>
                  <span className="board-item__meta">
                    <ShareBadge shareType={b.shareType} />
                    {!b.active ? <span className="badge badge--inactive">Inaktiv</span> : null}
                    {!isSystem ? <span className="board-item__owner">{b.ownerName}</span> : null}
                  </span>
                </span>
              </button>
              {ordering ? (
                <span className="board-item__move">
                  <button className="icon-btn" onClick={() => move(i, i - 1)} disabled={i === 0} aria-label="Nach oben">
                    ↑
                  </button>
                  <button
                    className="icon-btn"
                    onClick={() => move(i, i + 1)}
                    disabled={i === list.length - 1}
                    aria-label="Nach unten"
                  >
                    ↓
                  </button>
                </span>
              ) : null}
            </li>
          )
        })}
      </ul>
    </aside>
  )
}
