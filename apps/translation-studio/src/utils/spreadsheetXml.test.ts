import { describe, expect, it } from 'vitest'
import { decodeXml, encodeXmlText, scanWorkbook } from './spreadsheetXml'

describe('spreadsheetXml', () => {
  it('encodes and decodes text', () => {
    const text = 'A & B <c> "d" \'e\'\nf'
    expect(encodeXmlText(text)).toBe('A &amp; B &lt;c&gt; "d" \'e\'&#10;f')
    expect(decodeXml(encodeXmlText(text))).toBe(text)
    expect(decodeXml('&#x263A;&#65;&unknown;')).toBe('☺A&unknown;')
    expect(encodeXmlText('a\u0001b')).toBe('ab')
  })

  it('handles prefixed elements, merged cells, rich text and CDATA', () => {
    const xml =
      '<ss:Workbook xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"><ss:Worksheet ss:Name="S"><ss:Table>' +
      '<ss:Row><ss:Cell ss:MergeAcross="1"><ss:Data ss:Type="String">a</ss:Data></ss:Cell><ss:Cell><ss:Data ss:Type="String"><B>b</B>c</ss:Data></ss:Cell>' +
      '<ss:Cell><ss:Data ss:Type="String"><![CDATA[<x>]]></ss:Data></ss:Cell></ss:Row>' +
      '</ss:Table></ss:Worksheet></ss:Workbook>'
    const wb = scanWorkbook(xml)
    const cells = wb.sheets[0].rows[0].cells
    expect(cells.map((c) => [c.col, c.lastCol, c.text])).toEqual([
      [1, 2, 'a'],
      [3, 3, 'bc'],
      [4, 4, '<x>'],
    ])
    expect(cells[1].data!.rich).toBe(true)
    expect(wb.names).toEqual({ cell: 'ss:Cell', data: 'ss:Data' })
  })

  it('rejects unclosed workbooks', () => {
    expect(() => scanWorkbook('<Workbook><Worksheet ss:Name="x"><Table><Row>')).toThrow(/unvollständig/)
  })
})
