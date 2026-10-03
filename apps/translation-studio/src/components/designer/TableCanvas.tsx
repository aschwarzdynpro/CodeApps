import { useMemo, useState } from 'react'
import { Input, Switch } from '@fluentui/react-components'
import { SearchRegular } from '@fluentui/react-icons'
import type { ChoiceGroup, LabelRow } from '../../types/translation'
import { cellState, kindOf } from '../../utils/gaps'
import { columnRow, countRows } from '../../utils/labelIndex'
import { S } from '../../strings'
import { useDesigner, type LabelRef } from './context'
import { LabelText } from './LabelText'
import { tableNameRow } from './refs'
import { CanvasHeader } from './CanvasHeader'

interface TableCanvasProps {
  table: string
  label: string
  /** Every label row of the table. */
  rows: LabelRow[]
  /** Options per choice column; null while loading or when the metadata isn't readable. */
  choices: ChoiceGroup[] | null
}

interface ColumnEntry {
  id: string
  logical: string
  display?: LabelRow
  description?: LabelRow
}

interface ChoiceEntry {
  display?: LabelRow
  description?: LabelRow
}

/** Table profile: names, columns (display name + description) and choice values grouped by their column. */
export function TableCanvas({ table, label, rows, choices }: TableCanvasProps) {
  const d = useDesigner()
  const [search, setSearch] = useState('')
  const [gapsOnly, setGapsOnly] = useState(false)

  const model = useMemo(() => {
    const columns = new Map<string, ColumnEntry>()
    const choiceRows = new Map<string, ChoiceEntry>()
    const other: LabelRow[] = []
    for (const r of rows) {
      const kind = kindOf(r, d.components)
      if (kind === 'column') {
        const c = columns.get(r.objectId) ?? { id: r.objectId, logical: d.components.get(r.objectId)?.name ?? '' }
        if (r.column === 'DisplayName') c.display = r
        else if (r.column === 'Description') c.description = r
        columns.set(r.objectId, c)
      } else if (kind === 'choice') {
        const c = choiceRows.get(r.objectId) ?? {}
        if (r.column === 'DisplayName') c.display = r
        else c.description = r
        choiceRows.set(r.objectId, c)
      } else if (kind === 'other') other.push(r)
      // Names the lookup couldn't place (charts, forms of a failed lookup): shown here so no counted row is unreachable.
      else if (!d.resolving && (r.column === 'name' || r.column === 'description') && !d.components.get(r.objectId)?.kind) other.push(r)
    }
    // Group choice values under their column: by option MetadataId, else by unique base text.
    const groups: { attribute: string; entries: ChoiceEntry[] }[] = []
    const used = new Set<string>()
    if (choices) {
      const byText = new Map<string, string[]>()
      for (const [id, c] of choiceRows) {
        const t = c.display?.values[d.baseLanguage] ?? ''
        byText.set(t, [...(byText.get(t) ?? []), id])
      }
      for (const g of choices) {
        const entries: ChoiceEntry[] = []
        for (const o of g.options) {
          let id = o.metadataId && choiceRows.has(o.metadataId) ? o.metadataId : ''
          if (!id) {
            const candidates = (byText.get(o.label) ?? []).filter((x) => !used.has(x))
            if (candidates.length === 1) id = candidates[0]
          }
          if (id && !used.has(id)) {
            used.add(id)
            entries.push(choiceRows.get(id)!)
          }
        }
        if (entries.length > 0) groups.push({ attribute: g.attribute, entries })
      }
    }
    const rest = [...choiceRows].filter(([id]) => !used.has(id)).map(([, c]) => c)
    const sortKey = (c: ColumnEntry) => (c.display?.values[d.baseLanguage] || c.logical).toLowerCase()
    return { columns: [...columns.values()].sort((a, b) => sortKey(a).localeCompare(sortKey(b))), groups, rest, other }
  }, [rows, choices, d.components, d.baseLanguage, d.resolving])

  const names = {
    one: tableNameRow(d.index, table, 'LocalizedName'),
    many: tableNameRow(d.index, table, 'LocalizedCollectionName'),
    description: tableNameRow(d.index, table, 'Description'),
  }
  const ref = (row: LabelRow | undefined, role: string, context = label): LabelRef => ({ row: row ?? null, fallback: {}, role, context })
  const isGap = (r?: LabelRow) => {
    if (!r) return false
    const s = cellState(r, d.lcid, d.baseLanguage, d.acknowledged)
    return s === 'missing' || s === 'untranslated' || s === 'changed'
  }
  const words = search.toLowerCase().split(/\s+/).filter(Boolean)
  const matches = (c: ColumnEntry) => {
    if (gapsOnly && !isGap(c.display) && !isGap(c.description)) return false
    if (words.length === 0) return true
    const hay = [c.logical, ...Object.values(c.display?.values ?? {}), ...Object.values(c.description?.values ?? {})].join(' ').toLowerCase()
    return words.every((w) => hay.includes(w))
  }
  const visibleColumns = model.columns.filter(matches)

  const allRows = useMemo(() => {
    const all: (LabelRow | undefined)[] = [names.one, names.many, names.description]
    for (const c of model.columns) all.push(c.display, c.description)
    for (const g of model.groups) for (const e of g.entries) all.push(e.display, e.description)
    for (const e of model.rest) all.push(e.display, e.description)
    all.push(...model.other)
    return all
  }, [model, names.one, names.many, names.description])
  const counts = useMemo(() => countRows(allRows, d.lcid, d.baseLanguage, d.acknowledged), [allRows, d.lcid, d.baseLanguage, d.acknowledged])

  const choiceList = (entries: ChoiceEntry[], context: string) => (
    <div className="tc__choices">
      {entries.map((e, i) => (
        <span key={e.display?.key ?? e.description?.key ?? i} className="tc__choice">
          <LabelText labelRef={ref(e.display, S.designer.roles.choice, context)} />
          {e.description ? (
            <span className="tc__choicedesc small">
              <LabelText labelRef={ref(e.description, S.designer.roles.choiceDescription, context)} />
            </span>
          ) : null}
        </span>
      ))}
    </div>
  )

  return (
    <div className="canvas" data-canvas="1">
      <CanvasHeader kicker={`${S.designer.kinds.table} · ${table}`} title={<LabelText labelRef={ref(names.one, S.designer.roles.tableOne)} className="lt--title" empty={table} echo />} counts={counts} rows={allRows} />
      <div className="tc">
        <section className="tc__card">
          <h4 className="tc__cardtitle">{S.designer.tableNames}</h4>
          <div className="tc__names">
            <span className="tc__key">{S.designer.roles.tableOne}</span>
            <LabelText labelRef={ref(names.one, S.designer.roles.tableOne)} empty={table} />
            <span className="tc__key">{S.designer.roles.tableMany}</span>
            <LabelText labelRef={ref(names.many, S.designer.roles.tableMany)} empty="—" />
            <span className="tc__key">{S.designer.roles.tableDescription}</span>
            <LabelText labelRef={ref(names.description, S.designer.roles.tableDescription)} empty="—" />
          </div>
        </section>

        <section className="tc__card">
          <div className="tc__cardhead">
            <h4 className="tc__cardtitle">
              {S.designer.columns} <span className="muted small">{model.columns.length}</span>
            </h4>
            <Input size="small" contentBefore={<SearchRegular />} placeholder={S.designer.searchColumns} value={search} onChange={(e) => setSearch(e.target.value)} aria-label={S.designer.searchColumns} />
            <Switch label={S.designer.gapsOnly} checked={gapsOnly} onChange={(_, v) => setGapsOnly(v.checked)} />
          </div>
          {visibleColumns.length === 0 ? (
            <div className="muted small tc__none">{model.columns.length === 0 ? S.designer.noColumnsInFile : S.designer.noMatch}</div>
          ) : (
            <div className="tc__columns" role="list">
              {visibleColumns.map((c) => {
                const context = `${label} › ${c.logical || c.display?.values[d.baseLanguage] || c.id}`
                return (
                  <div key={c.id} className="tc__column" role="listitem">
                    <div className="tc__colname">
                      <LabelText labelRef={ref(c.display, S.designer.roles.columnName, context)} empty={c.logical} />
                      {c.logical ? <span className="tc__logical">{c.logical}</span> : null}
                    </div>
                    <div className="tc__coldesc small">
                      {c.description ? <LabelText labelRef={ref(c.description, S.designer.roles.columnDescription, context)} /> : <span className="muted">—</span>}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </section>

        {model.groups.length > 0 || model.rest.length > 0 ? (
          <section className="tc__card">
            <h4 className="tc__cardtitle">{S.designer.choices}</h4>
            {choices === null ? <p className="muted small">{S.designer.choicesUngrouped}</p> : null}
            {model.groups.map((g) => {
              const column = columnRow(d.index, table, g.attribute)
              return (
                <div key={g.attribute} className="tc__group">
                  <div className="tc__grouphead">
                    <LabelText labelRef={ref(column, S.designer.roles.columnName, `${label} › ${g.attribute}`)} empty={g.attribute} />
                    <span className="tc__logical">{g.attribute}</span>
                  </div>
                  {choiceList(g.entries, `${label} › ${g.attribute}`)}
                </div>
              )
            })}
            {model.rest.length > 0 ? (
              <div className="tc__group">
                {model.groups.length > 0 ? <div className="tc__grouphead muted">{S.designer.moreChoices}</div> : null}
                {choiceList(model.rest, label)}
              </div>
            ) : null}
          </section>
        ) : null}

        {model.other.length > 0 ? (
          <section className="tc__card">
            <h4 className="tc__cardtitle">{S.designer.moreLabels}</h4>
            <div className="tc__names">
              {model.other.map((r) => (
                <OtherRow key={r.key} row={r} labelRef={ref(r, r.column, label)} />
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </div>
  )
}

function OtherRow({ row, labelRef }: { row: LabelRow; labelRef: LabelRef }) {
  return (
    <>
      <span className="tc__key tc__logical" title={row.objectId}>
        {row.column}
      </span>
      <LabelText labelRef={labelRef} />
    </>
  )
}

