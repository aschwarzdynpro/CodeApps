import type { AuditEvent, AuditOperation } from '../types/audit'
import { OPERATION_COLORS } from '../utils/format'

interface KpiCardsProps {
  events: AuditEvent[]
  activeOperation: AuditOperation | 'All'
  onOperationToggle: (op: AuditOperation) => void
}

export function KpiCards({
  events,
  activeOperation,
  onOperationToggle,
}: KpiCardsProps) {
  const byOp = (op: AuditOperation) =>
    events.filter((e) => e.operation === op).length
  const users = new Set(events.map((e) => e.user.name)).size
  const tables = new Set(events.map((e) => e.tableName)).size

  const ops: AuditOperation[] = ['Create', 'Update', 'Delete']

  return (
    <div className="kpis">
      <div className="kpi kpi--total">
        <span className="kpi-value">{events.length}</span>
        <span className="kpi-label">Total events</span>
      </div>

      {ops.map((op) => {
        const active = activeOperation === op
        return (
          <button
            key={op}
            className={`kpi kpi--op ${active ? 'kpi--active' : ''}`}
            style={{ borderTopColor: OPERATION_COLORS[op] }}
            onClick={() => onOperationToggle(op)}
            title={`Filter by ${op}`}
          >
            <span className="kpi-value" style={{ color: OPERATION_COLORS[op] }}>
              {byOp(op)}
            </span>
            <span className="kpi-label">{op}</span>
          </button>
        )
      })}

      <div className="kpi">
        <span className="kpi-value">{users}</span>
        <span className="kpi-label">Active users</span>
      </div>
      <div className="kpi">
        <span className="kpi-value">{tables}</span>
        <span className="kpi-label">Tables touched</span>
      </div>
    </div>
  )
}
