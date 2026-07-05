import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
} from 'react'
import type { OrgStructure, OrgTeam } from '../types/orgStructure'
import { TEAM_TYPE_LABELS } from '../types/orgStructure'
import { roleAnalyzerService } from '../services/roleAnalyzerService'
import { buildForest, layoutTree } from '../utils/orgTree'

/**
 * Team & BU Map — an interactive org-chart of the business-unit hierarchy
 * with the role-granting teams docked to each BU. Rendered as inline SVG
 * (no chart dependency): pan by dragging, zoom with the buttons/wheel,
 * collapse a subtree, click a BU or team for details, and trace one user to
 * see where their team-inherited rights come from.
 */

const NODE_W = 214
const HEADER_H = 58
const TEAM_H = 24
const TEAM_MAX = 6
const H_GAP = 30
const LEVEL_GAP = 50
const PAD = 48

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s
}

interface Selection {
  type: 'bu' | 'team'
  id: string
}

export function TeamBuMap({ envKey }: { envKey: string }) {
  const [structure, setStructure] = useState<OrgStructure | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [showAllTeams, setShowAllTeams] = useState(false)
  const [selected, setSelected] = useState<Selection | null>(null)
  const [traceUserId, setTraceUserId] = useState('')
  const [search, setSearch] = useState('')

  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: PAD, y: PAD })
  const dragging = useRef<{ x: number; y: number } | null>(null)
  const viewportRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let cancelled = false
    const t = window.setTimeout(() => {
      setLoading(true)
      setError(null)
      roleAnalyzerService
        .getOrgStructure(envKey)
        .then((s) => {
          if (!cancelled) setStructure(s)
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

  const buById = useMemo(
    () => new Map((structure?.businessUnits ?? []).map((b) => [b.id, b])),
    [structure],
  )

  // Teams visible per BU (role-granting only unless the toggle is on).
  const visibleTeams = useMemo(() => {
    const map = new Map<string, OrgTeam[]>()
    if (!structure) return map
    for (const [buId, teams] of Object.entries(structure.teamsByBu)) {
      const list = showAllTeams
        ? teams
        : teams.filter((t) => t.roleNames.length > 0)
      if (list.length) map.set(buId, list)
    }
    return map
  }, [structure, showAllTeams])

  const nodeHeight = useCallback(
    (buId: string) => {
      const teams = visibleTeams.get(buId) ?? []
      const shown = Math.min(teams.length, TEAM_MAX)
      const overflow = teams.length > TEAM_MAX ? 1 : 0
      return (
        HEADER_H + (shown + overflow) * TEAM_H + (teams.length ? 10 : 6)
      )
    },
    [visibleTeams],
  )

  const layout = useMemo(() => {
    if (!structure) return null
    const forest = buildForest(structure.businessUnits, collapsed)
    return layoutTree(forest, {
      nodeWidth: NODE_W,
      hGap: H_GAP,
      levelGap: LEVEL_GAP,
      heightOf: nodeHeight,
    })
  }, [structure, collapsed, nodeHeight])

  // Which BUs actually have children (for the collapse toggle).
  const hasChildren = useMemo(() => {
    const set = new Set<string>()
    for (const b of structure?.businessUnits ?? [])
      if (b.parentId && buById.has(b.parentId)) set.add(b.parentId)
    return set
  }, [structure, buById])

  // Trace: the selected user's BU + the teams they belong to + gained roles.
  const trace = useMemo(() => {
    if (!structure || !traceUserId) return null
    const user = structure.users.find((u) => u.id === traceUserId)
    if (!user) return null
    const teams: OrgTeam[] = []
    for (const list of Object.values(structure.teamsByBu))
      for (const t of list) if (t.memberIds.includes(traceUserId)) teams.push(t)
    const roleNames = [
      ...new Set(teams.flatMap((t) => t.roleNames)),
    ].sort((a, b) => a.localeCompare(b))
    return {
      user,
      buId: user.buId,
      teamIds: new Set(teams.map((t) => t.id)),
      teams,
      roleNames,
    }
  }, [structure, traceUserId])

  const toggleCollapse = (buId: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(buId)) next.delete(buId)
      else next.add(buId)
      return next
    })

  const centerOn = useCallback((x: number, y: number) => {
    const vp = viewportRef.current
    if (!vp) return
    setZoom((z) => {
      setPan({ x: vp.clientWidth / 2 - x * z, y: vp.clientHeight / 3 - y * z })
      return z
    })
  }, [])

  const runSearch = () => {
    if (!structure || !layout) return
    const q = search.trim().toLowerCase()
    if (!q) return
    const bu = structure.businessUnits.find((b) =>
      b.name.toLowerCase().includes(q),
    )
    if (bu) {
      const pos = layout.positions.get(bu.id)
      if (pos) {
        setSelected({ type: 'bu', id: bu.id })
        centerOn(pos.x, pos.y)
        return
      }
    }
    for (const [buId, teams] of visibleTeams) {
      const team = teams.find((t) => t.name.toLowerCase().includes(q))
      if (team) {
        const pos = layout.positions.get(buId)
        if (pos) {
          setSelected({ type: 'team', id: team.id })
          centerOn(pos.x, pos.y)
        }
        return
      }
    }
  }

  // --- pan / zoom ---
  const onPointerDown = (e: ReactPointerEvent<SVGSVGElement>) => {
    dragging.current = { x: e.clientX, y: e.clientY }
    ;(e.target as Element).setPointerCapture?.(e.pointerId)
  }
  const onPointerMove = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (!dragging.current) return
    const dx = e.clientX - dragging.current.x
    const dy = e.clientY - dragging.current.y
    dragging.current = { x: e.clientX, y: e.clientY }
    setPan((p) => ({ x: p.x + dx, y: p.y + dy }))
  }
  const onPointerUp = () => {
    dragging.current = null
  }
  const onWheel = (e: ReactWheelEvent<SVGSVGElement>) => {
    const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1
    setZoom((z) => Math.min(2.5, Math.max(0.3, z * factor)))
  }
  const resetView = () => {
    setZoom(1)
    setPan({ x: PAD, y: PAD })
  }

  const teamById = useCallback(
    (id: string): OrgTeam | undefined => {
      for (const list of Object.values(structure?.teamsByBu ?? {}))
        for (const t of list) if (t.id === id) return t
      return undefined
    },
    [structure],
  )

  const teamPillClass = (t: OrgTeam): string => {
    if (t.roleNames.length === 0) return 'tbmap-pill tbmap-pill--norole'
    if (t.teamType === 1) return 'tbmap-pill tbmap-pill--access'
    return 'tbmap-pill tbmap-pill--role'
  }

  return (
    <div>
      <div className="card trace-toolbar">
        <div className="search-group">
          <input
            className="search"
            type="search"
            placeholder="Find BU or team…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && runSearch()}
          />
          <button className="btn btn--small" onClick={runSearch}>
            Find
          </button>
        </div>
        <label>
          Trace user
          <select
            value={traceUserId}
            onChange={(e) => {
              setTraceUserId(e.target.value)
              // Show the trace summary rather than a stale node selection.
              if (e.target.value) setSelected(null)
            }}
          >
            <option value="">— none —</option>
            {(structure?.users ?? []).map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </label>
        <label className="trace-check">
          <input
            type="checkbox"
            checked={showAllTeams}
            onChange={(e) => setShowAllTeams(e.target.checked)}
          />
          all teams (incl. default / access)
        </label>
        <span className="trace-toolbar-right">
          <button className="btn btn--small" onClick={() => setZoom((z) => Math.min(2.5, z * 1.2))}>
            ＋
          </button>
          <button className="btn btn--small" onClick={() => setZoom((z) => Math.max(0.3, z / 1.2))}>
            －
          </button>
          <button className="btn btn--small" onClick={resetView}>
            Reset view
          </button>
        </span>
      </div>

      {error && <div className="state state--error">{error}</div>}
      {loading && !structure && (
        <div className="state">Loading org structure…</div>
      )}

      {structure && layout && (
        <div className="tbmap-layout">
          <div className="tbmap-viewport card" ref={viewportRef}>
            <svg
              className="tbmap-svg"
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerLeave={onPointerUp}
              onWheel={onWheel}
            >
              <g transform={`translate(${pan.x} ${pan.y}) scale(${zoom})`}>
                {/* edges */}
                {layout.edges.map((e) => {
                  const from = layout.positions.get(e.from)
                  const to = layout.positions.get(e.to)
                  if (!from || !to) return null
                  const x1 = from.x
                  const y1 = from.y + from.height
                  const x2 = to.x
                  const y2 = to.y
                  const midY = (y1 + y2) / 2
                  return (
                    <path
                      key={`${e.from}-${e.to}`}
                      className="tbmap-edge"
                      d={`M ${x1} ${y1} V ${midY} H ${x2} V ${y2}`}
                    />
                  )
                })}
                {/* nodes */}
                {structure.businessUnits.map((bu) => {
                  const pos = layout.positions.get(bu.id)
                  if (!pos) return null
                  const teams = visibleTeams.get(bu.id) ?? []
                  const dim = !!trace && trace.buId !== bu.id
                  const isSel = selected?.type === 'bu' && selected.id === bu.id
                  const traced = trace?.buId === bu.id
                  return (
                    <g
                      key={bu.id}
                      transform={`translate(${pos.x - NODE_W / 2} ${pos.y})`}
                      className={`tbmap-node ${dim ? 'tbmap-node--dim' : ''}`}
                    >
                      <rect
                        className={`tbmap-bu ${isSel ? 'tbmap-bu--sel' : ''} ${traced ? 'tbmap-bu--trace' : ''}`}
                        width={NODE_W}
                        height={pos.height}
                        rx={10}
                        onClick={() => setSelected({ type: 'bu', id: bu.id })}
                      />
                      <text className="tbmap-bu-title" x={12} y={22}>
                        {truncate(bu.name, 24)}
                      </text>
                      <text className="tbmap-bu-meta" x={12} y={40}>
                        {(structure.teamsByBu[bu.id]?.length ?? 0)} team
                        {(structure.teamsByBu[bu.id]?.length ?? 0) === 1 ? '' : 's'} ·{' '}
                        {bu.userCount} user{bu.userCount === 1 ? '' : 's'}
                      </text>
                      {/* team pills */}
                      {teams.slice(0, TEAM_MAX).map((t, i) => {
                        const tDim = !!trace && !trace.teamIds.has(t.id)
                        const tSel =
                          selected?.type === 'team' && selected.id === t.id
                        const tTrace = trace?.teamIds.has(t.id)
                        return (
                          <g
                            key={t.id}
                            transform={`translate(10 ${HEADER_H + i * TEAM_H})`}
                            onClick={(e) => {
                              e.stopPropagation()
                              setSelected({ type: 'team', id: t.id })
                            }}
                          >
                            <rect
                              className={`${teamPillClass(t)} ${tSel ? 'tbmap-pill--sel' : ''} ${tTrace ? 'tbmap-pill--trace' : ''} ${tDim ? 'tbmap-pill--dim' : ''}`}
                              width={NODE_W - 20}
                              height={TEAM_H - 5}
                              rx={5}
                            />
                            <text className="tbmap-pill-text" x={8} y={13}>
                              {truncate(t.name, 20)}
                              {t.roleNames.length > 0
                                ? `  ·  ${t.roleNames.length}🛡`
                                : ''}
                            </text>
                          </g>
                        )
                      })}
                      {teams.length > TEAM_MAX && (
                        <text
                          className="tbmap-more"
                          x={12}
                          y={HEADER_H + TEAM_MAX * TEAM_H + 13}
                        >
                          +{teams.length - TEAM_MAX} more team
                          {teams.length - TEAM_MAX === 1 ? '' : 's'}
                        </text>
                      )}
                      {/* collapse toggle */}
                      {hasChildren.has(bu.id) && (
                        <g
                          transform={`translate(${NODE_W / 2 - 9} ${pos.height - 2})`}
                          onClick={(e) => {
                            e.stopPropagation()
                            toggleCollapse(bu.id)
                          }}
                          className="tbmap-toggle"
                        >
                          <circle cx={9} cy={9} r={9} />
                          <text x={9} y={13} className="tbmap-toggle-text">
                            {collapsed.has(bu.id) ? '+' : '−'}
                          </text>
                        </g>
                      )}
                    </g>
                  )
                })}
              </g>
            </svg>
            <div className="tbmap-legend">
              <span className="tbmap-legend-item">
                <span className="tbmap-swatch tbmap-swatch--role" /> role-granting
              </span>
              <span className="tbmap-legend-item">
                <span className="tbmap-swatch tbmap-swatch--access" /> access team
              </span>
              <span className="tbmap-legend-item">
                <span className="tbmap-swatch tbmap-swatch--norole" /> no roles
              </span>
              <span className="muted">· drag to pan · wheel to zoom</span>
            </div>
          </div>

          <aside className="tbmap-panel card">
            {selected?.type === 'bu' &&
              (() => {
                const bu = buById.get(selected.id)
                if (!bu) return null
                const teams = structure.teamsByBu[bu.id] ?? []
                const parent = bu.parentId ? buById.get(bu.parentId) : null
                const children = structure.businessUnits.filter(
                  (b) => b.parentId === bu.id,
                )
                return (
                  <>
                    <h3>{bu.name}</h3>
                    <div className="muted tbmap-panel-sub">Business unit</div>
                    <dl className="tbmap-dl">
                      <dt>Parent</dt>
                      <dd>{parent ? parent.name : '— (root)'}</dd>
                      <dt>Users</dt>
                      <dd>{bu.userCount}</dd>
                      <dt>Child BUs</dt>
                      <dd>
                        {children.length
                          ? children.map((c) => c.name).join(', ')
                          : '—'}
                      </dd>
                    </dl>
                    <h4>Teams ({teams.length})</h4>
                    {teams.length === 0 ? (
                      <div className="muted">No teams.</div>
                    ) : (
                      <ul className="tbmap-list">
                        {teams.map((t) => (
                          <li key={t.id}>
                            <button
                              className="tbmap-link"
                              onClick={() =>
                                setSelected({ type: 'team', id: t.id })
                              }
                            >
                              {t.name}
                            </button>{' '}
                            <span className="muted">
                              {t.roleNames.length} role
                              {t.roleNames.length === 1 ? '' : 's'}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </>
                )
              })()}

            {selected?.type === 'team' &&
              (() => {
                const t = teamById(selected.id)
                if (!t) return null
                const bu = buById.get(t.buId)
                return (
                  <>
                    <h3>{t.name}</h3>
                    <div className="muted tbmap-panel-sub">
                      {TEAM_TYPE_LABELS[t.teamType] ?? 'Team'} team
                      {t.isDefault ? ' · default' : ''}
                    </div>
                    <dl className="tbmap-dl">
                      <dt>Business unit</dt>
                      <dd>{bu?.name ?? '—'}</dd>
                    </dl>
                    <h4>Grants roles ({t.roleNames.length})</h4>
                    {t.roleNames.length === 0 ? (
                      <div className="muted">No security roles.</div>
                    ) : (
                      <ul className="tbmap-list">
                        {t.roleNames.map((r) => (
                          <li key={r}>{r}</li>
                        ))}
                      </ul>
                    )}
                    <h4>Members ({t.memberNames.length})</h4>
                    {t.memberNames.length === 0 ? (
                      <div className="muted">
                        {t.roleNames.length === 0
                          ? 'Members not loaded for non-role teams.'
                          : 'No members.'}
                      </div>
                    ) : (
                      <ul className="tbmap-list">
                        {t.memberNames.map((m) => (
                          <li key={m}>{m}</li>
                        ))}
                      </ul>
                    )}
                    {t.roleNames.length > 0 && t.memberNames.length > 0 && (
                      <div className="muted tbmap-note">
                        These {t.memberNames.length} member
                        {t.memberNames.length === 1 ? '' : 's'} inherit the
                        roles above via this team.
                      </div>
                    )}
                  </>
                )
              })()}

            {!selected && trace && (
              <>
                <h3>{trace.user.name}</h3>
                <div className="muted tbmap-panel-sub">
                  Trace — team-inherited rights
                </div>
                <dl className="tbmap-dl">
                  <dt>Business unit</dt>
                  <dd>{buById.get(trace.buId)?.name ?? '—'}</dd>
                  <dt>Member of</dt>
                  <dd>
                    {trace.teams.length
                      ? `${trace.teams.length} role-granting team${trace.teams.length === 1 ? '' : 's'}`
                      : 'no role-granting team'}
                  </dd>
                </dl>
                {trace.teams.length > 0 && (
                  <>
                    <h4>Inherited via teams</h4>
                    <ul className="tbmap-list">
                      {trace.teams.map((t) => (
                        <li key={t.id}>
                          <strong>{t.name}</strong>
                          <span className="muted">
                            {' '}
                            → {t.roleNames.join(', ') || 'no roles'}
                          </span>
                        </li>
                      ))}
                    </ul>
                    <div className="muted tbmap-note">
                      {trace.roleNames.length} distinct role
                      {trace.roleNames.length === 1 ? '' : 's'} gained through
                      team membership. Direct role assignments are shown in
                      the User rights tab.
                    </div>
                  </>
                )}
              </>
            )}

            {!selected && !trace && (
              <div className="muted tbmap-empty">
                Click a business unit or team for details, or pick a user above
                to trace where their team-inherited rights come from.
              </div>
            )}
          </aside>
        </div>
      )}
    </div>
  )
}
