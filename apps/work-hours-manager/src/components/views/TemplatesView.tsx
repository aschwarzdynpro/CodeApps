import { Badge } from '@fluentui/react-components'
import { S } from '../../strings'
import type { CalendarTree, WorkHourTemplate } from '../../types/calendar'
import { describeBlock } from '../../utils/rules'

interface Props {
  templates: WorkHourTemplate[] | undefined
  trees: Record<string, CalendarTree> | undefined
  focusedId: string | null
  onFocus: (templateId: string) => void
}

/** Work hour templates with the rules of their calendars; the inspector shows the selected one. */
export function TemplatesView({ templates, trees, focusedId, onFocus }: Props) {
  return (
    <div className="page">
      <h2>{S.templates.title}</h2>
      <p className="muted">{S.templates.intro}</p>
      {!templates ? (
        <p className="loading">{S.app.loading}</p>
      ) : templates.length === 0 ? (
        <p className="empty">{S.templates.empty}</p>
      ) : (
        <ul className="template-list">
          {templates.map((t) => {
            const tree = t.calendarId ? trees?.[t.calendarId.toLowerCase()] : undefined
            return (
              <li key={t.id}>
                <button type="button" className={`template-item${focusedId === t.id ? ' is-focused' : ''}`} onClick={() => onFocus(t.id)}>
                  <div className="template-item__head">
                    <strong>{t.name}</strong>
                    {!t.active ? <Badge size="small" appearance="tint">{S.templates.inactive}</Badge> : null}
                    {!t.calendarId ? <Badge size="small" appearance="tint" color="warning">{S.templates.noCalendar}</Badge> : null}
                  </div>
                  {t.description ? <span className="muted small">{t.description}</span> : null}
                  {tree ? (
                    <ul className="template-item__rules">
                      {tree.blocks.map((b) => (
                        <li key={b.rootRuleId}>{describeBlock(b)}</li>
                      ))}
                      {tree.blocks.length === 0 ? <li className="muted">{S.inspector.noBlocks}</li> : null}
                    </ul>
                  ) : null}
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
