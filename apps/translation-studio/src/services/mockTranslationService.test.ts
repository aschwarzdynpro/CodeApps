import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mockTranslationService as svc } from './mockTranslationService'
import { applyEdits, parseTranslationFile, serializeTranslationFile } from '../utils/translationFile'
import { buildImportZip, readTranslationZip } from '../utils/translationZip'
import { findGaps, countStates } from '../utils/gaps'
import { importStatus } from '../utils/importLog'

/** Advances the fake clock in small steps until `p` settles (JSZip needs real ticks in between). */
async function settle<T>(p: Promise<T>): Promise<T> {
  let done = false
  p.then(
    () => (done = true),
    () => (done = true),
  )
  for (let i = 0; i < 400 && !done; i++) await vi.advanceTimersByTimeAsync(25)
  return p
}

async function exportFile(solution: string) {
  const { zip } = await settle(svc.exportTranslations(solution))
  return { zip, file: parseTranslationFile(await readTranslationZip(zip)) }
}

describe('mock translation service', () => {
  beforeEach(() => vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] }))
  afterEach(() => vi.useRealTimers())

  it('exports a three-language file with gaps', async () => {
    const { file } = await exportFile('ProFleet')
    expect(file.languages).toEqual([1033, 1031, 1036])
    const counts = countStates(findGaps(file), [1031, 1036])
    expect(counts[1031].missing).toBeGreaterThan(0)
    expect(counts[1036].missing).toBeGreaterThan(counts[1031].missing)
    expect(counts[1031].untranslated).toBeGreaterThan(0)
    // Mock export roundtrips byte for byte as well.
    expect(serializeTranslationFile(file)).toBe(file.xml)
    const big = await exportFile('Default')
    expect(big.file.rows.length).toBeGreaterThan(2000)
  })

  it('simulates an import job and persists the labels across solutions', async () => {
    const { zip, file } = await exportFile('ProFleet')
    const gap = findGaps(file).find((g) => g.states[1036] === 'missing' && g.row.type === 'Attribute')!
    const { file: edited } = applyEdits(file, [{ rowKey: gap.row.key, lcid: 1036, value: 'Texte simulé' }])
    const b64 = await buildImportZip(zip, serializeTranslationFile(edited))

    await settle(svc.importTranslations(b64, 'job-1'))
    const running = await settle(svc.getImportJob('job-1', false))
    expect(importStatus(running!)).toBe('running')
    await vi.advanceTimersByTimeAsync(4000)
    const done = await settle(svc.getImportJob('job-1', true))
    expect(importStatus(done!)).toBe('succeeded')

    const { file: after } = await exportFile('Default')
    expect(after.rows.find((r) => r.objectId === gap.row.objectId && r.column === gap.row.column)!.original[1036]).toBe('Texte simulé')
  })

  it('fails the job when a text contains #fehler', async () => {
    // The fake clock restarts at real time; let the previous test's job finish first.
    await vi.advanceTimersByTimeAsync(60_000)
    const { zip, file } = await exportFile('ProContracts')
    const gap = findGaps(file).find((g) => g.states[1031] === 'missing')!
    const { file: edited } = applyEdits(file, [{ rowKey: gap.row.key, lcid: 1031, value: 'kaputt #fehler' }])
    await settle(svc.importTranslations(await buildImportZip(zip, serializeTranslationFile(edited)), 'job-2'))
    await vi.advanceTimersByTimeAsync(4000)
    const job = await settle(svc.getImportJob('job-2', true))
    expect(importStatus(job!)).toBe('failed')
    expect(job!.data).toContain('#fehler')
  })
})
