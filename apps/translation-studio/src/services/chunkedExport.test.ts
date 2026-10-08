import { describe, expect, it, vi } from 'vitest'
import { deleteOneByOne, exportInParts, planChunks, withTimeout, type ChunkComponent, type ChunkDeps } from './chunkedExport'
import { cellTexts } from '../utils/mergeTranslations'

const cell = (t: string) => `<Cell><Data ss:Type="String">${t}</Data></Cell>`
const sheet = (name: string, rows: string[][]) => `<Worksheet ss:Name="${name}"><Table>${rows.map((r) => `<Row>${r.map(cell).join('')}</Row>`).join('')}</Table></Worksheet>`
const file = (solution: string, labels: string[][]) =>
  '<Workbook>' +
  sheet('Information', [['Solution Name:', solution]]) +
  sheet('Display Strings', [['Entity name', 'Display String Key', '1033', '1031']]) +
  sheet('Localized Labels', [['Entity name', 'Object ID', 'Object Column Name', '1033', '1031'], ['Solution', solution, 'friendlyname', solution, ''], ...labels]) +
  '</Workbook>'
const labelRows = (xml: string) => (xml.slice(xml.indexOf('"Localized Labels"')).match(/<Row\b[\s\S]*?<\/Row>/g) ?? []).slice(1).map(cellTexts)

const t = (id: string): ChunkComponent => ({ type: 1, id })

function fakeDeps(roots: ChunkComponent[]) {
  const solutions = new Map<string, ChunkComponent[]>()
  const ids = new Map<string, string>()
  const tableNames = new Map(roots.filter((c) => c.type === 1).map((c) => [c.id, `tbl_${c.id}`]))
  tableNames.set('dragged', 'tbl_dragged')
  let deadlocks = 0
  const deps: ChunkDeps = {
    solution: async () => ({ id: 'sol-1', publisherId: 'pub-1', friendlyName: 'Big' }),
    rootComponents: async () => roots,
    tables: async () => tableNames,
    createSolution: vi.fn(async (name: string) => {
      solutions.set(name, [])
      ids.set(`id-${name}`, name)
      return `id-${name}`
    }),
    addComponent: vi.fn(async (name: string, c: ChunkComponent, bare: boolean) => {
      // A custom API only goes in bare; one deadlock on the way.
      if (c.type === 10027 && !bare) throw new Error('0x8004f087 Error while creating the SolutionComponent record. Type 91')
      if (c.id === 'deadlock' && deadlocks++ === 0) throw new Error('Sql Number: 1205')
      solutions.get(name)!.push(c)
    }),
    exportXml: vi.fn(async (name: string) => {
      const items = solutions.get(name)!
      const rows = items.flatMap((c) => (c.type === 1 ? [[`tbl_${c.id}`, c.id, 'DisplayName', `T ${c.id}`, `DE ${c.id}`]] : c.type === 10027 ? [['CustomAPI', c.id, 'displayname', 'Api', 'Api DE']] : [['Workflow Categories', c.id, 'name', 'Flow', '']]))
      // Processes drag a table that isn't in the solution.
      if (items.some((c) => c.type === 29)) rows.push(['tbl_dragged', 'd', 'DisplayName', 'Dragged', ''])
      return file(name, rows)
    }),
    deleteSolution: vi.fn(async () => {}),
    staleSolutions: async () => ['old-1'],
    labels: vi.fn(async (set: string, id: string, column: string): Promise<Record<number, string>> =>
      set === 'solutions' ? { 1033: 'Big', 1031: 'Groß' } : id === 'a1' && column === 'buttonlabeltext' ? { 1033: 'Sync', 1031: 'Abgleich' } : {},
    ),
  }
  return { deps, solutions }
}

describe('planChunks', () => {
  it('splits tables, groups the other label carriers, reads app actions directly', () => {
    const roots = [...Array.from({ length: 45 }, (_, i) => t(`t${i}`)), { type: 29, id: 'w' }, { type: 9, id: 'o' }, { type: 20, id: 'role' }, { type: 10205, id: 'a' }]
    const plan = planChunks(roots, 20)
    expect(plan.parts.map((p) => p.length)).toEqual([20, 20, 5, 1, 1])
    expect(plan.parts.flat().some((c) => c.type === 20)).toBe(false)
    expect(plan.actions).toEqual([{ type: 10205, id: 'a' }])
  })
})

