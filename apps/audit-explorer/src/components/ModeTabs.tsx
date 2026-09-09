/**
 * The four questions the explorer can answer. The first three are bounded
 * lookups and form the everyday path; `activity` is the volume dashboard and
 * deliberately sits last, because "show me everything" is an admin question,
 * not the one people arrive with.
 */
export type ExplorerMode = 'record' | 'person' | 'field' | 'activity'

const TABS: { mode: ExplorerMode; label: string; hint: string }[] = [
  { mode: 'record', label: 'Record', hint: 'Why does this record look like this?' },
  { mode: 'person', label: 'Person', hint: 'What did someone change?' },
  { mode: 'field', label: 'Field', hint: 'Who changes this column?' },
  { mode: 'activity', label: 'Activity', hint: 'What produces audit data here?' },
]

interface ModeTabsProps {
  mode: ExplorerMode
  onChange: (mode: ExplorerMode) => void
}

export function ModeTabs({ mode, onChange }: ModeTabsProps) {
  return (
    <nav className="mode-tabs" aria-label="Audit question">
      {TABS.map((tab) => (
        <button
          key={tab.mode}
          className={`mode-tab ${tab.mode === mode ? 'mode-tab--active' : ''} ${
            tab.mode === 'activity' ? 'mode-tab--last' : ''
          }`}
          onClick={() => onChange(tab.mode)}
          aria-current={tab.mode === mode}
          title={tab.hint}
        >
          {tab.label}
        </button>
      ))}
    </nav>
  )
}
