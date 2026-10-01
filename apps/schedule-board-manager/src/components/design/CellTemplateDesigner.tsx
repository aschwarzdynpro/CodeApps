import { useCallback, useState, type ReactNode } from 'react'
import { Input, Switch, Tab, TabList } from '@fluentui/react-components'
import { CONFIG_TYPE, ConflictError, type Board, type BoardSummary, type ConfigDetail } from '../../types/board'
import { getBoardService, type BoardService } from '../../services/boardService'
import { useLoad } from '../../hooks/useLoad'
import { configUsers, isDefaultBoard } from '../../utils/boardRules'
import { renderTemplate } from '../../utils/handlebarsLite'
import { foldUnchanged, lineDiff } from '../../utils/lineDiff'
import { queryOutputs, type QueryOutput } from '../../utils/queryAnalysis'
import { slotEntries } from '../../utils/settingsFields'
import { parseSettings } from '../../utils/settingsModel'
import { saveConfigSnapshot } from '../../utils/snapshots'
import { sameId } from '../../utils/format'
import {
  CELL_BUILTINS,
  CELL_STATE_FLAGS,
  STARTER_CELL_TEMPLATE,
  URS_PARTIALS,
  cellVariables,
  formatSample,
  lintTemplate,
  parseSample,
  sampleFor,
  ursHelpers,
  type TemplateLint,
} from '../../utils/templates'
import type { Notify } from '../BoardDetail'
import { ConfigHistory } from '../ConfigHistory'
import { Modal } from '../Modal'
import { Btn } from '../ui'
import { PreviewFrame } from './PreviewFrame'
import { CELL_WIDTH, cellRowsDoc, cellRowsHeight } from './previewDocs'
import { useInsert } from './insert'
import { SampleTable, TemplateWorkbench } from './Workbench'

interface Props {
  board: Board
  boards: BoardSummary[]
  /** Effective template and query: the board's own, else the Default board's. */
  cellId: string | null
  queryId: string | null
  /** The Default board's template — to count inheriting boards and warn before editing it. */
  defaultCellId: string | null
  /** Unsaved board changes — creating/assigning a template writes the board and would drop them. */
  boardDirty: boolean
  rowHeight: number
  notify: Notify
  onBoardChanged: () => void
}

/** Rows of the preview: the same resource in the states the board styles differently. */
const STATES: { label: string; name: string | null; flags: Record<string, boolean>; saOnly?: boolean }[] = [
  { label: 'normal', name: null, flags: {} },
  { label: 'ausgewählt', name: 'Jonas Feldmann', flags: { ResourceCellSelected: true } },
  { label: 'nicht verfügbar', name: 'Aylin Demir', flags: { ResourceUnavailable: true } },
  { label: 'passt zur Verfügbarkeitssuche', name: 'Per Andersen', flags: { IsMatchingAvailability: true }, saOnly: true },
]

const NO_FLAGS = Object.fromEntries(CELL_STATE_FLAGS.map((f) => [f, false]))

function defaultSample(name: string, outputs: QueryOutput[]): string {
  const builtin = CELL_BUILTINS.find((b) => b.name === name)
  if (builtin) return formatSample(builtin.sample)
  const out = outputs.find((o) => o.name === name)
  // Show the first bag flag switched on, so conditional blocks are visible right away.
  if (out?.source === 'bag') return outputs.find((o) => o.source === 'bag')?.name === name ? 'true' : 'false'
  if (/count/i.test(name)) return '2'
  return sampleFor(name, { entity: 'bookableresource' })
}

/**
 * Resource cell template (`msdyn_configuration`, type 192350001) with a
 * live preview of the resource column. Like the filter layout, the template
 * is its own row shared by every board that points to it (or inherits it
 * from the Default board) — saving writes the row, "copy for this board"
 * creates a new one and assigns it.
 */
