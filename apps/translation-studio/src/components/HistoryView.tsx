import { useState } from 'react'
import { clearHistory, loadHistory, type RunRecord } from '../utils/storage'
import { languageName } from '../utils/languages'
import { formatDateTime } from '../utils/download'
import { ConfirmDialog } from './Modal'
import { Btn } from './ui'
import { S } from '../strings'

/** Local run history (this browser). `epoch` re-reads after a run. */
export function HistoryView({ epoch }: { epoch: number }) {
  const [runs, setRuns] = useState<{ epoch: number; list: RunRecord[] }>(() => ({ epoch, list: loadHistory() }))
  const [confirm, setConfirm] = useState(false)
  const list = runs.epoch === epoch ? runs.list : loadHistory()

  return (
    <section className="page">
      <header className="page__header">
        <h1>{S.history.title}</h1>
        <p className="muted small">{S.history.intro}</p>
      </header>
      {list.length === 0 ? (
        <p className="muted">{S.history.empty}</p>
      ) : (
        <>
          <div className="diff">
            <table className="diff__table">
              <thead>
                <tr>
                  <th>{S.history.headWhen}</th>
                  <th>{S.history.headSolution}</th>
                  <th>{S.history.headChanges}</th>
                  <th>{S.history.headResult}</th>
                  <th>{S.history.headPublish}</th>
                </tr>
              </thead>
              <tbody>
                {list.map((r) => (
                  <tr key={r.id}>
                    <td>{formatDateTime(r.at)}</td>
                    <td>
                      {r.solution}
                      {r.orgUrl ? <div className="muted small">{r.orgUrl.replace(/^https:\/\//, '')}</div> : null}
                    </td>
                    <td>
                      {Object.entries(r.counts).map(([l, n]) => (
                        <span key={l} className="chip">
                          {languageName(Number(l))}: {n}
                        </span>
                      ))}
                    </td>
                    <td>
                      <span className={`badge badge--${r.status === 'succeeded' ? 'ok' : r.status === 'running' ? 'lock' : 'error'}`}>{S.history.status[r.status]}</span>
                      {r.message ? <div className="muted small">{r.message}</div> : null}
                      {r.importJobId ? <div className="muted small mono">{r.importJobId}</div> : null}
                    </td>
                    <td>{r.published ? S.history.yes : S.history.no}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div>
            <Btn kind="danger" onClick={() => setConfirm(true)}>
              {S.history.clear}
            </Btn>
          </div>
        </>
      )}
      {confirm ? (
        <ConfirmDialog
          title={S.history.clear}
          message={S.history.clearConfirm}
          confirmLabel={S.history.clear}
          danger
          onClose={() => setConfirm(false)}
          onConfirm={() => {
            clearHistory()
            setRuns({ epoch, list: [] })
            setConfirm(false)
          }}
        />
      ) : null}
    </section>
  )
}
