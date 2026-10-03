// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { columnBasis, layoutIds, parseFormXml } from './formXml'
import { createMockState, mockForm } from '../services/mockData'

const XML = `<form>
  <tabs>
    <tab name="general" id="{3A26DB5E-8089-4167-A992-4286140D6BDF}" showlabel="true">
      <labels><label description="Summary" languagecode="1033" /><label description="Zusammenfassung" languagecode="1031" /></labels>
      <columns>
        <column width="33%"><sections>
          <section name="info" id="{40a0bdec-f927-4bb6-9743-fb37d4377577}" showlabel="false" columns="11">
            <labels><label description="Customer card" languagecode="1033" /></labels>
            <rows>
              <row>
                <cell id="{2583764f-ebc0-4d3a-a833-78ed30e1de82}" showlabel="true"><labels><label description="Owner" languagecode="1033" /></labels><control id="ownerid" classid="{270BD3DB-D9AF-4782-9025-509E298DEC0A}" datafieldname="ownerid" /></cell>
                <cell id="{11111111-0000-4000-8000-000000000001}" colspan="2"><labels /></cell>
              </row>
            </rows>
          </section>
        </sections></column>
        <column width="67%"><sections>
          <section name="cases" id="{22222222-0000-4000-8000-000000000001}" visible="false">
            <labels><label description="Recent Cases" languagecode="1033" /></labels>
            <rows><row><cell id="{33333333-0000-4000-8000-000000000001}"><labels><label description="Cases" languagecode="1033" /></labels><control id="Cases" classid="{E7A81278-8635-4d9e-8D4D-59480B391C5B}" /></cell></row></rows>
          </section>
        </sections></column>
      </columns>
    </tab>
  </tabs>
  <header id="{44444444-0000-4000-8000-000000000001}" columns="111">
    <rows><row><cell id="{55555555-0000-4000-8000-000000000001}"><labels><label description="Status" languagecode="1033" /></labels><control id="header_statecode" classid="{3EF39988-22BB-4f0b-BBBE-64B5A3748AEE}" datafieldname="statecode" /></cell></row></rows>
  </header>
</form>`

describe('parseFormXml', () => {
  const layout = parseFormXml(XML)

  it('reads tabs, columns, sections and cells with normalized ids and labels', () => {
    expect(layout.tabs).toHaveLength(1)
    const tab = layout.tabs[0]
    expect(tab).toMatchObject({ id: '3a26db5e-8089-4167-a992-4286140d6bdf', name: 'general', showLabel: true, visible: true })
    expect(tab.labels).toEqual({ 1033: 'Summary', 1031: 'Zusammenfassung' })
    expect(tab.columns.map((c) => c.width)).toEqual(['33%', '67%'])
    const info = tab.columns[0].sections[0]
    expect(info).toMatchObject({ id: '40a0bdec-f927-4bb6-9743-fb37d4377577', showLabel: false, columns: 2 })
    const [owner, spacer] = info.rows[0]
    expect(owner).toMatchObject({ id: '2583764f-ebc0-4d3a-a833-78ed30e1de82', field: 'ownerid', control: 'field', labels: { 1033: 'Owner' } })
    expect(spacer).toMatchObject({ control: 'spacer', colspan: 2, labels: {} })
  })

  it('recognizes subgrids, hidden sections and header fields', () => {
    const cases = layout.tabs[0].columns[1].sections[0]
    expect(cases.visible).toBe(false)
    expect(cases.rows[0][0]).toMatchObject({ control: 'subgrid', controlId: 'Cases', field: '' })
    expect(layout.header).toHaveLength(1)
    expect(layout.header[0]).toMatchObject({ field: 'statecode', control: 'field' })
    expect(layoutIds(layout).cells).toHaveLength(4)
  })

  it('rejects broken XML', () => {
    expect(() => parseFormXml('<form><tabs>')).toThrow(/formxml/)
  })

  it('column widths', () => {
    expect(columnBasis('33%', 3)).toBe('33%')
    expect(columnBasis('', 2)).toBe('50%')
  })

  it('the mock renders a parseable form whose element ids are label rows', () => {
    const state = createMockState()
    const form = mockForm(state, state.forms[0].id)!
    const parsed = parseFormXml(form.formxml)
    const ids = layoutIds(parsed)
    const labelIds = new Set(state.labels.filter((l) => l.column === 'displayname').map((l) => l.objectId))
    expect(parsed.tabs.length).toBeGreaterThan(1)
    expect([...ids.tabs, ...ids.sections, ...ids.cells.map((c) => c.id)].every((id) => labelIds.has(id))).toBe(true)
  })
})
