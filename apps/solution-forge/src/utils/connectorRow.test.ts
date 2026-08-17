import { describe, expect, it } from 'vitest'
import { connectorCellValue, connectorColumns } from './connectorRow'

describe('connectorCellValue', () => {
  // Shape the Web API returns for `<attribute name="inv_subject"/>` on a
  // lookup: the value lives under `_inv_subject_value`, never under the name
  // the FetchXML asked for.
  const ROW = {
    inv_keyword_txt: 'Buchungsbestaetigung',
    inv_ranking_int: 17,
    _inv_subject_value: 'c0ffee00-0000-0000-0000-000000000001',
    '_inv_subject_value@OData.Community.Display.V1.FormattedValue': 'Buchung',
    inv_topickeywordmappingtype_opt: 902120001,
    '_inv_owner_value': 'dead0000-0000-0000-0000-000000000002',
  }

  it('resolves a lookup asked for by its plain name', () => {
    expect(connectorCellValue(ROW, 'inv_subject')).toBe('Buchung')
  })

  it('falls back to the raw lookup value when there is no display text', () => {
    expect(connectorCellValue(ROW, 'inv_owner')).toBe(
      'dead0000-0000-0000-0000-000000000002',
    )
  })

  it('still reads plain columns', () => {
    expect(connectorCellValue(ROW, 'inv_keyword_txt')).toBe('Buchungsbestaetigung')
    expect(connectorCellValue(ROW, 'inv_ranking_int')).toBe('17')
  })

  it('renders a zero rather than swallowing it as empty', () => {
    expect(connectorCellValue({ statecode: 0 }, 'statecode')).toBe('0')
  })

  it('is empty for an unknown column', () => {
    expect(connectorCellValue(ROW, 'inv_nothing')).toBe('')
  })
})

describe('connectorColumns', () => {
  it('folds lookup keys back to their bare name and drops annotations', () => {
    expect(
      connectorColumns({
        inv_keyword_txt: 'x',
        _inv_subject_value: 'guid',
        '_inv_subject_value@OData.Community.Display.V1.FormattedValue': 'Buchung',
        '_inv_subject_value@Microsoft.Dynamics.CRM.lookuplogicalname': 'inv_topic',
      }),
    ).toEqual(['inv_keyword_txt', 'inv_subject'])
  })

  it('keeps a column that is present in both spellings only once', () => {
    expect(
      connectorColumns({ inv_subject: 'a', _inv_subject_value: 'b' }),
    ).toEqual(['inv_subject'])
  })
})
