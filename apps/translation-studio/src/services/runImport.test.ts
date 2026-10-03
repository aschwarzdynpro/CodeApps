import { describe, expect, it, vi } from 'vitest'
import fixture from '../fixtures/CrmTranslations.sample.xml?raw'
import { runImport, type RunProgress } from './runImport'
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
    publishAll: vi.fn(async () => {}),
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
    expect(parseTranslationFile(xml).rows.some((r) => r.original[1031] === 'Neu')).toBe(true)
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
    const svc = stub({ publishAll: vi.fn(async () => Promise.reject(new Error('timeout'))) }, [job(100, true)])
    expect(await runImport((await opts(svc)).o)).toMatchObject({ status: 'succeeded', published: false, publishError: 'timeout' })
    const quiet = stub({}, [job(100, true)])
    expect(await runImport((await opts(quiet, false)).o)).toMatchObject({ status: 'succeeded', published: false })
    expect(quiet.publishAll).not.toHaveBeenCalled()
  })

  it('gives up when the call ended and no job exists', async () => {
    const out = await runImport((await opts(stub({}, [null]))).o)
    expect(out.error).toMatch(/nicht auffindbar/)
  })
})
