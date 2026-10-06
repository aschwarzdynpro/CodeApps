import { BUILD_TIME } from '../../config'
import { Badge } from '@fluentui/react-components'
import { S } from '../../strings'
import { useLoad } from '../../hooks/useLoad'
import { Btn } from '../ui'

/** What the environment provides (connector, org URL, tables, actions). */
export function SetupView() {
  const res = useLoad('setup', (svc) => svc.checkSetup())
  return (
    <div className="page">
      <h2>{S.setup.title}</h2>
      <p className="muted">{S.setup.intro}</p>
      <p className="muted small">{S.setup.build(BUILD_TIME)}</p>
      <Btn small onClick={res.reload} disabled={res.loading}>
        {S.setup.rerun}
      </Btn>
      {res.error ? <div className="notice notice--error">{res.error}</div> : null}
      {res.loading && !res.data ? <p className="loading">{S.app.loading}</p> : null}
      <ul className="setup-list">
        {(res.data ?? []).map((c) => (
          <li key={c.label} className="setup-item">
            <Badge appearance="filled" color={c.ok ? 'success' : 'danger'} size="small">
              {c.ok ? S.setup.ok : S.setup.missing}
            </Badge>
            <div>
              <strong>{c.label}</strong>
              <div className="muted small">{c.detail}</div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
