import { useCallback, useState } from 'react'
import { Input } from '@fluentui/react-components'
import { ChevronRightRegular, SearchRegular } from '@fluentui/react-icons'
import type { RelationshipMeta } from '../../types/board'
import type { BoardService } from '../../services/boardService'
import { useLoad } from '../../hooks/useLoad'
import { useInsert } from './insert'

const MAX_HOPS = 3
const LIMIT = 150

/**
 * Field picker for `{field}` templates: columns of the base table, and N:1
 * relationships to walk into — each hop adds the relationship schema name to
 * the path, as the booking template expects. Metadata come from the
 * Dataverse connector; without them only the special fields are offered.
 */
export function FieldPalette({
  baseEntity,
  baseLabel,
  specials = [],
}: {
  baseEntity: string
  baseLabel: string
  specials?: { path: string; label: string }[]
}) {
  const onInsert = useInsert()
  const [hops, setHops] = useState<(RelationshipMeta & { label: string })[]>([])
  const [query, setQuery] = useState('')
  const current = hops.length ? hops[hops.length - 1].target : baseEntity
  const load = useCallback((svc: BoardService) => svc.getTableInfo(current), [current])
  const { data: info, error, loading } = useLoad(`palette:${current}`, load)

  const q = query.trim().toLowerCase()
  const match = (...texts: string[]) => !q || texts.some((t) => t.toLowerCase().includes(q))
  const prefix = hops.map((h) => `${h.schemaName}.`).join('')
  const columnLabel = (attr: string) => info?.columns.find((c) => c.logicalName === attr)?.displayName ?? attr
  const relationships = hops.length < MAX_HOPS ? (info?.relationships ?? []).filter((r) => match(r.schemaName, r.attribute, r.target, columnLabel(r.attribute))) : []
  const columns = (info?.columns ?? []).filter((c) => match(c.logicalName, c.displayName))
  const insert = (path: string) => onInsert?.(`{${path}}`)

  return (
    <section className="palette" aria-label="Felder einfügen">
      <div className="palette__head">
        <strong>Felder einfügen</strong>
        <nav className="palette__crumbs" aria-label="Pfad">
          <button type="button" className="linklike" onClick={() => setHops([])} disabled={hops.length === 0}>
            {baseLabel}
          </button>
          {hops.map((h, i) => (
            <span key={`${h.schemaName}-${i}`}>
              <ChevronRightRegular aria-hidden />
              <button type="button" className="linklike" onClick={() => setHops(hops.slice(0, i + 1))} disabled={i === hops.length - 1}>
                {h.label}
              </button>
            </span>
          ))}
        </nav>
      </div>
      {onInsert === null ? <p className="muted small">Erst „Als eigene Vorlage bearbeiten“, dann lassen sich Felder einfügen.</p> : null}
      <Input
        size="small"
        className="input"
        contentBefore={<SearchRegular />}
        placeholder="Spalte oder Beziehung suchen …"
        aria-label="Spalte oder Beziehung suchen"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      {info?.isCustom ? (
        <p className="field__hint warn">Eigene Tabelle — Microsoft unterstützt in Buchungsvorlagen nur Systemtabellen.</p>
      ) : null}
      {error ? <p className="muted small">Metadaten nicht verfügbar ({error}). Feldnamen lassen sich von Hand eintragen.</p> : null}
      {!error && !loading && info === null ? <p className="muted small">Tabelle {current} gibt es in dieser Umgebung nicht.</p> : null}
      <ul className="palette__list">
        {hops.length === 0
          ? specials
              .filter((s) => match(s.path, s.label))
              .map((s) => (
                <li key={s.path}>
                  <button type="button" disabled={!onInsert} onClick={() => insert(s.path)}>
                    <span>{s.label}</span>
                    <code>{`{${s.path}}`}</code>
                  </button>
                </li>
              ))
          : null}
        {relationships.slice(0, LIMIT).map((r) => (
          <li key={r.schemaName}>
            <button
              type="button"
              className="palette__rel"
              onClick={() => {
                setHops([...hops, { ...r, label: columnLabel(r.attribute) }])
                setQuery('')
              }}
            >
              <span>
                {columnLabel(r.attribute)} <span className="muted">→ {r.target}</span>
              </span>
              <code>{r.schemaName}</code>
            </button>
          </li>
        ))}
        {columns.slice(0, LIMIT).map((c) => (
          <li key={c.logicalName}>
            <button type="button" disabled={!onInsert} onClick={() => insert(prefix + c.logicalName)}>
              <span>{c.displayName}</span>
              <code>{c.logicalName}</code>
            </button>
          </li>
        ))}
        {loading && !info ? <li className="muted small">Lade Spalten …</li> : null}
      </ul>
    </section>
  )
}
