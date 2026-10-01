import type { ReactNode } from 'react'
import { useRefData } from '../hooks/refData'
import type { Change } from '../utils/boardRules'
import { formatValue, nameById } from '../utils/format'
import { SHARE_TYPE_LABEL } from '../types/board'
import type { Json } from '../utils/settingsModel'

const AREA_LABEL: Record<Change['area'], string> = {
  column: 'Spalte',
  lookup: 'Konfiguration',
  settings: 'Settings',
  filterValues: 'Filter',
}

interface Props {
  changes: Change[]
  beforeLabel?: string
  afterLabel?: string
  /** Optional leading cell per row (e.g. a checkbox for bulk selection). */
  lead?: (change: Change) => ReactNode
  empty?: string
}

export function DiffTable({ changes, beforeLabel = 'Vorher', afterLabel = 'Nachher', lead, empty }: Props) {
  const { views, configs, timeZones } = useRefData()
  const resolve = (id: string) => nameById(views, id) ?? nameById(configs, id) ?? nameById(timeZones, id)

  const show = (c: Change, v: Json | undefined) =>
    c.key === 'msdyn_sharetype' && typeof v === 'number' ? (SHARE_TYPE_LABEL[v] ?? String(v)) : formatValue(v, resolve)

  if (changes.length === 0) return <p className="muted">{empty ?? 'Keine Unterschiede.'}</p>
  return (
    <div className="table-wrap">
      <table className="diff-table">
        <thead>
          <tr>
            {lead ? <th aria-label="Auswahl" /> : null}
            <th>Bereich</th>
            <th>Einstellung</th>
            <th>{beforeLabel}</th>
            <th>{afterLabel}</th>
          </tr>
        </thead>
        <tbody>
          {changes.map((c) => (
            <tr key={`${c.area}:${c.key}`}>
              {lead ? <td>{lead(c)}</td> : null}
              <td>
                <span className={`chip chip--${c.area}`}>{AREA_LABEL[c.area]}</span>
              </td>
              <td title={c.key}>{c.label}</td>
              <td className="diff-table__before">{show(c, c.before)}</td>
              <td className="diff-table__after">{show(c, c.after)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
