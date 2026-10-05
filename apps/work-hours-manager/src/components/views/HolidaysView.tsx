import { Badge, Checkbox, Dialog, DialogActions, DialogBody, DialogContent, DialogSurface, DialogTitle, Field, Input, MessageBar, MessageBarBody, Table, TableBody, TableCell, TableHeader, TableHeaderCell, TableRow } from '@fluentui/react-components'
import { DeleteRegular, DismissRegular } from '@fluentui/react-icons'
import { useActionState, useState } from 'react'
import { getCalendarService, PrivilegeError } from '../../services/calendarService'
import { S } from '../../strings'
import type { Closure, Notify } from '../../types/calendar'
import { closureRows } from '../../utils/closures'
import { formatDate, formatDateWithDay, isValidDate } from '../../utils/dates'
import { RULESETS, closureSpan, generateHolidays, reconcile, type MatchStatus } from '../../utils/holidays'
import { DateField, DaysField } from '../rules/editorParts'
import { Btn, Select } from '../ui'

interface Props {
  year: number
  onYear: (year: number) => void
  closures: Closure[] | undefined
  error: string | null
  viewerTz: string
  readOnly: boolean
  today: string
  notify: Notify
  /** Closures changed — reload. */
  onChanged: () => void
  onPrivilegeError: () => void
}

const STATUS_COLOR: Record<MatchStatus, 'success' | 'danger' | 'warning' | 'informative'> = { ok: 'success', missing: 'danger', nameDiffers: 'warning', partial: 'warning' }

