import type { AuditOperation } from '../types/audit'
import { OPERATION_COLORS } from '../utils/format'

export function OperationBadge({ operation }: { operation: AuditOperation }) {
  return (
    <span
      className="op-badge"
      style={{
        color: OPERATION_COLORS[operation],
        background: `${OPERATION_COLORS[operation]}1a`,
      }}
    >
      {operation}
    </span>
  )
}