describe('exportInParts', () => {
  it('exports the parts, merges them like one export and cleans up', async () => {
    const roots = [t('a'), t('b'), t('deadlock'), { type: 29, id: 'w1' }, { type: 10027, id: 'api' }, { type: 10205, id: 'a1' }, { type: 10205, id: 'a2' }]
    const { deps } = fakeDeps(roots)
    const steps: string[] = []
    const res = await exportInParts('Big', deps, { sleep: async () => {}, newRunId: () => 'r', onProgress: (p) => steps.push(p.step) })
    await res.cleanup
    // Tables in one part, the custom API group, processes.
    expect(res.parts).toBe(3)
    expect(labelRows(res.xml)).toEqual([
      ['tbl_a', 'a', 'DisplayName', 'T a', 'DE a'],
      ['tbl_b', 'b', 'DisplayName', 'T b', 'DE b'],
      ['tbl_deadlock', 'deadlock', 'DisplayName', 'T deadlock', 'DE deadlock'],
      ['CustomAPI', 'api', 'displayname', 'Api', 'Api DE'],
      ['Workflow Categories', 'w1', 'name', 'Flow', ''],
      ['appaction', 'a1', 'buttonlabeltext', 'Sync', 'Abgleich'],
      ['Solution', 'sol-1', 'friendlyname', 'Big', 'Groß'],
    ])
    expect(res.xml).toContain('<Data ss:Type="String">Big</Data>')
    expect(res.warnings).toEqual([])
    // Tables bare, the custom API bare after its first refusal.
    expect((deps.addComponent as ReturnType<typeof vi.fn>).mock.calls.filter((c) => c[1].type === 1).every((c) => c[2] === true)).toBe(true)
    // Every temporary solution and the left-over of an earlier run deleted, one after another.
    expect((deps.deleteSolution as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0])).toEqual(['id-tsexport_r_0', 'id-tsexport_r_1', 'id-tsexport_r_2', 'old-1'])
    expect(steps).toEqual(expect.arrayContaining(['prepare', 'add', 'export', 'merge']))
  })

  it('cleans up when an export fails', async () => {
    const { deps } = fakeDeps([t('a')])
    deps.exportXml = vi.fn(async () => Promise.reject(new Error('Invocation of API timed out')))
    await expect(exportInParts('Big', deps, { sleep: async () => {}, newRunId: () => 'r' })).rejects.toThrow(/timed out/)
    await vi.waitFor(() => expect((deps.deleteSolution as ReturnType<typeof vi.fn>).mock.calls.length).toBe(2))
  })
})

describe('cleanup helpers', () => {
  it('deletes one after another, retries while another uninstall runs, counts failures', async () => {
    const order: string[] = []
    let busy = 1
    const remove = vi.fn(async (id: string) => {
      if (id === 'b' && busy-- > 0) throw new Error('429 Cannot start another [Uninstall]')
      if (id === 'c') throw new Error('0x80040220 no privilege')
      order.push(id)
    })
    const steps: string[] = []
    const res = await deleteOneByOne(['a', 'b', 'c'], remove, { sleep: async () => {}, onProgress: (d, t) => steps.push(`${d}/${t}`) })
    expect(res).toEqual({ deleted: 2, failed: 1 })
    expect(order).toEqual(['a', 'b'])
    expect(steps).toEqual(['0/3', '1/3', '2/3', '3/3'])
  })

  it('ends a call that never answers, so the run reaches its cleanup', async () => {
    vi.useFakeTimers()
    const never = new Promise<string>(() => {})
    const check = expect(withTimeout(never, 90_000, 'Komponente hinzufügen')).rejects.toThrow(/keine Antwort nach 90 s/)
    await vi.advanceTimersByTimeAsync(90_000)
    await check
    vi.useRealTimers()
  })
})
