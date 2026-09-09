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

/**
 * Answered, but nothing came back.
 *
 * This deserves its own component because of a trap specific to auditing: an
 * empty result almost always means "not audited", not "never changed". Saying
 * only "no results" invites exactly the wrong conclusion — and on a compliance
 * question that is the most expensive mistake the app can make.
 */
export function NoResults({ scope }: { scope: string }) {
  return (
    <div className="empty empty--none">
      <p className="empty-prompt">No changes found for {scope}.</p>
      <p className="empty-example">
        Auditing may not be enabled for this table or column — an empty result
        is not proof that nothing was changed.
      </p>
    </div>
  )
}
