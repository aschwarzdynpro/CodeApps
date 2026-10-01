import { useState } from 'react'
import {
  CONFIG_TYPE,
  SHARE_TYPE,
  SHARE_TYPE_LABEL,
  type Board,
  type BoardSummary,
  type ConfigRef,
} from '../types/board'
import { getBoardService } from '../services/boardService'
import { prepareImport, previewContent, runImport, type ImportMode, type PreparedImport } from '../services/transferService'
import {
  compactWhere,
  parsePackage,
  samePayload,
  type BoardPackage,
  type ConfigAction,
  type ConfigChoice,
  type ImportPlan,
  type RefChoice,
} from '../utils/boardTransfer'
import { diffContent, nextOrderNumber, protectionOf } from '../utils/boardRules'
import { KNOWN_BOOKING_SETUPS } from '../utils/settingsFields'
import { formatDate } from '../utils/format'
import { ORG_URL } from '../config'
import { DiffTable } from './DiffTable'
import { Modal } from './Modal'
import type { Notify } from './BoardDetail'
import { Btn, FilePicker, Select } from './ui'
import { Checkbox, Input, Radio, RadioGroup } from '@fluentui/react-components'

interface Props {
  boards: BoardSummary[]
  notify: Notify
  onImported: (boardId: string) => void
}

const CONFIG_TYPE_LABEL: Record<number, string> = {
  [CONFIG_TYPE.filterLayout]: 'Filterlayout',
  [CONFIG_TYPE.resourceCellTemplate]: 'Ressourcenzellen-Vorlage',
  [CONFIG_TYPE.retrieveResourcesQuery]: 'Ressourcenabfrage',
  [CONFIG_TYPE.saFilterLayout]: 'SA-Filterlayout',
  [CONFIG_TYPE.saRetrieveConstraints]: 'SA-Einschränkungen',
  [CONFIG_TYPE.cloneQuery]: 'Klon-Abfrage',
}

const REF_SECTIONS: { kind: RefChoice['kind']; title: string; removeHint: string }[] = [
  { kind: 'view', title: 'Ansichten', removeHint: 'Fehlt eine Ansicht, wird das Feld geleert; ein Anforderungsbereich ohne Ansicht fällt weg.' },
  { kind: 'bookingSetup', title: 'Schedule-Typen', removeHint: 'Fehlt ein Schedule-Typ, fällt sein Eintrag (Vorlagen, Ansichten) aus den Settings.' },
  { kind: 'timeZone', title: 'Zeitzone', removeHint: 'Ohne Zeitzone gilt die des Benutzers.' },
  { kind: 'record', title: 'Gespeicherte Filterwerte', removeHint: 'Nicht gefundene Datensätze werden aus dem gespeicherten Filter entfernt.' },
]

const STATUS_LABEL: Record<RefChoice['status'], string> = {
  id: 'gleiche ID',
  name: 'über den Namen gefunden',
  manual: 'manuell gewählt',
  missing: 'fehlt',
  unchecked: 'nicht prüfbar — bleibt unverändert',
}

type Loaded = { fileName: string; pkg: BoardPackage; legacy: boolean; prepared: PreparedImport }

