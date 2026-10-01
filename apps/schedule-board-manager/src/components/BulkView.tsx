import { useCallback, useState } from 'react'
import {
  BOARD_COLUMNS,
  BOARD_LOOKUPS,
  ConflictError,
  SHARE_TYPE,
  type Board,
  type BoardContent,
  type BoardSummary,
  type LookupKey,
} from '../types/board'
import { getBoardService, type BoardService } from '../services/boardService'
import { useLoad } from '../hooks/useLoad'
import { applySelection, diffContent, type BulkSelection, type Change } from '../utils/boardRules'
import { topLevelLabel } from '../utils/settingsFields'
import { parseSettings } from '../utils/settingsModel'
import { saveSnapshot } from '../utils/snapshots'
import { DiffTable } from './DiffTable'
import type { BulkPreset } from './CompareView'
import type { Notify } from './BoardDetail'

const TRANSFERABLE_COLUMNS = BOARD_COLUMNS.filter(
  (c) => c.kind !== 'deprecated' && !['msdyn_tabname', 'msdyn_ordernumber', 'msdyn_sharetype'].includes(c.key),
)

interface Props {
  boards: BoardSummary[]
  preset: BulkPreset | null
  notify: Notify
  onDone: () => void
}

interface Preview {
  target: Board
  next: BoardContent
  changes: Change[]
}

type Outcome = { id: string; status: 'ok' | 'unchanged' | 'conflict' | 'error'; message?: string }

const EMPTY: BulkSelection = { columns: [], lookups: [], settingsPaths: [], filterValues: false }

function toggle<T>(list: T[], item: T, on: boolean): T[] {
  return on ? [...list.filter((x) => x !== item), item] : list.filter((x) => x !== item)
}

