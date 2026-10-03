import { usePower } from './PowerProvider'

export default function App() {
  const { ready, mode } = usePower()
  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar__brand">Translation Studio</div>
        <span className="mode">{ready ? (mode === 'local-mock' ? 'Mock-Daten' : 'Dataverse') : '…'}</span>
      </header>
    </div>
  )
}
