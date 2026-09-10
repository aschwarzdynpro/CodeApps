import type { TableAudit } from '../types/audit'

interface EmptyStateProps {
  /** Shown before any question has been asked. */
  prompt: string
  /** Concrete example of what to enter. */
  example?: string
}

/** Idle state: explains what the mode answers instead of showing an empty grid. */
export function EmptyState({ prompt, example }: EmptyStateProps) {
  return (
    <div className="empty">
      <p className="empty-prompt">{prompt}</p>
      {example && <p className="empty-example">{example}</p>}
    </div>
  )
}

interface NoResultsProps {
  scope: string
  /** Audit configuration of the table in question, when it could be read. */
  tableAudit?: TableAudit | null
  /** Logical name of the watched column, for a column-level verdict. */
  attribute?: string
  /** True when the question reached past the retention horizon. */
  beyondRetention?: boolean
  /** Human form of the retention setting, e.g. "90 days". */
  retention?: string
}

/**
 * Answered, but nothing came back.
 *
 * This has its own component because of a trap specific to auditing: an empty
 * result is usually about configuration, not about history. Three different
 * causes look identical on screen —
 *
 *   1. the table or column is not audited (nothing was ever written),
 *   2. the entries existed but retention purged them,
 *   3. genuinely nothing changed.
 *
 * Saying only "no results" invites the third reading, and on a compliance
 * question that is the most expensive mistake the app can make. Where metadata
 * is available the verdict is stated outright; otherwise the possibilities are
 * named rather than glossed over.
 */
export function NoResults({
  scope,
  tableAudit,
  attribute,
  beyondRetention,
  retention,
}: NoResultsProps) {
  const columnAudit = attribute
    ? tableAudit?.columns.find((c) => c.logicalName === attribute)
    : undefined

  // Ordered by how conclusive the cause is: a disabled switch explains the
  // emptiness completely, retention only partially.
  const verdict = (() => {
    if (tableAudit && !tableAudit.auditEnabled) {
      return {
        kind: 'off' as const,
        text: `Auditing is switched off for ${tableAudit.displayName}. Nothing was ever recorded for this table — this is a configuration finding, not a history finding.`,
      }
    }
    if (columnAudit && !columnAudit.auditEnabled) {
      return {
        kind: 'off' as const,
        text: `Auditing is switched off for the column ${columnAudit.displayName}. Changes to it are never recorded, however often it is edited.`,
      }
    }
    if (beyondRetention) {
      return {
        kind: 'retention' as const,
        text: `The question reaches past the audit retention window${
          retention ? ` (${retention})` : ''
        }. Older entries have been purged, so this cannot tell you whether anything happened back then.`,
      }
    }
    if (tableAudit?.auditEnabled) {
      return {
        kind: 'clean' as const,
        text: `Auditing is on for ${tableAudit.displayName}, so this really is an empty stretch — nothing was changed in the selected window.`,
      }
    }
    return {
      kind: 'unknown' as const,
      text: 'Auditing may not be enabled for this table or column, or the entries may have passed the retention window — an empty result is not proof that nothing was changed.',
    }
  })()

  return (
    <div className={`empty empty--${verdict.kind === 'clean' ? 'clean' : 'none'}`}>
      <p className="empty-prompt">No changes found for {scope}.</p>
      <p className="empty-example">{verdict.text}</p>
    </div>
  )
}
