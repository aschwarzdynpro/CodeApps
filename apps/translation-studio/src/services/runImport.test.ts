import { describe, expect, it, vi } from 'vitest'
import fixture from '../fixtures/CrmTranslations.sample.xml?raw'
import { publishAndWait, runImport, type RunProgress } from './runImport'
import { DataverseError } from './dataverseApi'
import type { TranslationService } from './translationService'
import type { ImportJobState } from '../types/translation'
import { applyEdits, parseTranslationFile } from '../utils/translationFile'
import { createTranslationZip, readTranslationZip, base64ToBytes } from '../utils/translationZip'

const base = parseTranslationFile(fixture)
const edited = applyEdits(base, [{ rowKey: base.rows.find((r) => r.original[1031] === '')!.key, lcid: 1031, value: 'Neu' }]).file

function stub(over: Partial<TranslationService> = {}, jobs: (ImportJobState | null)[] = []) {
  let poll = 0
  const svc = {
    source: 'mock',
    orgUrl: '',
    runningImports: vi.fn(async () => []),
    importTranslations: vi.fn(async () => {}),
    getImportJob: vi.fn(async (id: string, withLog: boolean) => {
      const j = jobs[Math.min(poll++, jobs.length - 1)] ?? null
      return j ? { ...j, id, data: withLog ? (j.data ?? '<x/>') : null } : null
    }),
    publishAll: vi.fn(async () => ({})),
    getAsyncOperation: vi.fn(async () => null),
    ...over,
  } as unknown as TranslationService
  return svc
}

const job = (progress: number, done = false): ImportJobState => ({ id: '', progress, startedOn: 'x', completedOn: done ? 'y' : null, data: null })
const opts = async (svc: TranslationService, publish = true) => {
  const seen: RunProgress[] = []
  return {
    seen,
    o: { svc, file: edited, exportZip: await createTranslationZip(fixture), publish, onProgress: (p: RunProgress) => seen.push(p), sleep: async () => {}, isHidden: () => false, newId: () => 'job-1', missingJobMs: 0 },
  }
}

