import { useState } from 'react'
import { SHARE_TYPE, type BoardSummary, type PrincipalRef } from '../types/board'
import { getBoardService } from '../services/boardService'
import { planOwnerChange, protectionOf, type OwnerPlanRow, type OwnerPlanStatus } from '../utils/boardRules'
import type { Notify } from './BoardDetail'
import { PrincipalLabel, PrincipalPicker } from './PrincipalPicker'
import { OwnerNotes } from './OwnerDialog'

interface Props {
  boards: BoardSummary[]
  notify: Notify
  onDone: () => void
}

type Outcome = { id: string; status: 'ok' | 'error'; message?: string }

const STATUS_LABEL: Record<OwnerPlanStatus, string> = {
  change: 'wird geändert',
  same: 'gehört schon — übersprungen',
  protected: 'System-Board — übersprungen',
}

/** Give several boards one new owner: pick boards, pick owner, check, apply. */
export function BulkOwnerView({ boards, notify, onDone }: Props) {
  const [targetIds, setTargetIds] = useState<string[]>([])
  const [owner, setOwner] = useState<PrincipalRef | null>(null)
  // Frozen at apply time — the board list reloads with the new owners afterwards.
  const [done, setDone] = useState<{ plan: OwnerPlanRow[]; outcomes: Outcome[] } | null>(null)
  const [busy, setBusy] = useState(false)

  const plan = done?.plan ?? (owner ? planOwnerChange(boards, targetIds, owner) : [])
  const outcomes = done?.outcomes ?? null
  const toChange = plan.filter((r) => r.status === 'change')
  const assignable = boards.filter((b) => protectionOf(b).canAssign)

  const toggle = (id: string, on: boolean) => {
    setTargetIds((ids) => (on ? [...ids.filter((x) => x !== id), id] : ids.filter((x) => x !== id)))
    setDone(null)
  }

  const apply = async () => {
    if (!owner) return
    setBusy(true)
    const svc = await getBoardService()
    const results: Outcome[] = []
    for (const row of toChange) {
      try {
        await svc.assignBoard(row.board.id, owner)
        results.push({ id: row.board.id, status: 'ok' })
      } catch (err) {
        results.push({ id: row.board.id, status: 'error', message: err instanceof Error ? err.message : String(err) })
      }
    }
    setDone({ plan, outcomes: results })
    setBusy(false)
    const ok = results.filter((r) => r.status === 'ok').length
    const failed = results.length - ok
    notify(`${ok} Board${ok === 1 ? '' : 's'} an ${owner.name} übergeben${failed ? `, ${failed} fehlgeschlagen` : ''}.`, failed ? 'error' : 'ok')
    onDone()
  }

  const outcomeFor = (id: string) => outcomes?.find((o) => o.id === id)

  return (
    <>
      <div className="bulk">
        <div className="bulk__col">
          <h2>1. Boards</h2>
          <fieldset className="checklist">
            {assignable.map((b) => (
              <label key={b.id} className="form-check">
                <input type="checkbox" checked={targetIds.includes(b.id)} onChange={(e) => toggle(b.id, e.target.checked)} />
                <span>
                  {b.name} <span className="muted small">· {b.ownerName}</span>
                  {!b.active ? <span className="badge badge--inactive">Inaktiv</span> : null}
                </span>
              </label>
            ))}
          </fieldset>
          <p className="muted small">System-Boards gehören SYSTEM und fehlen hier.</p>
        </div>

        <div className="bulk__col">
          <h2>2. Neuer Besitzer</h2>
          {owner ? (
            <div className="owner-line">
              <PrincipalLabel p={owner} />
              <button
                className="btn btn--small"
                disabled={busy}
                onClick={() => {
                  setOwner(null)
                  setDone(null)
                }}
              >
                Andere Person
              </button>
            </div>
          ) : (
            <PrincipalPicker
              exclude={new Set()}
              owners
              action={(p) => (
                <button
                  className="btn btn--small btn--primary"
                  onClick={() => {
                    setOwner(p)
                    setDone(null)
                  }}
                >
                  Auswählen
                </button>
              )}
            />
          )}
          <OwnerNotes
            justMe={plan.some((r) => r.status === 'change' && r.board.shareType === SHARE_TYPE.justMe)}
          />
        </div>
      </div>

      {owner && plan.length > 0 ? (
        <div className="bulk__preview">
          <table className="diff-table">
            <thead>
              <tr>
                <th>Board</th>
                <th>Bisher</th>
                <th>Neu</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {plan.map((r) => {
                const o = outcomeFor(r.board.id)
                return (
                  <tr key={r.board.id}>
                    <td>{r.board.name}</td>
                    <td className={r.status === 'change' ? 'diff-table__before' : undefined}>{r.board.ownerName}</td>
                    <td className={r.status === 'change' ? 'diff-table__after' : undefined}>{r.status === 'change' ? owner.name : '—'}</td>
                    <td>
                      {o ? (
                        <span className={`badge badge--outcome-${o.status}`} title={o.message}>
                          {o.status === 'ok' ? 'geändert' : `Fehler: ${o.message}`}
                        </span>
                      ) : (
                        <span className="muted small">{STATUS_LABEL[r.status]}</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          <div className="toolbar">
            <button className="btn btn--danger" disabled={busy || outcomes !== null || toChange.length === 0} onClick={apply}>
              {busy ? 'Ändert …' : `${toChange.length} Board${toChange.length === 1 ? '' : 's'} an ${owner.name} übergeben`}
            </button>
          </div>
        </div>
      ) : null}
    </>
  )
}
