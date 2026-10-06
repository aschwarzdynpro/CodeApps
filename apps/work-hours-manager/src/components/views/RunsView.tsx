import { Badge } from '@fluentui/react-components'
import { ArrowDownloadRegular, ArrowUndoRegular } from '@fluentui/react-icons'
import { S } from '../../strings'
import type { RunRecord } from '../../types/calendar'
import { downloadJson, runFileName } from '../../utils/runHistory'
import { Btn } from '../ui'

interface Props {
  runs: RunRecord[]
  onUndo: (record: RunRecord) => void
  readOnly: boolean
}

const STATUS_COLOR = { done: 'success', skipped: 'subtle', failed: 'danger', pending: 'informative', aborted: 'warning' } as const

/** Run history with per-step results, undo and JSON download. */
export function RunsView({ runs, onUndo, readOnly }: Props) {
  return (
    <div className="page">
      <h2>{S.runs.title}</h2>
      <p className="muted">{S.runs.intro}</p>
      {runs.length === 0 ? (
        <p className="empty">{S.runs.empty}</p>
      ) : (
        <ul className="run-list">
          {runs.map((r) => {
            const done = r.steps.filter((s) => s.status === 'done').length
            const failed = r.steps.some((s) => s.status === 'failed')
            return (
              <li key={r.id} className="run-card">
                <div className="run-card__head">
                  <div>
                    <strong>{r.label}</strong>
                    <div className="muted small">
                      {S.runs.at(new Date(r.startedAt).toLocaleString('de-DE'))} · {r.summary}
                    </div>
                  </div>
                  <div className="run-card__actions">
                    {failed ? <Badge appearance="tint" color="danger">{S.runs.status.failed}</Badge> : null}
                    {r.undoneBy ? <Badge appearance="tint">{S.runs.undone}</Badge> : null}
                    <Btn small icon={<ArrowDownloadRegular />} onClick={() => downloadJson(runFileName(r), r)}>
                      {S.runs.download}
                    </Btn>
                    {!readOnly && !r.undoneBy && done > 0 ? (
                      <Btn small kind="primary" icon={<ArrowUndoRegular />} onClick={() => onUndo(r)}>
                        {S.runs.undo}
                      </Btn>
                    ) : null}
                  </div>
                </div>
                <div className="muted small">{S.runs.stepsOf(done, r.steps.length)}</div>
                <details>
                  <summary className="small">{S.runs.history}</summary>
                  <ul className="run-results">
                    {r.steps.map((s) => (
                      <li key={s.resourceId} className="run-result">
                        <Badge size="small" appearance="filled" color={STATUS_COLOR[s.status]}>
                          {S.runs.status[s.status]}
                        </Badge>
                        <span>{s.resourceName}</span>
                        <span className="muted small">{s.message}</span>
                      </li>
                    ))}
                  </ul>
                </details>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
