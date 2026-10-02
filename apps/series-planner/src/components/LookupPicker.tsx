import { useEffect, useState } from 'react'
import { Combobox, Option, makeStyles } from '@fluentui/react-components'
import type { LookupKind, Ref } from '../types/series'
import { getSeriesService } from '../services/seriesService'

const useStyles = makeStyles({
  root: { width: '100%', minWidth: 'unset' },
  listbox: { maxHeight: '320px' },
})

/**
 * Record picker with live search (Dataverse `contains`, every word must
 * match). Shows the chosen record's name until the user types; opening
 * without typing lists the first matches.
 */
export function LookupPicker({
  kind,
  value,
  onChange,
  projectId,
  placeholder,
  disabled,
  clearable = true,
  'aria-label': ariaLabel,
}: {
  kind: LookupKind
  value: Ref | null
  onChange: (value: Ref | null) => void
  /** Restricts project tasks to one project. */
  projectId?: string
  placeholder?: string
  disabled?: boolean
  clearable?: boolean
  'aria-label'?: string
}) {
  const styles = useStyles()
  const [term, setTerm] = useState<string | null>(null)
  const [results, setResults] = useState<{ term: string; items: Ref[]; error?: string } | null>(null)

  useEffect(() => {
    if (term === null) return
    let cancelled = false
    const timer = setTimeout(() => {
      getSeriesService()
        .then((svc) => svc.search(kind, term, { projectId }))
        .then(
          (items) => {
            if (!cancelled) setResults({ term, items })
          },
          (err: unknown) => {
            if (!cancelled) setResults({ term, items: [], error: err instanceof Error ? err.message : String(err) })
          },
        )
    }, 250)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [term, kind, projectId])

  const current = results && results.term === term ? results : null
  const items = current?.items ?? []

  return (
    <Combobox
      freeform
      className={styles.root}
      listbox={{ className: styles.listbox }}
      aria-label={ariaLabel}
      placeholder={placeholder ?? 'Suchen …'}
      disabled={disabled}
      clearable={clearable && !!value}
      value={term ?? value?.name ?? ''}
      selectedOptions={value ? [value.id] : []}
      onChange={(e) => setTerm(e.target.value)}
      onOpenChange={(_, d) => {
        if (d.open && term === null) setTerm('')
        if (!d.open) setTerm(null)
      }}
      onOptionSelect={(_, d) => {
        if (d.optionValue === undefined) {
          onChange(null)
        } else {
          const hit = items.find((i) => i.id === d.optionValue) ?? (value?.id === d.optionValue ? value : null)
          if (hit) onChange(hit)
        }
        setTerm(null)
      }}
    >
      {term !== null && !current ? (
        <Option disabled value="__loading" text="">
          Suche …
        </Option>
      ) : null}
      {current?.error ? (
        <Option disabled value="__error" text="">
          {current.error}
        </Option>
      ) : null}
      {current && !current.error && items.length === 0 ? (
        <Option disabled value="__none" text="">
          Keine Treffer
        </Option>
      ) : null}
      {items.map((i) => (
        <Option key={i.id} value={i.id} text={i.name}>
          {i.name}
        </Option>
      ))}
    </Combobox>
  )
}
