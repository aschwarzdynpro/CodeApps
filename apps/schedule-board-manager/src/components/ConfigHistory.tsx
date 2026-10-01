import { formatDate } from '../utils/format'
import { listConfigSnapshots } from '../utils/snapshots'
import { Btn } from './ui'

/** Local snapshots of one configuration row (filter layout, cell template). */
export function ConfigHistory({ configId, emptyText, onRestore }: { configId: string; emptyText: string; onRestore: (value: string) => void }) {
  const snapshots = listConfigSnapshots(configId)
  if (snapshots.length === 0) return <p className="muted">{emptyText}</p>
  return (
    <ul className="history">
      {snapshots.map((s) => (
        <li key={s.at}>
          <span>
            {formatDate(s.at)} · {s.label}
          </span>
          <Btn small onClick={() => onRestore(s.value)}>
            Als Entwurf laden
          </Btn>
        </li>
      ))}
    </ul>
  )
}