describe('runImport', () => {
  it('imports the export plus edits, polls the job and publishes', async () => {
    const svc = stub({}, [null, job(30), job(80), job(100, true)])
    const { o, seen } = await opts(svc)
    // Keep the call pending so polling decides (asynchronous import).
    ;(svc.importTranslations as ReturnType<typeof vi.fn>).mockImplementation(() => new Promise(() => {}))
    const out = await runImport(o)
    expect(out).toMatchObject({ status: 'succeeded', published: true, jobId: 'job-1' })
    const [b64, id] = (svc.importTranslations as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(id).toBe('job-1')
    const xml = await readTranslationZip(base64ToBytes(b64))
    // Only the edited row goes back: unchanged labels would pull their components into the solution.
    expect(parseTranslationFile(xml).rows.map((r) => r.original[1031])).toEqual(['Neu'])
    expect(seen.map((p) => p.jobProgress)).toEqual(expect.arrayContaining([30, 80, 100]))
    expect(seen[seen.length - 1].steps).toEqual({ check: 'done', build: 'done', upload: 'done', job: 'done', publish: 'done' })
  })

  it('refuses while another import runs and never imports an unchanged file', async () => {
    const busy = stub({ runningImports: vi.fn(async () => [job(10)]) })
    expect((await runImport((await opts(busy)).o)).error).toMatch(/bereits ein Import/)
    expect(busy.importTranslations).not.toHaveBeenCalled()

    const svc = stub()
    const { o } = await opts(svc)
    const out = await runImport({ ...o, file: base })
    expect(out.error).toMatch(/unverändert/)
    expect(svc.importTranslations).not.toHaveBeenCalled()
  })

  it('reports a failed job with its log and skips publishing', async () => {
    const failed = { ...job(40, true), data: '<r result="failure" errortext="kaputt"/>' }
    const svc = stub({}, [job(40), failed])
    const out = await runImport((await opts(svc)).o)
    expect(out.status).toBe('failed')
    expect(out.log).toEqual([expect.objectContaining({ text: 'kaputt' })])
    expect(svc.publishAll).not.toHaveBeenCalled()
  })

  it('stops on a privilege error and flags it', async () => {
    const svc = stub({ importTranslations: vi.fn(async () => Promise.reject(new DataverseError('Principal user is missing prvImportCustomization privilege'))) }, [null])
    const out = await runImport((await opts(svc)).o)
    expect(out).toMatchObject({ status: 'error', privilege: true })
  })

  it('keeps the import when publishing fails, and skips publishing on request', async () => {
    const svc = stub({ publishAll: vi.fn(async () => Promise.reject(new Error('Bad gateway'))) }, [job(100, true)])
    expect(await runImport((await opts(svc)).o)).toMatchObject({ status: 'succeeded', published: false, publishError: 'Bad gateway' })
    // No answer in time: unknown, not failed — publishing goes on in Dataverse.
    const dropped = stub({ publishAll: vi.fn(async () => Promise.reject(new Error('The request was not sent or there was no response from the server.'))) }, [job(100, true)])
    const { o, seen } = await opts(dropped)
    expect(await runImport(o)).toMatchObject({ status: 'succeeded', published: null })
    expect(seen.at(-1)?.steps.publish).toBe('unknown')
    const quiet = stub({}, [job(100, true)])
    expect(await runImport((await opts(quiet, false)).o)).toMatchObject({ status: 'succeeded', published: false })
    expect(quiet.publishAll).not.toHaveBeenCalled()
  })

  it('after a failed call it still picks up a job that appears late, with its log', async () => {
    const failed = { ...job(0, true), data: '<r result="failure" errortext="Datei ungültig"/>' }
    const svc = stub({ importTranslations: vi.fn(async () => Promise.reject(new Error('Bad request'))) }, [null, null, failed])
    const out = await runImport((await opts(svc)).o)
    expect(out.status).toBe('failed')
    expect(out.log).toEqual([expect.objectContaining({ text: 'Datei ungültig' })])
    expect(out.error).toBe('Bad request')
  })

  it('lets the job decide when the call times out while the import runs on', async () => {
    const svc = stub({ importTranslations: vi.fn(async () => Promise.reject(new DataverseError('The request timed out after 180 seconds.'))) }, [job(40), job(90), job(100, true)])
    const { o, seen } = await opts(svc)
    const out = await runImport(o)
    expect(out).toMatchObject({ status: 'succeeded', published: true, callWarning: 'The request timed out after 180 seconds.' })
    expect(out.error).toBeUndefined()
    // The call's error never shows as a failed step.
    expect(seen.some((p) => p.steps.upload === 'failed')).toBe(false)
    expect(seen.at(-1)?.steps).toMatchObject({ upload: 'done', job: 'done', publish: 'done' })
  })

  it('waits for the system job of an asynchronous import, also while it is queued', async () => {
    const ops = [{ state: 'waiting' }, { state: 'running' }, { state: 'running' }]
    let n = 0
    const svc = stub(
      {
        importTranslations: vi.fn(async () => ({ asyncOperationId: 'op-1' })),
        getAsyncOperation: vi.fn(async (id: string) => ({ id, message: null, ...(ops[Math.min(n++, ops.length - 1)] as { state: 'waiting' }) })),
      },
      [null, null, null, job(50), job(100, true)],
    )
    // missingJobMs is 0: without the system job the run would give up at the first empty poll.
    expect(await runImport((await opts(svc, false)).o)).toMatchObject({ status: 'succeeded' })
  })

  it('shows the running system job and its start, and ends with it while the job row lags at 0 %', async () => {
    const states = ['running', 'running', 'succeeded'] as const
    let n = 0
    const started = { ...job(0), startedOn: '2026-10-05T17:24:14Z' }
    const svc = stub(
      {
        importTranslations: vi.fn(async () => ({ asyncOperationId: 'op-1' })),
        getAsyncOperation: vi.fn(async (id: string) => ({ id, message: null, state: states[Math.min(n++, states.length - 1)] })),
      },
      // The row never completes: only the system job says the import is done; the log has the verdict.
      [started, started, started, started, started, started, { ...started, data: '<importtranslations><status>Succeeded</status></importtranslations>' }],
    )
    const { o, seen } = await opts(svc, false)
    expect(await runImport(o)).toMatchObject({ status: 'succeeded' })
    expect(seen.some((p) => p.systemJob === 'running' && p.jobStartedAt === Date.parse('2026-10-05T17:24:14Z'))).toBe(true)
  })

  it('reports a failed import system job with its message', async () => {
    const svc = stub(
      {
        importTranslations: vi.fn(async () => ({ asyncOperationId: 'op-1' })),
        getAsyncOperation: vi.fn(async (id: string) => ({ id, state: 'failed' as const, message: 'Datei ungültig (Systemauftrag)' })),
      },
      [null],
    )
    expect(await runImport((await opts(svc)).o)).toMatchObject({ status: 'error', error: 'Datei ungültig (Systemauftrag)' })
  })

  it('reports the call error when no job turns up after a failed call', async () => {
    const svc = stub({ importTranslations: vi.fn(async () => Promise.reject(new Error('Bad request'))) }, [null])
    const out = await runImport((await opts(svc)).o)
    expect(out).toMatchObject({ status: 'error', error: 'Bad request' })
    // One poll while the call is pending, one after its error, then three grace polls.
    expect((svc.getImportJob as ReturnType<typeof vi.fn>).mock.calls.length).toBe(5)
  })

  it('gives up when the call ended and no job exists', async () => {
    const out = await runImport((await opts(stub({}, [null]))).o)
    expect(out.error).toMatch(/nicht auffindbar/)
  })
})

describe('publishAndWait', () => {
  const quick = { sleep: async () => {}, isHidden: () => false }
  it('waits for the system job of PublishAllXmlAsync', async () => {
    const states = ['waiting', 'running', 'succeeded'] as const
    let n = 0
    const svc = stub({ publishAll: vi.fn(async () => ({ asyncOperationId: 'op-2' })), getAsyncOperation: vi.fn(async (id: string) => ({ id, state: states[n++], message: null })) })
    expect(await publishAndWait({ svc, ...quick })).toEqual({ published: true })
    expect(n).toBe(3)
  })

  it('reports a failed publish job, and the synchronous answer when there is no job', async () => {
    const failed = stub({ publishAll: vi.fn(async () => ({ asyncOperationId: 'op-3' })), getAsyncOperation: vi.fn(async (id: string) => ({ id, state: 'failed' as const, message: 'Formular kaputt' })) })
    expect(await publishAndWait({ svc: failed, ...quick })).toEqual({ published: false, error: 'Formular kaputt' })
    expect(await publishAndWait({ svc: stub(), ...quick })).toEqual({ published: true })
  })
})