export function CellTemplateDesigner({ board, boards, cellId, queryId, defaultCellId, boardDirty, rowHeight, notify, onBoardChanged }: Props) {
  const own = board.content.lookups.msdyn_resourcecelltemplate
  const inherit = !isDefaultBoard(board)

  const loadConfigs = useCallback(
    async (svc: BoardService): Promise<[ConfigDetail | null, ConfigDetail | null]> =>
      Promise.all([
        cellId ? svc.getConfiguration(cellId) : Promise.resolve(null),
        queryId ? svc.getConfiguration(queryId).catch(() => null) : Promise.resolve(null),
      ]),
    [cellId, queryId],
  )
  const { data, error, reload } = useLoad(`cell:${cellId}|${queryId}`, loadConfigs)
  const [cell, query] = data ?? [null, null]

  const [tab, setTab] = useState<'template' | 'history'>('template')
  const [draftState, setDraftState] = useState<{ key: string; text: string } | null>(null)
  const [overrides, setOverrides] = useState<Record<string, string>>({})
  const [saView, setSaView] = useState(false)
  const [dialog, setDialog] = useState<'save' | 'copy' | 'create' | null>(null)
  const [busy, setBusy] = useState(false)
  const [conflict, setConflict] = useState(false)

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

  /** New configuration row with `text`, assigned to this board. */
  const createForBoard = (name: string, text: string) =>
    run(async (svc) => {
      const id = await svc.createConfiguration(name, CONFIG_TYPE.resourceCellTemplate, text)
      await svc.updateBoard(board, { ...board.content, lookups: { ...board.content.lookups, msdyn_resourcecelltemplate: id } })
      setDialog(null)
      setDraftState(null)
      notify(`Zellvorlage „${name}“ angelegt und „${board.name}“ zugewiesen.`)
      onBoardChanged()
    })

  const dirtyHint = boardDirty ? 'Erst die Änderungen am Board speichern oder verwerfen — das Zuweisen schreibt das Board.' : undefined

  if (error) return <div className="notice notice--error">Zellvorlage konnte nicht geladen werden: {error}</div>

  if (!cellId) {
    return (
      <div className="notice">
        <p>
          {inherit ? 'Weder dieses Board noch das Default-Board verweisen' : 'Das Default-Board verweist'} auf keine
          Ressourcenzellen-Vorlage — das Board nutzt die Produktvorlage, die sich hier nicht lesen lässt.
        </p>
        <p className="small">
          Eine eigene Vorlage beginnt mit dem Aufbau des Microsoft-Beispiels (Bild, Name, gebuchte Dauer, Auslastung, Kartenpin).
        </p>
        <Btn kind="primary" onClick={() => setDialog('create')} disabled={boardDirty} title={dirtyHint}>
          Zellvorlage anlegen …
        </Btn>
        {dialog === 'create' ? (
          <NameDialog
            title="Zellvorlage anlegen"
            defaultName={`Resource Cell Template – ${board.name}`}
            confirmLabel="Anlegen und zuweisen"
            busy={busy}
            onClose={() => setDialog(null)}
            onConfirm={(name) => createForBoard(name, STARTER_CELL_TEMPLATE)}
          >
            Legt eine neue Konfiguration (Typ Ressourcenzellen-Vorlage) an und setzt sie als Vorlage dieses Boards.
          </NameDialog>
        ) : null}
      </div>
    )
  }
  if (!cell) return <div className="loading">Lade Zellvorlage …</div>

  const versionKey = `${cell.id}:${cell.version ?? ''}`
  const draft = draftState?.key === versionKey ? draftState.text : cell.value
  const setDraft = (text: string) => setDraftState({ key: versionKey, text })
  const dirty = draft !== cell.value
  const users = configUsers(boards, 'msdyn_resourcecelltemplate', cell.id, defaultCellId)
  const isDefaultTemplate = sameId(cell.id, defaultCellId)
  const settings = parseSettings(board.content.settings)
  const saCopies = slotEntries(settings.ok ? settings.value : null).filter((e) =>
    sameId(String(e.slot.ScheduleAssistantResourceCellTemplateId ?? ''), cell.id),
  )

  // Variables: what the board always provides, what the query returns, what the template reads.
  const outputs = queryOutputs(query?.value).filter((o) => !CELL_BUILTINS.some((b) => b.name === o.name))
  const used = cellVariables(draft)
  const unknown = query ? used.filter((v) => !CELL_BUILTINS.some((b) => b.name === v) && !outputs.some((o) => o.name === v)) : []
  const sampleText = (name: string) => overrides[name] ?? defaultSample(name, outputs)
  const base: Record<string, unknown> = {}
  for (const v of used) base[v] = parseSample(sampleText(v))

  const helpers = ursHelpers({ saGridView: saView })
  const states = STATES.filter((s) => saView || !s.saOnly)
  const results = states.map((s) =>
    renderTemplate(draft, { ...base, ...NO_FLAGS, ...s.flags, name: s.name ?? base.name }, { helpers, partials: URS_PARTIALS }),
  )
  const failed = results.find((r) => !r.ok)
  const issues = [...new Set(results.flatMap((r) => (r.ok ? r.issues : [])))]

  const lints: TemplateLint[] = [
    ...(failed && !failed.ok ? [{ level: 'error' as const, message: `Syntaxfehler: ${failed.error}` }] : []),
    ...lintTemplate(draft, 'cell'),
    ...issues.map((message) => ({ level: 'warn' as const, message })),
    ...(unknown.length
      ? [{ level: 'warn' as const, message: `Nicht in der Ressourcenabfrage gefunden: ${unknown.join(', ')} — bleibt im Board leer, wenn die Abfrage den Wert nicht liefert.` }]
      : []),
  ]

  const save = () =>
    run(async (svc) => {
      saveConfigSnapshot(cell.id, 'Vor dem Speichern', cell.value)
      await svc.updateConfiguration(cell, draft)
      setDialog(null)
      setDraftState(null)
      notify(`Zellvorlage „${cell.name}“ gespeichert — wirkt auf ${users.length} Board${users.length === 1 ? '' : 's'}.`)
      reload()
    })

  return (
    <div className="layout-editor">
      <header className="layout-editor__head">
        <div>
          <h3>{cell.name}</h3>
          <p className="muted small">
            {own ? 'Eigene Zellvorlage dieses Boards' : 'Geerbt vom Default-Board'} · genutzt von{' '}
            {users.length === 0 ? 'keinem Board' : users.map((u) => u.name).join(', ')}
            {query ? ` · Werte aus „${query.name}“` : ' · Ressourcenabfrage nicht lesbar'}
          </p>
        </div>
        <Btn onClick={() => setDialog('copy')} disabled={boardDirty || !!failed} title={dirtyHint}>
          Als Kopie nur für dieses Board …
        </Btn>
      </header>

      {isDefaultTemplate ? (
        <div className="notice notice--warn">
          Das ist die Vorlage des Default-Boards. Microsoft rät, Standardvorlagen nicht direkt zu ändern, sondern eine Kopie anzulegen
          und diese zuzuweisen.
        </div>
      ) : null}
      {users.length > 1 ? (
        <div className="notice notice--warn">
          Diese Zellvorlage teilen sich {users.length} Boards. Speichern wirkt auf alle — für Änderungen nur an „{board.name}“ zuerst
          „Als Kopie nur für dieses Board“.
        </div>
      ) : null}
      {saCopies.length > 0 ? (
        <p className="muted small">
          Der Schedule Assistant nutzt in {saCopies.length} Schedule-Typ{saCopies.length === 1 ? '' : 'en'} eine Inline-Kopie dieser
          Vorlage aus den Board-Settings. Speichern hier ändert diese Kopien nicht (nur über den JSON-Reiter).
        </p>
      ) : null}
      {conflict ? (
        <div className="notice notice--error">
          Die Zellvorlage wurde zwischenzeitlich geändert. Nicht gespeichert.{' '}
          <Btn
            small
            onClick={() => {
              setConflict(false)
              setDraftState(null)
              reload()
            }}
          >
            Neu laden (Entwurf verwerfen)
          </Btn>
        </div>
      ) : null}

      <TabList size="small" selectedValue={tab} onTabSelect={(_, d) => setTab(d.value as 'template' | 'history')}>
        <Tab value="template">Vorlage</Tab>
        <Tab value="history">Verlauf</Tab>
      </TabList>

      {tab === 'template' ? (
        <TemplateWorkbench
          label="Ressourcenzellen-Vorlage (Handlebars)"
          value={draft}
          readOnly={false}
          lints={lints}
          onChange={setDraft}
          palette={<VariablePalette outputs={outputs} queryRead={query !== null} />}
        >
          <div className="preview-controls">
            <Switch label="Schedule-Assistant-Ansicht" checked={saView} onChange={(e) => setSaView(e.target.checked)} />
          </div>
          {failed ? (
            <div className="notice notice--error">Keine Vorschau — die Vorlage enthält einen Syntaxfehler (siehe links).</div>
          ) : (
            <PreviewFrame
              title="Vorschau Ressourcenzellen"
              doc={cellRowsDoc(
                results.map((r, i) => ({ html: r.ok ? r.html : '', state: states[i].label })),
                rowHeight,
              )}
              height={cellRowsHeight(states.length, rowHeight)}
            />
          )}
          <p className="muted small">
            Ressourcenspalte ({CELL_WIDTH} px) in den Zuständen, die das Board unterschiedlich darstellt. Zeilenhöhe {rowHeight} px aus den
            Board-Einstellungen. Bilder werden nicht geladen, Font-Awesome-Icons erscheinen als Ersatzzeichen. Annäherung an das Board,
            kein Abbild.
          </p>
          <SampleTable
            rows={used
              .filter((v) => !CELL_STATE_FLAGS.includes(v))
              .map((v) => ({
                key: v,
                label: CELL_BUILTINS.find((b) => b.name === v)?.label ?? outputs.find((o) => o.name === v)?.detail,
                value: sampleText(v),
                overridden: v in overrides,
              }))}
            hint="true/false und Zahlen werden als solche gelesen — {{#if}} prüft, ob ein Wert gesetzt ist."
            onChange={(key, value) => setOverrides({ ...overrides, [key]: value })}
            onReset={() => setOverrides({})}
          />
        </TemplateWorkbench>
      ) : (
        <ConfigHistory
          configId={cell.id}
          emptyText="Noch keine Sicherungen dieser Zellvorlage in diesem Browser."
          onRestore={(text) => {
            setDraft(text)
            setTab('template')
            notify('Stand als Entwurf geladen — prüfen und speichern.')
          }}
        />
      )}

      {dirty ? (
        <div className="savebar">
          <span>Ungespeicherte Änderungen an der Zellvorlage</span>
          <Btn onClick={() => setDraftState(null)}>Verwerfen</Btn>
          <Btn kind="primary" onClick={() => setDialog('save')} disabled={!!failed} title={failed ? 'Erst den Syntaxfehler beheben' : undefined}>
            Vorschau &amp; Speichern
          </Btn>
        </div>
      ) : null}

      {dialog === 'save' ? (
        <Modal
          title={`Zellvorlage „${cell.name}“ speichern`}
          wide
          onClose={() => setDialog(null)}
          footer={
            <>
              <Btn onClick={() => setDialog(null)} disabled={busy}>
                Zurück
              </Btn>
              <Btn kind="primary" onClick={save} disabled={busy}>
                {busy ? 'Speichert …' : `Für ${users.length} Board${users.length === 1 ? '' : 's'} speichern`}
              </Btn>
            </>
          }
        >
          {users.length > 1 ? <div className="notice notice--warn">Wirkt auf: {users.map((u) => u.name).join(', ')}</div> : null}
          <p className="muted small">Der bisherige Stand wird vorher im Verlauf gesichert.</p>
          <LineDiffView before={cell.value} after={draft} />
        </Modal>
      ) : null}

      {dialog === 'copy' ? (
        <NameDialog
          title="Zellvorlage für dieses Board kopieren"
          defaultName={`${cell.name} – ${board.name}`}
          confirmLabel="Kopie anlegen und zuweisen"
          busy={busy}
          onClose={() => setDialog(null)}
          onConfirm={(name) => createForBoard(name, draft)}
        >
          Legt eine neue Ressourcenzellen-Vorlage an{dirty ? ' — mit deinen ungespeicherten Änderungen' : ''} und setzt sie als Vorlage
          dieses Boards. Die bisherige Vorlage und die anderen Boards bleiben unverändert. Die Ressourcenabfrage wird nicht kopiert.
        </NameDialog>
      ) : null}
    </div>
  )
}

