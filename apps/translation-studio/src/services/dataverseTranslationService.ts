import { ORG_URL } from '../config'
import type { AppRecord, ChoiceGroup, ComponentInfo, ImportJobState, SetupCheck, SolutionRef, TranslationFile, ViewRecord } from '../types/translation'
import { base64ToBytes } from '../utils/translationZip'
import { callAction, DataverseError, fetchXml, hasConnector, metadataGet, nativeActions, odata, pick, type Row } from './dataverseApi'
import type { TranslationService } from './translationService'
import { tableKey } from '../utils/designerTree'

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

/** Requests in flight at once: fast for big solutions, gentle on the connector's throttling. */
const PARALLEL = 4

/** `fn` over `items`, at most `limit` at a time; results in input order. */
async function pool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length)
  let next = 0
  const worker = async () => {
    while (next < items.length) {
      const i = next++
      out[i] = await fn(items[i])
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return out
}

/** One more try after a short pause (throttling, a dropped request). */
async function retry<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn()
  } catch {
    await new Promise((resolve) => window.setTimeout(resolve, 800))
    return fn()
  }
}

/** Chunks of a lookup, in parallel; a chunk that fails twice is logged and skipped, the others still count. */
async function lookup<T>(what: string, items: T[], size: number, fn: (part: T[]) => Promise<void>): Promise<void> {
  await pool(chunks(items, size), PARALLEL, async (part) => {
    try {
      await retry(() => fn(part))
    } catch (err) {
      console.warn(`[translation] ${what} not resolvable`, part.length, err)
    }
  })
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

  async resolveComponents(file: TranslationFile, onPartial?: (partial: Map<string, ComponentInfo>) => void) {
    const out = new Map<string, ComponentInfo>()
    // Form and view names: `name`/`description` rows; the id is a formid or a savedqueryid.
    // Looked up at the same time as the columns, forms and views in parallel (an id matches one of them).
    const named = [...new Set(file.rows.filter((r) => r.kind === 'form' && (r.column === 'name' || r.column === 'description') && guid(r.objectId)).map((r) => r.objectId))]
    const records = (set: string, entity: string, idAttr: string, attrs: string[], map: (r: Row) => ComponentInfo) =>
      lookup(`${entity} names`, named, 50, async (part) => {
        const rows = await fetchXml(
          set,
          `<fetch><entity name="${entity}"><attribute name="${idAttr}" />${attrs.map((a) => `<attribute name="${a}" />`).join('')}${inFilter(idAttr, part)}</entity></fetch>`,
        )
        for (const r of rows) out.set(str(r[idAttr]).toLowerCase(), map(r))
      })
    const formsAndViews = Promise.all([
      records('systemforms', 'systemform', 'formid', ['name', 'objecttypecode', 'type'], (r) => ({
        table: tableName(r.objecttypecode),
        name: str(r.name),
        kind: 'form',
        formType: num(r.type),
      })),
      records('savedqueries', 'savedquery', 'savedqueryid', ['name', 'returnedtypecode'], (r) => ({ table: tableName(r.returnedtypecode), name: str(r.name), kind: 'view' })),
    ])

    // Columns vs. choice values: both are `DisplayName`/`Description` rows under
    // a table. The attribute ids of those tables are the columns, the rest are
    // choice values — but only for tables whose attributes could be read.
    const columnRows = file.rows.filter((r) => r.kind === 'column' && guid(r.objectId))
    const attributes = new Map<string, { table: string; name: string }>()
    const readTables = new Set<string>()
    await lookup('column names', [...new Set(columnRows.map((r) => r.type))], 10, async (part) => {
      const rows = await odata('EntityDefinitions', 'LogicalName,DisplayName', part.map((n) => `LogicalName eq '${n}'`).join(' or '), 'Attributes($select=MetadataId,LogicalName)')
      for (const t of rows) {
        readTables.add(str(t.LogicalName))
        // The table's name for the explorer when the export doesn't carry it (only some of its parts are in the solution).
        const label = (t.DisplayName ?? null) as { LocalizedLabels?: Row[]; UserLocalizedLabel?: Row | null } | null
        const name = str(label?.LocalizedLabels?.find((l) => num(l.LanguageCode) === file.baseLanguage)?.Label ?? label?.UserLocalizedLabel?.Label)
        if (name) out.set(tableKey(str(t.LogicalName)), { table: str(t.LogicalName), name, kind: 'table' })
        for (const a of (t.Attributes as Row[] | undefined) ?? []) attributes.set(str(a.MetadataId).toLowerCase(), { table: str(t.LogicalName), name: str(a.LogicalName) })
      }
    })
    for (const r of columnRows) {
      const a = attributes.get(r.objectId)
      if (a) out.set(r.objectId, { ...a, kind: 'column' })
      else if (readTables.has(r.type)) out.set(r.objectId, { table: r.type, kind: 'choice' })
    }
    // Columns first: the table canvases are complete before the forms and views are known.
    onPartial?.(new Map(out))
    await formsAndViews
    return out
  },

  async getForms(ids) {
    const parts = await pool(chunks(ids.filter(guid), 20), PARALLEL, (part) =>
      retry(() =>
        fetchXml(
          'systemforms',
          '<fetch><entity name="systemform"><attribute name="formid" /><attribute name="name" /><attribute name="objecttypecode" />' +
            `<attribute name="type" /><attribute name="formxml" />${inFilter('formid', part)}</entity></fetch>`,
        ),
      ),
    )
    return parts.flat().map((r) => ({ id: str(r.formid).toLowerCase(), name: str(r.name), table: tableName(r.objecttypecode), type: num(r.type), formxml: str(r.formxml) }))
  },

  async getViews(ids) {
    const parts = await pool(chunks(ids.filter(guid), 25), PARALLEL, (part) =>
      retry(() =>
        fetchXml(
          'savedqueries',
          '<fetch><entity name="savedquery"><attribute name="savedqueryid" /><attribute name="name" /><attribute name="returnedtypecode" />' +
            `<attribute name="querytype" /><attribute name="layoutxml" /><attribute name="fetchxml" />${inFilter('savedqueryid', part)}</entity></fetch>`,
        ),
      ),
    )
    return parts.flat().map(
      (r): ViewRecord => ({
        id: str(r.savedqueryid).toLowerCase(),
        name: str(r.name),
        table: tableName(r.returnedtypecode),
        queryType: num(r.querytype),
        layoutxml: str(r.layoutxml),
        fetchxml: str(r.fetchxml),
      }),
    )
  },

  async getApps(appIds, sitemapIds) {
    // Chunked like the other lookups: a long id list must not hit the URL length limit of a GET.
    const appParts = await pool(chunks(appIds.filter(guid), 50), PARALLEL, (part) =>
      retry(() =>
        fetchXml(
          'appmodules',
          `<fetch><entity name="appmodule"><attribute name="appmoduleid" /><attribute name="appmoduleidunique" /><attribute name="name" /><attribute name="uniquename" />${inFilter('appmoduleid', part)}</entity></fetch>`,
        ),
      ),
    )
    const apps = appParts.flat()
    // The app's sitemap: its app module component of type 62 (objectid = sitemapid). The unique
    // names often differ (Sales Hub: app "msdynce_saleshub", sitemap "SalesHubSitemap").
    const uniques = apps.map((a) => str(a.appmoduleidunique).toLowerCase()).filter(guid)
    const linkParts = await pool(chunks(uniques, 50), PARALLEL, (part) =>
      retry(() =>
        fetchXml(
          'appmodulecomponents',
          `<fetch><entity name="appmodulecomponent"><attribute name="objectid" /><attribute name="appmoduleidunique" />` +
            `<filter><condition attribute="componenttype" operator="eq" value="62" /><condition attribute="appmoduleidunique" operator="in">${values(part)}</condition></filter></entity></fetch>`,
        ),
      ).catch((err: unknown) => {
        console.warn('[translation] app components not readable, matching sitemaps by name', err)
        return [] as Row[]
      }),
    )
    const linked = new Map<string, string>()
    for (const r of linkParts.flat()) {
      const app = str(r._appmoduleidunique_value ?? r.appmoduleidunique).toLowerCase()
      const map = str(r.objectid).toLowerCase()
      if (app && map && !linked.has(app)) linked.set(app, map)
    }
    const sitemapQuery = (condition: string) =>
      retry(() =>
        fetchXml('sitemaps', `<fetch><entity name="sitemap"><attribute name="sitemapid" /><attribute name="sitemapnameunique" /><attribute name="sitemapxml" /><filter>${condition}</filter></entity></fetch>`),
      )
    const uniqueNames = apps.map((a) => str(a.uniquename)).filter(Boolean)
    const mapIds = [...new Set([...sitemapIds.filter(guid).map((id) => id.toLowerCase()), ...linked.values()])]
    const mapParts = await pool(
      [
        ...chunks(mapIds, 50).map((part) => `<condition attribute="sitemapid" operator="in">${values(part)}</condition>`),
        ...chunks(uniqueNames, 50).map((part) => `<condition attribute="sitemapnameunique" operator="in">${values(part)}</condition>`),
      ],
      PARALLEL,
      sitemapQuery,
    )
    const maps = [...new Map(mapParts.flat().map((m) => [str(m.sitemapid).toLowerCase(), m])).values()]
    // By the component link, else by unique name (case-insensitive, as Dataverse compares names).
    const sitemapOf = (a: Row) => {
      const id = linked.get(str(a.appmoduleidunique).toLowerCase())
      return (id ? maps.find((m) => str(m.sitemapid).toLowerCase() === id) : undefined) ?? maps.find((m) => str(m.sitemapnameunique).toLowerCase() === str(a.uniquename).toLowerCase())
    }
    const out: AppRecord[] = apps.map((a) => {
      const m = sitemapOf(a)
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
    // The five metadata reads at once.
    const [booleans, ...results] = await Promise.all([metadataGet('BooleanOptions', table), ...lists.map((api) => metadataGet(api, table))])
    for (const attrs of results) {
      for (const a of attrs) {
        const set = ((a.OptionSet ?? a.GlobalOptionSet) as { Options?: Row[] } | null) ?? null
        const options = (set?.Options ?? []).map(option)
        if (options.length > 0) groups.push({ attribute: str(a.LogicalName), options })
      }
    }
    for (const a of booleans) {
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
