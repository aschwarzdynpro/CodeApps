import { Fragment, useEffect, useMemo, useState } from 'react'
import type { FieldSecurityResult } from '../types/fieldSecurity'
import { fieldSecurityService } from '../services/fieldSecurityService'
import { readReach } from '../utils/fieldSecurity'

/**
 * Field-Level Security Analyzer — the column-level analog of the role matrix.
 * Shows the Field Security Profiles (secured columns with R/C/U/unmasked +
 * who they are assigned to) and a column-centric pivot ("who can read/update
 * secured column X?"). Read-only; loads its own data per environment.
 */
interface Props {
  envKey: string
}

type View = 'profiles' | 'columns'

function AccessBadges({
  r,
  c,
  u,
  unmasked,
}: {
  r: boolean
  c: boolean
  u: boolean
  unmasked: boolean
}) {
  return (
    <span className="fls-access">
      <span className={`fls-flag ${r ? 'fls-flag--on' : ''}`} title="Read">
        R
      </span>
      <span className={`fls-flag ${c ? 'fls-flag--on' : ''}`} title="Create">
        C
      </span>
      <span className={`fls-flag ${u ? 'fls-flag--on' : ''}`} title="Update">
        U
      </span>
      <span
        className={`fls-flag ${unmasked ? 'fls-flag--on' : ''}`}
        title="Read unmasked"
      >
        ◍
      </span>
    </span>
  )
}

