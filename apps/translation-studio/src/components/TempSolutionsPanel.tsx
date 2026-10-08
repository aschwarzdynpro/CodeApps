import { useState } from 'react'
import type { TranslationService } from '../services/translationService'
import { getTranslationService } from '../services/translationService'
import { STALE_MINUTES } from '../services/chunkedExport'
import { useLoad } from '../hooks/useLoad'
import { formatDateTime } from '../utils/download'
import { Btn } from './ui'
import { S } from '../strings'

const listTemp = (svc: TranslationService) => svc.listTempSolutions()

/** Older than {@link STALE_MINUTES}: the run that created it was cut off (a run takes minutes). */
const isStale = (createdOn: string | null, now: number) => !createdOn || now - Date.parse(createdOn) > STALE_MINUTES * 60_000

interface Props {
  /**
   * `studio`: a notice only when a cut-off run left temporary solutions behind;
   * `setup`: always, with the count and the button.
   */
  mode: 'studio' | 'setup'
  /** Changes after a load, to look again. */
  refresh?: number
}

/** Temporary solutions of the chunked export left behind by a cut-off run — and the button to delete them. */
export function TempSolutionsPanel({ mode, refresh = 0 }: Props) {
  const res = useLoad(`temp:${refresh}`, listTemp)
  const [cleaning, setCleaning] = useState<{ done: number; total: number } | null>(null)
  const [result, setResult] = useState<{ deleted: number; failed: number } | null>(null)
  // When the list was read: what counts as left over is fixed per read, not per render.
  const [readAt] = useState(() => Date.now())
  const list = res.data ?? []
  const stale = list.filter((t) => isStale(t.createdOn, readAt))
  const young = list.length - stale.length

  const clean = async () => {
    setResult(null)
    setCleaning({ done: 0, total: stale.length })
    try {
      const svc = await getTranslationService()
      setResult(await svc.deleteTempSolutions(stale.map((t) => t.id), (done, total) => setCleaning({ done, total })))
    } finally {
      setCleaning(null)
      res.reload()
    }
  }

  const action = (
    <Btn small kind={mode === 'studio' ? 'primary' : undefined} onClick={() => void clean()} disabled={cleaning !== null || stale.length === 0}>
      {cleaning ? S.temp.cleaning(cleaning.done, cleaning.total) : S.temp.clean}
    </Btn>
  )
  const oldest = stale[0]
  const summary = oldest ? S.temp.leftover(stale.length, oldest.createdBy, oldest.createdOn ? formatDateTime(oldest.createdOn) : '?') : null
  const done = result ? (result.failed > 0 ? S.temp.partly(result.deleted, result.failed) : S.temp.done(result.deleted)) : null

  if (mode === 'studio') {
    if (!summary && !done) return null
    return (
      <div className={`notice ${done && !summary ? 'notice--ok' : 'notice--warn'} temp`}>
        <span>{summary ? `${summary} ${S.temp.why}` : done}</span>
        {summary ? action : null}
      </div>
    )
  }
  return (
    <>
      <h2>{S.temp.title}</h2>
      <p className="muted small">{S.temp.intro}</p>
      {res.error ? <div className="notice notice--error">{res.error}</div> : null}
      <div className="temp">
        <span>{res.loading && !res.data ? S.setup.checking : summary ?? S.temp.none}</span>
        {young > 0 ? <span className="muted small">{S.temp.young(young)}</span> : null}
        {action}
      </div>
      {done ? <div className={`notice ${result!.failed > 0 ? 'notice--warn' : 'notice--ok'}`}>{done}</div> : null}
    </>
  )
}
