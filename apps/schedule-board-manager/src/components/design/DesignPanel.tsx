import { useState } from 'react'
import { Tab, TabList } from '@fluentui/react-components'
import type { Board, BoardContent, BoardSummary } from '../../types/board'
import { isDefaultBoard } from '../../utils/boardRules'
import { rowHeightOf } from '../../utils/settingsFields'
import { parseSettings, serializeSettings, type JsonObject } from '../../utils/settingsModel'
import type { Notify } from '../BoardDetail'
import { CellTemplateDesigner } from './CellTemplateDesigner'
import { ColorDesigner } from './ColorDesigner'
import { AlertDesigner, BookingTileDesigner } from './FieldTemplateDesigners'
import { ViewsDesigner } from './ViewsDesigner'

type Area = 'booking' | 'cell' | 'views' | 'colors' | 'alert'

const AREAS: [Area, string][] = [
  ['booking', 'Buchungskachel'],
  ['cell', 'Ressourcenzelle'],
  ['views', 'Tooltips & Details'],
  ['colors', 'Farben'],
  ['alert', 'Buchungswarnung'],
]

interface Props {
  board: Board
  boards: BoardSummary[]
  draft: BoardContent
  /** Default board content; null on the Default board itself. */
  defaults: BoardContent | null
  /** The board draft has unsaved changes. */
  boardDirty: boolean
  notify: Notify
  onChange: (next: BoardContent) => void
  onBoardChanged: () => void
}

/**
 * Designer and preview for everything visual on a board tab. Changes to the
 * board (templates in the settings, view IDs, colors) go into the same draft
 * as the "Bearbeiten" tab and are saved with its save bar. The resource cell
 * template is a configuration row of its own with its own save.
 */
export function DesignPanel({ board, boards, draft, defaults, boardDirty, notify, onChange, onBoardChanged }: Props) {
  const [area, setArea] = useState<Area>('booking')
  const [slotIndex, setSlotIndex] = useState(0)

  const parsed = parseSettings(draft.settings)
  const settings: JsonObject | null = parsed.ok ? parsed.value : null
  const orig = parseSettings(board.content.settings)
  const origSettings: JsonObject = orig.ok ? orig.value : {}
  const def = parseSettings(defaults?.settings ?? null)
  const defSettings: JsonObject | null = defaults && def.ok ? def.value : null

  // Resource cell template and query: own, else inherited from the Default board.
  const defaultBoard = boards.find(isDefaultBoard)
  const inherits = !isDefaultBoard(board)
  const cellId = board.content.lookups.msdyn_resourcecelltemplate ?? (inherits ? (defaultBoard?.lookups.msdyn_resourcecelltemplate ?? null) : null)
  const queryId = board.content.lookups.msdyn_retrieveresourcesquery ?? (inherits ? (defaultBoard?.lookups.msdyn_retrieveresourcesquery ?? null) : null)

  const setSettings = (next: JsonObject) => onChange({ ...draft, settings: serializeSettings(next) })
  const setColumn = (key: string, value: string | null) => onChange({ ...draft, columns: { ...draft.columns, [key]: value } })
  const needsSettings = area !== 'cell'

  return (
    <div className="design">
      <TabList size="small" selectedValue={area} onTabSelect={(_, d) => setArea(d.value as Area)} aria-label="Darstellung">
        {AREAS.map(([a, label]) => (
          <Tab key={a} value={a}>
            {label}
          </Tab>
        ))}
      </TabList>

      {needsSettings && !settings ? (
        <div className="notice notice--error">
          Das Settings-JSON ist ungültig ({parsed.ok ? '' : parsed.error}). Vorlagen, Ansichten und Zeitlinie lassen sich erst nach der
          Korrektur im Reiter „JSON“ bearbeiten.
        </div>
      ) : null}

      {area === 'booking' && settings ? (
        <BookingTileDesigner
          settings={settings}
          origSettings={origSettings}
          defSettings={defSettings}
          slotIndex={slotIndex}
          onSlot={setSlotIndex}
          onSettings={setSettings}
        />
      ) : null}

      {area === 'cell' ? (
        <CellTemplateDesigner
          board={board}
          boards={boards}
          cellId={cellId}
          queryId={queryId}
          defaultCellId={defaultBoard?.lookups.msdyn_resourcecelltemplate ?? null}
          boardDirty={boardDirty}
          rowHeight={rowHeightOf(settings, defSettings, 'hourAndDay')}
          notify={notify}
          onBoardChanged={onBoardChanged}
        />
      ) : null}

      {area === 'views' ? (
        <ViewsDesigner
          draft={draft}
          original={board.content}
          defaults={defaults}
          settings={settings}
          origSettings={origSettings}
          defSettings={defSettings}
          slotIndex={slotIndex}
          onSlot={setSlotIndex}
          onColumn={setColumn}
          onSettings={setSettings}
        />
      ) : null}

      {area === 'colors' ? (
        <ColorDesigner
          draft={draft}
          original={board.content}
          defaults={defaults}
          settings={settings}
          origSettings={origSettings}
          defSettings={defSettings}
          onColumn={setColumn}
          onSettings={setSettings}
        />
      ) : null}

      {area === 'alert' && settings ? (
        <AlertDesigner settings={settings} origSettings={origSettings} defSettings={defSettings} onSettings={setSettings} />
      ) : null}
    </div>
  )
}
