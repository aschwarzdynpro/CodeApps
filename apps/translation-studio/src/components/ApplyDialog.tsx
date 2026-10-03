import { useEffect, useRef, useState } from 'react'
import { Checkbox, ProgressBar } from '@fluentui/react-components'
import { CheckmarkCircleRegular, ErrorCircleRegular } from '@fluentui/react-icons'
import type { CellChange, ComponentInfo, SolutionRef, TranslationFile } from '../types/translation'
import { getTranslationService } from '../services/translationService'
import { runImport, type RunOutcome, type RunProgress, type StepId } from '../services/runImport'
import { languageName } from '../utils/languages'
import { saveRun } from '../utils/storage'
import { downloadText, stamp } from '../utils/download'
import { ConfirmDialog, Modal } from './Modal'
import { Btn } from './ui'
import { S } from '../strings'

const PREVIEW_LIMIT = 300
const STEPS: StepId[] = ['check', 'build', 'upload', 'job', 'publish']

interface Props {
  solution: SolutionRef
  file: TranslationFile
  exportZip: Uint8Array
  changes: CellChange[]
  components: ReadonlyMap<string, ComponentInfo>
  /** True while the import runs: the studio locks editing. */
  onLock: (locked: boolean) => void
  /** Outcome of the run, or null when closed without importing. */
  onClose: (outcome: RunOutcome | null) => void
}

