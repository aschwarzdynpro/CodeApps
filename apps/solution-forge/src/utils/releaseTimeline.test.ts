import { describe, expect, it } from 'vitest'
import { buildReleaseTimeline } from './releaseTimeline'
import type { MergeRun, ReleaseNote } from '../types/solution'
import type { ImportJobSummary } from '../types/importHistory'

const merge = (id: string, createdOn: string, over: Partial<MergeRun> = {}): MergeRun => ({
  id,
  createdOn,
  createdBy: 'Andy',
  added: 5,
  skipped: 1,
  errors: 0,
  sources: ['feature_1', 'bug_2'],
  components: [],
  ...over,
})

const note = (id: string, createdOn: string): ReleaseNote => ({
  id,
  releaseRecordId: 'r1',
  name: 'Notes',
  version: '1.2.0.0',
  markdown: '',
  text: '',
  summary: '2 solutions · 7 components',
  createdOn,
  createdBy: 'Marie',
})

const job = (id: string, startedOn: string, status: ImportJobSummary['status']): ImportJobSummary => ({
  id,
  solutionName: 'deploy_q3',
  startedOn,
  completedOn: startedOn,
  progress: status === 'succeeded' ? 100 : 35,
  status,
  createdBy: 'Niels',
  publisher: 'Schulz Systemtechnik GmbH',
  context: 'Update',
})

describe('buildReleaseTimeline', () => {
  it('merges all three sources sorted newest first', () => {
    const events = buildReleaseTimeline(
      [merge('m1', '2026-07-01T10:00:00Z')],
      [note('n1', '2026-07-02T10:00:00Z')],
      [{ job: job('j1', '2026-07-03T10:00:00Z', 'succeeded'), envKey: 'uat', envLabel: 'UAT' }],
    )
    expect(events.map((e) => e.kind)).toEqual(['import', 'note', 'merge'])
  })

  it('maps merge counts, note version and import env/status', () => {
    const events = buildReleaseTimeline(
      [merge('m1', '2026-07-01T10:00:00Z')],
      [note('n1', '2026-07-02T10:00:00Z')],
      [{ job: job('j1', '2026-07-03T10:00:00Z', 'failed'), envKey: 'prod', envLabel: 'PROD' }],
    )
    const m = events.find((e) => e.kind === 'merge')!
    expect(m.title).toBe('Merged 5 components')
    expect(m.subtitle).toBe('from feature_1, bug_2')
    expect(m.added).toBe(5)
    const n = events.find((e) => e.kind === 'note')!
    expect(n.title).toContain('v1.2.0.0')
    const i = events.find((e) => e.kind === 'import')!
    expect(i.title).toBe('Import into PROD failed')
    expect(i.status).toBe('failed')
    expect(i.envLabel).toBe('PROD')
  })

  it('truncates long source lists and drops undated events', () => {
    const events = buildReleaseTimeline(
      [
        merge('m1', '2026-07-01T10:00:00Z', {
          sources: ['a', 'b', 'c', 'd', 'e'],
        }),
        merge('m2', ''),
      ],
      [],
      [],
    )
    expect(events).toHaveLength(1)
    expect(events[0].subtitle).toBe('from a, b, c +2 more')
  })
})
