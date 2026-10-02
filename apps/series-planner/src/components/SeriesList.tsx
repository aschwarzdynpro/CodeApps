import { useState } from 'react'
import { Input } from '@fluentui/react-components'
import { SearchRegular } from '@fluentui/react-icons'
import type { SeriesSummary } from '../types/series'
import { formatDate } from '../utils/dates'

export function SeriesList({ series, selectedId, onSelect }: { series: SeriesSummary[]; selectedId: string | null; onSelect: (id: string) => void }) {
  const [query, setQuery] = useState('')
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
  const visible = series.filter((s) => words.every((w) => [s.name, s.project?.name, s.resource?.name, s.summary].some((t) => t?.toLowerCase().includes(w))))
  return (
    <aside className="sidebar">
      <div className="sidebar__head">
        <Input
          className="input"
          contentBefore={<SearchRegular />}
          aria-label="Serie, Projekt oder Ressource suchen"
          placeholder="Serie, Projekt oder Ressource …"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      {visible.length === 0 ? <p className="muted small sidebar__empty">{series.length ? 'Keine Treffer.' : 'Noch keine Serien — „Neue Serie“ legt die erste an.'}</p> : null}
      <ul className="series-list">
        {visible.map((s) => (
          <li key={s.id}>
            <button className={`series-item${s.id === selectedId ? ' series-item--active' : ''}${s.active ? '' : ' series-item--inactive'}`} onClick={() => onSelect(s.id)}>
              <span className="series-item__name">{s.name}</span>
              <span className="series-item__meta">{s.project?.name ?? 'ohne Projekt'}</span>
              <span className="series-item__meta">{s.summary}</span>
              <span className="series-item__meta">
                {s.resource?.name ?? '—'}
                {s.startDate && s.endDate ? ` · ${formatDate(s.startDate)} – ${formatDate(s.endDate)}` : ''}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </aside>
  )
}