/** Diff preview → import with job progress → publish → result log. */
export function ApplyDialog({ solution, file, exportZip, changes, components, onLock, onClose }: Props) {
  const [publish, setPublish] = useState(true)
  const [progress, setProgress] = useState<RunProgress | null>(null)
  const [outcome, setOutcome] = useState<RunOutcome | null>(null)
  const [publishing, setPublishing] = useState<'confirm' | 'running' | null>(null)
  const signal = useRef({ cancelled: false })

  useEffect(() => {
    // StrictMode mounts twice in development: re-arm after the first cleanup.
    const s = signal.current
    s.cancelled = false
    return () => {
      s.cancelled = true
    }
  }, [])

  const rows = new Map(file.rows.map((r) => [r.key, r]))
  const perLanguage = new Map<number, number>()
  for (const c of changes) perLanguage.set(c.lcid, (perLanguage.get(c.lcid) ?? 0) + 1)
  const running = progress !== null && outcome === null

  const start = async () => {
    const svc = await getTranslationService()
    onLock(true)
    const runId = crypto.randomUUID()
    const counts = Object.fromEntries(perLanguage)
    saveRun({ id: runId, at: new Date().toISOString(), orgUrl: svc.orgUrl, solution: solution.uniqueName, counts, importJobId: null, status: 'running', published: false, message: '' })
    const result = await runImport({ svc, file, exportZip, publish, onProgress: setProgress, signal: signal.current })
    saveRun({
      id: runId,
      at: new Date().toISOString(),
      orgUrl: svc.orgUrl,
      solution: solution.uniqueName,
      counts,
      importJobId: result.jobId,
      status: result.status,
      published: result.published,
      message: result.error ?? result.publishError ?? (result.log.length ? `${result.log.length} Meldungen` : ''),
    })
    onLock(false)
    setOutcome(result)
  }

  const publishNow = async () => {
    setPublishing('running')
    try {
      await (await getTranslationService()).publishAll()
      setOutcome((o) => (o ? { ...o, published: true, publishError: undefined } : o))
    } catch (err) {
      setOutcome((o) => (o ? { ...o, publishError: err instanceof Error ? err.message : String(err) } : o))
    } finally {
      setPublishing(null)
    }
  }

  const close = () => {
    if (!running) onClose(outcome)
  }

  const footer = outcome ? (
    <>
      {outcome.status === 'succeeded' && !outcome.published ? (
        <Btn onClick={() => setPublishing('confirm')} disabled={publishing !== null}>
          {publishing === 'running' ? S.app.loading : S.apply.publishNow}
        </Btn>
      ) : null}
      <Btn kind="primary" onClick={close}>
        {outcome.status === 'succeeded' ? S.apply.reloadAfter : S.apply.close}
      </Btn>
    </>
  ) : (
    <>
      <Btn onClick={close} disabled={running}>
        {S.apply.cancel}
      </Btn>
      <Btn kind="primary" onClick={() => void start()} disabled={running || changes.length === 0 || solution.isManaged}>
        {running ? S.app.loading : S.apply.start(changes.length)}
      </Btn>
    </>
  )

  return (
    <Modal title={`${S.apply.title} — ${solution.friendlyName}`} onClose={close} footer={footer} wide>
      {!progress ? (
        <>
          <p>
            <strong>{S.apply.summary(changes.length, perLanguage.size)}</strong>{' '}
            {[...perLanguage].map(([l, n]) => (
              <span key={l} className="chip">
                {languageName(l)}: {n}
              </span>
            ))}
          </p>
          {solution.isManaged ? <div className="notice notice--error">{S.apply.managed}</div> : null}
          <div className="diff">
            <table className="diff__table">
              <thead>
                <tr>
                  <th>{S.matrix.component}</th>
                  <th>{S.matrix.column}</th>
                  <th>{S.apply.headLanguage}</th>
                  <th>{S.apply.headBefore}</th>
                  <th>{S.apply.headAfter}</th>
                </tr>
              </thead>
              <tbody>
                {changes.slice(0, PREVIEW_LIMIT).map((c) => {
                  const r = rows.get(c.rowKey)
                  const info = r ? components.get(r.objectId) : undefined
                  return (
                    <tr key={`${c.rowKey}|${c.lcid}`}>
                      <td>
                        {info?.table ?? (r?.type || r?.sheet)}
                        {info?.name && info.name !== info.table ? <span className="muted small"> · {info.name}</span> : null}
                      </td>
                      <td className="mono">{r?.column}</td>
                      <td>{c.lcid}</td>
                      <td className="diff__before">{c.before || <span className="muted">—</span>}</td>
                      <td className="diff__after">{c.after}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            {changes.length > PREVIEW_LIMIT ? <p className="muted small">{S.apply.more(changes.length - PREVIEW_LIMIT)}</p> : null}
          </div>
          <div className="notice">{S.apply.tableHint}</div>
          <Checkbox checked={publish} onChange={(_, d) => setPublish(!!d.checked)} label={S.apply.publish} />
          {!publish ? <p className="muted small">{S.apply.publishHint}</p> : null}
        </>
      ) : (
        <>
          <ol className="steps">
            {STEPS.map((id) => {
              const st = progress.steps[id]
              return (
                <li key={id} className={`step step--${st}`}>
                  <span className="step__icon" aria-hidden>
                    {st === 'done' ? '✓' : st === 'failed' ? '✕' : st === 'running' ? '…' : st === 'skipped' ? '–' : '○'}
                  </span>
                  <span className="step__label">{S.apply.steps[id]}</span>
                  {id === 'job' && st !== 'pending' ? (
                    <span className="step__detail">
                      {progress.jobProgress === null ? S.apply.jobWaiting : S.apply.jobProgress(progress.jobProgress)}
                      {progress.paused ? ` · ${S.apply.paused}` : ''}
                    </span>
                  ) : null}
                </li>
              )
            })}
          </ol>
          {running ? <ProgressBar value={progress.jobProgress === null ? undefined : progress.jobProgress / 100} /> : null}
          {outcome ? <Result outcome={outcome} solution={solution.uniqueName} /> : null}
        </>
      )}
      {publishing === 'confirm' ? (
        <ConfirmDialog
          title={S.apply.publishNow}
          message={S.apply.publishConfirm}
          confirmLabel={S.apply.publishNow}
          onClose={() => setPublishing(null)}
          onConfirm={() => void publishNow()}
        />
      ) : null}
    </Modal>
  )
}

function Result({ outcome, solution }: { outcome: RunOutcome; solution: string }) {
  const ok = outcome.status === 'succeeded'
  return (
    <div className="result">
      <div className={`notice ${ok ? 'notice--ok' : 'notice--error'}`}>
        {ok ? <CheckmarkCircleRegular aria-hidden /> : <ErrorCircleRegular aria-hidden />}{' '}
        {ok ? (outcome.published ? S.apply.donePublished : S.apply.done) : S.apply.failed}
        {outcome.error ? ` ${outcome.error}` : ''}
        {outcome.jobId ? <span className="muted small"> · Importjob {outcome.jobId}</span> : null}
      </div>
      {outcome.privilege ? <div className="notice notice--warn">{S.apply.privilege}</div> : null}
      {outcome.publishError ? (
        <div className="notice notice--warn">
          {S.apply.publishFailed} {outcome.publishError}
        </div>
      ) : null}
      {outcome.job ? (
        <>
          <h3>{S.apply.logTitle}</h3>
          {outcome.log.length === 0 ? (
            <p className="muted small">{S.apply.logEmpty}</p>
          ) : (
            <table className="diff__table">
              <tbody>
                {outcome.log.map((e, i) => (
                  <tr key={i} className={e.level === 'failure' ? 'is-error' : 'is-warn'}>
                    <td>{e.level === 'failure' ? S.apply.levelFailure : S.apply.levelWarning}</td>
                    <td className="mono">{e.context}</td>
                    <td>{e.text}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {outcome.job.data ? (
            <div>
              <Btn small onClick={() => downloadText(`${solution}_Importprotokoll_${stamp()}.xml`, outcome.job!.data!, 'application/xml')}>
                {S.apply.logDownload}
              </Btn>
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  )
}
