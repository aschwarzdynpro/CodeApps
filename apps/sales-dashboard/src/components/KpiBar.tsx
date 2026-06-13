import { useMemo } from 'react'
import type { SalesData } from '../types/sales'
import type { ViewContext } from '../dashboard/types'
import {
  fmtEurCompact,
  fmtNumber,
  isLastMonth,
  isThisMonth,
} from '../utils/format'

/**
 * KPI-Leiste über den Kacheln — die "dynamische" Verdichtung, die das
 * Legacy-Dashboard nicht hatte: Kernzahlen aus allen sechs Entitäten auf
 * einen Blick, Angebots-/Auftragswerte mit Trend zum Vormonat.
 */

interface KpiBarProps {
  data: SalesData
  ctx: ViewContext
  /** Aktuell gewählter Bereich — die zugehörige Kennzahl wird hervorgehoben. */
  activeTileId: string
  /** Klick auf eine Kennzahl wählt den zugehörigen Bereich (Vorauswahl). */
  onSelectTile: (id: string) => void
}

interface Kpi {
  /** Bereich, den diese Kennzahl repräsentiert (Kachel-ID). */
  tileId: string
  label: string
  value: string
  sub: string
  /** Veränderung zum Vormonat in Prozent (nur wo sinnvoll). */
  delta?: number
}

function pctDelta(current: number, previous: number): number | undefined {
  if (previous <= 0) return undefined
  return ((current - previous) / previous) * 100
}

export function KpiBar({ data, ctx, activeTileId, onSelectTile }: KpiBarProps) {
  const kpis = useMemo<Kpi[]>(() => {
    const { userId, now } = ctx

    const openActivities = data.activities.filter(
      (a) =>
        a.participantIds.includes(userId) &&
        a.open &&
        (!a.scheduledEnd ||
          isThisMonth(a.scheduledEnd, now) ||
          isLastMonth(a.scheduledEnd, now)),
    ).length

    const openLeads = data.leads.filter(
      (l) => l.open && l.owner.id === userId,
    ).length

    const myOpenOpps = data.opportunities.filter(
      (o) => o.open && o.areaSalesManager.id === userId,
    )
    const pipeline = myOpenOpps.reduce((sum, o) => sum + o.estimatedValue, 0)

    const myOpenProjects = data.projects.filter(
      (p) => p.statusCategory === 'open' && p.areaSalesManager.id === userId,
    )
    const projectPotential = myOpenProjects.reduce((sum, p) => sum + p.potential, 0)

    const myQuotes = data.quotes.filter((q) => q.areaSalesManager.id === userId)
    const quotesThisMonth = myQuotes.filter((q) => isThisMonth(q.creationDate, now))
    const quoteValue = quotesThisMonth.reduce((sum, q) => sum + q.totalAmount, 0)
    const quoteValuePrev = myQuotes
      .filter((q) => isLastMonth(q.creationDate, now))
      .reduce((sum, q) => sum + q.totalAmount, 0)

    const myOrders = data.orders.filter((o) => o.areaSalesManager.id === userId)
    const ordersThisMonth = myOrders.filter((o) => isThisMonth(o.creationDate, now))
    const orderValue = ordersThisMonth.reduce((sum, o) => sum + o.totalAmount, 0)
    const orderValuePrev = myOrders
      .filter((o) => isLastMonth(o.creationDate, now))
      .reduce((sum, o) => sum + o.totalAmount, 0)

    return [
      {
        tileId: 'activities',
        label: 'Offene Aktivitäten',
        value: fmtNumber(openActivities),
        sub: 'dieser & letzter Monat',
      },
      {
        tileId: 'leads',
        label: 'Offene Leads',
        value: fmtNumber(openLeads),
        sub: 'mit mir als Besitzer',
      },
      {
        tileId: 'opportunities',
        label: 'Pipeline Verkaufschancen',
        value: fmtEurCompact(pipeline),
        sub: `${myOpenOpps.length} offene Chancen`,
      },
      {
        tileId: 'projects',
        label: 'Offenes Projektpotential',
        value: fmtEurCompact(projectPotential),
        sub: `${myOpenProjects.length} offene Projekte`,
      },
      {
        tileId: 'quotes',
        label: 'Angebotswert',
        value: fmtEurCompact(quoteValue),
        sub: `${quotesThisMonth.length} Angebote diesen Monat`,
        delta: pctDelta(quoteValue, quoteValuePrev),
      },
      {
        tileId: 'orders',
        label: 'Auftragseingang',
        value: fmtEurCompact(orderValue),
        sub: `${ordersThisMonth.length} Aufträge diesen Monat`,
        delta: pctDelta(orderValue, orderValuePrev),
      },
    ]
  }, [data, ctx])

  return (
    <section className="kpis" aria-label="Kennzahlen">
      {kpis.map((kpi) => (
        <button
          type="button"
          className={`kpi${activeTileId === kpi.tileId ? ' is-active' : ''}`}
          key={kpi.tileId}
          onClick={() => onSelectTile(kpi.tileId)}
          aria-pressed={activeTileId === kpi.tileId}
          title={`Bereich „${kpi.label}" anzeigen`}
        >
          <p className="kpi__label">{kpi.label}</p>
          <p className="kpi__value">
            {kpi.value}
            {kpi.delta !== undefined && (
              <span
                className={`kpi__delta ${kpi.delta >= 0 ? 'kpi__delta--up' : 'kpi__delta--down'}`}
                title="Veränderung zum Vormonat"
              >
                {kpi.delta >= 0 ? '▲' : '▼'} {Math.abs(Math.round(kpi.delta))} %
              </span>
            )}
          </p>
          <p className="kpi__sub">{kpi.sub}</p>
        </button>
      ))}
    </section>
  )
}
