import { S } from '../../strings'

/** Placeholder until Phase 4 brings the run history. */
export function RunsView() {
  return (
    <div className="page">
      <h2>{S.runs.title}</h2>
      <p className="empty">{S.runs.empty}</p>
    </div>
  )
}
