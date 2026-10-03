import { useDeferredValue, useMemo, useRef, useState } from 'react'
import { Checkbox, Input, ToggleButton } from '@fluentui/react-components'
import {
  ArrowDownloadRegular,
  ArrowUploadRegular,
  BranchCompareRegular,
  DesignIdeasRegular,
  LightbulbRegular,
  LockClosedRegular,
  SearchRegular,
  TableSimpleRegular,
} from '@fluentui/react-icons'
import type { TranslationService } from '../services/translationService'
import { getTranslationService } from '../services/translationService'
import { DataverseError } from '../services/dataverseApi'
import type { RunOutcome } from '../services/runImport'
import { useLoad } from '../hooks/useLoad'
import { cellId, type CellEdit, type ComponentInfo, type ComponentKind, type Lcid, type LabelRow, type SolutionRef, type TranslationFile } from '../types/translation'
import { applyEdits, parseTranslationFile } from '../utils/translationFile'
import { readTranslationZip } from '../utils/translationZip'
import { countStates, filterRows, findGaps, kindOf, NO_TABLE, tableOf, type StateFilter } from '../utils/gaps'
import { consistencyReport, glossaryKey, suggestFromGlossary } from '../utils/glossary'
import { exportCsv } from '../utils/csv'
import { KIND_ORDER, languageLabel, languageName } from '../utils/languages'
import { loadAcknowledged, loadExportDuration, saveAcknowledged, saveExportDuration } from '../utils/storage'
import { downloadText, formatDateTime, stamp } from '../utils/download'
import { Matrix } from './Matrix'
import { ApplyDialog } from './ApplyDialog'
import { CsvImportDialog } from './CsvImportDialog'
import { ConsistencyDialog } from './ConsistencyDialog'
import { ConfirmDialog } from './Modal'
import { LoadProgress, type LoadProgressState } from './LoadProgress'
import { Designer } from './designer/Designer'
import { Btn, Select, type SelectOption } from './ui'
import { S } from '../strings'

export type Notify = (text: string, kind?: 'ok' | 'error') => void

interface Loaded {
  solution: SolutionRef
  file: TranslationFile
  zip: Uint8Array
  route: string
  at: string
}

const DEFAULT_SOLUTION = 'Default'
const listSolutions = (svc: TranslationService) => svc.listSolutions()

type Dialog = 'apply' | 'csv' | 'consistency' | { confirm: 'reload' | 'discard' } | null