/** Board variables, query outputs and the usual building blocks, inserted as Handlebars. */
function VariablePalette({ outputs, queryRead }: { outputs: QueryOutput[]; queryRead: boolean }) {
  const onInsert = useInsert()
  const item = (key: string, text: string, label: string, detail?: string) => (
    <li key={key}>
      <button type="button" disabled={!onInsert} onClick={() => onInsert?.(text)}>
        <span>
          {label}
          {detail ? <span className="muted"> · {detail}</span> : null}
        </span>
        <code>{text}</code>
      </button>
    </li>
  )
  return (
    <section className="palette" aria-label="Variablen einfügen">
      <div className="palette__head">
        <strong>Variablen einfügen</strong>
      </div>
      <ul className="palette__list">
        <li className="palette__group">Vom Board</li>
        {CELL_BUILTINS.map((b) => item(b.name, `{{${b.name}}}`, b.label))}
        <li className="palette__group">Aus der Ressourcenabfrage</li>
        {outputs.length === 0 ? (
          <li className="muted small palette__note">
            {queryRead ? 'Die Abfrage liefert keine zusätzlichen Werte (Alias-Attribute oder <bag>-Einträge).' : 'Ressourcenabfrage nicht lesbar.'}
          </li>
        ) : (
          outputs.map((o) => item(o.name, `{{${o.name}}}`, o.name, o.source === 'bag' ? `Bedingung ${o.detail}` : o.detail))
        )}
        <li className="palette__group">Bausteine</li>
        {item('if', '{{#if Bedingung}}\n\n{{/if}}', 'Wenn-Block')}
        {item('iif', '{{iif Bedingung "ja" "nein"}}', 'Wert je nach Bedingung (iif)')}
        {item('board', '{{#if (eq (is-sa-grid-view) false) }}\n\n{{/if}}', 'Nur im Board, nicht im Schedule Assistant')}
      </ul>
      <p className="muted small">
        Neue Werte brauchen ein Attribut mit Alias oder einen &lt;bag&gt;-Eintrag in der Ressourcenabfrage (Microsoft-Beispiele
        „Custom Resource Attribute“, „Crew Information“).
      </p>
    </section>
  )
}

