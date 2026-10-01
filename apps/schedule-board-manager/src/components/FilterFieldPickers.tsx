import { useCallback, useState } from 'react'
import type { TableRef } from '../types/board'
import { getBoardService, type BoardService } from '../services/boardService'
import { useLoad } from '../hooks/useLoad'
import type { NewControl } from '../utils/filterLayout'
import { KNOWN_KEYS, NON_FILTER_KEYS, analyzeQuery, describeUsage, type KeyUsage } from '../utils/queryAnalysis'

/**
 * Pickers for the filter layout editor: table (datalist over EntityDefinitions,
 * free text still allowed), choice column of a table, and the "add field"
 * form with suggestions derived from the Retrieve Resources Query.
 */

export const TABLES_DATALIST_ID = 'sbm-tables'

export function TablesDatalist({ tables }: { tables: TableRef[] }) {
  return (
    <datalist id={TABLES_DATALIST_ID}>
      {tables.map((t) => (
        <option key={t.logicalName} value={t.logicalName}>
          {t.displayName}
        </option>
      ))}
    </datalist>
  )
}

export function TableInput({
  value,
  tables,
  onChange,
  ariaLabel,
  placeholder,
}: {
  value: string
  tables: TableRef[]
  onChange: (v: string) => void
  ariaLabel: string
  placeholder?: string
}) {
  const match = tables.find((t) => t.logicalName === value.trim().toLowerCase())
  return (
    <div className="picker">
      <input
        className={`input input--mono${value && tables.length > 0 && !match ? ' input--warn' : ''}`}
        list={TABLES_DATALIST_ID}
        value={value}
        aria-label={ariaLabel}
        placeholder={placeholder ?? 'Tabelle wählen …'}
        onChange={(e) => onChange(e.target.value)}
      />
      {value ? (
        <span className={`picker__hint${match || tables.length === 0 ? '' : ' warn'}`}>
          {match ? match.displayName : tables.length > 0 ? 'Tabelle nicht gefunden' : ''}
        </span>
      ) : null}
    </div>
  )
}

/** Choice columns (incl. multi-select) of `entity`; keeps an unknown current value selectable. */
export function ColumnSelect({
  entity,
  value,
  onChange,
  ariaLabel,
}: {
  entity: string
  value: string
  onChange: (v: string) => void
  ariaLabel: string
}) {
  const table = entity.trim().toLowerCase()
  const loadInfo = useCallback((svc: BoardService) => svc.getTableInfo(table), [table])
  const { data: info, error, loading } = useLoad(table || null, loadInfo)
  const columns = (info?.columns ?? []).filter((c) => c.kind === 'picklist')
  const known = columns.some((c) => c.logicalName === value)
  return (
    <div className="picker">
      <select className="input input--mono" value={value} aria-label={ariaLabel} onChange={(e) => onChange(e.target.value)}>
        <option value="">{loading ? 'lade Spalten …' : 'Auswahlspalte wählen …'}</option>
        {value && !known ? <option value={value}>{value}</option> : null}
        {columns.map((c) => (
          <option key={c.logicalName} value={c.logicalName}>
            {c.displayName} ({c.logicalName})
          </option>
        ))}
      </select>
      {error ? <span className="picker__hint warn">Metadaten nicht lesbar</span> : null}
      {info === null && table ? <span className="picker__hint warn">Tabelle unbekannt</span> : null}
    </div>
  )
}

interface Suggestion {
  key: string
  usage: KeyUsage
  text: string
}

/**
 * Turns a query key into a control proposal: known product keys from the
 * template table; otherwise from where the query uses the key — a primary
 * key means rows of that table, a lookup column means rows of its target, a
 * choice column means its values.
 */
async function resolveSuggestion(svc: BoardService, s: Suggestion): Promise<NewControl> {
  const known = KNOWN_KEYS[s.key]
  if (known) {
    return { kind: known.kind, key: s.key, labelId: known.label, entity: known.entity ?? '', attribute: known.attribute ?? '', multi: true }
  }
  const { entity, attribute } = s.usage
  const base: NewControl = { kind: 'lookup', key: s.key, labelId: s.key, entity: '', attribute: '', multi: true }
  if (!entity || !attribute) return base
  if (attribute === `${entity}id`) {
    const info = await svc.getTableInfo(entity).catch(() => null)
    return { ...base, entity, labelId: info?.displayName ?? s.key }
  }
  const info = await svc.getTableInfo(entity).catch(() => null)
  const col = info?.columns.find((c) => c.logicalName === attribute)
  if (col?.kind === 'lookup' && col.target) return { ...base, entity: col.target, labelId: col.displayName }
  if (col?.kind === 'picklist') return { ...base, kind: 'optionset', entity, attribute, labelId: col.displayName, multi: s.usage.operator !== 'eq' }
  return base
}

const EMPTY: NewControl = { kind: 'lookup', key: '', labelId: '', entity: '', attribute: '', multi: true }
const LOGICAL_NAME = /^[a-z][a-z0-9_]*$/

