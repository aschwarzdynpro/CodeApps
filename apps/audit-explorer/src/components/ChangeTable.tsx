import { useState } from 'react'
import type { AttributeChange, AuditOperation } from '../types/audit'
import { partitionChanges } from '../utils/auditFields'

interface ChangeTableProps {
  changes: AttributeChange[]
  operation: AuditOperation
  /** Logical name to display name, from table metadata when available. */
  labels?: Record<string, string>
}

/**
 * The field diff of one audit entry.
 *
 * Two decisions make this readable on real data:
 *
 * - A **Create** is rendered as a plain field/value list. Every "old" cell of a
 *   create is empty by definition, so an old -> new layout spends half its
 *   width saying nothing.
 * - **Technical columns** (modifiedon, versionnumber, owning*) are collapsed
 *   behind a disclosure. Dataverse rewrites them on nearly every update, and
 *   left inline they bury the one line somebody came to read.
 */
export function ChangeTable({ changes, operation, labels }: ChangeTableProps) {
  const [showTechnical, setShowTechnical] = useState(false)
  const { business, technical } = partitionChanges(changes)
  const shown = showTechnical ? [...business, ...technical] : business
  const nameOf = (attribute: string) => labels?.[attribute] ?? attribute

  // Everything in this entry was bookkeeping — show it rather than an
  // apparently empty diff, which would read as "nothing changed".
  const onlyTechnical = business.length === 0 && technical.length > 0
  const rows = onlyTechnical ? technical : shown

  if (operation === 'Create') {
    return (
      <>
        <div className="changes changes--create">
          <div className="changes-head">
            <span>Field</span>
            <span>Value</span>
          </div>
          {rows.map((c) => (
            <div className="change-row change-row--create" key={c.attribute}>
              <span className="change-attr" title={c.attribute}>
                {nameOf(c.attribute)}
              </span>
              <span className="change-new">{c.newValue || '—'}</span>
            </div>
          ))}
        </div>
        <TechnicalToggle
          count={technical.length}
          shown={showTechnical || onlyTechnical}
          onToggle={() => setShowTechnical((v) => !v)}
          suppressed={onlyTechnical}
        />
      </>
    )
  }

  return (
    <>
      <div className="changes">
        <div className="changes-head">
          <span>Field</span>
          <span>Old value</span>
          <span>New value</span>
        </div>
        {rows.map((c) => (
          <div className="change-row" key={c.attribute}>
            <span className="change-attr" title={c.attribute}>
              {nameOf(c.attribute)}
            </span>
            <span className="change-old">{c.oldValue || '—'}</span>
            <span className="change-new">{c.newValue || '—'}</span>
          </div>
        ))}
      </div>
      <TechnicalToggle
        count={technical.length}
        shown={showTechnical || onlyTechnical}
        onToggle={() => setShowTechnical((v) => !v)}
        suppressed={onlyTechnical}
      />
    </>
  )
}

function TechnicalToggle({
  count,
  shown,
  onToggle,
  suppressed,
}: {
  count: number
  shown: boolean
  onToggle: () => void
  suppressed: boolean
}) {
  if (count === 0) return null
  if (suppressed) {
    return (
      <p className="tech-note">
        Only technical columns changed in this entry.
      </p>
    )
  }
  return (
    <button className="link-btn tech-toggle" onClick={onToggle}>
      {shown ? 'Hide' : 'Show'} {count} technical column
      {count === 1 ? '' : 's'}
    </button>
  )
}
