import { ORG_URL } from '../config'
import type { AppRecord, ChoiceGroup, ComponentInfo, FormRecord, ImportJobState, SetupCheck, SolutionRef, TranslationFile, ViewRecord } from '../types/translation'
import { base64ToBytes } from '../utils/translationZip'
import { callAction, DataverseError, fetchXml, hasConnector, metadataGet, nativeActions, odata, pick, type Row } from './dataverseApi'
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
const values = (ids: string[]) => ids.map((id) => `<value>${esc(id)}</value>`).join('')
const inFilter = (attr: string, ids: string[]) => `<filter><condition attribute="${attr}" operator="in">${values(ids)}</condition></filter>`
/** `objecttypecode`/`returnedtypecode` as logical name; dashboards carry "none". */
const tableName = (v: unknown) => {
  const s = str(v)
  return s === 'none' ? '' : s
}

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
    // Columns vs. choice values: both are `DisplayName`/`Description` rows under
    // a table. The attribute ids of those tables are the columns, the rest are
    // choice values — but only for tables whose attributes could be read.
    const columnRows = file.rows.filter((r) => r.kind === 'column' && guid(r.objectId))
    const attributes = new Map<string, { table: string; name: string }>()
    const readTables = new Set<string>()
    for (const part of chunks([...new Set(columnRows.map((r) => r.type))], 10)) {
      try {
        const rows = await odata('EntityDefinitions', 'LogicalName', part.map((n) => `LogicalName eq '${n}'`).join(' or '), 'Attributes($select=MetadataId,LogicalName)')
        for (const t of rows) {
          readTables.add(str(t.LogicalName))
          for (const a of (t.Attributes as Row[] | undefined) ?? []) attributes.set(str(a.MetadataId).toLowerCase(), { table: str(t.LogicalName), name: str(a.LogicalName) })
        }
      } catch (err) {
        console.warn('[translation] column names not resolvable', part, err)
      }
    }
    for (const r of columnRows) {
      const a = attributes.get(r.objectId)
      if (a) out.set(r.objectId, { ...a, kind: 'column' })
      else if (readTables.has(r.type)) out.set(r.objectId, { table: r.type, kind: 'choice' })
    }

    // Form and view names: `name`/`description` rows; the id is a formid or a savedqueryid.
    const named = [...new Set(file.rows.filter((r) => r.kind === 'form' && (r.column === 'name' || r.column === 'description') && guid(r.objectId)).map((r) => r.objectId))]
    const records = async (set: string, entity: string, idAttr: string, attrs: string[], ids: string[], map: (r: Row) => ComponentInfo) => {
      try {
        for (const part of chunks(ids, 50)) {
          const values = part.map((id) => `<value>${esc(id)}</value>`).join('')
          const rows = await fetchXml(
            set,
            `<fetch><entity name="${entity}"><attribute name="${idAttr}" />${attrs.map((a) => `<attribute name="${a}" />`).join('')}` +
              `<filter><condition attribute="${idAttr}" operator="in">${values}</condition></filter></entity></fetch>`,
          )
          for (const r of rows) out.set(str(r[idAttr]).toLowerCase(), map(r))
        }
      } catch (err) {
        console.warn(`[translation] ${entity} names not resolvable`, err)
      }
    }
    await records('systemforms', 'systemform', 'formid', ['name', 'objecttypecode', 'type'], named, (r) => ({
      table: tableName(r.objecttypecode),
      name: str(r.name),
      kind: 'form',
      formType: num(r.type),
    }))
    await records(
      'savedqueries',
      'savedquery',
      'savedqueryid',
      ['name', 'returnedtypecode'],
      named.filter((id) => !out.has(id)),
      (r) => ({ table: tableName(r.returnedtypecode), name: str(r.name), kind: 'view' }),
    )
    return out
  },

  async getForms(ids) {
    const out: FormRecord[] = []
    for (const part of chunks(ids.filter(guid), 20)) {
      const rows = await fetchXml(
        'systemforms',
        '<fetch><entity name="systemform"><attribute name="formid" /><attribute name="name" /><attribute name="objecttypecode" />' +
          `<attribute name="type" /><attribute name="formxml" />${inFilter('formid', part)}</entity></fetch>`,
      )
      for (const r of rows) out.push({ id: str(r.formid).toLowerCase(), name: str(r.name), table: tableName(r.objecttypecode), type: num(r.type), formxml: str(r.formxml) })
    }
    return out
  },

  async getViews(ids) {
    const out: ViewRecord[] = []
    for (const part of chunks(ids.filter(guid), 25)) {
      const rows = await fetchXml(
        'savedqueries',
        '<fetch><entity name="savedquery"><attribute name="savedqueryid" /><attribute name="name" /><attribute name="returnedtypecode" />' +
          `<attribute name="querytype" /><attribute name="layoutxml" /><attribute name="fetchxml" />${inFilter('savedqueryid', part)}</entity></fetch>`,
      )
      for (const r of rows)
        out.push({
          id: str(r.savedqueryid).toLowerCase(),
          name: str(r.name),
          table: tableName(r.returnedtypecode),
          queryType: num(r.querytype),
          layoutxml: str(r.layoutxml),
          fetchxml: str(r.fetchxml),
        })
    }
    return out
  },

  async getApps(appIds, sitemapIds) {
    const apps = appIds.some(guid)
      ? await fetchXml(
          'appmodules',
          `<fetch><entity name="appmodule"><attribute name="appmoduleid" /><attribute name="name" /><attribute name="uniquename" />${inFilter('appmoduleid', appIds.filter(guid))}</entity></fetch>`,
        )
      : []
    const uniqueNames = apps.map((a) => str(a.uniquename)).filter(Boolean)
    const conditions = [
      sitemapIds.some(guid) ? `<condition attribute="sitemapid" operator="in">${values(sitemapIds.filter(guid))}</condition>` : '',
      uniqueNames.length > 0 ? `<condition attribute="sitemapnameunique" operator="in">${values(uniqueNames)}</condition>` : '',
    ].join('')
    const maps = conditions
      ? await fetchXml(
          'sitemaps',
          `<fetch><entity name="sitemap"><attribute name="sitemapid" /><attribute name="sitemapnameunique" /><attribute name="sitemapxml" /><filter type="or">${conditions}</filter></entity></fetch>`,
        )
      : []
    const sitemapOf = (unique: string) => maps.find((m) => str(m.sitemapnameunique) === unique)
    const out: AppRecord[] = apps.map((a) => {
      const m = sitemapOf(str(a.uniquename))
      return { id: str(a.appmoduleid).toLowerCase(), name: str(a.name), uniqueName: str(a.uniquename), sitemap: m ? { id: str(m.sitemapid).toLowerCase(), xml: str(m.sitemapxml) } : null }
    })
    for (const m of maps) {
      if (out.some((a) => a.sitemap?.id === str(m.sitemapid).toLowerCase())) continue
      out.push({ id: '', name: str(m.sitemapnameunique), uniqueName: str(m.sitemapnameunique), sitemap: { id: str(m.sitemapid).toLowerCase(), xml: str(m.sitemapxml) } })
    }
    return out
  },

  async getChoiceGroups(table, baseLanguage) {
    const label = (l: unknown): string => {
      const labels = ((l as { LocalizedLabels?: Row[] } | null)?.LocalizedLabels ?? []) as Row[]
      return str(labels.find((x) => num(x.LanguageCode) === baseLanguage)?.Label ?? labels[0]?.Label)
    }
    const option = (o: Row) => ({ value: num(o.Value), metadataId: str(o.MetadataId).toLowerCase(), label: label(o.Label) })
    const groups: ChoiceGroup[] = []
    const lists = ['PicklistOptions', 'MultiSelectOptions', 'StateOptions', 'StatusOptions'] as const
    for (const api of lists) {
      for (const a of await metadataGet(api, table)) {
        const set = ((a.OptionSet ?? a.GlobalOptionSet) as { Options?: Row[] } | null) ?? null
        const options = (set?.Options ?? []).map(option)
        if (options.length > 0) groups.push({ attribute: str(a.LogicalName), options })
      }
    }
    for (const a of await metadataGet('BooleanOptions', table)) {
      const set = (a.OptionSet ?? {}) as { TrueOption?: Row; FalseOption?: Row }
      const options = [set.FalseOption, set.TrueOption].filter((o): o is Row => !!o).map(option)
      if (options.length > 0) groups.push({ attribute: str(a.LogicalName), options })
    }
    return groups
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
