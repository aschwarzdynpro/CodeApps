import { useState } from 'react'
import './App.css'
import { usePower } from './PowerProvider'
import { useAuditQuery } from './hooks/useAuditQuery'
import { useAuditSettings, useTableAudit } from './hooks/useAuditSettings'
import { ModeTabs, type ExplorerMode } from './components/ModeTabs'
import { RecordQueryForm } from './components/RecordQueryForm'
import { PersonQueryForm } from './components/PersonQueryForm'
import { FieldQueryForm } from './components/FieldQueryForm'
import { EventAccordion } from './components/EventAccordion'
import { FieldChangeTable } from './components/FieldChangeTable'
import { EmptyState, NoResults } from './components/EmptyState'
import { RecordHeader } from './components/RecordHeader'
import { ActivityView } from './views/ActivityView'
import type { AuditQuery, AuditUser, UserRef } from './types/audit'
import { parseDeepLink } from './utils/recordRef'
import { formatRetention, windowExceedsRetention } from './utils/auditFields'

/** The three modes that hold a query; `activity` loads its own window. */
type QueryMode = Exclude<ExplorerMode, 'activity'>

/** Default window for a question arrived at laterally rather than typed. */
const DEFAULT_WINDOW_DAYS = 30

/**
 * A deep link opens the explorer straight on the record it is about:
 * `?record=<guid>&table=<logical>`. Read once at mount, so a later in-app
 * navigation never fights the URL.
 */
function initialRecordQuery(): AuditQuery | null {
  if (typeof window === 'undefined') return null
  const ref = parseDeepLink(window.location.search)
  return ref ? { kind: 'record', ...ref } : null
}

/** One-line description of what the current result set answers. */
function describeQuery(query: AuditQuery, count: number): string {
  const suffix = `${count} change${count === 1 ? '' : 's'}`
  switch (query.kind) {
    case 'record':
      return `${query.table ? `${query.table} · ` : ''}${query.recordId} · ${suffix}`
    case 'user':
      return `${query.userName} · last ${query.sinceDays} days · ${suffix}`
    case 'field':
      return `${query.tableName} · ${query.attribute ?? 'any column'} · last ${
        query.sinceDays
      } days · ${suffix}`
  }
}

/**
 * Query-first shell.
 *
 * The three bounded modes are the everyday path: each turns a concrete question
 * into one server-side filter, so the result is limited by the question rather
 * than by a row cap applied afterwards. The activity dashboard keeps the older
 * load-a-window behaviour and therefore sits last.
 */
