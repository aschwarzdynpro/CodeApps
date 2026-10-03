import { describe, expect, it } from 'vitest'
import JSZip from 'jszip'
import fixture from '../fixtures/CrmTranslations.sample.xml?raw'
import { base64ToBytes, buildImportZip, bytesToBase64, createTranslationZip, readTranslationZip } from './translationZip'

describe('translation zip', () => {
  it('reads the xml and rebuilds the zip with only the xml replaced', async () => {
    const exported = await createTranslationZip(fixture)
    expect(await readTranslationZip(exported)).toBe(fixture)
    const b64 = await buildImportZip(exported, fixture.replace('Fahrzeug<', 'Kfz<'))
    const zip = await JSZip.loadAsync(base64ToBytes(b64))
    expect(Object.keys(zip.files).sort()).toEqual(['CrmTranslations.xml', '[Content_Types].xml'])
    expect(await zip.file('CrmTranslations.xml')!.async('string')).toContain('Kfz<')
  })

  it('keeps a byte order mark and non-ASCII text', async () => {
    const xml = '﻿' + fixture
    expect(await readTranslationZip(await createTranslationZip(xml))).toBe(xml)
  })

  it('complains about a zip without translation file', async () => {
    const zip = new JSZip()
    zip.file('other.xml', '<x/>')
    await expect(readTranslationZip(await zip.generateAsync({ type: 'uint8array' }))).rejects.toThrow(/CrmTranslations/)
  })

  it('converts base64 both ways', () => {
    const bytes = new Uint8Array(70000).map((_, i) => i % 256)
    expect(base64ToBytes(bytesToBase64(bytes))).toEqual(bytes)
  })
})
