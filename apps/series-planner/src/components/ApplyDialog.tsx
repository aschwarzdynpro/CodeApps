import { useState, type ReactNode } from 'react'
import { ProgressBar } from '@fluentui/react-components'
import type { Series } from '../types/series'
import { getSeriesService, type SeriesService } from '../services/seriesService'
import { runActions, type ActionResult } from '../services/applyPlan'
import { countActions, isWrite, type PlanAction } from '../utils/planner'
import { formatDateWithDay, timeRange } from '../utils/dates'
import { Modal } from './Modal'
import { Btn } from './ui'

type Phase = { kind: 'confirm' } | { kind: 'running'; step: string; done: number; total: number } | { kind: 'done'; results: ActionResult[]; seriesId: string } | { kind: 'failed'; error: string }

const CHANGE_LABEL = { date: 'Datum', time: 'Uhrzeit', resource: 'Ressource' }

/**
 * Preview → apply: shows what a plan writes, saves the series record first
 * (so the intent survives a partial failure), then runs the occurrence
 * actions with progress and a result per occurrence.
 */
export function ApplyDialog({
  title,
  description,
  actions,
  resourceName,
  save,
  confirmLabel,
  onClose,
}: {
  title: string
  description?: ReactNode
  actions: PlanAction[]
  resourceName: (id: string | null) => string
  /** Creates or updates the series record and returns it. */
  save: (svc: SeriesService) => Promise<Series>
  confirmLabel: string
  onClose: (changed: boolean, seriesId?: string) => void
}) {
  const [phase, setPhase] = useState<Phase>({ kind: 'confirm' })
  const writes = actions.filter(isWrite)
  const counts = countActions(actions)

  const run = async () => {
    setPhase({ kind: 'running', step: 'Serienplan speichern …', done: 0, total: writes.length })
    try {
      const svc = await getSeriesService()
      const series = await save(svc)
      const results = await runActions(svc, series, actions, (done, total) => setPhase({ kind: 'running', step: 'Termine schreiben …', done, total }))
      setPhase({ kind: 'done', results, seriesId: series.id })
    } catch (err) {
      setPhase({ kind: 'failed', error: err instanceof Error ? err.message : String(err) })
    }
  }

  const busy = phase.kind === 'running'
  const failed = phase.kind === 'done' ? phase.results.filter((r) => !r.ok) : []

  return (
    <Modal
      title={title}
      wide
      onClose={() => !busy && onClose(phase.kind === 'done', phase.kind === 'done' ? phase.seriesId : undefined)}
      footer={
        phase.kind === 'confirm' ? (
          <>
            <Btn onClick={() => onClose(false)}>Zurück</Btn>
            <Btn kind="primary" onClick={run}>
              {confirmLabel}
            </Btn>
          </>
        ) : (
          <Btn kind="primary" disabled={busy} onClick={() => onClose(phase.kind === 'done', phase.kind === 'done' ? phase.seriesId : undefined)}>
            Schließen
          </Btn>
        )
      }
    >
      {phase.kind === 'confirm' ? (
        <>
          {description}
          <div className="plan-counts">
            <span className="status status--new">{counts.create} neu</span>
            <span className="status status--planned">{counts.update} ändern</span>
            <span className="status status--canceled">{counts.cancel} absagen</span>
            <span className="status status--past">{counts.keep - counts.deviates} unverändert</span>
            {counts.deviates ? <span className="status status--deviates">{counts.deviates} abweichend, bleiben</span> : null}
          </div>
          {writes.length === 0 ? (
            <p className="muted">Keine Termine zu schreiben — nur der Serienplan wird gespeichert.</p>
          ) : (
            <div className="table-wrap plan-table">
              <table className="grid">
                <thead>
                  <tr>
                    <th>Termin</th>
                    <th>Aktion</th>
                    <th>Neu</th>
                  </tr>
                </thead>
                <tbody>
                  {writes.map((a) => (
                    <tr key={`${a.kind}-${a.key}`}>
                      <td>{formatDateWithDay(a.key)}</td>
                      <td>
                        {a.kind === 'create'
                          ? 'Arbeitsauftrag + Buchung anlegen'
                          : a.kind === 'update'
                            ? `${a.record.workOrderName}: ${a.changes.map((c) => CHANGE_LABEL[c]).join(', ') || 'buchen'}`
                            : `${a.record.workOrderName} absagen${a.reason === 'skipped' ? '' : ' (nicht mehr im Muster)'}`}
                      </td>
                      <td>
                        {a.kind === 'cancel'
                          ? '—'
                          : `${formatDateWithDay(a.occ.date)}, ${timeRange(a.occ.startTime, a.occ.durationMinutes)}, ${resourceName(a.occ.resourceId)}`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      ) : null}

      {phase.kind === 'running' ? (
        <div className="progress">
          <span>{phase.step}</span>
          <ProgressBar value={phase.total ? phase.done / phase.total : undefined} />
          <span className="muted small">
            {phase.done} von {phase.total} Terminen
          </span>
        </div>
      ) : null}

      {phase.kind === 'done' ? (
        <>
          <div className={`notice ${failed.length ? 'notice--warn' : 'notice--ok'}`}>
            Serienplan gespeichert. {phase.results.length - failed.length} von {phase.results.length} Terminen erfolgreich geschrieben.
            {failed.length ? ' Was fehlgeschlagen ist, holt „Abgleichen“ in der Serie nach.' : ''}
          </div>
          {failed.length ? (
            <ul className="result-list">
              {failed.map((r) => (
                <li key={`${r.kind}-${r.key}`} className="warn">
                  {r.message}
                </li>
              ))}
            </ul>
          ) : null}
        </>
      ) : null}

      {phase.kind === 'failed' ? <div className="notice notice--error">Nicht gespeichert: {phase.error}</div> : null}
    </Modal>
  )
}