/** Business closures of a year: list, create, delete, and the reconciliation with a holiday rule set. */
export function HolidaysView({ year, onYear, closures, error, viewerTz, readOnly, today, notify, onChanged, onPrivilegeError }: Props) {
  const [rulesetId, setRulesetId] = useState('DE')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [creating, setCreating] = useState(false)
  const [toDelete, setToDelete] = useState<Closure | null>(null)
  const years = [year - 1, year, year + 1, year + 2].map((y) => ({ value: String(y), label: String(y) }))
  const rows = closureRows(closures ?? [], viewerTz)
  const holidays = generateHolidays(rulesetId, year)
  const rec = closures ? reconcile(holidays, closures, year, viewerTz) : null
  const missing = rec?.matches.filter((m) => m.status === 'missing') ?? []
  const selectedMissing = missing.filter((m) => selected.has(m.holiday.key))
  const ok = rec?.matches.filter((m) => m.status === 'ok').length ?? 0
  const differs = rec?.matches.filter((m) => m.status === 'nameDiffers' || m.status === 'partial').length ?? 0
  const extraIds = new Set(rec?.extra.map((c) => c.id) ?? [])
  const duplicateIds = new Set(rec?.duplicates.flat().map((c) => c.id) ?? [])

  const fail = (err: unknown) => {
    if (err instanceof PrivilegeError) onPrivilegeError()
    notify(err instanceof Error ? err.message : String(err), 'error')
  }

  const [, createMissing, creatingMissing] = useActionState(async () => {
    try {
      const svc = await getCalendarService()
      for (const m of selectedMissing) {
        const span = closureSpan(m.holiday.date, viewerTz)
        await svc.saveClosure(m.holiday.name, span.start, span.end)
      }
      notify(S.holidays.created(selectedMissing.length))
      setSelected(new Set())
      onChanged()
    } catch (err) {
      fail(err)
    }
    return null
  }, null)

  const [, deleteClosure, deleting] = useActionState(async () => {
    if (!toDelete) return null
    try {
      const svc = await getCalendarService()
      await svc.deleteClosure(toDelete)
      notify(S.holidays.deleted)
      setToDelete(null)
      onChanged()
    } catch (err) {
      if (err instanceof PrivilegeError) onPrivilegeError()
      notify(`${err instanceof Error ? err.message : String(err)} — ${S.holidays.deleteFailedHint}`, 'error')
      setToDelete(null)
    }
    return null
  }, null)

  return (
    <div className="page">
      <h2>{S.holidays.title}</h2>
      <p className="muted">{S.holidays.intro}</p>
      <div className="row">
        <span className="row__label">{S.holidays.year}</span>
        <div className="w-120">
          <Select small value={String(year)} options={years} onChange={(v) => onYear(Number(v))} aria-label={S.holidays.year} />
        </div>
        <span className="muted small">{S.holidays.count(rows.length)}</span>
        <span className="spacer" />
        {!readOnly ? (
          <Btn small kind="primary" onClick={() => setCreating(true)}>
            {S.holidays.newClosure}
          </Btn>
        ) : (
          <span className="muted small">{S.holidays.readOnly}</span>
        )}
      </div>
      {error ? <div className="notice notice--error">{S.app.loadError('Schließungen', error)}</div> : null}

      <section className="holidays__section">
        <h3>{S.holidays.closuresTitle(year)}</h3>
        {!closures ? (
          <p className="loading">{S.app.loading}</p>
        ) : rows.length === 0 ? (
          <p className="empty">{S.holidays.empty(year)}</p>
        ) : (
          <Table size="small" aria-label={S.holidays.closuresTitle(year)}>
            <TableHeader>
              <TableRow>
                <TableHeaderCell>{S.holidays.columns.name}</TableHeaderCell>
                <TableHeaderCell>{S.holidays.columns.from}</TableHeaderCell>
                <TableHeaderCell>{S.holidays.columns.to}</TableHeaderCell>
                <TableHeaderCell>{S.holidays.columns.days}</TableHeaderCell>
                <TableHeaderCell />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.closure.id}>
                  <TableCell>
                    {r.closure.name}
                    {extraIds.has(r.closure.id) ? <Badge size="small" appearance="tint" className="ml-6">{S.holidays.extra}</Badge> : null}
                    {duplicateIds.has(r.closure.id) ? <Badge size="small" appearance="tint" color="warning" className="ml-6">{S.holidays.duplicate}</Badge> : null}
                  </TableCell>
                  <TableCell>{formatDate(r.from)}</TableCell>
                  <TableCell>{formatDate(r.to)}</TableCell>
                  <TableCell>{r.days}</TableCell>
                  <TableCell>{!readOnly ? <Btn small kind="ghost" icon={<DeleteRegular />} aria-label={S.holidays.delete} title={S.holidays.delete} onClick={() => setToDelete(r.closure)} /> : null}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>

      <section className="holidays__section">
        <h3>{S.holidays.reconcileTitle}</h3>
        <p className="muted small">{S.holidays.reconcileIntro}</p>
        <div className="row">
          <span className="row__label">{S.holidays.ruleset}</span>
          <div className="w-320">
            <Select small value={rulesetId} options={RULESETS.map((r) => ({ value: r.id, label: r.label, group: r.country === 'DE' ? 'Deutschland' : r.country === 'AT' ? 'Österreich' : 'Schweiz' }))} onChange={setRulesetId} aria-label={S.holidays.ruleset} />
          </div>
          {rec ? <span className="muted small">{S.holidays.summary(ok, missing.length, differs)}</span> : null}
        </div>
        {rec && missing.length === 0 && differs === 0 ? (
          <MessageBar intent="success" layout="multiline">
            <MessageBarBody>{S.holidays.allPresent}</MessageBarBody>
          </MessageBar>
        ) : null}
        {rec ? (
          <>
            <Table size="small" aria-label={S.holidays.reconcileTitle} className="holiday-table">
              <TableHeader>
                <TableRow>
                  <TableHeaderCell />
                  <TableHeaderCell>{S.holidays.columns.date}</TableHeaderCell>
                  <TableHeaderCell>{S.holidays.columns.name}</TableHeaderCell>
                  <TableHeaderCell>{S.holidays.columns.scope}</TableHeaderCell>
                  <TableHeaderCell>{S.holidays.columns.status}</TableHeaderCell>
                  <TableHeaderCell>{S.holidays.columns.closure}</TableHeaderCell>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rec.matches.map((m) => (
                  <TableRow key={m.holiday.key}>
                    <TableCell>
                      {m.status === 'missing' && !readOnly ? (
                        <Checkbox
                          size="medium"
                          aria-label={m.holiday.name}
                          checked={selected.has(m.holiday.key)}
                          onChange={(_, d) => {
                            const next = new Set(selected)
                            if (d.checked) next.add(m.holiday.key)
                            else next.delete(m.holiday.key)
                            setSelected(next)
                          }}
                        />
                      ) : null}
                    </TableCell>
                    <TableCell className={m.holiday.date < today ? 'muted' : undefined}>{formatDateWithDay(m.holiday.date)}</TableCell>
                    <TableCell>{m.holiday.name}</TableCell>
                    <TableCell>
                      <Badge size="small" appearance="outline">
                        {m.holiday.optional ? S.holidays.optional : m.holiday.scope === 'national' ? S.holidays.national : S.holidays.regional}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge size="small" appearance="tint" color={STATUS_COLOR[m.status]}>
                        {S.holidays.status[m.status]}
                      </Badge>
                    </TableCell>
                    <TableCell className="muted small">{m.closure ? `${m.closure.name}` : ''}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {!readOnly && missing.length ? (
              <div className="row">
                <Btn small onClick={() => setSelected(new Set(missing.map((m) => m.holiday.key)))}>
                  {S.holidays.selectMissing}
                </Btn>
                <form action={createMissing} className="inline-form">
                  <Btn small kind="primary" type="submit" disabled={selectedMissing.length === 0 || creatingMissing}>
                    {creatingMissing ? S.holidays.creating : S.holidays.createMissing(selectedMissing.length)}
                  </Btn>
                </form>
              </div>
            ) : null}
            {rec.extra.length || rec.duplicates.length ? (
              <p className="muted small">
                {rec.extra.length ? S.holidays.extras(rec.extra.length) : ''}
                {rec.extra.length && rec.duplicates.length ? ' · ' : ''}
                {rec.duplicates.length ? S.holidays.duplicates(rec.duplicates.length) : ''}
              </p>
            ) : null}
          </>
        ) : null}
      </section>

      {creating ? <NewClosureDialog viewerTz={viewerTz} today={today} onClose={() => setCreating(false)} onDone={onChanged} notify={notify} onPrivilegeError={onPrivilegeError} /> : null}

      {toDelete ? (
        <Dialog open onOpenChange={(_, d) => !d.open && !deleting && setToDelete(null)}>
          <DialogSurface aria-label={S.holidays.delete}>
            <DialogBody>
              <DialogTitle action={<Btn kind="ghost" aria-label={S.editor.cancel} icon={<DismissRegular />} onClick={() => setToDelete(null)} />}>{S.holidays.delete}</DialogTitle>
              <DialogContent>{S.holidays.confirmDelete(toDelete.name)}</DialogContent>
              <DialogActions>
                <Btn onClick={() => setToDelete(null)} disabled={deleting}>
                  {S.editor.cancel}
                </Btn>
                <form action={deleteClosure} className="inline-form">
                  <Btn kind="danger" type="submit" disabled={deleting}>
                    {S.holidays.delete}
                  </Btn>
                </form>
              </DialogActions>
            </DialogBody>
          </DialogSurface>
        </Dialog>
      ) : null}
    </div>
  )
}

function NewClosureDialog({ viewerTz, today, onClose, onDone, notify, onPrivilegeError }: { viewerTz: string; today: string; onClose: () => void; onDone: () => void; notify: Notify; onPrivilegeError: () => void }) {
  const [name, setName] = useState('')
  const [date, setDate] = useState(today)
  const [days, setDays] = useState(1)
  const valid = name.trim().length > 0 && isValidDate(date) && days >= 1
  const [result, submit, pending] = useActionState<{ error: string | null }>(async () => {
    try {
      const svc = await getCalendarService()
      const span = closureSpan(date, viewerTz, days)
      await svc.saveClosure(name.trim(), span.start, span.end)
      notify(S.holidays.created(1))
      onDone()
      onClose()
      return { error: null }
    } catch (err) {
      if (err instanceof PrivilegeError) onPrivilegeError()
      return { error: err instanceof Error ? err.message : String(err) }
    }
  }, { error: null })
  return (
    <Dialog open onOpenChange={(_, d) => !d.open && !pending && onClose()}>
      <DialogSurface aria-label={S.holidays.newClosure}>
        <DialogBody>
          <DialogTitle action={<Btn kind="ghost" aria-label={S.editor.cancel} icon={<DismissRegular />} onClick={onClose} disabled={pending} />}>{S.holidays.newClosure}</DialogTitle>
          <DialogContent className="editor__form">
            <Field label={S.holidays.name} required>
              <Input size="small" value={name} placeholder={S.holidays.namePlaceholder} onChange={(_, d) => setName(d.value)} />
            </Field>
            <div className="editor__row">
              <Field label={S.holidays.date} required>
                <DateField value={date} onChange={(d) => d && setDate(d)} ariaLabel={S.holidays.date} />
              </Field>
              <Field label={S.holidays.days}>
                <DaysField value={days} onChange={setDays} />
              </Field>
            </div>
            {result.error ? (
              <MessageBar intent="error" layout="multiline">
                <MessageBarBody>{result.error}</MessageBarBody>
              </MessageBar>
            ) : null}
          </DialogContent>
          <DialogActions>
            <Btn onClick={onClose} disabled={pending}>
              {S.editor.cancel}
            </Btn>
            <form action={submit} className="inline-form">
              <Btn kind="primary" type="submit" disabled={!valid || pending}>
                {pending ? S.holidays.creating : S.holidays.create}
              </Btn>
            </form>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  )
}
