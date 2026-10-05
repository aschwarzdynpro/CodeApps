import { useState } from 'react'
import { CopyRegular } from '@fluentui/react-icons'
import { clearHistory, loadHistory, type RunRecord } from '../utils/storage'
import { languageName } from '../utils/languages'
import { formatDateTime } from '../utils/download'
import { ConfirmDialog } from './Modal'
import { Btn } from './ui'
import { S } from '../strings'
import { looksLikeTimeout } from '../services/runImport'

/**
 * Older runs kept the publish error in `message`: on a successful import that
 * isn't a log count, it belongs to publishing.
 */
function split(r: RunRecord): { message: string; publishMessage: string } {
  if (r.publishMessage !== undefined || r.status !== 'succeeded' || r.published === true || !r.message || /Meldungen$/.test(r.message)) {
    return { message: r.message, publishMessage: r.publishMessage ?? '' }
  }
  return { message: '', publishMessage: r.message }
}

function copy(text: string) {
  void navigator.clipboard?.writeText(text).catch(() => window.prompt(S.history.copyPrompt, text))
}

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
                {list.map((r) => {
                  const { message, publishMessage } = split(r)
                  // A dropped answer while publishing: the server usually finished (see runImport).
                  const published = r.published === false && publishMessage && looksLikeTimeout(publishMessage) ? null : r.published
                  return (
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
                        {message ? <div className="muted small">{message}</div> : null}
                        {r.importJobId ? (
                          <div className="history__job muted small">
                            <span title={r.importJobId}>
                              {S.history.job} <span className="mono">{r.importJobId.slice(0, 8)}…</span>
                            </span>
                            <button type="button" className="history__copy" onClick={() => copy(r.importJobId!)} title={S.history.copyJob} aria-label={S.history.copyJob}>
                              <CopyRegular aria-hidden />
                            </button>
                          </div>
                        ) : null}
                      </td>
                      <td>
                        {published === null ? S.history.unknown : published ? S.history.yes : S.history.no}
                        {publishMessage ? <div className="muted small">{published === null ? S.history.publishUnknown : publishMessage}</div> : null}
                      </td>
                    </tr>
                  )
                })}
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
