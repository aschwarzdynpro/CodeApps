import { describe, expect, it } from 'vitest'
import { importStatus, parseImportLog } from './importLog'

describe('importLog', () => {
  it('derives the status from progress and completion', () => {
    expect(importStatus({ progress: 100, completedOn: '2026-10-03T10:00:00Z' })).toBe('succeeded')
    expect(importStatus({ progress: 40, completedOn: '2026-10-03T10:00:00Z' })).toBe('failed')
    expect(importStatus({ progress: 40, completedOn: null })).toBe('running')
  })

  it('reads the translation import log', () => {
    const ok =
      '<importtranslations><status>Succeeded</status><errordetails><errorcode>0</errorcode><worksheet>Localized Labels</worksheet><rownumber>33622</rownumber></errordetails></importtranslations>'
    expect(importStatus({ progress: 100, completedOn: 'x', data: ok })).toBe('succeeded')
    expect(parseImportLog(ok)).toEqual([])
    const failed = ok.replace('Succeeded', 'Failed').replace('<errorcode>0<', '<errorcode>-2147220891<').replace('33622', '512')
    // The log's verdict wins over the progress heuristic.
    expect(importStatus({ progress: 100, completedOn: 'x', data: failed })).toBe('failed')
    expect(parseImportLog(failed)).toEqual([{ level: 'failure', text: 'Fehlercode 0x80040265', context: 'Localized Labels, Zeile 512' }])
  })

  it('collects failures and warnings with context', () => {
    const xml =
      '<importexportxml><entities><entity name="pro_vehicle"><result result="success"/>' +
      '<attribute id="{b2}" result="failure" errorcode="0x80040203" errortext="Label too long &amp; rejected"/>' +
      '<result result="warning" errortext="Language 1040 not provisioned"/></entity></entities></importexportxml>'
    expect(parseImportLog(xml)).toEqual([
      { level: 'failure', text: 'Label too long & rejected', context: 'attribute {b2}' },
      { level: 'warning', text: 'Language 1040 not provisioned', context: 'entity pro_vehicle' },
    ])
    expect(parseImportLog(null)).toEqual([])
  })
})