export function AddControlForm({
  existingKeys,
  queryXml,
  tables,
  onAdd,
}: {
  existingKeys: string[]
  /** null when the board has no readable Retrieve Resources Query. */
  queryXml: string | null
  tables: TableRef[]
  onAdd: (spec: NewControl) => void
}) {
  const [spec, setSpec] = useState<NewControl>(EMPTY)
  const [resolving, setResolving] = useState<string | null>(null)

  const usages = analyzeQuery(queryXml)
  const suggestions: Suggestion[] = [...usages.values()]
    .filter((u) => !NON_FILTER_KEYS.has(u.key) && !existingKeys.includes(u.key))
    .map((u) => ({ key: u.key, usage: u, text: KNOWN_KEYS[u.key]?.meaning ?? describeUsage(u) }))
    .sort((a, b) => a.key.localeCompare(b.key))

  const key = spec.key.trim()
  const needsTable = spec.kind !== 'characteristic'
  const problems = [
    !key ? 'Key fehlt' : existingKeys.includes(key) ? 'Key ist schon im Layout' : null,
    !spec.labelId.trim() ? 'Beschriftung fehlt' : null,
    needsTable && !LOGICAL_NAME.test(spec.entity.trim()) ? 'Tabelle wählen' : null,
    spec.kind === 'optionset' && !LOGICAL_NAME.test((spec.attribute ?? '').trim()) ? 'Spalte wählen' : null,
  ].filter((p): p is string => p !== null)
  const unmatched = queryXml !== null && key !== '' && !usages.has(key)

  const take = async (s: Suggestion) => {
    setResolving(s.key)
    try {
      setSpec(await resolveSuggestion(await getBoardService(), s))
    } finally {
      setResolving(null)
    }
  }

  const preview =
    spec.kind === 'characteristic'
      ? `<control type="characteristic" key="${key}" label-id="${spec.labelId}" />`
      : `<control type="combo" source="${spec.kind === 'lookup' ? 'entity' : 'optionset'}" key="${key}" label-id="${spec.labelId}" entity="${spec.entity}"${
          spec.kind === 'optionset' ? ` attribute="${spec.attribute ?? ''}"` : ''
        } multi="${spec.multi}" />`

  return (
    <fieldset className="subcard add-control">
      <legend>Feld hinzufügen</legend>

      {queryXml !== null ? (
        <div className="suggestions">
          <h4>Filter, die die Ressourcenabfrage auswertet, aber noch im Layout fehlen</h4>
          {suggestions.length === 0 ? (
            <p className="muted small">Alle Filter-Keys der Abfrage sind schon im Layout.</p>
          ) : (
            <ul className="suggestion-list">
              {suggestions.map((s) => (
                <li key={s.key} className={spec.key === s.key ? 'is-active' : ''}>
                  <code>{s.key}</code>
                  <span className="muted small">{s.text}</span>
                  <button className="btn btn--small" onClick={() => void take(s)} disabled={resolving !== null}>
                    {resolving === s.key ? '…' : 'Übernehmen'}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <p className="muted small">Keine Ressourcenabfrage lesbar — Vorschläge entfallen.</p>
      )}

      <div className="add-control__grid">
        <label className="form-row">
          <span>Art</span>
          <select className="input" value={spec.kind} onChange={(e) => setSpec({ ...spec, kind: e.target.value as NewControl['kind'] })}>
            <option value="lookup">Datensätze</option>
            <option value="optionset">Auswahlwerte</option>
            <option value="characteristic">Merkmale</option>
          </select>
        </label>
        <label className="form-row">
          <span>Key</span>
          <input
            className={`input input--mono${unmatched ? ' input--warn' : ''}`}
            list="sbm-query-keys"
            value={spec.key}
            placeholder="z. B. Site"
            onChange={(e) => setSpec({ ...spec, key: e.target.value })}
          />
          <datalist id="sbm-query-keys">
            {suggestions.map((s) => (
              <option key={s.key} value={s.key}>
                {s.text}
              </option>
            ))}
          </datalist>
        </label>
        <label className="form-row">
          <span>Beschriftung</span>
          <input className="input" value={spec.labelId} placeholder="z. B. Ressourcen" onChange={(e) => setSpec({ ...spec, labelId: e.target.value })} />
        </label>
        {needsTable ? (
          <div className="form-row">
            <span>Tabelle</span>
            <TableInput
              value={spec.entity}
              tables={tables}
              ariaLabel="Tabelle des neuen Felds"
              placeholder="z. B. bookableresource"
              onChange={(v) => setSpec({ ...spec, entity: v, attribute: '' })}
            />
          </div>
        ) : null}
        {spec.kind === 'optionset' ? (
          <div className="form-row">
            <span>Spalte</span>
            <ColumnSelect
              entity={spec.entity}
              value={spec.attribute ?? ''}
              ariaLabel="Spalte des neuen Felds"
              onChange={(v) => setSpec({ ...spec, attribute: v })}
            />
          </div>
        ) : null}
      </div>

      {unmatched ? (
        <p className="field__hint warn">
          Die Ressourcenabfrage wertet „{key}“ nicht aus. Das Feld erscheint im Filterbereich, filtert aber erst, wenn die
          Abfrage um <code>$input/{key}</code> erweitert ist.
        </p>
      ) : null}
      {key ? <pre className="code-block code-block--inline">{preview}</pre> : null}

      <div className="toolbar">
        {needsTable ? (
          <label className="form-check">
            <input type="checkbox" checked={spec.multi} onChange={(e) => setSpec({ ...spec, multi: e.target.checked })} />
            <span>Mehrfachauswahl</span>
          </label>
        ) : null}
        <button
          className="btn btn--primary btn--small"
          disabled={problems.length > 0}
          title={problems.join(' · ')}
          onClick={() => {
            onAdd({ ...spec, key, labelId: spec.labelId.trim(), entity: spec.entity.trim().toLowerCase(), attribute: spec.attribute?.trim() })
            setSpec(EMPTY)
          }}
        >
          Hinzufügen
        </button>
        {problems.length > 0 && (spec.key || spec.labelId || spec.entity) ? <span className="muted small">{problems.join(' · ')}</span> : null}
      </div>
    </fieldset>
  )
}
