import { useEffect, useMemo, useRef, useState } from 'react'
import { diffLines } from 'diff'
import type {
  AlmComponentRef,
  ContentPair,
  EnvKey,
} from '../types/comparison'
import { ENVIRONMENTS } from '../config'
import { comparisonService } from '../services/comparisonService'

/**
 * Side-by-side definition diff for one component across two environments.
 * Used by Compare and the Layer Inspector; the host passes the component
 * ref and the environments to choose between.
 */

/** One aligned line of the side-by-side diff. */
interface DiffLine {
  left: string | null
  right: string | null
  kind: 'same' | 'change' | 'add' | 'del'
}

/** Split a jsdiff chunk into lines, dropping the trailing empty element. */
function splitLines(value: string): string[] {
  const lines = value.split('\n')
  if (lines.length > 1 && lines[lines.length - 1] === '') lines.pop()
  return lines
}

/** Align jsdiff line parts into left/right rows for a side-by-side view. */
function buildSideBySide(a: string, b: string): DiffLine[] {
  const parts = diffLines(a, b)
  const rows: DiffLine[] = []
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i]
    if (!part.added && !part.removed) {
      for (const line of splitLines(part.value))
        rows.push({ left: line, right: line, kind: 'same' })
    } else if (part.removed && parts[i + 1]?.added) {
      const left = splitLines(part.value)
      const right = splitLines(parts[i + 1].value)
      const n = Math.max(left.length, right.length)
      for (let j = 0; j < n; j++)
        rows.push({
          left: left[j] ?? null,
          right: right[j] ?? null,
          kind: 'change',
        })
      i++ // consume the paired added part
    } else if (part.removed) {
      for (const line of splitLines(part.value))
        rows.push({ left: line, right: null, kind: 'del' })
    } else {
      for (const line of splitLines(part.value))
        rows.push({ left: null, right: line, kind: 'add' })
    }
  }
  return rows
}

export function ContentDiffModal({
  target,
  onClose,
}: {
  target: { ref: AlmComponentRef; envs: EnvKey[] }
  onClose: () => void
}) {
  const { ref, envs } = target
  const [envA, setEnvA] = useState<EnvKey>(envs[0])
  const [envB, setEnvB] = useState<EnvKey>(envs[1] ?? envs[0])
  const [pair, setPair] = useState<ContentPair | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const req = useRef(0)

  useEffect(() => {
    const id = ++req.current
    // Reset to the loading state for the new env pair, then fetch.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true)
    setError(null)
    setPair(null)
    comparisonService
      .fetchContentPair(ref, envA, envB)
      .then((p) => {
        if (id === req.current) setPair(p)
      })
      .catch((err) => {
        if (id === req.current)
          setError(err instanceof Error ? err.message : String(err))
      })
      .finally(() => {
        if (id === req.current) setLoading(false)
      })
  }, [ref, envA, envB])

  const rows = useMemo(() => {
    if (!pair || pair.a.text === null || pair.b.text === null) return null
    return buildSideBySide(pair.a.text, pair.b.text)
  }, [pair])

  const labelOf = (key: EnvKey) =>
    ENVIRONMENTS.find((e) => e.key === key)?.label ?? key.toUpperCase()
  const identical = rows?.every((r) => r.kind === 'same') ?? false

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal card modal--wide diff-modal"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h2 className="diff-title">{ref.name}</h2>
          <button className="modal-close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        <div className="diff-env-row">
          <EnvPicker value={envA} options={envs} onChange={setEnvA} />
          <span className="diff-vs">vs</span>
          <EnvPicker value={envB} options={envs} onChange={setEnvB} />
        </div>

        {loading && <div className="state">Loading definitions…</div>}
        {error && <div className="state state--error">{error}</div>}

        {!loading && !error && pair && (
          <>
            {(pair.a.binary || pair.b.binary) && (
              <div className="state">
                Binary content — showing size only. {labelOf(envA)}:{' '}
                {pair.a.size ?? 0} bytes · {labelOf(envB)}: {pair.b.size ?? 0}{' '}
                bytes ·{' '}
                {pair.a.size === pair.b.size ? 'same size' : 'different size'}.
              </div>
            )}
            {!pair.a.present || !pair.b.present ? (
              <div className="state">
                Present in only one of the two selected environments — nothing
                to diff. Pick two environments that both have it.
              </div>
            ) : rows ? (
              <>
                {identical && (
                  <div className="state state--success">
                    Definitions are identical in {labelOf(envA)} and{' '}
                    {labelOf(envB)}.
                  </div>
                )}
                <div className={`diff-view diff-view--${pair.language}`}>
                  <div className="diff-col-head">{labelOf(envA)}</div>
                  <div className="diff-col-head">{labelOf(envB)}</div>
                  {rows.map((line, i) => (
                    <DiffRow key={i} line={line} />
                  ))}
                </div>
              </>
            ) : null}
          </>
        )}
      </div>
    </div>
  )
}

function EnvPicker({
  value,
  options,
  onChange,
}: {
  value: EnvKey
  options: EnvKey[]
  onChange: (key: EnvKey) => void
}) {
  return (
    <select
      className="diff-env-select"
      value={value}
      onChange={(e) => onChange(e.target.value as EnvKey)}
    >
      {options.map((key) => (
        <option key={key} value={key}>
          {ENVIRONMENTS.find((e) => e.key === key)?.label ?? key.toUpperCase()}
        </option>
      ))}
    </select>
  )
}

function DiffRow({ line }: { line: DiffLine }) {
  const leftClass =
    line.kind === 'del' || line.kind === 'change' ? 'diff-cell--del' : ''
  const rightClass =
    line.kind === 'add' || line.kind === 'change' ? 'diff-cell--add' : ''
  return (
    <>
      <pre
        className={`diff-cell ${line.left === null ? 'diff-cell--empty' : leftClass}`}
      >
        {line.left ?? ''}
      </pre>
      <pre
        className={`diff-cell ${line.right === null ? 'diff-cell--empty' : rightClass}`}
      >
        {line.right ?? ''}
      </pre>
    </>
  )
}
