import type { ImportJobState, SetupCheck } from '../types/translation'
import { parseTranslationFile } from '../utils/translationFile'
import { base64ToBytes, createTranslationZip, readTranslationZip } from '../utils/translationZip'
import { createMockState, MOCK_BASE, mockComponents, renderTranslationXml } from './mockData'
import type { TranslationService } from './translationService'

/**
 * In-memory implementation for `npm run dev` without a host. The import is a
 * simulated job: progress over a few seconds, then the labels land in the
 * store. A translation containing "#fehler" makes the job fail with a log, to
 * show the error path.
 */

const state = createMockState()
const JOB_MS = 3500
const FAIL_MARK = '#fehler'

interface MockJob {
  id: string
  started: number
  fail: string[]
  apply: () => void
  applied: boolean
}
const jobs = new Map<string, MockJob>()

const delay = <T,>(value: T, ms = 150): Promise<T> => new Promise((resolve) => setTimeout(() => resolve(value), ms))

function jobState(job: MockJob, withLog: boolean): ImportJobState {
  const elapsed = Date.now() - job.started
  const done = elapsed >= JOB_MS
  const failed = job.fail.length > 0
  if (done && !failed && !job.applied) {
    job.apply()
    job.applied = true
  }
  const progress = done ? (failed ? 62 : 100) : Math.min(failed ? 62 : 99, Math.round((elapsed / JOB_MS) * 100))
  const log = failed
    ? `<importexportxml><result result="failure" errortext="Import abgebrochen (Mock)"/>${job.fail
        .map((t) => `<label id="${t}" result="failure" errortext="Mock: Text enthält ${FAIL_MARK}"/>`)
        .join('')}</importexportxml>`
    : '<importexportxml><result result="success"/></importexportxml>'
  return {
    id: job.id,
    progress,
    startedOn: new Date(job.started).toISOString(),
    completedOn: done ? new Date(job.started + JOB_MS).toISOString() : null,
    data: withLog && done ? log : null,
  }
}

export const mockTranslationService: TranslationService = {
  source: 'mock',
  orgUrl: '',

  listSolutions: () => delay(state.solutions.map((s) => ({ ...s }))),

  baseLanguage: () => delay(MOCK_BASE),

  async exportTranslations(solution) {
    if (!state.solutions.some((s) => s.uniqueName === solution)) throw new Error(`Solution „${solution}“ gibt es nicht.`)
    const zip = await createTranslationZip(renderTranslationXml(state, solution))
    return delay({ zip, route: 'mock' }, solution === 'Default' ? 900 : 400)
  },

  resolveComponents: () => delay(mockComponents(state.labels), 200),

  async importTranslations(zipBase64, importJobId) {
    if ([...jobs.values()].some((j) => Date.now() - j.started < JOB_MS)) throw new Error('Es läuft bereits ein Import (Mock).')
    const file = parseTranslationFile(await readTranslationZip(base64ToBytes(zipBase64)), { baseLanguage: MOCK_BASE })
    const byKey = new Map(state.labels.map((l) => [`${l.sheet}|${l.type}|${l.objectId}|${l.column}`, l]))
    const updates: { label: (typeof state.labels)[number]; lcid: number; text: string }[] = []
    const fail: string[] = []
    for (const r of file.rows) {
      const label =
        r.sheet === 'Display Strings' ? byKey.get(`Display Strings|||${r.column}`) : byKey.get(`${r.sheet}|${r.type}|${r.objectId}|${r.column}`)
      if (!label) continue
      for (const lcid of file.languages) {
        const text = r.original[lcid] ?? ''
        // Empty = unchanged; the base language is never written.
        if (lcid === file.baseLanguage || text === '' || text === label.texts[lcid]) continue
        if (text.includes(FAIL_MARK)) fail.push(r.objectId || r.column)
        updates.push({ label, lcid, text })
      }
    }
    jobs.set(importJobId, {
      id: importJobId,
      started: Date.now(),
      fail,
      applied: false,
      apply: () => {
        for (const u of updates) u.label.texts = { ...u.label.texts, [u.lcid]: u.text }
      },
    })
    return delay(undefined, 800)
  },

  async getImportJob(id, withLog) {
    const job = jobs.get(id)
    return delay(job ? jobState(job, withLog) : null, 80)
  },

  async runningImports() {
    return delay([...jobs.values()].filter((j) => Date.now() - j.started < JOB_MS).map((j) => jobState(j, false)))
  },

  publishAll: () => delay(undefined, 1500),

  async checkSetup(): Promise<SetupCheck[]> {
    return delay([
      { id: 'org', label: 'Org-URL gesetzt', ok: null, detail: 'Mock-Modus — kein Power-Apps-Host, keine Umgebung.' },
      { id: 'connector', label: 'Dataverse-Konnektor eingebunden', ok: null, detail: 'Mock: Daten aus src/services/mockData.ts (fiktiv).' },
      { id: 'solutions', label: 'Solutions lesbar', ok: true, detail: `${state.solutions.length} Mock-Solutions` },
      { id: 'base', label: 'Basissprache gelesen', ok: true, detail: String(MOCK_BASE) },
      { id: 'importjob', label: 'Importjobs lesbar', ok: true, detail: 'simulierter Importjob' },
    ])
  },
}