export function BulkView({ boards, preset, notify, onDone }: Props) {
  const [templateId, setTemplateId] = useState(preset?.templateId ?? boards.find((b) => b.shareType !== SHARE_TYPE.system)?.id ?? '')
  const [selection, setSelection] = useState<BulkSelection>(preset?.selection ?? EMPTY)
  const [targetIds, setTargetIds] = useState<string[]>(preset?.targetIds ?? [])
  const [previews, setPreviews] = useState<Preview[] | null>(null)
  const [outcomes, setOutcomes] = useState<Outcome[] | null>(null)
  const [busy, setBusy] = useState(false)

  const loadTemplate = useCallback((svc: BoardService) => svc.getBoard(templateId), [templateId])
  const { data: template } = useLoad(templateId || null, loadTemplate)

  const settingsKeys = (() => {
    const p = parseSettings(template?.content.settings ?? null)
    const keys = p.ok ? Object.keys(p.value) : []
    // Keys selected via preset but absent in the template mean "remove on target".
    for (const path of selection.settingsPaths) if (!keys.includes(String(path[0]))) keys.push(String(path[0]))
    return keys.sort((a, b) => topLevelLabel(a).localeCompare(topLevelLabel(b)))
  })()

  const selectedSettings = selection.settingsPaths.map((p) => String(p[0]))
  const selectionSize =
    selection.columns.length + selection.lookups.length + selection.settingsPaths.length + (selection.filterValues ? 1 : 0)

  const resetPreview = () => {
    setPreviews(null)
    setOutcomes(null)
  }
  const updateSelection = (next: BulkSelection) => {
    setSelection(next)
    resetPreview()
  }

  const preview = async () => {
    if (!template) return
    setBusy(true)
    try {
      const svc = await getBoardService()
      const targets = await Promise.all(targetIds.map((id) => svc.getBoard(id)))
      setPreviews(
        targets.map((target) => {
          const next = applySelection(target.content, template.content, selection)
          return { target, next, changes: diffContent(target.content, next) }
        }),
      )
      setOutcomes(null)
    } catch (err) {
      notify(err instanceof Error ? err.message : String(err), 'error')
    } finally {
      setBusy(false)
    }
  }

  const apply = async () => {
    if (!previews) return
    setBusy(true)
    const svc = await getBoardService()
    const results: Outcome[] = []
    for (const p of previews) {
      if (p.changes.length === 0) {
        results.push({ id: p.target.id, status: 'unchanged' })
        continue
      }
      try {
        saveSnapshot(p.target.id, `Vor Bulk aus „${template?.name ?? ''}“`, p.target.content)
        await svc.updateBoard(p.target, p.next)
        results.push({ id: p.target.id, status: 'ok' })
      } catch (err) {
        results.push({
          id: p.target.id,
          status: err instanceof ConflictError ? 'conflict' : 'error',
          message: err instanceof Error ? err.message : String(err),
        })
      }
    }
    setOutcomes(results)
    setBusy(false)
    const ok = results.filter((r) => r.status === 'ok').length
    const failed = results.filter((r) => r.status === 'conflict' || r.status === 'error').length
    notify(`${ok} Board${ok === 1 ? '' : 's'} aktualisiert${failed ? `, ${failed} fehlgeschlagen` : ''}.`, failed ? 'error' : 'ok')
    onDone()
  }

  const outcomeFor = (id: string) => outcomes?.find((o) => o.id === id)

  return (
    <section className="page">
      <header className="page__header">
        <h1>Mehrere Boards anpassen</h1>
        <p className="muted">
          Ausgewählte Einstellungen eines Vorlage-Boards auf andere Boards übertragen. Vor dem Schreiben siehst du pro Board,
          was sich ändert; jedes Board wird vorher im Verlauf gesichert.
        </p>
      </header>

      <div className="bulk">
        <div className="bulk__col">
          <h2>1. Vorlage</h2>
          <select
            className="input"
            value={templateId}
            onChange={(e) => {
              setTemplateId(e.target.value)
              setTargetIds((ids) => ids.filter((id) => id !== e.target.value))
              resetPreview()
            }}
          >
            {boards.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>

          <h2>2. Was übertragen?</h2>
          <fieldset className="checklist">
            <legend>Konfigurationen</legend>
            {BOARD_LOOKUPS.map((lk) => (
              <label key={lk.key} className="form-check">
                <input
                  type="checkbox"
                  checked={selection.lookups.includes(lk.key)}
                  onChange={(e) => updateSelection({ ...selection, lookups: toggle<LookupKey>(selection.lookups, lk.key, e.target.checked) })}
                />
                <span>{lk.label}</span>
              </label>
            ))}
          </fieldset>
          <fieldset className="checklist">
            <legend>Settings-JSON</legend>
            {settingsKeys.map((k) => (
              <label key={k} className="form-check">
                <input
                  type="checkbox"
                  checked={selectedSettings.includes(k)}
                  onChange={(e) =>
                    updateSelection({
                      ...selection,
                      settingsPaths: e.target.checked
                        ? [...selection.settingsPaths.filter((p) => String(p[0]) !== k), [k]]
                        : selection.settingsPaths.filter((p) => String(p[0]) !== k),
                    })
                  }
                />
                <span title={k}>{topLevelLabel(k)}</span>
              </label>
            ))}
            <label className="form-check">
              <input
                type="checkbox"
                checked={selection.filterValues}
                onChange={(e) => updateSelection({ ...selection, filterValues: e.target.checked })}
              />
              <span>Gespeicherte Filterwerte (msdyn_filtervalues)</span>
            </label>
          </fieldset>
          <fieldset className="checklist">
            <legend>Spalten</legend>
            {TRANSFERABLE_COLUMNS.map((c) => (
              <label key={c.key} className="form-check">
                <input
                  type="checkbox"
                  checked={selection.columns.includes(c.key)}
                  onChange={(e) => updateSelection({ ...selection, columns: toggle(selection.columns, c.key, e.target.checked) })}
                />
                <span>{c.label}</span>
              </label>
            ))}
          </fieldset>
        </div>

        <div className="bulk__col">
          <h2>3. Ziel-Boards</h2>
          <fieldset className="checklist">
            {boards
              .filter((b) => b.id !== templateId)
              .map((b) => (
                <label key={b.id} className="form-check">
                  <input
                    type="checkbox"
                    checked={targetIds.includes(b.id)}
                    onChange={(e) => {
                      setTargetIds(toggle(targetIds, b.id, e.target.checked))
                      resetPreview()
                    }}
                  />
                  <span>
                    {b.name}
                    {b.shareType === SHARE_TYPE.system ? <span className="badge badge--lock">System</span> : null}
                    {!b.active ? <span className="badge badge--inactive">Inaktiv</span> : null}
                  </span>
                </label>
              ))}
          </fieldset>
          <div className="toolbar">
            <button className="btn btn--primary" disabled={busy || !template || targetIds.length === 0 || selectionSize === 0} onClick={preview}>
              {busy && !previews ? 'Lade …' : 'Vorschau'}
            </button>
            {previews ? (
              <button
                className="btn btn--danger"
                disabled={busy || outcomes !== null || previews.every((p) => p.changes.length === 0)}
                onClick={apply}
              >
                {busy ? 'Schreibt …' : `Auf ${previews.filter((p) => p.changes.length > 0).length} Board(s) anwenden`}
              </button>
            ) : null}
          </div>
        </div>
      </div>

      {previews ? (
        <div className="bulk__preview">
          {previews.map((p) => {
            const o = outcomeFor(p.target.id)
            return (
              <details key={p.target.id} className="section" open={previews.length === 1}>
                <summary className="section__title">
                  {p.target.name} — {p.changes.length} Änderung{p.changes.length === 1 ? '' : 'en'}
                  {o ? <span className={`badge badge--outcome-${o.status}`}>{OUTCOME_LABEL[o.status]}</span> : null}
                </summary>
                {o?.message ? <div className="notice notice--error">{o.message}</div> : null}
                <DiffTable changes={p.changes} empty="Schon identisch — wird übersprungen." />
              </details>
            )
          })}
        </div>
      ) : null}
    </section>
  )
}

const OUTCOME_LABEL: Record<Outcome['status'], string> = {
  ok: 'gespeichert',
  unchanged: 'unverändert',
  conflict: 'Konflikt — neu laden',
  error: 'Fehler',
}
