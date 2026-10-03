import { describe, expect, it } from 'vitest'
import { importStatus, parseImportLog } from './importLog'

describe('importLog', () => {
  it('derives the status from progress and completion', () => {
    expect(importStatus({ progress: 100, completedOn: '2026-10-03T10:00:00Z' })).toBe('succeeded')
    expect(importStatus({ progress: 40, completedOn: '2026-10-03T10:00:00Z' })).toBe('failed')
    expect(importStatus({ progress: 40, completedOn: null })).toBe('running')
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
