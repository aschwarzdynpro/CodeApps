import { useState } from 'react'
import type { CellEdit, TranslationFile } from '../types/translation'
import { csvToEdits, type CsvReadResult } from '../utils/csv'
import { applyEdits } from '../utils/translationFile'
import { languageName } from '../utils/languages'
import { Modal } from './Modal'
import { Btn, FilePicker } from './ui'
import { S } from '../strings'

const PREVIEW_LIMIT = 200

interface Preview {
  name: string
  read: CsvReadResult
  /** Edits that change something, after the same guards as the import. */
  edits: CellEdit[]
  changes: { rowKey: string; lcid: number; before: string; after: string }[]
  skipped: { edit: CellEdit; reason: string }[]
}

/** Reads a filled CSV, shows what would change, hands the edits to the matrix. */
export function CsvImportDialog({ file, onClose, onTake }: { file: TranslationFile; onClose: () => void; onTake: (edits: CellEdit[]) => void }) {
  const [preview, setPreview] = useState<Preview | null>(null)
  const [error, setError] = useState<string | null>(null)

  const onFile = async (f: File) => {
    setError(null)
    try {
      const read = csvToEdits(await f.text(), file)
      const res = applyEdits(file, read.edits)
      // Changes relative to the current state (the file already carries earlier edits).
      const current = new Map(file.rows.map((r) => [r.key, r]))
      const changes = read.edits
        .filter((e) => !res.skipped.some((s) => s.edit === e))
        .map((e) => ({ rowKey: e.rowKey, lcid: e.lcid, before: current.get(e.rowKey)?.values[e.lcid] ?? '', after: e.value }))
      setPreview({ name: f.name, read, edits: read.edits.filter((e) => !res.skipped.some((s) => s.edit === e)), changes, skipped: res.skipped })
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setPreview(null)
    }
  }

  const rows = new Map(file.rows.map((r) => [r.key, r]))
  return (
    <Modal
      title={S.csv.title}
      onClose={onClose}
      wide
      footer={
        <>
          <Btn onClick={onClose}>{S.common.cancel}</Btn>
          <Btn kind="primary" disabled={!preview || preview.edits.length === 0} onClick={() => preview && onTake(preview.edits)}>
            {S.csv.take(preview?.edits.length ?? 0)}
          </Btn>
        </>
      }
    >
      <FilePicker accept=".csv,text/csv,text/plain" fileName={preview?.name ?? null} hint={S.csv.hint} onFile={(f) => void onFile(f)} />
      {error ? <div className="notice notice--error">{error}</div> : null}
      {preview ? (
        <>
          <p>
            {S.csv.read(preview.read.rowsRead)} · <strong>{S.csv.changes(preview.edits.length)}</strong>{' '}
            {preview.read.languages.map((l) => (
              <span key={l} className="chip">
                {languageName(l)}: {preview.edits.filter((e) => e.lcid === l).length}
              </span>
            ))}
          </p>
          {preview.read.issues.map((i) => (
            <div key={i} className="notice notice--warn">
              {i}
            </div>
          ))}
          {preview.skipped.length > 0 ? (
            <div className="notice notice--warn">
              <strong>{S.csv.skipped}:</strong>
              <ul>
                {[...new Set(preview.skipped.map((s) => s.reason))].map((r) => (
                  <li key={r}>
                    {preview.skipped.filter((s) => s.reason === r).length} × {r}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {preview.edits.length === 0 ? <p className="muted">{S.csv.none}</p> : null}
          {preview.changes.length > 0 ? (
            <div className="diff">
              <table className="diff__table">
                <thead>
                  <tr>
                    <th>{S.matrix.column}</th>
                    <th>{S.apply.headLanguage}</th>
                    <th>{S.apply.headBefore}</th>
                    <th>{S.apply.headAfter}</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.changes.slice(0, PREVIEW_LIMIT).map((c) => (
                    <tr key={`${c.rowKey}|${c.lcid}`}>
                      <td className="mono">
                        {rows.get(c.rowKey)?.values[file.baseLanguage]} <span className="muted small">{rows.get(c.rowKey)?.column}</span>
                      </td>
                      <td>{c.lcid}</td>
                      <td className="diff__before">{c.before || <span className="muted">—</span>}</td>
                      <td className="diff__after">{c.after}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {preview.changes.length > PREVIEW_LIMIT ? <p className="muted small">{S.apply.more(preview.changes.length - PREVIEW_LIMIT)}</p> : null}
            </div>
          ) : null}
        </>
      ) : null}
    </Modal>
  )
}
