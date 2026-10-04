import type { ImportJobState, TranslationFile } from '../types/translation'
import { importStatus, parseImportLog, type LogEntry } from '../utils/importLog'
import { changesOf, serializeTranslationFile } from '../utils/translationFile'
import { buildImportZip } from '../utils/translationZip'
import { DataverseError } from './dataverseApi'
import type { TranslationService } from './translationService'

/**
 * One import run: refuse while another import runs, build the file (export +
 * edits), start `ImportTranslation` with a fresh job id, poll the job until
 * it completes (paused while the app is hidden), then publish if wanted.
 *
 * The import call and the polling run side by side: whether the call returns
 * at once or only when the import is done (or times out on the way) is not
 * documented — the job row decides.
 */

export type StepId = 'check' | 'build' | 'upload' | 'job' | 'publish'
export type StepStatus = 'pending' | 'running' | 'done' | 'failed' | 'skipped'

export interface RunProgress {
  steps: Record<StepId, StepStatus>
  jobProgress: number | null
  paused: boolean
}

export interface RunOutcome {
  status: 'succeeded' | 'failed' | 'error'
  jobId: string | null
  job: ImportJobState | null
  log: LogEntry[]
  error?: string
  /** The error was a missing privilege → the UI switches to read-only. */
  privilege?: boolean
  published: boolean
  publishError?: string
  /**
   * The import call reported an error, but the job ran through (typically the
   * call's timeout on a large solution while Dataverse kept importing).
   */
  callWarning?: string
}

export interface RunOptions {
  svc: TranslationService
  /** Current file with the edits applied. */
  file: TranslationFile
  /** The zip as exported (the import zip is this zip with the new xml). */
  exportZip: Uint8Array
  publish: boolean
  onProgress: (p: RunProgress) => void
  /** Set `cancelled` to stop polling (dialog closed); the import itself continues in Dataverse. */
  signal?: { cancelled: boolean }
  pollMs?: number
  /** Give up waiting for a job that never appears after the call returned. */
  missingJobMs?: number
  /**
   * Polls after a failed call before giving up: the job row (with the reason
   * in its log) can show up a moment after the call's error.
   */
  failedCallPolls?: number
  maxWaitMs?: number
  sleep?: (ms: number) => Promise<void>
  isHidden?: () => boolean
  newId?: () => string
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))
const defaultHidden = () => typeof document !== 'undefined' && document.hidden

const message = (err: unknown) => (err instanceof Error ? err.message : String(err))

