import { useCallback, useEffect, useState } from 'react'
import type {
  CollectionRef,
  EntityMeta,
  EntityRef,
  OdataRow,
} from '../types/odataBrowser'
import { odataBrowserService } from '../services/odataBrowserService'
import { OdataQueryError } from '../utils/odataErrors'
import { cellValue, lookupTarget, rawText } from '../utils/odataFormat'
import {
  FIELD_GROUP_LABELS,
  FIELD_GROUP_ORDER,
  fieldsOfGroup,
  filterRecordFields,
  groupRecordFields,
  recordId as idOf,
  recordLabel,
} from '../utils/odataRecord'

/**
 * One record, opened from the grid — the part that turns the browser from a
 * query tool into something you can actually navigate.
 *
 * Reads with no `$select` so it shows what is really stored, groups the keys
 * (Identity / Data / References / System) and makes every lookup clickable.
 * Drill-through pushes onto an internal trail, so following account → contact
 * → account can be walked back without re-running anything.
 *
 * Related records deliberately do **not** use `$expand`: picking a 1:N
 * relationship hands the parent id back to the workspace, which runs a normal
 * query against the child table (`_<attr>_value eq <id>`). That result pages,
 * filters and sorts like any other — an expanded collection would not.
 */
export interface RecordAddress {
  entitySet: string
  recordId: string
  /** Logical name, needed to resolve metadata for the panel. */
  logicalName: string
}

interface Props {
  envKey: string
  address: RecordAddress
  entities: EntityRef[]
  /** Metadata of the table currently in the grid, reused when it matches. */
  currentMeta: EntityMeta | null
  onClose: () => void
  /** Browse a child table filtered to this record. */
  onBrowseRelated: (
    childEntitySet: string,
    childLogicalName: string,
    filterColumn: string,
    parentId: string,
  ) => void
}

type Tab = 'fields' | 'related' | 'json'

