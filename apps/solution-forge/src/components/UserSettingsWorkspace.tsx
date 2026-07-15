import { useEffect, useMemo, useState } from 'react'
import type { UserSettingsRow } from '../types/userSettings'
import { userSettingsService } from '../services/userSettingsService'
import { OperateEnvPicker } from './OperateEnvPicker'
import { formatRelative } from '../utils/format'

/**
 * User Settings — a read-only inventory of every enabled user's personal
 * `usersettings` in the chosen environment (time zone, language/locale,
 * date/number formats, rows-per-page, …). Switch the environment picker to
 * compare a user across systems. Reads run through the connector (SP identity).
 */
interface Props {
  envKey: string
  onEnvChange: (envKey: string) => void
}

type SortKey =
  | 'fullName'
  | 'email'
  | 'timeZone'
  | 'uiLanguage'
  | 'locale'
  | 'dateFormat'
  | 'timeFormat'
  | 'number'
  | 'pagingLimit'
  | 'calendarView'

interface Column {
  key: SortKey
  label: string
  get: (r: UserSettingsRow) => string | number
  num?: boolean
}

const numberSample = (r: UserSettingsRow): string =>
  `1${r.numberSeparator}234${r.decimalSymbol}56`

const COLUMNS: Column[] = [
  { key: 'fullName', label: 'User', get: (r) => r.fullName },
  { key: 'email', label: 'Login', get: (r) => r.email },
  { key: 'timeZone', label: 'Time zone', get: (r) => r.timeZone },
  { key: 'uiLanguage', label: 'UI language', get: (r) => r.uiLanguage },
  { key: 'locale', label: 'Locale', get: (r) => r.locale },
  { key: 'dateFormat', label: 'Date', get: (r) => r.dateFormat },
  { key: 'timeFormat', label: 'Time', get: (r) => r.timeFormat },
  { key: 'number', label: 'Number', get: numberSample },
  { key: 'pagingLimit', label: 'Rows/page', get: (r) => r.pagingLimit, num: true },
  { key: 'calendarView', label: 'Calendar', get: (r) => r.calendarView },
]

export function UserSettingsWorkspace({ envKey, onEnvChange }: Props) {
  const [rows, setRows] = useState<UserSettingsRow[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [loadedAt, setLoadedAt] = useState<Date | null>(null)
  const [nonce, setNonce] = useState(0)

  const [search, setSearch] = useState('')
  const [realOnly, setRealOnly] = useState(true)
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({
    key: 'fullName',
    dir: 'asc',
  })

  useEffect(() => {
    let cancelled = false
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true)
    userSettingsService
      .list(envKey)
      .then((res) => {
        if (cancelled) return
        setRows(res.rows)
        setError(res.error ?? null)
        setLoadedAt(new Date())
      })
      .catch((err) => {
        if (!cancelled)
          setError(err instanceof Error ? err.message : String(err))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [envKey, nonce])

  const q = search.trim().toLowerCase()
  const filtered = useMemo(() => {
    if (!rows) return []
    return rows.filter(
      (r) =>
        (!realOnly || !r.isApp) &&
        (!q ||
          r.fullName.toLowerCase().includes(q) ||
          r.email.toLowerCase().includes(q)),
    )
  }, [rows, q, realOnly])

  const sorted = useMemo(() => {
    const col = COLUMNS.find((c) => c.key === sort.key) ?? COLUMNS[0]
    const arr = [...filtered]
    arr.sort((a, b) => {
      const av = col.get(a)
      const bv = col.get(b)
      const cmp =
        typeof av === 'number' && typeof bv === 'number'
          ? av - bv
          : String(av).localeCompare(String(bv))
      return sort.dir === 'asc' ? cmp : -cmp
    })
    return arr
  }, [filtered, sort])

  const onSort = (key: SortKey) =>
    setSort((s) =>
      s.key === key
        ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' }
        : { key, dir: 'asc' },
    )

  const appCount = rows?.filter((r) => r.isApp).length ?? 0

  return (
    <div>
      <OperateEnvPicker envKey={envKey} onChange={onEnvChange} />

      <div className="card trace-toolbar">
        <input
          className="search"
          type="search"
          placeholder="Search a user by name or login…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <label className="cmp-driftonly">
          <input
            type="checkbox"
            checked={realOnly}
            onChange={(e) => setRealOnly(e.target.checked)}
          />
          Only real users{appCount ? ` (hide ${appCount} app)` : ''}
        </label>
        <span className="trace-toolbar-right">
          {rows && (
            <span className="muted">
              {sorted.length} user{sorted.length === 1 ? '' : 's'}
              {loadedAt && ` · synced ${formatRelative(loadedAt.toISOString())}`}
            </span>
          )}
          <button
            className="btn btn--small"
            onClick={() => setNonce((n) => n + 1)}
            disabled={loading}
          >
            {loading ? 'Reading…' : '⟳ Refresh'}
          </button>
        </span>
      </div>

      {error && <div className="state state--error">{error}</div>}
      {loading && !rows && (
        <div className="state">Reading user settings…</div>
      )}
      {rows && sorted.length === 0 && !loading && (
        <div className="state">
          {q || realOnly
            ? 'No users match the filter.'
            : 'No user settings found in this environment.'}
        </div>
      )}

      {sorted.length > 0 && (
        <div className="card trace-list">
          <table className="ops-table us-table">
            <thead>
              <tr>
                {COLUMNS.map((c) => (
                  <th
                    key={c.key}
                    className={`us-th ${c.num ? 'num' : ''} ${
                      sort.key === c.key ? 'us-th--sorted' : ''
                    }`}
                    onClick={() => onSort(c.key)}
                    title="Sort"
                  >
                    {c.label}
                    {sort.key === c.key && (
                      <span className="us-sort">
                        {sort.dir === 'asc' ? ' ▲' : ' ▼'}
                      </span>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.map((r) => (
                <tr key={r.userId}>
                  <td>
                    <span className="us-user">{r.fullName}</span>
                    {r.isApp && <span className="us-app">app</span>}
                  </td>
                  <td className="trace-type">{r.email}</td>
                  <td>{r.timeZone}</td>
                  <td>{r.uiLanguage}</td>
                  <td>{r.locale}</td>
                  <td className="nowrap">{r.dateFormat}</td>
                  <td className="nowrap">{r.timeFormat}</td>
                  <td className="nowrap">{numberSample(r)}</td>
                  <td className="num">{r.pagingLimit}</td>
                  <td>{r.calendarView}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