export async function runImport(o: RunOptions): Promise<RunOutcome> {
  const sleep = o.sleep ?? defaultSleep
  const isHidden = o.isHidden ?? defaultHidden
  const pollMs = o.pollMs ?? 2000
  const missingJobMs = o.missingJobMs ?? 60_000
  const failedCallPolls = o.failedCallPolls ?? 3
  const maxWaitMs = o.maxWaitMs ?? 30 * 60_000
  const progress: RunProgress = {
    steps: { check: 'pending', build: 'pending', upload: 'pending', job: 'pending', publish: o.publish ? 'pending' : 'skipped' },
    jobProgress: null,
    paused: false,
  }
  const emit = () => o.onProgress({ ...progress, steps: { ...progress.steps } })
  const step = (id: StepId, s: StepStatus) => {
    progress.steps[id] = s
    emit()
  }
  const fail = (id: StepId, err: unknown, jobId: string | null = null, job: ImportJobState | null = null): RunOutcome => {
    step(id, 'failed')
    return {
      status: 'error',
      jobId,
      job,
      log: parseImportLog(job?.data ?? null),
      error: message(err),
      privilege: err instanceof DataverseError && err.privilege,
      published: false,
    }
  }

  // 1. One import at a time.
  step('check', 'running')
  try {
    const running = await o.svc.runningImports()
    if (running.length > 0) return fail('check', new Error(`Es läuft bereits ein Import (Job ${running[0].id.slice(0, 8)}…).`))
  } catch (err) {
    // Not readable: Dataverse refuses a parallel import itself — go on.
    console.warn('[translation] running imports not checkable', err)
  }
  step('check', 'done')

  // 2. Build: never import an unchanged file, never anything but export + edits.
  step('build', 'running')
  let zipBase64: string
  try {
    if (changesOf(o.file).length === 0) throw new Error('Die Datei ist unverändert — es gibt nichts zu importieren.')
    const xml = serializeTranslationFile(o.file)
    if (xml === o.file.xml) throw new Error('Die Datei ist unverändert — es gibt nichts zu importieren.')
    zipBase64 = await buildImportZip(o.exportZip, xml)
  } catch (err) {
    return fail('build', err)
  }
  step('build', 'done')

  // 3. Start the import; 4. poll the job while the call runs.
  const jobId = (o.newId ?? (() => crypto.randomUUID()))()
  step('upload', 'running')
  let callDone = false
  let callError: unknown = null
  let callDoneAt = 0
  void o.svc.importTranslations(zipBase64, jobId).then(
    () => {
      callDone = true
      callDoneAt = Date.now()
    },
    (err: unknown) => {
      callDone = true
      callDoneAt = Date.now()
      callError = err
    },
  )

  const started = Date.now()
  let job: ImportJobState | null = null
  let pollsAfterError = 0
  step('job', 'running')
  for (;;) {
    if (o.signal?.cancelled) return { status: 'error', jobId, job, log: [], error: 'abgebrochen', published: false }
    // A failed call isn't the verdict yet: after a timeout the import goes on, and the job decides.
    if (callDone && !callError && progress.steps.upload === 'running') step('upload', 'done')
    if (callError instanceof DataverseError && callError.privilege) {
      step('job', 'failed')
      return fail('upload', callError, jobId, job)
    }
    try {
      job = await o.svc.getImportJob(jobId, false)
    } catch (err) {
      console.warn('[translation] import job not readable', err)
    }
    if (job) {
      progress.jobProgress = job.progress
      emit()
      if (importStatus(job) !== 'running') break
    } else if (callDone && callError) {
      // Failed call: look a few more times for the job and its log, then report the call's error.
      if (pollsAfterError++ >= failedCallPolls) {
        step('job', 'failed')
        return fail('upload', callError, jobId, null)
      }
    } else if (callDone && Date.now() - callDoneAt >= missingJobMs) {
      // The call succeeded and no job turned up: the import never started.
      step('job', 'failed')
      return fail('upload', new Error('Der Importjob ist nicht auffindbar — Import vermutlich nicht gestartet.'), jobId, null)
    }
    if (Date.now() - started > maxWaitMs) return fail('job', new Error('Der Importjob läuft ungewöhnlich lange — Stand im Maker-Portal prüfen.'), jobId, job)
    await sleep(pollMs)
    if (isHidden()) {
      progress.paused = true
      emit()
      while (isHidden() && !o.signal?.cancelled) await sleep(500)
      progress.paused = false
      emit()
    }
  }

  // Final read with the log.
  try {
    job = (await o.svc.getImportJob(jobId, true)) ?? job
  } catch (err) {
    console.warn('[translation] import log not readable', err)
  }
  const log = parseImportLog(job?.data ?? null)
  const status = job ? importStatus(job) : 'failed'
  if (progress.steps.upload === 'running') step('upload', callError && status !== 'succeeded' ? 'failed' : 'done')
  // The job succeeded although the call failed: keep the call's message as a note, not as an error.
  const callWarning = callError && status === 'succeeded' ? message(callError) : undefined
  if (callWarning) console.warn('[translation] import call failed, job succeeded', callError)
  progress.jobProgress = job?.progress ?? progress.jobProgress
  step('job', status === 'succeeded' ? 'done' : 'failed')
  if (status !== 'succeeded') {
    if (o.publish) step('publish', 'skipped')
    return { status: 'failed', jobId, job, log, published: false, error: callError ? message(callError) : undefined }
  }

  // 5. Publish.
  if (!o.publish) return { status: 'succeeded', jobId, job, log, published: false, callWarning }
  step('publish', 'running')
  try {
    await o.svc.publishAll()
    step('publish', 'done')
    return { status: 'succeeded', jobId, job, log, published: true, callWarning }
  } catch (err) {
    step('publish', 'failed')
    return { status: 'succeeded', jobId, job, log, published: false, publishError: message(err), callWarning }
  }
}