export function StudioView({ notify, onRun }: { notify: Notify; onRun: () => void }) {
  const solutionsRes = useLoad('solutions', listSolutions)
  const [solutionName, setSolutionName] = useState('')
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [loading, setLoading] = useState(false)
  const [progress, setProgress] = useState<LoadProgressState | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [components, setComponents] = useState<ReadonlyMap<string, ComponentInfo>>(new Map())
  const [resolving, setResolving] = useState(false)
  const [edits, setEdits] = useState<ReadonlyMap<string, CellEdit>>(new Map())
  const [ack, setAck] = useState<ReadonlySet<string>>(new Set())
  const [targets, setTargets] = useState<Lcid[]>([])
  const [stateFilter, setStateFilter] = useState<StateFilter>('gaps')
  const [kinds, setKinds] = useState<ReadonlySet<ComponentKind> | null>(null)
  const [table, setTable] = useState('')
  const [text, setText] = useState('')
  const [dialog, setDialog] = useState<Dialog>(null)
  const [view, setView] = useState<'matrix' | 'designer'>('designer')
  const [locked, setLocked] = useState(false)
  const [noPrivilege, setNoPrivilege] = useState(false)
  const deferredText = useDeferredValue(text)
  /** Number of the latest load: results of an older one are dropped. */
  const loadSeq = useRef(0)
  /** File whose names are being resolved: a result for any other file is dropped (independent of loads that fail or are cancelled). */
  const resolvingFor = useRef<TranslationFile | null>(null)

  const solutions = useMemo(() => {
    const list = solutionsRes.data ?? []
    return list.some((s) => s.uniqueName === DEFAULT_SOLUTION)
      ? list
      : [...list, { id: '', uniqueName: DEFAULT_SOLUTION, friendlyName: 'Default Solution', version: '', isManaged: false, publisher: '' }]
  }, [solutionsRes.data])
  const solutionOptions: SelectOption[] = [
    ...solutions
      .filter((s) => !s.isManaged)
      .map((s) => ({
        value: s.uniqueName,
        label: s.uniqueName === DEFAULT_SOLUTION ? S.scope.defaultLabel : `${s.friendlyName} (${s.uniqueName})`,
        group: S.scope.groupUnmanaged,
      })),
    ...solutions.filter((s) => s.isManaged).map((s) => ({ value: s.uniqueName, label: `${s.friendlyName} (${s.uniqueName})`, group: S.scope.groupManaged })),
  ]
  const chosen = solutions.find((s) => s.uniqueName === solutionName) ?? null

  // ---- derived matrix data ------------------------------------------------
  const applied = useMemo(() => (loaded ? applyEdits(loaded.file, [...edits.values()]) : null), [loaded, edits])
  const current = applied?.file ?? null
  const gaps = useMemo(() => (current ? findGaps(current, { languages: targets, acknowledged: ack }) : []), [current, targets, ack])
  const counts = useMemo(() => countStates(gaps, targets), [gaps, targets])
  const suggestions = useMemo(() => (current ? suggestFromGlossary(current, targets, ack) : new Map()), [current, targets, ack])
  const sameBase = useMemo(() => {
    const m = new Map<string, number>()
    if (!current) return m
    for (const r of current.rows) {
      for (const l of targets) {
        if (suggestions.has(cellId(r.key, l))) {
          const k = `${glossaryKey(r.values[current.baseLanguage] ?? '')}|${l}`
          m.set(k, (m.get(k) ?? 0) + 1)
        }
      }
    }
    return m
  }, [current, targets, suggestions])
  const inconsistencies = useMemo(() => (current ? consistencyReport(current, targets) : []), [current, targets])
  const filtered = useMemo(
    () => filterRows(gaps, { state: stateFilter, kinds, table, text: deferredText, languages: targets }, components),
    [gaps, stateFilter, kinds, table, deferredText, targets, components],
  )
  const kindCounts = useMemo(() => {
    const m = new Map<ComponentKind, number>()
    for (const g of gaps) {
      const k = kindOf(g.row, components)
      m.set(k, (m.get(k) ?? 0) + 1)
    }
    return m
  }, [gaps, components])
  const tableOptions = useMemo(() => {
    const m = new Map<string, number>()
    for (const g of gaps) {
      const t = tableOf(g.row, components)
      m.set(t, (m.get(t) ?? 0) + 1)
    }
    const opts: SelectOption[] = [{ value: '', label: S.filter.tableAll }]
    for (const [t, n] of [...m].filter(([t]) => t).sort((a, b) => a[0].localeCompare(b[0]))) opts.push({ value: t, label: `${t} (${n})` })
    if (m.has('')) opts.push({ value: NO_TABLE, label: `${S.filter.tableNone} (${m.get('')})` })
    return opts
  }, [gaps, components])
  const changes = applied?.changes ?? []
  const suggestionsInView = filtered.reduce((n, g) => n + targets.filter((l) => suggestions.has(cellId(g.row.key, l))).length, 0)

  const managed = loaded?.solution.isManaged ?? false
  const readOnly = managed || locked || noPrivilege

  // ---- loading -----------------------------------------------------------
  async function load(name: string) {
    const solution = solutions.find((s) => s.uniqueName === name)
    if (!solution) return
    const seq = ++loadSeq.current
    const latest = () => seq === loadSeq.current
    setLoading(true)
    setLoadError(null)
    try {
      const svc = await getTranslationService()
      const startedAt = Date.now()
      setProgress({ phase: 'export', name: solution.friendlyName, phaseAt: startedAt, lastMs: loadExportDuration(svc.orgUrl, name) })
      const [exported, base] = await Promise.all([svc.exportTranslations(name), svc.baseLanguage()])
      if (!latest()) return
      const readAt = Date.now()
      saveExportDuration(svc.orgUrl, name, readAt - startedAt)
      setProgress((p) => (p ? { ...p, phase: 'read', phaseAt: readAt } : p))
      // Let the new phase paint before unzipping and parsing block the thread.
      await new Promise((resolve) => window.setTimeout(resolve, 0))
      const xml = await readTranslationZip(exported.zip)
      const file = parseTranslationFile(xml, base ? { baseLanguage: base } : {})
      if (!latest()) return
      if (loaded?.solution.uniqueName !== name) {
        // Another solution: start from the default view, not from the last one's filters.
        setStateFilter('gaps')
        setKinds(null)
        setTable('')
        setText('')
      }
      setLoaded({ solution, file, zip: exported.zip, route: exported.route, at: new Date().toISOString() })
      setEdits(new Map())
      setAck(loadAcknowledged(svc.orgUrl, name))
      setTargets(file.languages.filter((l) => l !== file.baseLanguage))
      setComponents(new Map())
      setResolving(true)
      resolvingFor.current = file
      svc
        .resolveComponents(file)
        .then(
          (map) => {
            if (resolvingFor.current === file) setComponents(map)
          },
          (err: unknown) => console.warn('[translation] components', err),
        )
        .finally(() => {
          if (resolvingFor.current === file) setResolving(false)
        })
    } catch (err) {
      if (!latest()) return
      const msg = err instanceof Error ? err.message : String(err)
      setLoadError(err instanceof DataverseError && err.privilege ? `${S.errors.privilegeExport} (${msg})` : msg)
    } finally {
      if (latest()) {
        setLoading(false)
        setProgress(null)
      }
    }
  }

  /** Stops waiting for the export; its result is dropped (the export itself changes nothing). */
  function cancelLoad() {
    loadSeq.current++
    setLoading(false)
    setProgress(null)
    notify(S.progress.canceled)
  }

  const requestLoad = () => {
    if (edits.size > 0) setDialog({ confirm: 'reload' })
    else void load(solutionName)
  }

  // ---- edits ---------------------------------------------------------------
  const setEdit = (rowKey: string, lcid: Lcid, value: string) =>
    setEdits((prev) => {
      const next = new Map(prev)
      next.set(cellId(rowKey, lcid), { rowKey, lcid, value })
      return next
    })
  const addEdits = (list: CellEdit[]) =>
    setEdits((prev) => {
      const next = new Map(prev)
      for (const e of list) next.set(cellId(e.rowKey, e.lcid), e)
      return next
    })
  const revert = (rowKey: string, lcid: Lcid) =>
    setEdits((prev) => {
      const next = new Map(prev)
      next.delete(cellId(rowKey, lcid))
      return next
    })
  const acknowledge = (rowKey: string, lcid: Lcid, on: boolean) => {
    const next = new Set(ack)
    if (on) next.add(cellId(rowKey, lcid))
    else next.delete(cellId(rowKey, lcid))
    setAck(next)
    if (loaded) void getTranslationService().then((svc) => saveAcknowledged(svc.orgUrl, loaded.solution.uniqueName, next))
  }
  const accept = (row: LabelRow, lcid: Lcid, value: string, all: boolean) => {
    if (!all || !current) {
      setEdit(row.key, lcid, value)
      return
    }
    const key = glossaryKey(row.values[current.baseLanguage] ?? '')
    const list = current.rows
      .filter((r) => glossaryKey(r.values[current.baseLanguage] ?? '') === key && suggestions.has(cellId(r.key, lcid)))
      .map((r) => ({ rowKey: r.key, lcid, value }))
    addEdits(list)
    notify(S.toolbar.acceptedSame(list.length, value))
  }
  const refused = (m: string) => notify(m, 'error')
  /** From the designer: the labels it has no canvas for (ribbon, messages …) in the table view. */
  const showOther = () => {
    setView('matrix')
    setKinds(new Set<ComponentKind>(['other']))
    setTable('')
    setText('')
  }
  const acceptAllInView = () => {
    const list: CellEdit[] = []
    for (const g of filtered) for (const l of targets) {
      const s = suggestions.get(cellId(g.row.key, l))
      if (s) list.push({ rowKey: g.row.key, lcid: l, value: s.value })
    }
    addEdits(list)
    notify(S.toolbar.acceptedAll(list.length))
  }

  const exportCsvFile = () => {
    if (!current || !loaded) return
    const csv = exportCsv(current, filtered.map((g) => g.row), { languages: [current.baseLanguage, ...targets], components })
    downloadText(`${loaded.solution.uniqueName}_Uebersetzungen_${stamp()}.csv`, csv, 'text/csv;charset=utf-8')
  }

  const onImportDone = (outcome: RunOutcome | null) => {
    setDialog(null)
    onRun()
    if (outcome?.privilege) setNoPrivilege(true)
    if (outcome?.status === 'succeeded') {
      notify(outcome.published ? S.apply.donePublished : S.apply.done)
      void load(loaded!.solution.uniqueName)
    }
  }

  const toggleKind = (k: ComponentKind) =>
    setKinds((prev) => {
      const next = new Set(prev ?? KIND_ORDER)
      if (next.has(k)) next.delete(k)
      else next.add(k)
      return next.size === KIND_ORDER.length ? null : next
    })

  const filterActive = stateFilter !== 'all' || kinds !== null || table !== '' || text !== ''
  const stateOptions: SelectOption[] = [
    { value: 'all', label: S.filter.stateAll },
    { value: 'gaps', label: S.filter.stateGaps },
    { value: 'missing', label: S.filter.stateMissing },
    { value: 'untranslated', label: S.filter.stateUntranslated },
    { value: 'changed', label: S.filter.stateChanged },
  ]
  const onlyBase = current !== null && current.languages.length < 2

  return (
    <main className="studio">
      <section className="scope">
        <div className="scope__row">
          <label className="field">
            <span className="field__label">{S.scope.solution}</span>
            <Select
              value={solutionName}
              options={solutionOptions}
              placeholder={solutionsRes.loading ? S.app.loading : S.scope.solutionPlaceholder}
              onChange={setSolutionName}
              disabled={locked}
              aria-label={S.scope.solution}
            />
          </label>
          <Btn kind="primary" onClick={requestLoad} disabled={!chosen || loading || locked}>
            {loading ? S.scope.loadingExport : loaded?.solution.uniqueName === solutionName ? S.scope.reload : S.scope.load}
          </Btn>
          {current && current.languages.length > 1 ? (
            <div className="scope__langs" role="group" aria-label={S.scope.languages}>
              <span className="field__label">{S.scope.languages}</span>
              {current.languages
                .filter((l) => l !== current.baseLanguage)
                .map((l) => (
                  <Checkbox
                    key={l}
                    label={languageLabel(l)}
                    checked={targets.includes(l)}
                    onChange={(_, d) => setTargets((t) => (d.checked ? current.languages.filter((x) => x === l || t.includes(x)) : t.filter((x) => x !== l)))}
                  />
                ))}
            </div>
          ) : null}
        </div>
        {solutionsRes.error ? <div className="notice notice--error">{S.errors.load} {solutionsRes.error}</div> : null}
        {solutionName === DEFAULT_SOLUTION ? <div className="notice notice--warn">{S.scope.defaultWarn}</div> : null}
        {chosen?.isManaged ? <div className="notice notice--warn">{S.scope.managedWarn}</div> : null}
        {loadError ? <div className="notice notice--error">{loadError}</div> : null}
        {noPrivilege ? <div className="notice notice--warn">{S.apply.privilege}</div> : null}
        {progress ? <LoadProgress state={progress} onCancel={cancelLoad} /> : null}
        {loaded && current ? (
          <p className="muted small">
            <strong>{loaded.solution.friendlyName}</strong> ·{' '}
            {S.scope.loadedInfo(current.rows.length, languageLabel(current.baseLanguage), formatDateTime(loaded.at))}
            {resolving ? ` · ${S.scope.resolving}` : ''}
          </p>
        ) : null}
      </section>

      {!loaded && !progress ? <div className="empty">{S.scope.nothingLoaded}</div> : null}
      {onlyBase ? <div className="notice notice--warn studio__single">{S.scope.singleLanguage}</div> : null}

      {current && !onlyBase && targets.length > 0 ? (
        <>
          {view === 'matrix' ? (
            <section className="kpis" aria-label={S.kpi.label}>
              {targets.map((l) => {
                const c = counts[l]
                const total = c.missing + c.untranslated + c.changed + c.ok
                const pct = total === 0 ? 100 : ((c.ok + c.changed) / total) * 100
                return (
                  <div key={l} className="kpi">
                    <div className="kpi__head">
                      <strong>{languageName(l)}</strong>
                      <span className="muted small">{S.kpi.coverage(pct)}</span>
                    </div>
                    <div className="kpi__bar" aria-hidden>
                      <span className="kpi__fill" style={{ width: `${pct}%` }} />
                    </div>
                    <div className="kpi__counts">
                      {(['missing', 'untranslated', 'changed'] as const).map((s) => (
                        <button key={s} type="button" className={`state state--${s}`} onClick={() => setStateFilter(s)} title={S.filter.state}>
                          {c[s].toLocaleString('de-DE')} {S.kpi[s]}
                        </button>
                      ))}
                    </div>
                  </div>
                )
              })}
            </section>
          ) : null}

          {view === 'matrix' ? (
            <section className="filters">
              <div className="filters__state">
                <Select value={stateFilter} options={stateOptions} onChange={(v) => setStateFilter(v as StateFilter)} aria-label={S.filter.state} small />
              </div>
              <div className="filters__kinds" role="group" aria-label={S.filter.kinds}>
                {KIND_ORDER.filter((k) => kindCounts.has(k)).map((k) => (
                  <ToggleButton key={k} size="small" checked={kinds === null || kinds.has(k)} onClick={() => toggleKind(k)}>
                    {S.kinds[k]} <span className="muted small">&nbsp;{kindCounts.get(k)}</span>
                  </ToggleButton>
                ))}
              </div>
              <div className="filters__table">
                <Select value={table} options={tableOptions} onChange={setTable} aria-label={S.filter.table} small />
              </div>
              <Input
                size="small"
                className="filters__text"
                contentBefore={<SearchRegular />}
                placeholder={S.filter.text}
                value={text}
                onChange={(e) => setText(e.target.value)}
                aria-label={S.filter.text}
              />
              {filterActive ? (
                <Btn
                  kind="ghost"
                  small
                  onClick={() => {
                    setStateFilter('all')
                    setKinds(null)
                    setTable('')
                    setText('')
                  }}
                >
                  {S.filter.reset}
                </Btn>
              ) : null}
              <span className="muted small filters__count">{S.filter.count(filtered.length, gaps.length)}</span>
            </section>
          ) : null}

          <section className="toolbar studio__toolbar">
            <div className="views" role="group" aria-label={S.views.label}>
              <ToggleButton size="small" icon={<TableSimpleRegular />} checked={view === 'matrix'} onClick={() => setView('matrix')}>
                {S.views.matrix}
              </ToggleButton>
              <ToggleButton size="small" icon={<DesignIdeasRegular />} checked={view === 'designer'} onClick={() => setView('designer')}>
                {S.views.designer}
              </ToggleButton>
            </div>
            {readOnly ? (
              <span className="badge badge--lock">
                <LockClosedRegular aria-hidden /> {locked ? S.toolbar.locked : S.toolbar.readOnly}
              </span>
            ) : null}
            {view === 'matrix' ? (
              <Btn icon={<LightbulbRegular />} disabled={readOnly || suggestionsInView === 0} onClick={acceptAllInView} title={S.toolbar.acceptAllTitle}>
                {S.toolbar.acceptAll(suggestionsInView)}
              </Btn>
            ) : null}
            <Btn icon={<BranchCompareRegular />} disabled={inconsistencies.length === 0} onClick={() => setDialog('consistency')}>
              {S.toolbar.consistency(inconsistencies.length)}
            </Btn>
            {view === 'matrix' ? (
              <Btn icon={<ArrowDownloadRegular />} disabled={filtered.length === 0} onClick={exportCsvFile} title={S.toolbar.csvExportTitle}>
                {S.toolbar.csvExport(filtered.length)}
              </Btn>
            ) : null}
            <Btn icon={<ArrowUploadRegular />} disabled={readOnly} onClick={() => setDialog('csv')}>
              {S.toolbar.csvImport}
            </Btn>
            <span className="toolbar__spacer" />
            <Btn kind="ghost" disabled={changes.length === 0 || locked} onClick={() => setDialog({ confirm: 'discard' })}>
              {S.toolbar.discard}
            </Btn>
            <Btn kind="primary" disabled={changes.length === 0 || readOnly} onClick={() => setDialog('apply')}>
              {S.toolbar.apply(changes.length)}
            </Btn>
          </section>

          {view === 'matrix' ? (
            <Matrix
              rows={filtered}
              baseLanguage={current.baseLanguage}
              languages={targets}
              components={components}
              suggestions={suggestions}
              sameBase={sameBase}
              acknowledged={ack}
              readOnly={readOnly}
              onEdit={setEdit}
              onRevert={revert}
              onAccept={accept}
              onAcknowledge={acknowledge}
              onRefused={(m) => notify(m, 'error')}
            />
          ) : (
            <Designer
              key={`${loaded?.solution.uniqueName}|${loaded?.at}`}
              file={current}
              components={components}
              targets={targets}
              acknowledged={ack}
              readOnly={readOnly}
              resolving={resolving}
              suggestions={suggestions}
              sameBase={sameBase}
              onEdit={setEdit}
              onRevert={revert}
              onAccept={accept}
              onAcknowledge={acknowledge}
              onRefused={refused}
              onShowOther={showOther}
            />
          )}
        </>
      ) : null}

      {dialog === 'apply' && loaded && current ? (
        <ApplyDialog
          solution={loaded.solution}
          file={current}
          exportZip={loaded.zip}
          changes={changes}
          components={components}
          onLock={setLocked}
          onClose={onImportDone}
        />
      ) : null}
      {dialog === 'csv' && current ? (
        <CsvImportDialog
          file={current}
          onClose={() => setDialog(null)}
          onTake={(list) => {
            addEdits(list)
            setDialog(null)
            setStateFilter('changed')
            notify(S.csv.taken(list.length))
          }}
        />
      ) : null}
      {dialog === 'consistency' && current ? (
        <ConsistencyDialog
          report={inconsistencies}
          readOnly={readOnly}
          onClose={() => setDialog(null)}
          onUnify={(list) => {
            addEdits(list)
            notify(S.consistency.unified(list.length))
          }}
          onShow={(base) => {
            setStateFilter('all')
            setText(base)
            setDialog(null)
          }}
        />
      ) : null}
      {dialog && typeof dialog === 'object' ? (
        <ConfirmDialog
          title={dialog.confirm === 'reload' ? S.scope.reload : S.toolbar.discard}
          message={dialog.confirm === 'reload' ? S.scope.discardConfirm(changes.length) : S.toolbar.discardConfirm(changes.length)}
          confirmLabel={S.common.yes}
          danger
          onClose={() => setDialog(null)}
          onConfirm={() => {
            setDialog(null)
            setEdits(new Map())
            if (dialog.confirm === 'reload') void load(solutionName)
          }}
        />
      ) : null}
    </main>
  )
}
