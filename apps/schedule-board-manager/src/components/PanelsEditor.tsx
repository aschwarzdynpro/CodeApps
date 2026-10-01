import { useRefData } from '../hooks/refData'
import { getAt, jsonEqual, setAt, type Json, type JsonObject } from '../utils/settingsModel'
import { ViewSelect } from './fields'

interface Props {
  settings: JsonObject
  original: JsonObject
  onChange: (next: JsonObject) => void
}

const REQUIREMENT = 'msdyn_resourcerequirement'

/**
 * `UnscheduledTabs` — the requirement panels under the board. Each entry is
 * `{ Title, ViewType, UnscheduledView }`; extra keys on an entry are kept
 * because entries are edited in place, not rebuilt.
 */
export function PanelsEditor({ settings, original, onChange }: Props) {
  const { views } = useRefData()
  const raw = getAt(settings, ['UnscheduledTabs'])
  const tabs: Json[] = Array.isArray(raw) ? raw : []
  const changed = !jsonEqual(raw, getAt(original, ['UnscheduledTabs']))

  const write = (next: Json[]) => onChange(setAt(settings, ['UnscheduledTabs'], next))
  const move = (from: number, to: number) => {
    if (to < 0 || to >= tabs.length) return
    const next = tabs.slice()
    const [item] = next.splice(from, 1)
    next.splice(to, 0, item)
    write(next)
  }
  const add = () => {
    const firstView = views.find((v) => v.entity === REQUIREMENT && v.kind === 'system')
    write([...tabs, { Title: 'Neuer Bereich', UnscheduledView: firstView?.id ?? null, ViewType: REQUIREMENT }])
  }

  return (
    <div className={`full panels${changed ? ' panels--changed' : ''}`}>
      {tabs.length === 0 ? <p className="muted">Keine eigenen Anforderungsbereiche.</p> : null}
      {tabs.map((tab, i) => {
        if (tab === null || typeof tab !== 'object' || Array.isArray(tab)) return null
        const entity = typeof tab.ViewType === 'string' ? tab.ViewType : REQUIREMENT
        return (
          <div className="panel-row" key={i}>
            <span className="panel-row__index">{i + 1}</span>
            <input
              className="input"
              aria-label={`Titel Bereich ${i + 1}`}
              value={typeof tab.Title === 'string' ? tab.Title : ''}
              onChange={(e) => onChange(setAt(settings, ['UnscheduledTabs', i, 'Title'], e.target.value))}
            />
            <ViewSelect
              id={`panel-view-${i}`}
              entity={entity}
              value={typeof tab.UnscheduledView === 'string' ? tab.UnscheduledView : null}
              onChange={(v) => onChange(setAt(settings, ['UnscheduledTabs', i, 'UnscheduledView'], v))}
            />
            <div className="panel-row__actions">
              <button className="icon-btn" onClick={() => move(i, i - 1)} disabled={i === 0} aria-label="Nach oben">
                ↑
              </button>
              <button className="icon-btn" onClick={() => move(i, i + 1)} disabled={i === tabs.length - 1} aria-label="Nach unten">
                ↓
              </button>
              <button
                className="icon-btn icon-btn--danger"
                onClick={() => write(tabs.filter((_, j) => j !== i))}
                aria-label="Bereich entfernen"
              >
                ✕
              </button>
            </div>
          </div>
        )
      })}
      <button className="btn btn--small" onClick={add}>
        + Bereich hinzufügen
      </button>
    </div>
  )
}
