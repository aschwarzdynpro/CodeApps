import { Table, TableBody, TableCell, TableHeader, TableHeaderCell, TableRow } from '@fluentui/react-components'
import { S } from '../../strings'
import type { Closure } from '../../types/calendar'
import { formatDate } from '../../utils/dates'
import { closureRows } from '../../utils/closures'
import { Select } from '../ui'

interface Props {
  year: number
  onYear: (year: number) => void
  closures: Closure[] | undefined
  error: string | null
  viewerTz: string
}

/** Business closures of a year (read-only in Phase 2; create/reconcile follow in Phase 5). */
export function HolidaysView({ year, onYear, closures, error, viewerTz }: Props) {
  const years = [year - 1, year, year + 1, year + 2].map((y) => ({ value: String(y), label: String(y) }))
  const rows = closureRows(closures ?? [], viewerTz)
  return (
    <div className="page">
      <h2>{S.holidays.title}</h2>
      <p className="muted">{S.holidays.intro}</p>
      <div className="row">
        <span className="row__label">{S.holidays.year}</span>
        <div className="w-120">
          <Select small value={String(year)} options={years} onChange={(v) => onYear(Number(v))} aria-label={S.holidays.year} />
        </div>
        <span className="muted small">{S.holidays.count(rows.length)}</span>
      </div>
      {error ? <div className="notice notice--error">{S.app.loadError('Schließungen', error)}</div> : null}
      {!closures ? (
        <p className="loading">{S.app.loading}</p>
      ) : rows.length === 0 ? (
        <p className="empty">{S.holidays.empty(year)}</p>
      ) : (
        <Table size="small" aria-label={S.holidays.title}>
          <TableHeader>
            <TableRow>
              <TableHeaderCell>{S.holidays.columns.name}</TableHeaderCell>
              <TableHeaderCell>{S.holidays.columns.from}</TableHeaderCell>
              <TableHeaderCell>{S.holidays.columns.to}</TableHeaderCell>
              <TableHeaderCell>{S.holidays.columns.days}</TableHeaderCell>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.closure.id}>
                <TableCell>{r.closure.name}</TableCell>
                <TableCell>{formatDate(r.from)}</TableCell>
                <TableCell>{formatDate(r.to)}</TableCell>
                <TableCell>{r.days}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      <p className="muted small">{S.holidays.readOnlyHint}</p>
    </div>
  )
}
