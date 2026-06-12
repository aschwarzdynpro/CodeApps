import { useMemo, useState, type CSSProperties } from 'react'
import type { TileDef, ViewContext } from '../dashboard/types'
import {
  buildChartData,
  matchesSelection,
  type ChartCategory,
  type ChartSelection,
} from '../utils/aggregate'
import { DataGrid } from './DataGrid'
import { TileIcon } from './TileIcon'
import { ColumnChart } from './charts/ColumnChart'
import { DonutChart } from './charts/DonutChart'
import { FunnelChart } from './charts/FunnelChart'

/**
 * Eine Dashboard-Kachel = Legacy-Dashboard-Zelle (Chart + Grid) mit den
 * modernen Extras: Ansichts- und Diagrammwechsler, Schnellsuche und
 * Cross-Filter (Klick ins Diagramm filtert die Liste).
 */

interface DashboardTileProps<T> {
  def: TileDef<T>
  rows: T[]
  ctx: ViewContext
  /** Dataverse-Org-URL für Datensatz-Deep-Links (nur bei Live-Daten gesetzt). */
  orgUrl?: string
}

const GUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function DashboardTile<T>({ def, rows, ctx, orgUrl }: DashboardTileProps<T>) {
  const [viewId, setViewId] = useState(def.views[0].id)
  const [chartId, setChartId] = useState(def.charts[0].id)
  const [search, setSearch] = useState('')
  const [selection, setSelection] = useState<ChartSelection | null>(null)

  const view = def.views.find((v) => v.id === viewId) ?? def.views[0]
  const chart = def.charts.find((c) => c.id === chartId) ?? def.charts[0]

  const viewRows = useMemo(
    () => rows.filter((row) => view.filter(row, ctx)).sort(view.sort),
    [rows, view, ctx],
  )

  const chartData = useMemo(() => buildChartData(viewRows, chart), [viewRows, chart])

  const gridRows = useMemo(() => {
    let out = viewRows
    if (selection) out = out.filter((row) => matchesSelection(row, chart, selection))
    const query = search.trim().toLowerCase()
    if (query) out = out.filter((row) => def.searchText(row).toLowerCase().includes(query))
    return out
  }, [viewRows, selection, chart, search, def])

  const changeView = (id: string) => {
    setViewId(id)
    setSelection(null)
  }

  const changeChart = (id: string) => {
    setChartId(id)
    setSelection(null)
  }

  const handleSelect = (category: ChartCategory, stack?: string) => {
    setSelection((prev) =>
      prev && prev.group === category.key && prev.stack === stack
        ? null
        : {
            group: category.key,
            stack,
            // "Weitere" filtert auf alle zusammengefassten Gruppen.
            ...(category.isRest ? { groups: category.memberKeys } : {}),
          },
    )
  }

  // Deep-Link in den Datensatz — nur mit Org-URL und echter Datensatz-GUID
  // (Demo-Daten haben keine, dort entfällt das Öffnen-Icon).
  const recordHref = useMemo(() => {
    if (!orgUrl) return undefined
    const base = orgUrl.replace(/\/+$/, '')
    return (row: T): string | undefined => {
      const id = def.rowId(row)
      if (!GUID_RE.test(id)) return undefined
      const entity = def.recordEntity?.(row) ?? def.entityLogicalName
      return `${base}/main.aspx?pagetype=entityrecord&etn=${entity}&id=${id}`
    }
  }, [orgUrl, def])

  const chartEmpty = chartData.categories.length === 0

  return (
    <section className="tile" style={{ '--tile-accent': def.accent } as CSSProperties}>
      <header className="tile__head">
        <span className="tile__icon">
          <TileIcon name={def.icon} />
        </span>
        <h2 className="tile__title">{def.title}</h2>
        <span className="tile__count" title="Datensätze in der Ansicht">
          {gridRows.length === viewRows.length
            ? viewRows.length
            : `${gridRows.length} / ${viewRows.length}`}
        </span>
        {def.charts.length > 1 && (
          <select
            className="tile__select tile__select--chart"
            value={chart.id}
            onChange={(e) => changeChart(e.target.value)}
            aria-label="Diagramm wählen"
            title={chart.label}
          >
            {def.charts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        )}
      </header>

      <div className="tile__controls">
        {def.views.length > 1 ? (
          <select
            className="tile__select tile__select--view"
            value={view.id}
            onChange={(e) => changeView(e.target.value)}
            aria-label="Ansicht wählen"
            title={view.label}
          >
            {def.views.map((v) => (
              <option key={v.id} value={v.id}>
                {v.label}
              </option>
            ))}
          </select>
        ) : (
          <span className="tile__view-label" title={view.label}>
            {view.label}
          </span>
        )}
        <input
          type="search"
          className="tile__search"
          placeholder="Suchen…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label={`In ${def.title} suchen`}
        />
      </div>

      <div className="tile__chart" data-chart={chart.kind}>
        <p className="tile__chart-title">{chart.label}</p>
        {chartEmpty ? (
          <p className="chart-empty">Keine Werte in dieser Ansicht</p>
        ) : chart.kind === 'donut' ? (
          <DonutChart
            data={chartData}
            format={chart.format}
            selection={selection}
            onSelect={handleSelect}
          />
        ) : chart.kind === 'funnel' ? (
          <FunnelChart
            data={chartData}
            format={chart.format}
            selection={selection}
            onSelect={handleSelect}
          />
        ) : (
          <ColumnChart
            data={chartData}
            format={chart.format}
            selection={selection}
            onSelect={handleSelect}
          />
        )}
      </div>

      {selection && (
        <div className="tile__filter">
          <span>
            Filter: <strong>{selection.group}</strong>
            {selection.stack !== undefined && <> · {selection.stack}</>}
          </span>
          <button
            type="button"
            onClick={() => setSelection(null)}
            aria-label="Diagrammfilter aufheben"
          >
            ✕
          </button>
        </div>
      )}

      <DataGrid
        columns={def.columns}
        rows={gridRows}
        rowId={def.rowId}
        recordHref={recordHref}
        emptyText="Keine Datensätze in dieser Ansicht"
      />
    </section>
  )
}
