import { useCallback, useState } from 'react'
import {
  CONFIG_TYPE,
  ConflictError,
  type Board,
  type BoardContent,
  type BoardSummary,
  type ConfigDetail,
} from '../types/board'
import { getBoardService, type BoardService } from '../services/boardService'
import { useLoad } from '../hooks/useLoad'
import { isDefaultBoard } from '../utils/boardRules'
import {
  addControl,
  diffLayouts,
  moveControl,
  needsQuery,
  parseLayout,
  queryInputKeys,
  removeControl,
  updateControl,
  type ControlInfo,
  type NewControl,
} from '../utils/filterLayout'
import { formatDate } from '../utils/format'
import { listConfigSnapshots, saveConfigSnapshot } from '../utils/snapshots'
import { Modal } from './Modal'
import type { Notify } from './BoardDetail'

interface Props {
  board: Board
  boards: BoardSummary[]
  defaults: BoardContent | null
  notify: Notify
  /** The board's lookup changed (copy for this board) — reload board + list. */
  onBoardChanged: () => void
}

type View = 'fields' | 'xml' | 'query' | 'history'
type Dialog = 'save' | 'copy' | null

const LOGICAL_NAME = /^[a-z][a-z0-9_]*$/

export function FilterLayoutPanel({ board, boards, defaults, notify, onBoardChanged }: Props) {
  const ownLayout = board.content.lookups.msdyn_filterlayout
  const ownQuery = board.content.lookups.msdyn_retrieveresourcesquery
  const layoutId = ownLayout ?? defaults?.lookups.msdyn_filterlayout ?? null
  const queryId = ownQuery ?? defaults?.lookups.msdyn_retrieveresourcesquery ?? null

  const loadConfigs = useCallback(
    async (svc: BoardService): Promise<[ConfigDetail | null, ConfigDetail | null]> =>
      Promise.all([
        layoutId ? svc.getConfiguration(layoutId) : Promise.resolve(null),
        queryId ? svc.getConfiguration(queryId).catch(() => null) : Promise.resolve(null),
      ]),
    [layoutId, queryId],
  )
  const { data, error, reload } = useLoad(`${layoutId}|${queryId}`, loadConfigs)
  const [layout, query] = data ?? [null, null]

  const [view, setView] = useState<View>('fields')
  const [dialog, setDialog] = useState<Dialog>(null)
  const [busy, setBusy] = useState(false)
  const [conflict, setConflict] = useState(false)
  const [draftState, setDraftState] = useState<{ key: string; xml: string } | null>(null)

  if (error) return <div className="notice notice--error">Filterlayout konnte nicht geladen werden: {error}</div>
  if (!layoutId) {
    return (
      <div className="notice">
        Weder dieses Board noch das Default-Board verweisen auf ein Filterlayout — der Schedule Board nutzt das
        Produkt-Standardlayout. Unter Bearbeiten → Sonstiges ein Filterlayout zuweisen, um es hier anzupassen.
      </div>
    )
  }
  if (!layout) return <div className="loading">Lade Filterlayout …</div>

  const versionKey = `${layout.id}:${layout.version ?? ''}`
  const draft = draftState?.key === versionKey ? draftState.xml : layout.value
  const setDraft = (xml: string) => setDraftState({ key: versionKey, xml })
  const parsed = parseLayout(draft)
  const changes = diffLayouts(layout.value, draft)
  const inputKeys = queryInputKeys(query?.value)

  const sameId = (a: string | null | undefined, b: string | null | undefined) => (a ?? '').toLowerCase() === (b ?? '').toLowerCase()
  const defaultLayout = defaults?.lookups.msdyn_filterlayout ?? null
  const users = boards.filter(
    (b) => sameId(b.lookups.msdyn_filterlayout, layout.id) || (!b.lookups.msdyn_filterlayout && !isDefaultBoard(b) && sameId(defaultLayout, layout.id)),
  )

  const edit = (fn: (xml: string) => string) => {
    try {
      setDraft(fn(draft))
    } catch (err) {
      notify(err instanceof Error ? err.message : String(err), 'error')
    }
  }

  const run = async (action: (svc: BoardService) => Promise<void>) => {
    setBusy(true)
    try {
      await action(await getBoardService())
    } catch (err) {
      if (err instanceof ConflictError) {
        setConflict(true)
        setDialog(null)
      } else notify(err instanceof Error ? err.message : String(err), 'error')
    } finally {
      setBusy(false)
    }
  }

  const save = () =>
    run(async (svc) => {
      saveConfigSnapshot(layout.id, 'Vor dem Speichern', layout.value)
      await svc.updateConfiguration(layout, draft)
      setDialog(null)
      setDraftState(null)
      notify(`Filterlayout „${layout.name}“ gespeichert — wirkt auf ${users.length} Board${users.length === 1 ? '' : 's'}.`)
      reload()
    })

  const copyForBoard = (name: string) =>
    run(async (svc) => {
      const id = await svc.createConfiguration(name, CONFIG_TYPE.filterLayout, draft)
      await svc.updateBoard(board, { ...board.content, lookups: { ...board.content.lookups, msdyn_filterlayout: id } })
      setDialog(null)
      setDraftState(null)
      notify(`Filterlayout „${name}“ angelegt und „${board.name}“ zugewiesen.`)
      onBoardChanged()
    })

  return (
    <div className="layout-editor">
      <header className="layout-editor__head">
        <div>
          <h3>{layout.name}</h3>
          <p className="muted small">
            {ownLayout ? 'Eigenes Filterlayout dieses Boards' : 'Geerbt vom Default-Board'} · genutzt von{' '}
            {users.length === 0 ? 'keinem Board' : users.map((u) => u.name).join(', ')}
          </p>
        </div>
        <button className="btn" onClick={() => setDialog('copy')} disabled={!parsed.ok}>
          Als Kopie nur für dieses Board …
        </button>
      </header>

      {users.length > 1 ? (
        <div className="notice notice--warn">
          Dieses Filterlayout teilen sich {users.length} Boards. Änderungen wirken auf alle — für Änderungen nur an „{board.name}“
          zuerst „Als Kopie nur für dieses Board“.
        </div>
      ) : null}
      {conflict ? (
        <div className="notice notice--error">
          Das Filterlayout wurde zwischenzeitlich geändert. Nicht gespeichert.{' '}
          <button className="btn btn--small" onClick={() => { setConflict(false); setDraftState(null); reload() }}>
            Neu laden (Entwurf verwerfen)
          </button>
        </div>
      ) : null}

      <nav className="segmented">
        {(
          [
            ['fields', 'Felder'],
            ['xml', 'XML'],
            ['query', `Ressourcenabfrage${query ? '' : ' (–)'}`],
            ['history', 'Verlauf'],
          ] as [View, string][]
        ).map(([v, label]) => (
          <button key={v} className={view === v ? 'is-active' : ''} onClick={() => setView(v)}>
            {label}
          </button>
        ))}
      </nav>

      {view === 'fields' ? (
        parsed.ok ? (
          <>
            <ControlTable
              controls={parsed.controls}
              inputKeys={query ? inputKeys : null}
              onMove={(from, to) => edit((x) => moveControl(x, from, to))}
              onRemove={(i) => edit((x) => removeControl(x, i))}
              onEdit={(i, e) => edit((x) => updateControl(x, i, e))}
            />
            <AddControlForm
              existingKeys={parsed.controls.map((c) => c.key ?? '')}
              inputKeys={query ? inputKeys : null}
              onAdd={(spec) => edit((x) => addControl(x, spec))}
            />
          </>
        ) : (
          <div className="notice notice--error">XML ungültig: {parsed.error} — im Reiter „XML“ korrigieren.</div>
        )
      ) : null}

      {view === 'xml' ? <LayoutXml key={versionKey} xml={draft} onValid={setDraft} /> : null}

      {view === 'query' ? (
        query ? (
          <div className="sharing__block">
            <p>
              <strong>{query.name}</strong> {ownQuery ? '' : <span className="muted">(geerbt vom Default-Board)</span>}
            </p>
            <p className="muted small">Ausgewertete Filter-Keys: {[...inputKeys].sort().join(', ') || '—'}</p>
            <details>
              <summary className="small">UFX-Abfrage anzeigen (nur lesen)</summary>
              <pre className="code-block">{query.value}</pre>
            </details>
          </div>
        ) : (
          <p className="muted">Keine Ressourcenabfrage zugewiesen oder nicht lesbar — der Abgleich der Filter-Keys entfällt.</p>
        )
      ) : null}

      {view === 'history' ? (
        <ConfigHistory
          configId={layout.id}
          onRestore={(xml) => {
            setDraft(xml)
            setView('fields')
            notify('Stand als Entwurf geladen — prüfen und speichern.')
          }}
        />
      ) : null}

      {changes.length > 0 ? (
        <div className="savebar">
          <span>
            {changes.length} ungespeicherte Änderung{changes.length === 1 ? '' : 'en'} am Filterlayout
          </span>
          <button className="btn" onClick={() => setDraftState(null)}>
            Verwerfen
          </button>
          <button className="btn btn--primary" onClick={() => setDialog('save')} disabled={!parsed.ok}>
            Vorschau &amp; Speichern
          </button>
        </div>
      ) : null}

      {dialog === 'save' ? (
        <Modal
          title={`Filterlayout „${layout.name}“ speichern`}
          wide
          onClose={() => setDialog(null)}
          footer={
            <>
              <button className="btn" onClick={() => setDialog(null)} disabled={busy}>
                Zurück
              </button>
              <button className="btn btn--primary" onClick={save} disabled={busy}>
                {busy ? 'Speichert …' : `Für ${users.length} Board${users.length === 1 ? '' : 's'} speichern`}
              </button>
            </>
          }
        >
          {users.length > 1 ? (
            <div className="notice notice--warn">Wirkt auf: {users.map((u) => u.name).join(', ')}</div>
          ) : null}
          <div className="table-wrap">
            <table className="diff-table">
              <thead>
                <tr>
                  <th>Änderung</th>
                  <th>Vorher</th>
                  <th>Nachher</th>
                </tr>
              </thead>
              <tbody>
                {changes.map((c) => (
                  <tr key={c.key}>
                    <td>{c.label}</td>
                    <td className="diff-table__before">{c.before ?? '— (nicht vorhanden)'}</td>
                    <td className="diff-table__after">{c.after ?? '— (entfernt)'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Modal>
      ) : null}

      {dialog === 'copy' ? (
        <CopyLayoutDialog
          defaultName={`${layout.name} – ${board.name}`}
          hasChanges={changes.length > 0}
          busy={busy}
          onClose={() => setDialog(null)}
          onCopy={copyForBoard}
        />
      ) : null}
    </div>
  )
}

function ControlTable({
  controls,
  inputKeys,
  onMove,
  onRemove,
  onEdit,
}: {
  controls: ControlInfo[]
  inputKeys: Set<string> | null
  onMove: (from: number, to: number) => void
  onRemove: (index: number) => void
  onEdit: (index: number, edit: Parameters<typeof updateControl>[2]) => void
}) {
  return (
    <div className="table-wrap">
      <table className="diff-table control-table">
        <thead>
          <tr>
            <th>#</th>
            <th>Beschriftung (label-id)</th>
            <th>Key</th>
            <th>Typ</th>
            <th>Tabelle / Spalte</th>
            <th>Mehrfach</th>
            <th aria-label="Aktionen" />
          </tr>
        </thead>
        <tbody>
          {controls.map((c, i) => {
            const simple = c.type === 'combo' && (c.source === 'entity' || c.source === 'optionset')
            const unmatched = inputKeys !== null && needsQuery(c) && !inputKeys.has(c.key!)
            return (
              // Index key on purpose: editing the control key must not remount the row (focus).
              <tr key={i}>
                <td className="muted">{i + 1}</td>
                <td>
                  {c.labelId !== null ? (
                    <input className="input" value={c.labelId} aria-label={`Beschriftung ${i + 1}`} onChange={(e) => onEdit(i, { 'label-id': e.target.value })} />
                  ) : (
                    <span className="muted">—</span>
                  )}
                </td>
                <td>
                  {c.key !== null ? (
                    <>
                      <input
                        className={`input input--mono${unmatched ? ' input--warn' : ''}`}
                        value={c.key}
                        aria-label={`Key ${i + 1}`}
                        disabled={!simple}
                        onChange={(e) => onEdit(i, { key: e.target.value })}
                      />
                      {unmatched ? <div className="field__hint warn">Nicht in der Ressourcenabfrage — filtert nichts.</div> : null}
                    </>
                  ) : (
                    <span className="muted">—</span>
                  )}
                </td>
                <td>
                  <span className="chip">{c.type}{c.source ? `/${c.source}` : ''}</span>
                  {c.nestedCount > 0 ? <div className="field__hint">Gruppe mit {c.nestedCount} Feldern (nur XML)</div> : null}
                </td>
                <td>
                  {simple ? (
                    <div className="control-table__entity">
                      <input className="input input--mono" value={c.entity ?? ''} aria-label={`Tabelle ${i + 1}`} onChange={(e) => onEdit(i, { entity: e.target.value })} />
                      {c.source === 'optionset' ? (
                        <input className="input input--mono" value={c.attribute ?? ''} aria-label={`Spalte ${i + 1}`} onChange={(e) => onEdit(i, { attribute: e.target.value })} />
                      ) : null}
                    </div>
                  ) : (
                    <span className="muted small">{c.entity ?? '—'}</span>
                  )}
                </td>
                <td>
                  {simple ? (
                    <input type="checkbox" checked={c.multi} aria-label={`Mehrfachauswahl ${i + 1}`} onChange={(e) => onEdit(i, { multi: e.target.checked })} />
                  ) : null}
                </td>
                <td className="control-table__actions">
                  <button className="icon-btn" onClick={() => onMove(i, i - 1)} disabled={i === 0} aria-label="Nach oben">
                    ↑
                  </button>
                  <button className="icon-btn" onClick={() => onMove(i, i + 1)} disabled={i === controls.length - 1} aria-label="Nach unten">
                    ↓
                  </button>
                  <button className="icon-btn icon-btn--danger" onClick={() => onRemove(i)} aria-label="Feld entfernen">
                    ✕
                  </button>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function AddControlForm({
  existingKeys,
  inputKeys,
  onAdd,
}: {
  existingKeys: string[]
  inputKeys: Set<string> | null
  onAdd: (spec: NewControl) => void
}) {
  const [spec, setSpec] = useState<NewControl>({ kind: 'lookup', key: '', labelId: '', entity: '', attribute: '', multi: true })
  const key = spec.key.trim()
  const problems = [
    !key ? 'Key fehlt' : existingKeys.includes(key) ? 'Key gibt es schon' : null,
    !spec.labelId.trim() ? 'Beschriftung fehlt' : null,
    !LOGICAL_NAME.test(spec.entity.trim()) ? 'Tabelle als logischer Name (z. B. sst_site)' : null,
    spec.kind === 'optionset' && !LOGICAL_NAME.test((spec.attribute ?? '').trim()) ? 'Spalte als logischer Name' : null,
  ].filter(Boolean)
  const unmatched = inputKeys !== null && key !== '' && !inputKeys.has(key)

  return (
    <fieldset className="subcard add-control">
      <legend>Feld hinzufügen</legend>
      <div className="add-control__grid">
        <label className="form-row">
          <span>Art</span>
          <select className="input" value={spec.kind} onChange={(e) => setSpec({ ...spec, kind: e.target.value as NewControl['kind'] })}>
            <option value="lookup">Datensätze einer Tabelle</option>
            <option value="optionset">Auswahlwerte einer Spalte</option>
          </select>
        </label>
        <label className="form-row">
          <span>Beschriftung</span>
          <input className="input" value={spec.labelId} placeholder="z. B. Niederlassung" onChange={(e) => setSpec({ ...spec, labelId: e.target.value })} />
        </label>
        <label className="form-row">
          <span>Key</span>
          <input className="input input--mono" value={spec.key} placeholder="z. B. Site" onChange={(e) => setSpec({ ...spec, key: e.target.value })} />
        </label>
        <label className="form-row">
          <span>Tabelle</span>
          <input
            className="input input--mono"
            value={spec.entity}
            placeholder={spec.kind === 'lookup' ? 'z. B. sst_site' : 'bookableresource'}
            onChange={(e) => setSpec({ ...spec, entity: e.target.value })}
          />
        </label>
        {spec.kind === 'optionset' ? (
          <label className="form-row">
            <span>Spalte</span>
            <input className="input input--mono" value={spec.attribute ?? ''} placeholder="z. B. msdyn_workertype" onChange={(e) => setSpec({ ...spec, attribute: e.target.value })} />
          </label>
        ) : null}
        <label className="form-check">
          <input type="checkbox" checked={spec.multi} onChange={(e) => setSpec({ ...spec, multi: e.target.checked })} />
          <span>Mehrfachauswahl</span>
        </label>
      </div>
      {unmatched ? (
        <p className="field__hint warn">
          Die Ressourcenabfrage wertet „{key}“ nicht aus. Das Feld erscheint im Filterbereich, filtert aber erst, wenn die
          Abfrage um <code>$input/{key}</code> erweitert ist.
        </p>
      ) : null}
      <div className="toolbar">
        <button
          className="btn btn--primary btn--small"
          disabled={problems.length > 0}
          title={problems.join(' · ')}
          onClick={() => {
            onAdd({ ...spec, key, labelId: spec.labelId.trim(), entity: spec.entity.trim(), attribute: spec.attribute?.trim() })
            setSpec({ ...spec, key: '', labelId: '', entity: '', attribute: '' })
          }}
        >
          Hinzufügen
        </button>
        {problems.length > 0 && (spec.key || spec.labelId || spec.entity) ? <span className="muted small">{problems.join(' · ')}</span> : null}
      </div>
    </fieldset>
  )
}

function LayoutXml({ xml, onValid }: { xml: string; onValid: (xml: string) => void }) {
  const [text, setText] = useState(xml)
  const p = parseLayout(text)
  return (
    <div className="json-area">
      <div className="json-area__head">
        <h3>Filterlayout-XML</h3>
        {p.ok ? <span className="badge badge--ok">gültig · {p.controls.length} Felder</span> : <span className="badge badge--error">Ungültig: {p.error}</span>}
      </div>
      <textarea
        className="input input--mono json-area__text"
        spellCheck={false}
        value={text}
        aria-label="Filterlayout-XML"
        onChange={(e) => {
          setText(e.target.value)
          if (parseLayout(e.target.value).ok) onValid(e.target.value)
        }}
      />
    </div>
  )
}

function CopyLayoutDialog({
  defaultName,
  hasChanges,
  busy,
  onClose,
  onCopy,
}: {
  defaultName: string
  hasChanges: boolean
  busy: boolean
  onClose: () => void
  onCopy: (name: string) => void
}) {
  const [name, setName] = useState(defaultName)
  return (
    <Modal
      title="Filterlayout für dieses Board kopieren"
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose} disabled={busy}>
            Abbrechen
          </button>
          <button className="btn btn--primary" onClick={() => onCopy(name.trim())} disabled={busy || name.trim() === ''}>
            {busy ? 'Legt an …' : 'Kopie anlegen und zuweisen'}
          </button>
        </>
      }
    >
      <label className="form-row">
        <span>Name der neuen Konfiguration</span>
        <input className="input" value={name} autoFocus onChange={(e) => setName(e.target.value)} />
      </label>
      <p className="muted small">
        Legt eine neue Filterlayout-Konfiguration an{hasChanges ? ' — mit deinen ungespeicherten Änderungen' : ''} und setzt sie
        als Filterlayout dieses Boards. Das bisherige Layout und die anderen Boards bleiben unverändert. Die Ressourcenabfrage
        wird nicht kopiert.
      </p>
    </Modal>
  )
}

function ConfigHistory({ configId, onRestore }: { configId: string; onRestore: (xml: string) => void }) {
  const snapshots = listConfigSnapshots(configId)
  if (snapshots.length === 0) return <p className="muted">Noch keine Sicherungen dieses Filterlayouts in diesem Browser.</p>
  return (
    <ul className="history">
      {snapshots.map((s) => (
        <li key={s.at}>
          <span>
            {formatDate(s.at)} · {s.label}
          </span>
          <button className="btn btn--small" onClick={() => onRestore(s.value)}>
            Als Entwurf laden
          </button>
        </li>
      ))}
    </ul>
  )
}
