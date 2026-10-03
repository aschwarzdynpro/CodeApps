import JSZip from 'jszip'

/**
 * The exported zip holds `CrmTranslations.xml` and `[Content_Types].xml` at
 * the root; the import expects the same zip "just as it was exported"
 * (Microsoft Learn). So the import zip is the export zip with only
 * `CrmTranslations.xml` replaced.
 */

export const TRANSLATION_XML = 'CrmTranslations.xml'

function findEntry(zip: JSZip): JSZip.JSZipObject {
  const entry = zip.file(TRANSLATION_XML) ?? zip.file(/(^|\/)crmtranslations\.xml$/i)[0]
  if (!entry) throw new Error(`Die Zip-Datei enthält keine ${TRANSLATION_XML}.`)
  return entry
}

export async function readTranslationZip(bytes: Uint8Array): Promise<string> {
  const zip = await JSZip.loadAsync(bytes)
  return findEntry(zip).async('string')
}

/** Export zip with `xml` in place of its translation file; base64 for the action parameter. */
export async function buildImportZip(exportZip: Uint8Array, xml: string): Promise<string> {
  const zip = await JSZip.loadAsync(exportZip)
  const entry = findEntry(zip)
  zip.file(entry.name, xml)
  return zip.generateAsync({ type: 'base64', compression: 'DEFLATE' })
}

/** Zip from scratch (mock export). */
export async function createTranslationZip(xml: string): Promise<Uint8Array> {
  const zip = new JSZip()
  zip.file(
    '[Content_Types].xml',
    '<?xml version="1.0" encoding="utf-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/octet-stream" /></Types>',
  )
  zip.file(TRANSLATION_XML, xml)
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' })
}

export function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64.replace(/\s+/g, ''))
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

export function bytesToBase64(bytes: Uint8Array): string {
  let bin = ''
  const CHUNK = 0x8000
  for (let i = 0; i < bytes.length; i += CHUNK) bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  return btoa(bin)
}
