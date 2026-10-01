import { useCallback, useState } from 'react'
import type { BoardSummary, LookupKey } from '../types/board'
import type { BoardService } from '../services/boardService'
import { useLoad } from '../hooks/useLoad'
import { diffContent, type BulkSelection, type ChangeArea } from '../utils/boardRules'
import { topLevelKey } from '../utils/settingsFields'
import { DiffTable } from './DiffTable'

/** Fields that identify a board rather than configure it — never transferred. */
const IDENTITY_COLUMNS = ['msdyn_tabname', 'msdyn_ordernumber', 'msdyn_sharetype']

export interface BulkPreset {
  templateId: string
  targetIds: string[]
  selection: BulkSelection
}

interface Props {
  boards: BoardSummary[]
  onTransfer: (preset: BulkPreset) => void
}

const AREAS: { value: ChangeArea | 'all'; label: string }[] = [
  { value: 'all', label: 'Alle' },
  { value: 'column', label: 'Spalten' },
  { value: 'lookup', label: 'Konfigurationen' },
  { value: 'settings', label: 'Settings' },
  { value: 'filterValues', label: 'Filter' },
]

export function CompareView({ boards, onTransfer }: Props) {
  const [leftId, setLeftId] = useState(boards[0]?.id ?? '')
  const [rightId, setRightId] = useState(boards[1]?.id ?? '')
  const [area, setArea] = useState<ChangeArea | 'all'>('all')
  const [query, setQuery] = useState('')

  const key = leftId && rightId ? `${leftId}|${rightId}` : null
  const loadPair = useCallback(
    (svc: BoardService) => Promise.all([svc.getBoard(leftId), svc.getBoard(rightId)]),
    [leftId, rightId],
  )
  const { data, error, loading } = useLoad(key, loadPair)

  const [left, right] = data ?? []
  const changes = left && right ? diffContent(left.content, right.content) : []
  const q = query.trim().toLowerCase()
  const visible = changes.filter(
    (c) => (area === 'all' || c.area === area) && (!q || c.label.toLowerCase().includes(q) || c.key.toLowerCase().includes(q)),
  )

  const transfer = () => {
    if (!left || !right) return
    const settingsKeys = [...new Set(changes.filter((c) => c.area === 'settings').map((c) => topLevelKey(c.key)))]
    onTransfer({
      templateId: left.id,
      targetIds: [right.id],
      selection: {
        columns: changes.filter((c) => c.area === 'column' && !IDENTITY_COLUMNS.includes(c.key)).map((c) => c.key),
        lookups: changes.filter((c) => c.area === 'lookup').map((c) => c.key as LookupKey),
        settingsPaths: settingsKeys.map((k) => [k]),
        filterValues: changes.some((c) => c.area === 'filterValues'),
      },
    })
  }

  const picker = (value: string, onChange: (v: string) => void, label: string) => (
    <label className="form-row form-row--inline">
      <span>{label}</span>
      <select className="input" value={value} onChange={(e) => onChange(e.target.value)}>
        {boards.map((b) => (
          <option key={b.id} value={b.id}>
            {b.name}
            {b.active ? '' : ' (inaktiv)'}
          </option>
        ))}
      </select>
    </label>
  )

  return (
    <section className="page">
      <header className="page__header">
        <h1>Boards vergleichen</h1>
        <p className="muted">Zeigt jede abweichende Einstellung — Spalten, Konfigurationen und jedes Blatt im Settings-JSON.</p>
      </header>
      <div className="toolbar">
        {picker(leftId, setLeftId, 'A')}
        <button className="icon-btn" aria-label="Seiten tauschen" onClick={() => { setLeftId(rightId); setRightId(leftId) }}>
          ⇄
        </button>
        {picker(rightId, setRightId, 'B')}
      </div>
      {error ? <div className="notice notice--error">{error}</div> : null}
      {loading && !data ? <div className="loading">Lade …</div> : null}
      {left && right ? (
        <>
          <div className="toolbar">
            <div className="segmented">
              {AREAS.map((a) => (
                <button key={a.value} className={area === a.value ? 'is-active' : ''} onClick={() => setArea(a.value)}>
                  {a.label} ({a.value === 'all' ? changes.length : changes.filter((c) => c.area === a.value).length})
                </button>
              ))}
            </div>
            <input className="input" placeholder="Einstellung suchen …" value={query} onChange={(e) => setQuery(e.target.value)} />
            <button className="btn btn--primary" disabled={leftId === rightId || changes.length === 0} onClick={transfer}>
              Von A nach B übertragen …
            </button>
          </div>
          <DiffTable
            changes={visible}
            beforeLabel={`A: ${left.name}`}
            afterLabel={`B: ${right.name}`}
            empty={leftId === rightId ? 'Zweimal dasselbe Board gewählt.' : 'Keine Unterschiede.'}
          />
        </>
      ) : null}
    </section>
  )
}
