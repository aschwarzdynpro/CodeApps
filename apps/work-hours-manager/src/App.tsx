import { usePower } from './PowerProvider'
import { S } from './strings'

/** Phase 1 placeholder — the shell arrives with Phase 2. */
export default function App() {
  const { ready, mode } = usePower()
  return (
    <div style={{ padding: 24 }}>
      <h1>{S.app.title}</h1>
      <p>{ready ? (mode === 'local-mock' ? S.app.modeMock : S.app.modeDataverse) : S.app.loading}</p>
    </div>
  )
}