export function OdataRecordPanel({
  envKey,
  address,
  entities,
  currentMeta,
  onClose,
  onBrowseRelated,
}: Props) {
  /** Drill-through trail; the last entry is what is on screen. */
  const [trail, setTrail] = useState<RecordAddress[]>([address])
  const here = trail[trail.length - 1]

  const [row, setRow] = useState<OdataRow | null>(null)
  const [meta, setMeta] = useState<EntityMeta | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hint, setHint] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('fields')

  const [collections, setCollections] = useState<CollectionRef[] | null>(null)
  const [collectionsLoading, setCollectionsLoading] = useState(false)
  const [copied, setCopied] = useState(false)
  /** Narrows the Fields tab. Cleared on every move — see `goTo`/`goBack`. */
  const [fieldSearch, setFieldSearch] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    setHint(null)
    setRow(null)
    try {
      const [loadedRow, loadedMeta] = await Promise.all([
        odataBrowserService.getRecord(envKey, here.entitySet, here.recordId),
        currentMeta?.ref.logicalName === here.logicalName
          ? Promise.resolve(currentMeta)
          : odataBrowserService.getEntityMeta(envKey, here.logicalName),
      ])
      setRow(loadedRow)
      setMeta(loadedMeta)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setHint(err instanceof OdataQueryError ? err.hint : null)
    } finally {
      setLoading(false)
    }
  }, [envKey, here.entitySet, here.recordId, here.logicalName, currentMeta])

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0)
    return () => window.clearTimeout(timer)
  }, [load])

  /**
   * Moving to another record invalidates the relationship list and the tab.
   * Done here rather than in an effect on `here`: the trail only ever changes
   * through these two paths, so this is both complete and effect-free (the
   * react-compiler rules forbid setState straight from an effect).
   */
  const goTo = (next: RecordAddress) => {
    setCollections(null)
    setTab('fields')
    setFieldSearch('')
    setTrail((prev) => [...prev, next])
  }

  const goBack = () => {
    setCollections(null)
    setTab('fields')
    setFieldSearch('')
    setTrail((prev) => prev.slice(0, -1))
  }

  const openRelated = () => {
    setTab('related')
    if (collections !== null || collectionsLoading) return
    setCollectionsLoading(true)
    odataBrowserService
      .listCollections(envKey, here.logicalName)
      .then(setCollections)
      .catch(() => setCollections([]))
      .finally(() => setCollectionsLoading(false))
  }

  /** Follow a lookup cell into the record it points at. */
  const drillInto = (key: string) => {
    if (!row) return
    const targetLogical = lookupTarget(row, key)
    const id = row[key]
    if (!targetLogical || typeof id !== 'string' || id === '') return
    const target = entities.find((e) => e.logicalName === targetLogical)
    if (!target) {
      setError(
        `The lookup points at “${targetLogical}”, which is not an addressable table in this environment.`,
      )
      return
    }
    goTo({
      entitySet: target.entitySet,
      recordId: id,
      logicalName: target.logicalName,
    })
  }

  const fields = row ? groupRecordFields(row, meta?.columns ?? [], meta?.ref ?? null) : []
  const visibleFields = row ? filterRecordFields(fields, row, fieldSearch) : fields
  const title = row ? recordLabel(row, meta?.ref ?? null) : here.recordId
  const thisId = row ? idOf(row, meta?.ref ?? null) : null

  const copyJson = () => {
    if (!row) return
    void navigator.clipboard?.writeText(JSON.stringify(row, null, 2))
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1600)
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal card modal--wide odb-record"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <div className="odb-record-title">
            <h2>{title}</h2>
            <code>
              {here.entitySet}({here.recordId})
            </code>
          </div>
          <button className="modal-close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        {trail.length > 1 && (
          <div className="odb-record-trail">
            <button
              className="btn btn--small"
              onClick={goBack}
            >
              ← Back
            </button>
            <span className="muted">
              {trail.map((step) => step.logicalName).join(' › ')}
            </span>
          </div>
        )}

        <div className="subtabs odb-record-tabs">
          <button
            className={`subtab ${tab === 'fields' ? 'subtab--active' : ''}`}
            onClick={() => setTab('fields')}
          >
            Fields
          </button>
          <button
            className={`subtab ${tab === 'related' ? 'subtab--active' : ''}`}
            onClick={openRelated}
          >
            Related
          </button>
          <button
            className={`subtab ${tab === 'json' ? 'subtab--active' : ''}`}
            onClick={() => setTab('json')}
          >
            JSON
          </button>
        </div>

        <div className="odb-record-body">
          {error && (
            <div className="state state--error">
              <div>{error}</div>
              {hint && <div className="odb-error-hint">💡 {hint}</div>}
            </div>
          )}
          {loading && <div className="state">Reading record…</div>}

          {!loading && row && tab === 'fields' && (
            <>
              <div className="odb-record-search">
                <input
                  className="search"
                  type="search"
                  placeholder="Search fields — display name, logical name or value…"
                  value={fieldSearch}
                  onChange={(e) => setFieldSearch(e.target.value)}
                  aria-label="Search the fields of this record"
                />
                {fieldSearch.trim() !== '' && (
                  <span className="muted">
                    {visibleFields.length} of {fields.length} fields
                  </span>
                )}
              </div>
              {fieldSearch.trim() !== '' && visibleFields.length === 0 && (
                <div className="state">
                  No field matches “{fieldSearch.trim()}” — neither by name nor
                  by value.
                </div>
              )}
              {FIELD_GROUP_ORDER.map((group) => {
                // Groups whose fields all filtered out render nothing, heading
                // included — that already falls out of the length check below.
                const groupFields = fieldsOfGroup(visibleFields, group)
                if (groupFields.length === 0) return null
                return (
                  <section key={group} className="odb-record-group">
                    <h3>{FIELD_GROUP_LABELS[group]}</h3>
                    <table className="ops-table odb-record-table">
                      <tbody>
                        {groupFields.map((field) => {
                          const cell = cellValue(row, field.key)
                          const target = lookupTarget(row, field.key)
                          return (
                            <tr key={field.key}>
                              <td className="odb-record-label">
                                {field.label}
                                <code>{field.key}</code>
                              </td>
                              <td>
                                {field.empty ? (
                                  <span className="muted">—</span>
                                ) : target ? (
                                  <button
                                    className="odb-record-link"
                                    onClick={() => drillInto(field.key)}
                                    title={`Open this ${target} record`}
                                  >
                                    {cell.text}
                                    <code>{target}</code>
                                    <span aria-hidden="true"> ↗</span>
                                  </button>
                                ) : (
                                  <span
                                    title={
                                      cell.formatted ? rawText(cell.raw) : undefined
                                    }
                                  >
                                    {cell.text}
                                  </span>
                                )}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </section>
                )
              })}
            </>
          )}

          {!loading && tab === 'related' && (
            <>
              {collectionsLoading && <div className="state">Reading relationships…</div>}
              {collections !== null && collections.length === 0 && (
                <div className="state">
                  No child relationships reported for this table.
                </div>
              )}
              {collections !== null && collections.length > 0 && !thisId && (
                <div className="state state--error">
                  The record's primary id is missing — cannot filter children by it.
                </div>
              )}
              {collections !== null && thisId && collections.length > 0 && (
                <table className="ops-table">
                  <thead>
                    <tr>
                      <th>Child table</th>
                      <th>Via column</th>
                      <th>Relationship</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {collections.map((rel) => {
                      const child = entities.find(
                        (e) => e.logicalName === rel.targetEntity,
                      )
                      return (
                        <tr key={rel.schemaName}>
                          <td>
                            {child?.displayName ?? rel.targetEntity}
                            <code className="odb-record-sub">
                              {rel.targetEntity}
                            </code>
                          </td>
                          <td className="trace-type">
                            _{rel.referencingAttribute}_value
                          </td>
                          <td className="trace-type">{rel.schemaName}</td>
                          <td className="nowrap">
                            <button
                              className="btn btn--small"
                              disabled={!child}
                              title={
                                child
                                  ? 'Query this child table filtered to the record'
                                  : 'The child table is not addressable over OData'
                              }
                              onClick={() =>
                                child &&
                                onBrowseRelated(
                                  child.entitySet,
                                  child.logicalName,
                                  `_${rel.referencingAttribute}_value`,
                                  thisId,
                                )
                              }
                            >
                              Browse →
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </>
          )}

          {!loading && row && tab === 'json' && (
            <>
              <div className="odb-record-jsonbar">
                <button className="btn btn--small" onClick={copyJson}>
                  {copied ? '✓ Copied' : 'Copy JSON'}
                </button>
              </div>
              <pre className="odb-value-pre">{JSON.stringify(row, null, 2)}</pre>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