function App() {
  const { mode: hostMode } = usePower()

  const [initialQuery] = useState(initialRecordQuery)
  const [mode, setMode] = useState<ExplorerMode>('record')
  // One query per mode: a tab keeps its own answer until that tab is asked
  // again, and switching tabs never leaves another mode's result on screen.
  const [queries, setQueries] = useState<Record<QueryMode, AuditQuery | null>>({
    record: initialQuery,
    person: null,
    field: null,
  })
  const [personPreset, setPersonPreset] = useState<UserRef | null>(null)

  const setQuery = (target: QueryMode, next: AuditQuery) =>
    setQueries((prev) => ({ ...prev, [target]: next }))

  // The activity view owns its own loading; keep the query hook idle there.
  const query = mode === 'activity' ? null : queries[mode]
  const { events, answered, truncated, loading, error } = useAuditQuery(query)
  const settings = useAuditSettings()

  // The table under investigation, when the question names one. Record mode
  // learns it from the result; field mode carries it in the query.
  const queriedTable =
    query?.kind === 'field'
      ? query.table
      : query?.kind === 'record'
        ? (events[0]?.tableLogicalName ?? query.table)
        : undefined
  const tableAudit = useTableAudit(queriedTable)

  const windowDays = query && query.kind !== 'record' ? query.sinceDays : undefined
  const beyondRetention =
    query !== null && windowExceedsRetention(settings, windowDays)

  const openRecord = (recordId: string, table?: string) => {
    setMode('record')
    setQuery('record', { kind: 'record', recordId, ...(table ? { table } : {}) })
  }

  const openPerson = (user: AuditUser) => {
    if (!user.id) return
    const ref: UserRef = {
      id: user.id,
      name: user.name,
      initials: user.initials,
    }
    setPersonPreset(ref)
    setMode('person')
    setQuery('person', {
      kind: 'user',
      userId: ref.id,
      userName: ref.name,
      sinceDays: DEFAULT_WINDOW_DAYS,
    })
  }

  const recordPreset =
    query?.kind === 'record' ? query.recordId : undefined

  const renderForm = () => {
    switch (mode) {
      case 'record':
        return (
          <RecordQueryForm
            key={recordPreset ?? 'blank'}
            preset={recordPreset}
            onSubmit={(ref) => setQuery('record', { kind: 'record', ...ref })}
          />
        )
      case 'person':
        return (
          <PersonQueryForm
            key={personPreset?.id ?? 'blank'}
            preset={personPreset}
            onSubmit={(user, sinceDays) => {
              setPersonPreset(user)
              setQuery('person', {
                kind: 'user',
                userId: user.id,
                userName: user.name,
                sinceDays,
              })
            }}
          />
        )
      case 'field':
        return (
          <FieldQueryForm
            onSubmit={(table, attribute, sinceDays) =>
              setQuery('field', {
                kind: 'field',
                table: table.logicalName,
                tableName: table.displayName,
                ...(attribute ? { attribute } : {}),
                sinceDays,
              })
            }
          />
        )
      default:
        return null
    }
  }

  const renderResult = () => {
    if (loading) return <div className="state">Loading audit data…</div>
    if (error) return <div className="state state--error">{error}</div>
    if (!query || !answered) {
      if (mode === 'record')
        return (
          <EmptyState
            prompt="Find out why a single record looks the way it does."
            example="Paste the address bar of the record form, or its GUID."
          />
        )
      if (mode === 'person')
        return (
          <EmptyState
            prompt="See everything one person changed in a time window."
            example="Useful for handovers, offboarding and incident review."
          />
        )
      return (
        <EmptyState
          prompt="Watch a single column: who changed it, from what, to what."
          example="Pick a table, then the column you care about."
        />
      )
    }

    if (events.length === 0) {
      const scope =
        query.kind === 'record'
          ? 'this record'
          : query.kind === 'user'
            ? query.userName
            : `${query.tableName}${query.attribute ? ` · ${query.attribute}` : ''}`
      return (
        <NoResults
          scope={scope}
          tableAudit={tableAudit}
          attribute={query.kind === 'field' ? query.attribute : undefined}
          beyondRetention={beyondRetention}
          retention={formatRetention(settings.retentionDays)}
        />
      )
    }

    return (
      <>
        {query.kind === 'record' ? (
          <RecordHeader
            events={events}
            recordId={query.recordId}
            fallbackTable={query.table}
          />
        ) : (
          <div className="result-head">{describeQuery(query, events.length)}</div>
        )}
        {query.kind === 'field' && query.attribute ? (
          <FieldChangeTable
            events={events}
            attribute={query.attribute}
            table={query.table}
            onOpenRecord={openRecord}
            onOpenPerson={openPerson}
          />
        ) : (
          <EventAccordion
            events={events}
            groupByDay={query.kind === 'user'}
            showTable={query.kind !== 'record'}
            onOpenRecord={(event) =>
              openRecord(event.recordId, event.tableLogicalName)
            }
            onOpenPerson={(event) => openPerson(event.user)}
          />
        )}
      </>
    )
  }

  return (
    <div className="app">
      <header className="app-header">
        <div>
          <h1>Audit Explorer</h1>
          <p className="subtitle">
            Dataverse audit history — ask about a record, a person or a column.
          </p>
        </div>
        <span className={`mode-badge mode-${hostMode}`}>
          {hostMode === 'power-platform' ? 'Power Platform' : 'Local · mock data'}
        </span>
      </header>

      <ModeTabs mode={mode} onChange={setMode} />

      {/* Org-level auditing off makes every answer in every mode empty, so it
          belongs above the tabs rather than inside one result. */}
      {!settings.orgAuditEnabled && (
        <div className="state state--error" role="status">
          <strong>Auditing is switched off for this organisation.</strong> No
          changes are being recorded at all — every result below will be empty
          regardless of what actually happened.
        </div>
      )}

      {mode === 'activity' ? (
        <ActivityView />
      ) : (
        <>
          {renderForm()}
          {beyondRetention && !loading && !error && (
            <div className="state state--warning" role="status">
              <strong>Beyond the retention window.</strong> Audit entries are{' '}
              {formatRetention(settings.retentionDays)}; anything older has been
              purged. For that stretch an empty result means "no longer
              recorded", not "nothing happened".
            </div>
          )}
          {truncated && !loading && !error && (
            <div className="state state--warning" role="status">
              <strong>Incomplete data.</strong> The row limit was reached, so
              older changes in this window are missing. Narrow the time window
              for a complete answer.
            </div>
          )}
          {renderResult()}
        </>
      )}
    </div>
  )
}

export default App