function LineDiffView({ before, after }: { before: string; after: string }) {
  const rows = foldUnchanged(lineDiff(before, after))
  return (
    <pre className="line-diff">
      {rows.map((r, i) =>
        r.op === 'skip' ? (
          <div key={i} className="line-diff__skip">
            … {r.count} unveränderte Zeile{r.count === 1 ? '' : 'n'}
          </div>
        ) : (
          <div key={i} className={`line-diff__${r.op}`}>
            {r.op === 'add' ? '+ ' : r.op === 'del' ? '- ' : '  '}
            {r.text}
          </div>
        ),
      )}
    </pre>
  )
}

function NameDialog({
  title,
  defaultName,
  confirmLabel,
  busy,
  onClose,
  onConfirm,
  children,
}: {
  title: string
  defaultName: string
  confirmLabel: string
  busy: boolean
  onClose: () => void
  onConfirm: (name: string) => void
  children: ReactNode
}) {
  const [name, setName] = useState(defaultName)
  return (
    <Modal
      title={title}
      onClose={onClose}
      footer={
        <>
          <Btn onClick={onClose} disabled={busy}>
            Abbrechen
          </Btn>
          <Btn kind="primary" onClick={() => onConfirm(name.trim())} disabled={busy || name.trim() === ''}>
            {busy ? 'Legt an …' : confirmLabel}
          </Btn>
        </>
      }
    >
      <label className="form-row">
        <span>Name der neuen Konfiguration</span>
        <Input className="input" value={name} autoFocus onChange={(e) => setName(e.target.value)} />
      </label>
      <p className="muted small">{children}</p>
    </Modal>
  )
}
