import { ORG_URL } from '../config'
import type { ComponentInfo, ImportJobState, SetupCheck, SolutionRef, TranslationFile } from '../types/translation'
import { base64ToBytes } from '../utils/translationZip'
import { callAction, DataverseError, fetchXml, hasConnector, nativeActions, odata, pick, type Row } from './dataverseApi'
import type { TranslationService } from './translationService'

/**
 * Dataverse implementation. Reads go through the Dataverse connector (user
 * connection) as FetchXML/OData; the three actions through `callAction`
 * (native generated service first, then the connector).
 */

const str = (v: unknown): string => (typeof v === 'string' ? v : v === null || v === undefined ? '' : String(v))
const num = (v: unknown): number => (typeof v === 'number' ? v : typeof v === 'string' && v !== '' ? Number(v) : 0)
const esc = (v: string) => v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;')
const guid = (v: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)

function chunks<T>(items: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

function toJob(r: Row): ImportJobState {
  return {
    id: str(r.importjobid),
    progress: num(r.progress),
    startedOn: str(r.startedon) || null,
    completedOn: str(r.completedon) || null,
    data: str(r.data) || null,
  }
}

export const ACTIONS = ['ExportTranslation', 'ImportTranslation', 'PublishAllXml']

export const dataverseTranslationService: TranslationService = {
  source: 'dataverse',
  orgUrl: ORG_URL,

  async listSolutions() {
    const rows = await fetchXml(
      'solutions',
      '<fetch><entity name="solution">' +
        '<attribute name="solutionid" /><attribute name="uniquename" /><attribute name="friendlyname" />' +
        '<attribute name="version" /><attribute name="ismanaged" />' +
        '<filter><condition attribute="isvisible" operator="eq" value="1" /></filter>' +
        '<link-entity name="publisher" from="publisherid" to="publisherid" link-type="outer" alias="pub">' +
        '<attribute name="friendlyname" /></link-entity>' +
        '<order attribute="friendlyname" /></entity></fetch>',
    )
    return rows.map(
      (r): SolutionRef => ({
        id: str(r.solutionid),
        uniqueName: str(r.uniquename),
        friendlyName: str(r.friendlyname) || str(r.uniquename),
        version: str(r.version),
        isManaged: r.ismanaged === true || r.ismanaged === 'true',
        publisher: str(r['pub.friendlyname']),
      }),
    )
  },

  async baseLanguage() {
    try {
      const rows = await odata('organizations', 'languagecode')
      const code = num(rows[0]?.languagecode)
      return code > 0 ? code : null
    } catch (err) {
      console.warn('[translation] organization.languagecode not readable', err)
      return null
    }
  },

  async exportTranslations(solutionUniqueName) {
    const { data, route } = await callAction({ name: 'ExportTranslation', params: [['SolutionName', solutionUniqueName]], boundTo: 'solutions' })
    const file = pick(data, 'ExportTranslationFile')
    if (typeof file !== 'string' || file === '') throw new DataverseError('ExportTranslation lieferte keine Datei (ExportTranslationFile fehlt).')
    return { zip: base64ToBytes(file), route }
  },

  async resolveComponents(file: TranslationFile) {
    const out = new Map<string, ComponentInfo>()
    const idsOf = (pred: (type: string) => boolean) => [...new Set(file.rows.filter((r) => pred(r.type.toLowerCase()) && guid(r.objectId)).map((r) => r.objectId))]
    try {
      // Tables: all entity definitions once (a few thousand rows, small columns).
      const tables = await odata('EntityDefinitions', 'MetadataId,LogicalName')
      const tableById = new Map(tables.map((t) => [str(t.MetadataId).toLowerCase(), str(t.LogicalName)]))
      const fileTables = new Set<string>()
      for (const id of idsOf((t) => t === 'entity')) {
        const name = tableById.get(id)
        if (name) {
          out.set(id, { table: name, name })
          fileTables.add(name)
        }
      }
      // Columns: attributes of the tables in the file, ten tables per request.
      const attrIds = new Set(idsOf((t) => t === 'attribute'))
      for (const part of chunks([...fileTables], 10)) {
        if (attrIds.size === 0) break
        const rows = await odata(
          'EntityDefinitions',
          'LogicalName',
          part.map((n) => `LogicalName eq '${n}'`).join(' or '),
          'Attributes($select=MetadataId,LogicalName)',
        )
        for (const t of rows) {
          for (const a of (t.Attributes as Row[] | undefined) ?? []) {
            const id = str(a.MetadataId).toLowerCase()
            if (attrIds.has(id)) out.set(id, { table: str(t.LogicalName), name: str(a.LogicalName) })
          }
        }
      }
    } catch (err) {
      console.warn('[translation] table/column names not resolvable', err)
    }
    const records = async (set: string, entity: string, idAttr: string, tableAttr: string, ids: string[]) => {
      try {
        for (const part of chunks(ids, 50)) {
          const values = part.map((id) => `<value>${esc(id)}</value>`).join('')
          const rows = await fetchXml(
            set,
            `<fetch><entity name="${entity}"><attribute name="${idAttr}" /><attribute name="name" /><attribute name="${tableAttr}" />` +
              `<filter><condition attribute="${idAttr}" operator="in">${values}</condition></filter></entity></fetch>`,
          )
          for (const r of rows) out.set(str(r[idAttr]).toLowerCase(), { table: str(r[tableAttr]), name: str(r.name) })
        }
      } catch (err) {
        console.warn(`[translation] ${entity} names not resolvable`, err)
      }
    }
    await records('systemforms', 'systemform', 'formid', 'objecttypecode', idsOf((t) => t.includes('form')))
    await records('savedqueries', 'savedquery', 'savedqueryid', 'returnedtypecode', idsOf((t) => t.includes('savedquery')))
    return out
  },

  async importTranslations(zipBase64, importJobId) {
    await callAction({ name: 'ImportTranslation', params: [['TranslationFile', zipBase64], ['ImportJobId', importJobId]], sideEffects: true })
  },

  async getImportJob(id, withLog) {
    const rows = await fetchXml(
      'importjobs',
      `<fetch top="1"><entity name="importjob"><attribute name="importjobid" /><attribute name="progress" />` +
        `<attribute name="startedon" /><attribute name="completedon" />${withLog ? '<attribute name="data" />' : ''}` +
        `<filter><condition attribute="importjobid" operator="eq" value="${esc(id)}" /></filter></entity></fetch>`,
    )
    return rows[0] ? toJob(rows[0]) : null
  },

  async runningImports() {
    const since = new Date(Date.now() - 3 * 3600_000).toISOString()
    const rows = await fetchXml(
      'importjobs',
      `<fetch top="10"><entity name="importjob"><attribute name="importjobid" /><attribute name="progress" />` +
        `<attribute name="startedon" /><attribute name="completedon" />` +
        `<filter><condition attribute="completedon" operator="null" /><condition attribute="startedon" operator="ge" value="${since}" /></filter>` +
        `</entity></fetch>`,
    )
    return rows.map(toJob)
  },

  async publishAll() {
    await callAction({ name: 'PublishAllXml', params: [], sideEffects: true })
  },

  async checkSetup() {
    const checks: SetupCheck[] = []
    checks.push({
      id: 'org',
      label: 'Org-URL gesetzt',
      ok: ORG_URL !== '',
      detail: ORG_URL || 'VITE_ORG_URL in .env fehlt — beim Build setzen.',
    })
    checks.push({
      id: 'connector',
      label: 'Dataverse-Konnektor eingebunden',
      ok: hasConnector(),
      detail: hasConnector() ? 'shared_commondataserviceforapps (Benutzer-Connection)' : 'pac code add-data-source -a shared_commondataserviceforapps -c <connection-id>',
    })
    const native = nativeActions(ACTIONS)
    const missing = ACTIONS.filter((a) => !native[a])
    checks.push({
      id: 'native',
      label: 'Native Aktionen eingebunden',
      ok: missing.length === 0 ? true : null,
      detail:
        missing.length === 0
          ? ACTIONS.join(', ')
          : `Fehlt: ${missing.join(', ')} — ohne sie versucht die App den Konnektor („Perform an unbound action“). ExportTranslation ist an „solutions“ gebunden und braucht vermutlich den nativen Weg.`,
    })
    const probe = async (id: string, label: string, fn: () => Promise<string>) => {
      try {
        checks.push({ id, label, ok: true, detail: await fn() })
      } catch (err) {
        checks.push({ id, label, ok: false, detail: err instanceof Error ? err.message : String(err) })
      }
    }
    if (hasConnector() && ORG_URL) {
      await probe('solutions', 'Solutions lesbar', async () => {
        const list = await dataverseTranslationService.listSolutions()
        return `${list.filter((s) => !s.isManaged).length} unmanaged, ${list.filter((s) => s.isManaged).length} managed sichtbar`
      })
      await probe('base', 'Basissprache gelesen', async () => {
        const code = await dataverseTranslationService.baseLanguage()
        if (!code) throw new Error('organization.languagecode nicht lesbar — die App nimmt die erste Sprachspalte der Datei.')
        return String(code)
      })
      await probe('importjob', 'Importjobs lesbar', async () => {
        await fetchXml('importjobs', '<fetch top="1"><entity name="importjob"><attribute name="importjobid" /></entity></fetch>')
        return 'importjob (Fortschritt des Imports)'
      })
    }
    return checks
  },
}