export function FieldSecurityWorkspace({ envKey }: Props) {
  const [result, setResult] = useState<FieldSecurityResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [view, setView] = useState<View>('profiles')
  const [search, setSearch] = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const t = window.setTimeout(() => {
      setLoading(true)
      setError(null)
      fieldSecurityService
        .loadFieldSecurity(envKey)
        .then((r) => {
          if (!cancelled) setResult(r)
        })
        .catch((err) => {
          if (!cancelled)
            setError(err instanceof Error ? err.message : String(err))
        })
        .finally(() => {
          if (!cancelled) setLoading(false)
        })
    }, 20)
    return () => {
      cancelled = true
      window.clearTimeout(t)
    }
  }, [envKey])

  const filteredProfiles = useMemo(() => {
    if (!result) return []
    const q = search.trim().toLowerCase()
    return result.profiles.filter((p) => !q || p.name.toLowerCase().includes(q))
  }, [result, search])

  const filteredColumns = useMemo(() => {
    if (!result) return []
    const q = search.trim().toLowerCase()
    return result.columns.filter(
      (c) =>
        !q ||
        c.attribute.toLowerCase().includes(q) ||
        c.entity.toLowerCase().includes(q),
    )
  }, [result, search])

  return (
    <div>
      <div className="card trace-toolbar">
        <div className="chips">
          <button
            className={`chip ${view === 'profiles' ? 'chip--active' : ''}`}
            onClick={() => {
              setView('profiles')
              setExpanded(null)
            }}
          >
            Profiles
          </button>
          <button
            className={`chip ${view === 'columns' ? 'chip--active' : ''}`}
            onClick={() => {
              setView('columns')
              setExpanded(null)
            }}
          >
            Secured columns
          </button>
        </div>
        <input
          className="search"
          type="search"
          placeholder={view === 'profiles' ? 'Search profiles…' : 'Search columns…'}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="state trace-hint">
        ℹ System Administrators bypass field security — these grants apply to
        everyone else. Columns not covered by any profile are readable only by
        admins.
      </div>

      {error && <div className="state state--error">{error}</div>}
      {loading && !result && (
        <div className="state">Reading field security…</div>
      )}

      {result && view === 'profiles' && (
        <>
          {filteredProfiles.length === 0 ? (
            <div className="state">
              {result.profiles.length === 0
                ? 'No field security profiles in this environment.'
                : 'No profiles match the search.'}
            </div>
          ) : (
            <div className="card trace-list">
              <table className="ops-table">
                <thead>
                  <tr>
                    <th>Profile</th>
                    <th className="num">Columns</th>
                    <th className="num">Users</th>
                    <th className="num">Teams</th>
                    <th>Status</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredProfiles.map((p) => {
                    const isOpen = expanded === p.id
                    const orphan = p.userNames.length + p.teamNames.length === 0
                    return (
                      <Fragment key={p.id}>
                        <tr
                          className={`ops-row ${isOpen ? 'ops-row--open' : ''}`}
                          onClick={() => setExpanded(isOpen ? null : p.id)}
                        >
                          <td className="envcfg-name">
                            {p.name}
                            {p.isManaged && (
                              <span className="muted"> (managed)</span>
                            )}
                          </td>
                          <td className="num">{p.columns.length}</td>
                          <td className="num">{p.userNames.length}</td>
                          <td className="num">{p.teamNames.length}</td>
                          <td>
                            {orphan ? (
                              <span className="audit-eff audit-eff--warn">
                                ⚠ assigned to nobody
                              </span>
                            ) : (
                              <span className="muted">—</span>
                            )}
                          </td>
                          <td className="nowrap">
                            <button className="btn btn--small">
                              {isOpen ? 'Hide' : 'Details'}
                            </button>
                          </td>
                        </tr>
                        {isOpen && (
                          <tr className="ops-detail-row">
                            <td colSpan={6}>
                              <div className="fls-detail">
                                <div className="fls-detail-col">
                                  <h4>Secured columns ({p.columns.length})</h4>
                                  {p.columns.length === 0 ? (
                                    <div className="muted">No columns.</div>
                                  ) : (
                                    <table className="ops-table">
                                      <thead>
                                        <tr>
                                          <th>Table</th>
                                          <th>Column</th>
                                          <th>Access</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {p.columns.map((c) => (
                                          <tr key={`${c.entity}.${c.attribute}`}>
                                            <td className="trace-type">{c.entity}</td>
                                            <td className="trace-type">
                                              {c.attribute}
                                            </td>
                                            <td>
                                              <AccessBadges
                                                r={c.canRead}
                                                c={c.canCreate}
                                                u={c.canUpdate}
                                                unmasked={c.canReadUnmasked}
                                              />
                                            </td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  )}
                                </div>
                                <div className="fls-detail-col">
                                  <h4>Assigned to</h4>
                                  <div className="fls-assign">
                                    <strong>Users ({p.userNames.length})</strong>
                                    {p.userNames.length === 0 ? (
                                      <span className="muted"> — none</span>
                                    ) : (
                                      <div className="chips">
                                        {p.userNames.map((u) => (
                                          <span key={u} className="chip chip--static">
                                            👤 {u}
                                          </span>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                  <div className="fls-assign">
                                    <strong>Teams ({p.teamNames.length})</strong>
                                    {p.teamNames.length === 0 ? (
                                      <span className="muted"> — none</span>
                                    ) : (
                                      <div className="chips">
                                        {p.teamNames.map((t) => (
                                          <span key={t} className="chip chip--static">
                                            👥 {t}
                                          </span>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {result && view === 'columns' && (
        <>
          {filteredColumns.length === 0 ? (
            <div className="state">
              {result.columns.length === 0
                ? 'No secured columns are granted by any profile.'
                : 'No columns match the search.'}
            </div>
          ) : (
            <div className="card trace-list">
              <table className="ops-table">
                <thead>
                  <tr>
                    <th>Table</th>
                    <th>Column</th>
                    <th className="num">Profiles</th>
                    <th className="num" title="Users + teams that can read this column (excl. admins).">
                      Read reach
                    </th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredColumns.map((col) => {
                    const key = `${col.entity}.${col.attribute}`
                    const isOpen = expanded === key
                    const noRead = !col.grants.some((g) => g.canRead)
                    return (
                      <Fragment key={key}>
                        <tr
                          className={`ops-row ${isOpen ? 'ops-row--open' : ''} ${noRead ? 'ops-row--error' : ''}`}
                          onClick={() => setExpanded(isOpen ? null : key)}
                        >
                          <td className="trace-type">{col.entity}</td>
                          <td className="trace-type">{col.attribute}</td>
                          <td className="num">{col.grants.length}</td>
                          <td className="num">
                            {noRead ? (
                              <span title="No profile grants read — admins only">
                                0
                              </span>
                            ) : (
                              readReach(col)
                            )}
                          </td>
                          <td className="nowrap">
                            <button className="btn btn--small">
                              {isOpen ? 'Hide' : 'Grants'}
                            </button>
                          </td>
                        </tr>
                        {isOpen && (
                          <tr className="ops-detail-row">
                            <td colSpan={5}>
                              <table className="ops-table">
                                <thead>
                                  <tr>
                                    <th>Profile</th>
                                    <th>Access</th>
                                    <th className="num">Users</th>
                                    <th className="num">Teams</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {col.grants.map((g) => (
                                    <tr key={g.profileId}>
                                      <td>{g.profileName}</td>
                                      <td>
                                        <AccessBadges
                                          r={g.canRead}
                                          c={g.canCreate}
                                          u={g.canUpdate}
                                          unmasked={g.canReadUnmasked}
                                        />
                                      </td>
                                      <td className="num">{g.userCount}</td>
                                      <td className="num">{g.teamCount}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  )
}
