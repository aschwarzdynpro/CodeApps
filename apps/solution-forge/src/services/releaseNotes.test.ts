import { describe, expect, it } from 'vitest'
import { buildReleaseNotes } from './releaseNotes'
import type { MergeRun, WorkingSolution, WorkItemInfo } from '../types/solution'

const sol = (over: Partial<WorkingSolution>): WorkingSolution =>
  ({
    id: over.id ?? 'x',
    recordId: over.id ?? 'x',
    uniqueName: 'u',
    title: 't',
    kind: 'feature',
    devOpsId: null,
    version: '',
    isManaged: false,
    createdOn: '2026-07-01T00:00:00Z',
    modifiedOn: '2026-07-01T00:00:00Z',
    publisher: null,
    ...over,
  }) as unknown as WorkingSolution

const release = sol({
  id: 'r1',
  uniqueName: 'deploy_sprint12',
  title: 'Sprint 12',
  kind: 'deployment',
  version: '1.2.0',
})
const feature = sol({
  id: 's6',
  uniqueName: 'feature_6',
  title: 'Lead Scanner',
  kind: 'feature',
  devOpsId: '6',
})
const bug = sol({
  id: 's7',
  uniqueName: 'bug_7',
  title: 'Currency bug',
  kind: 'bug',
  devOpsId: '7',
})

const run = {
  id: 'm1',
  createdOn: '2026-07-02T00:00:00Z',
  createdBy: 'Andy',
  added: 2,
  skipped: 0,
  errors: 0,
  sources: ['Lead Scanner', 'Currency bug'],
  components: [],
} as unknown as MergeRun

const wi = (over: Partial<WorkItemInfo>): WorkItemInfo => ({
  id: '0',
  type: 'Task',
  title: 't',
  state: 'New',
  assignedTo: null,
  description: '',
  url: null,
  ...over,
})

const at = new Date('2026-07-07T00:00:00Z')

describe('buildReleaseNotes — DevOps enrichment', () => {
  it('groups included sources by work-item type with title/state/assignee', () => {
    const wiMap = new Map<string, WorkItemInfo>([
      ['6', wi({ id: '6', type: 'User Story', title: 'Lead Scanner einrichten', state: 'New', assignedTo: 'Andy Schwarz' })],
      ['7', wi({ id: '7', type: 'Bug', title: 'Wrong currency', state: 'Resolved' })],
    ])
    const { markdown } = buildReleaseNotes(
      release,
      [run],
      [release, feature, bug],
      at,
      null,
      wiMap,
    )
    expect(markdown).toContain('### User Story (1)')
    expect(markdown).toContain('Lead Scanner einrichten — _New_ · Andy Schwarz')
    expect(markdown).toContain('### Bug (1)')
    // No assignee → no trailing " · <name>".
    expect(markdown).toContain('Wrong currency — _Resolved_')
    expect(markdown).not.toContain('Wrong currency — _Resolved_ ·')
  })

  it('falls back to plain title/#id lines when no work items are provided', () => {
    const { markdown } = buildReleaseNotes(release, [run], [release, feature, bug], at)
    expect(markdown).not.toContain('### User Story')
    expect(markdown).toContain('- Currency bug ([#7]')
    expect(markdown).toContain('- Lead Scanner ([#6]')
  })
})