/** Board package (from „Export“) → mapping per reference → new or replaced board. */
export function ImportView({ boards, notify, onImported }: Props) {
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [plan, setPlan] = useState<ImportPlan | null>(null)
  const [fileError, setFileError] = useState<string | null>(null)
  const [reading, setReading] = useState(false)

  const [modeKind, setModeKind] = useState<'new' | 'replace'>('new')
  const [name, setName] = useState('')
  const [shareType, setShareType] = useState<number>(SHARE_TYPE.everyone)
  const [replaceId, setReplaceId] = useState('')
  const [includeFilterValues, setIncludeFilterValues] = useState(true)

  const [review, setReview] = useState<{ mode: ImportMode; replaceBoard: Board | null } | null>(null)
  const [busy, setBusy] = useState(false)

  const replaceable = boards.filter((b) => protectionOf(b).canRename)

  const readFile = async (file: File) => {
    setReading(true)
    setFileError(null)
    setLoaded(null)
    setPlan(null)
    try {
      const parsed = parsePackage(await file.text())
      if (!parsed.ok) {
        setFileError(parsed.error)
        return
      }
      const prepared = await prepareImport(await getBoardService(), parsed.pkg)
      const base = parsed.pkg.board.name.trim() || 'Import'
      const taken = boards.some((b) => b.name.trim().toLowerCase() === base.toLowerCase())
      setLoaded({ fileName: file.name, pkg: parsed.pkg, legacy: parsed.legacy, prepared })
      setPlan(prepared.plan)
      setName(taken ? `${base} (Import)` : base)
      setShareType(parsed.pkg.board.shareType === SHARE_TYPE.system ? SHARE_TYPE.everyone : parsed.pkg.board.shareType)
    } catch (err) {
      setFileError(err instanceof Error ? err.message : String(err))
    } finally {
      setReading(false)
    }
  }

  const updateConfig = (i: number, patch: Partial<ConfigChoice>) =>
    setPlan((p) => (p ? { ...p, configs: p.configs.map((c, j) => (j === i ? { ...c, ...patch } : c)) } : p))

  const updateRef = (r: RefChoice, targetId: string | null) =>
    setPlan((p) =>
      p
        ? {
            ...p,
            refs: p.refs.map((x) => (x.kind === r.kind && x.sourceId === r.sourceId ? { ...x, targetId, status: 'manual' } : x)),
          }
        : p,
    )

  const openReview = async () => {
    if (!loaded || !plan) return
    if (modeKind === 'new') {
      if (name.trim()) setReview({ mode: { kind: 'new', name: name.trim(), shareType, order: nextOrderNumber(boards) }, replaceBoard: null })
      return
    }
    if (!replaceId) return
    setBusy(true)
    try {
      const board = await (await getBoardService()).getBoard(replaceId)
      setReview({ mode: { kind: 'replace', board }, replaceBoard: board })
    } catch (err) {
      notify(err instanceof Error ? err.message : String(err), 'error')
    } finally {
      setBusy(false)
    }
  }

  const execute = async () => {
    if (!loaded || !plan || !review) return
    setBusy(true)
    try {
      const result = await runImport(await getBoardService(), loaded.pkg, loaded.prepared, plan, review.mode, includeFilterValues)
      const extra = [
        result.createdConfigs.length ? `${result.createdConfigs.length} Konfiguration(en) angelegt` : '',
        result.updatedConfigs.length ? `${result.updatedConfigs.length} aktualisiert` : '',
      ].filter(Boolean)
      notify(
        `${review.mode.kind === 'new' ? `„${review.mode.name}“ angelegt` : `„${review.mode.board.name}“ ersetzt`}${extra.length ? ` · ${extra.join(', ')}` : ''}.`,
      )
      setReview(null)
      onImported(result.boardId)
    } catch (err) {
      notify(err instanceof Error ? err.message : String(err), 'error')
    } finally {
      setBusy(false)
    }
  }

  const pkg = loaded?.pkg
  const sameEnv = !!pkg?.source.orgUrl && !!ORG_URL && pkg.source.orgUrl.replace(/\/+$/, '').toLowerCase() === ORG_URL.toLowerCase()
  const nameTaken = boards.some((b) => b.name.trim().toLowerCase() === name.trim().toLowerCase())
  const missingCount = plan ? plan.refs.filter((r) => r.targetId === null).length + plan.configs.filter((c) => c.action === 'clear').length : 0
  const canReview = !!plan && !busy && (modeKind === 'new' ? name.trim() !== '' : replaceId !== '')

  return (
    <section className="page">
      <header className="page__header">
        <h1>Board importieren</h1>
        <p className="muted">
          Datei aus „Export“ eines Boards wählen — auch aus einer anderen Umgebung. Die App ordnet jede Ansicht, Konfiguration,
          jeden Schedule-Typ und gespeicherten Filterwert der Zielumgebung zu (erst über die ID, dann über den Namen). Du prüfst
          die Zuordnung, bevor etwas geschrieben wird.
        </p>
      </header>

      <div className="import">
        <FilePicker
          accept=".json,application/json"
          fileName={loaded?.fileName ?? null}
          hint="Export-Datei eines Boards (.board.json)"
          onFile={(f) => void readFile(f)}
        />
        {reading ? <p className="muted">Lese Datei und Zielumgebung …</p> : null}
        {fileError ? <div className="notice notice--error">{fileError}</div> : null}

        {pkg && plan && loaded ? (
          <>
            <div className="notice">
              <strong>{pkg.board.name}</strong> · {SHARE_TYPE_LABEL[pkg.board.shareType] ?? pkg.board.shareType}
              {pkg.exportedAt ? ` · exportiert ${formatDate(pkg.exportedAt)}` : ''}
              {pkg.source.orgUrl ? ` · aus ${pkg.source.orgUrl.replace(/^https:\/\//, '')}` : ''}
            </div>
            {loaded.legacy ? (
              <div className="notice notice--warn">
                Alte Export-Datei: Sie enthält weder die Inhalte der Konfigurationen noch die Namen der Ansichten. Zugeordnet wird
                nur über IDs, fehlende Konfigurationen können nicht angelegt werden. Für einen vollständigen Transfer das Board in
                der Quellumgebung neu exportieren.
              </div>
            ) : null}
            {sameEnv ? <div className="notice">Die Datei stammt aus dieser Umgebung — der Import legt eine Kopie an oder ersetzt ein Board.</div> : null}

            <section className="import__block">
              <h2>1. Ziel</h2>
              <RadioGroup value={modeKind} onChange={(_, d) => setModeKind(d.value as 'new' | 'replace')} aria-label="Ziel">
              <Radio value="new" label="Als neues Board anlegen" />
              {modeKind === 'new' ? (
                <div className="import__indent">
                  <label className="form-row">
                    <span>Name</span>
                    <Input className="input" value={name} onChange={(e) => setName(e.target.value)} />
                  </label>
                  {nameTaken ? <p className="field__hint warn">Ein Board mit diesem Namen gibt es schon.</p> : null}
                  <label className="form-row">
                    <span>Freigabe</span>
                    <Select
                      className="input"
                      aria-label="Freigabe"
                      value={String(shareType)}
                      options={[SHARE_TYPE.everyone, SHARE_TYPE.justMe, SHARE_TYPE.specificPeople].map((v) => ({ value: String(v), label: SHARE_TYPE_LABEL[v] }))}
                      onChange={(v) => setShareType(Number(v))}
                    />
                  </label>
                  <p className="muted small">Wird als letzter Tab einsortiert. Besitzer bist du; Datensatz-Freigaben kommen nicht mit.</p>
                </div>
              ) : null}
              <Radio value="replace" label="Bestehendes Board ersetzen" />
              {modeKind === 'replace' ? (
                <div className="import__indent">
                  <Select
                    className="input"
                    aria-label="Board, das ersetzt wird"
                    placeholder="Board wählen …"
                    value={replaceId}
                    options={replaceable.map((b) => ({ value: b.id, label: b.name }))}
                    onChange={setReplaceId}
                  />
                  <p className="muted small">
                    Name, Reihenfolge, Freigabe und Besitzer bleiben; alles andere kommt aus der Datei. Der bisherige Stand landet im
                    Verlauf des Boards. System-Boards lassen sich nicht ersetzen.
                  </p>
                </div>
              ) : null}
              </RadioGroup>
            </section>

            <section className="import__block">
              <h2>2. Konfigurationen</h2>
              {plan.configs.length === 0 ? <p className="muted">Das Board verweist auf keine Konfiguration.</p> : null}
              {plan.configs.length > 0 ? (
                <table className="diff-table import__table">
                  <thead>
                    <tr>
                      <th>Verwendet in</th>
                      <th>In der Datei</th>
                      <th>In dieser Umgebung</th>
                      <th>Aktion</th>
                    </tr>
                  </thead>
                  <tbody>
                    {plan.configs.map((c, i) => (
                      <ConfigRow
                        key={c.source.id}
                        choice={c}
                        configs={loaded.prepared.target.configs}
                        detailValue={c.matchId ? (loaded.prepared.configDetails.get(c.matchId.toLowerCase())?.value ?? null) : null}
                        usedBy={c.matchId ? boards.filter((b) => Object.values(b.lookups).some((id) => id?.toLowerCase() === c.matchId!.toLowerCase())) : []}
                        onChange={(patch) => updateConfig(i, patch)}
                      />
                    ))}
                  </tbody>
                </table>
              ) : null}
            </section>

            {REF_SECTIONS.map((sec, n) => {
              const rows = plan.refs.filter((r) => r.kind === sec.kind)
              if (rows.length === 0) return null
              return (
                <section key={sec.kind} className="import__block">
                  <h2>
                    {n + 3}. {sec.title}
                  </h2>
                  {sec.kind === 'record' ? (
                    <Checkbox label="Gespeicherte Filterwerte übernehmen" checked={includeFilterValues} onChange={(e) => setIncludeFilterValues(e.target.checked)} />
                  ) : null}
                  {sec.kind !== 'record' || includeFilterValues ? (
                    <>
                      <table className="diff-table import__table">
                        <thead>
                          <tr>
                            <th>Verwendet in</th>
                            <th>In der Datei</th>
                            <th>In dieser Umgebung</th>
                            <th>Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {rows.map((r) => (
                            <RefRow key={r.sourceId} choice={r} prepared={loaded.prepared} onChange={(id) => updateRef(r, id)} />
                          ))}
                        </tbody>
                      </table>
                      <p className="muted small">{sec.removeHint}</p>
                    </>
                  ) : null}
                </section>
              )
            })}

            {plan.unknown.length > 0 ? (
              <section className="import__block">
                <h2>Sonstige IDs</h2>
                <p className="muted small">Die App weiß nicht, worauf diese IDs zeigen; sie bleiben unverändert.</p>
                <ul className="muted small">
                  {plan.unknown.map((u, i) => (
                    <li key={`${u.id}-${i}`}>
                      {u.where}: <code>{u.id}</code>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            <div className="toolbar">
              <Btn kind="primary" disabled={!canReview} onClick={openReview}>
                Vorschau &amp; Importieren
              </Btn>
              {missingCount > 0 ? (
                <span className="muted small">
                  {missingCount} Bezug{missingCount === 1 ? '' : 'e'} ohne Ziel — werden entfernt.
                </span>
              ) : null}
            </div>
          </>
        ) : null}
      </div>

      {review && loaded && plan ? (
        <ReviewDialog
          pkg={loaded.pkg}
          plan={plan}
          mode={review.mode}
          replaceBoard={review.replaceBoard}
          includeFilterValues={includeFilterValues}
          busy={busy}
          onConfirm={execute}
          onClose={() => setReview(null)}
        />
      ) : null}
    </section>
  )
}

const WHERE_SHOWN = 4

function Where({ items }: { items: string[] }) {
  const list = compactWhere(items)
  const rest = list.length - WHERE_SHOWN
  return (
    <span title={list.join('\n')}>
      {list.slice(0, WHERE_SHOWN).join(' · ')}
      {rest > 0 ? <span className="muted"> · +{rest} weitere</span> : null}
    </span>
  )
}

function ConfigRow({
  choice: c,
  configs,
  detailValue,
  usedBy,
  onChange,
}: {
  choice: ConfigChoice
  configs: ConfigRef[]
  detailValue: string | null
  usedBy: BoardSummary[]
  onChange: (patch: Partial<ConfigChoice>) => void
}) {
  const [showDiff, setShowDiff] = useState(false)
  const typeLabel = c.source.type !== null ? (CONFIG_TYPE_LABEL[c.source.type] ?? String(c.source.type)) : 'Typ unbekannt'
  const sameType = configs.filter((x) => c.source.type === null || x.type === c.source.type)
  const canCreate = c.source.value !== null && c.source.type !== null
  const canUpdate = c.matchId !== null && c.source.value !== null && detailValue !== null
  const same = detailValue !== null && c.source.value !== null ? samePayload(detailValue, c.source.value) : null

  return (
    <tr>
      <td>
        <Where items={c.where} />
      </td>
      <td>
        {c.source.name}
        <span className="share-row__detail">{typeLabel}</span>
      </td>
      <td>
        {c.matchId ? (
          <>
            {configs.find((x) => x.id.toLowerCase() === c.matchId!.toLowerCase())?.name ?? c.matchId}
            <span className="share-row__detail">
              {c.matchedBy === 'id' ? 'gleiche ID' : 'über den Namen gefunden'}
              {same === true ? ' · Inhalt gleich' : same === false ? ' · Inhalt abweichend' : ''}
            </span>
            {same === false ? (
              <Btn small kind="ghost" onClick={() => setShowDiff((v) => !v)}>
                {showDiff ? 'Inhalte ausblenden' : 'Inhalte vergleichen'}
              </Btn>
            ) : null}
            {showDiff ? (
              <div className="import__compare">
                <div>
                  <strong className="small">Datei</strong>
                  <pre>{c.source.value}</pre>
                </div>
                <div>
                  <strong className="small">Diese Umgebung</strong>
                  <pre>{detailValue}</pre>
                </div>
              </div>
            ) : null}
          </>
        ) : (
          <span className="badge badge--error">nicht vorhanden</span>
        )}
      </td>
      <td>
        <Select
          className="input"
          aria-label={`Aktion für ${c.source.name}`}
          value={c.action}
          options={[
            ...(sameType.length > 0 ? [{ value: 'use', label: 'Vorhandene verwenden' }] : []),
            ...(canUpdate ? [{ value: 'update', label: 'Vorhandene mit Datei-Inhalt überschreiben' }] : []),
            ...(canCreate ? [{ value: 'create', label: 'Neu anlegen' }] : []),
            { value: 'clear', label: 'Leer lassen' },
          ]}
          onChange={(v) => onChange({ action: v as ConfigAction })}
        />
        {c.action === 'use' ? (
          <Select
            className="input"
            aria-label={`Vorhandene Konfiguration für ${c.source.name}`}
            placeholder="wählen …"
            value={c.useId ?? ''}
            options={sameType.map((x) => ({ value: x.id, label: x.name }))}
            onChange={(v) => onChange({ useId: v || null })}
          />
        ) : null}
        {c.action === 'create' ? (
          <Input
            className="input"
            aria-label="Name der neuen Konfiguration"
            value={c.createName}
            onChange={(e) => onChange({ createName: e.target.value })}
          />
        ) : null}
        {c.action === 'update' && usedBy.length > 0 ? (
          <p className="field__hint warn">Wirkt auch auf: {usedBy.map((b) => b.name).join(', ')}</p>
        ) : null}
      </td>
    </tr>
  )
}

function RefRow({ choice: r, prepared, onChange }: { choice: RefChoice; prepared: PreparedImport; onChange: (id: string | null) => void }) {
  const t = prepared.target
  const options: { id: string; label: string }[] =
    r.kind === 'view'
      ? t.views
          .filter((v) => !r.entity || v.entity.toLowerCase() === r.entity.toLowerCase() || v.id.toLowerCase() === r.sourceId)
          .map((v) => ({ id: v.id, label: `${v.name}${v.kind === 'personal' ? ' (persönlich)' : ''}` }))
      : r.kind === 'bookingSetup'
        ? t.bookingSetups.map((b) => ({ id: b.id, label: KNOWN_BOOKING_SETUPS[b.id.toLowerCase()] ?? b.entity }))
        : r.kind === 'timeZone'
          ? t.timeZones.map((z) => ({ id: z.id, label: z.name }))
          : []
  const sourceLabel = r.sourceName ?? `${r.sourceId.slice(0, 8)}…`
  const removed = r.targetId === null

  return (
    <tr>
      <td>
        <Where items={r.where} />
      </td>
      <td>
        {sourceLabel}
        {r.entity ? <span className="share-row__detail">{r.entity}</span> : null}
      </td>
      <td>
        {r.kind === 'record' ? (
          removed ? '—' : r.status === 'unchecked' ? <code className="small">{r.sourceId}</code> : 'vorhanden'
        ) : (
          <Select
            className="input"
            aria-label={`Ziel für ${sourceLabel}`}
            value={r.targetId ?? ''}
            options={[{ value: '', label: '— entfernen —' }, ...options.map((o) => ({ value: o.id, label: o.label }))]}
            onChange={(v) => onChange(v || null)}
          />
        )}
      </td>
      <td>
        {removed ? (
          <span className="badge badge--error">{r.status === 'missing' ? 'fehlt — wird entfernt' : 'wird entfernt'}</span>
        ) : (
          <span className={`badge ${r.status === 'id' || r.status === 'name' ? 'badge--ok' : 'badge--inactive'}`}>{STATUS_LABEL[r.status]}</span>
        )}
      </td>
    </tr>
  )
}

function ReviewDialog({
  pkg,
  plan,
  mode,
  replaceBoard,
  includeFilterValues,
  busy,
  onConfirm,
  onClose,
}: {
  pkg: BoardPackage
  plan: ImportPlan
  mode: ImportMode
  replaceBoard: Board | null
  includeFilterValues: boolean
  busy: boolean
  onConfirm: () => void
  onClose: () => void
}) {
  const content = previewContent(pkg, plan, mode, includeFilterValues)
  const created = plan.configs.filter((c) => c.action === 'create')
  const updated = plan.configs.filter((c) => c.action === 'update')
  const removed = plan.refs.filter((r) => r.targetId === null && (r.kind !== 'record' || includeFilterValues))
  const cleared = plan.configs.filter((c) => c.action === 'clear')
  const changes = replaceBoard ? diffContent(replaceBoard.content, content) : []

  return (
    <Modal
      title={mode.kind === 'new' ? `„${mode.name}“ anlegen` : `„${mode.board.name}“ ersetzen`}
      onClose={onClose}
      wide
      footer={
        <>
          <Btn onClick={onClose} disabled={busy}>
            Abbrechen
          </Btn>
          <Btn kind="primary" onClick={onConfirm} disabled={busy || (mode.kind === 'replace' && changes.length === 0)}>
            {busy ? 'Importiert …' : 'Importieren'}
          </Btn>
        </>
      }
    >
      <ul className="import__summary">
        {mode.kind === 'new' ? (
          <li>
            Neues Board <strong>{mode.name}</strong> ({SHARE_TYPE_LABEL[Number(content.columns.msdyn_sharetype)]}), als letzter Tab.
          </li>
        ) : (
          <li>
            <strong>{mode.board.name}</strong> bekommt den Inhalt aus der Datei — {changes.length} Änderung{changes.length === 1 ? '' : 'en'}.
          </li>
        )}
        {created.length > 0 ? <li>Neue Konfigurationen: {created.map((c) => c.createName).join(', ')}</li> : null}
        {updated.length > 0 ? <li className="warn">Überschriebene Konfigurationen: {updated.map((c) => c.source.name).join(', ')}</li> : null}
        {cleared.length > 0 ? <li>Leer gelassen: {cleared.map((c) => c.where.join(', ')).join('; ')}</li> : null}
        {removed.length > 0 ? (
          <li className="warn">
            Entfernt, weil es hier kein Gegenstück gibt: {removed.map((r) => r.sourceName ?? r.sourceId.slice(0, 8)).join(', ')}
          </li>
        ) : null}
        {!includeFilterValues ? <li>Gespeicherte Filterwerte werden nicht übernommen.</li> : null}
      </ul>
      {replaceBoard ? <DiffTable changes={changes} beforeLabel="Bisher" afterLabel="Aus der Datei" empty="Das Board ist schon identisch." /> : null}
    </Modal>
  )
}
