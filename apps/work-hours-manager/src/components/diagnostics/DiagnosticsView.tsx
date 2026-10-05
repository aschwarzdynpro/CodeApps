import { Badge, Card, CardHeader, Table, TableBody, TableCell, TableHeader, TableHeaderCell, TableRow } from '@fluentui/react-components'
import { useState } from 'react'
import { LIMITS } from '../../config'
import { S } from '../../strings'
import type { Finding, FindingKind } from '../../types/calendar'
import { FINDING_KINDS } from '../../utils/diagnostics'
import { Btn } from '../ui'

interface Props {
  findings: Finding[] | null
  fromSlots: boolean
  onShowResource: (resourceId: string, innerCalendarId: string | null) => void
}

const SEV_COLOR: Record<Finding['severity'], 'danger' | 'warning' | 'informative'> = { error: 'danger', warning: 'warning', info: 'informative' }

/** Cards with counts per finding kind; a click filters the list below. */
export function DiagnosticsView({ findings, fromSlots, onShowResource }: Props) {
  const [kind, setKind] = useState<FindingKind | null>(null)
  if (!findings) return <p className="loading">{S.diagnostics.waiting}</p>
  const shown = kind ? findings.filter((f) => f.kind === kind) : findings
  const count = (k: FindingKind) => findings.filter((f) => f.kind === k)
  return (
    <div className="page">
      <h2>{S.diagnostics.title}</h2>
      <p className="muted">{S.diagnostics.intro(LIMITS.diagnosticsWindowDays, LIMITS.ruleEndingDays)}</p>
      <div className="cards">
        <Card className={`finding-card${kind === null ? ' is-active' : ''}`} appearance="filled-alternative" onClick={() => setKind(null)} role="button" tabIndex={0}>
          <CardHeader header={<strong>{S.diagnostics.all}</strong>} description={<span className="muted small">{S.diagnostics.resources(new Set(findings.map((f) => f.resourceId)).size)}</span>} />
          <div className="finding-card__num">{findings.length}</div>
        </Card>
        {FINDING_KINDS.map((k) => {
          const list = count(k)
          const worst = list.find((f) => f.severity === 'error') ? 'error' : list.find((f) => f.severity === 'warning') ? 'warning' : 'info'
          return (
            <Card key={k} className={`finding-card${kind === k ? ' is-active' : ''}${list.length === 0 ? ' finding-card--empty' : ''}`} appearance="filled-alternative" onClick={() => setKind(k)} role="button" tabIndex={0}>
              <CardHeader header={<strong>{S.findings[k]}</strong>} description={list.length ? <Badge size="small" appearance="tint" color={SEV_COLOR[worst]}>{S.diagnostics.severity[worst]}</Badge> : <span className="muted small">{S.setup.ok}</span>} />
              <div className="finding-card__num">{list.length}</div>
            </Card>
          )
        })}
      </div>
      {shown.length === 0 ? (
        <p className="empty">{kind ? S.diagnostics.noneForKind : S.diagnostics.none}</p>
      ) : (
        <Table size="small" aria-label={S.diagnostics.title} className="finding-table">
          <TableHeader>
            <TableRow>
              <TableHeaderCell>{S.diagnostics.severity.warning.slice(0, 0)}Schwere</TableHeaderCell>
              <TableHeaderCell>{S.resources.columns.name}</TableHeaderCell>
              <TableHeaderCell>Befund</TableHeaderCell>
              <TableHeaderCell>Details</TableHeaderCell>
              <TableHeaderCell />
            </TableRow>
          </TableHeader>
          <TableBody>
            {shown.map((f, i) => (
              <TableRow key={`${f.resourceId}-${f.kind}-${i}`}>
                <TableCell>
                  <Badge size="small" appearance="filled" color={SEV_COLOR[f.severity]}>
                    {S.diagnostics.severity[f.severity]}
                  </Badge>
                </TableCell>
                <TableCell>{f.resourceName}</TableCell>
                <TableCell>{S.findings[f.kind]}</TableCell>
                <TableCell>{f.detail}</TableCell>
                <TableCell>
                  <Btn small kind="ghost" onClick={() => onShowResource(f.resourceId, f.innerCalendarId ?? null)}>
                    {S.diagnostics.showInCalendar}
                  </Btn>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      <p className="muted small">{fromSlots ? S.diagnostics.basedOn.slots : S.diagnostics.basedOn.rules}</p>
    </div>
  )
}
