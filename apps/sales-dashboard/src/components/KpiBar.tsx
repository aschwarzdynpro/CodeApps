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
}

interface Kpi {
  label: string
  value: string
  sub: string
  /** Veränderung zum Vormonat in Prozent (nur wo sinnvoll). */
  delta?: number
}

const OPEN_PROJECT_STATUSES = ['Neu', 'Vorphase', 'In Bearbeitung']

function pctDelta(current: number, previous: number): number | undefined {
  if (previous <= 0) return undefined
  return ((current - previous) / previous) * 100
}

export function KpiBar({ data, ctx }: KpiBarProps) {
  const kpis = useMemo<Kpi[]>(() => {
    const { userId, now } = ctx

    const openActivities = data.activities.filter(
      (a) =>
        a.participantIds.includes(userId) &&
        (a.state === 'Offen' || a.state === 'Geplant') &&
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
      (p) =>
        OPEN_PROJECT_STATUSES.includes(p.status) &&
        p.areaSalesManager.id === userId,
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
        label: 'Offene Aktivitäten',
        value: fmtNumber(openActivities),
        sub: 'dieser & letzter Monat',
      },
      {
        label: 'Offene Leads',
        value: fmtNumber(openLeads),
        sub: 'mit mir als Besitzer',
      },
      {
        label: 'Pipeline Verkaufschancen',
        value: fmtEurCompact(pipeline),
        sub: `${myOpenOpps.length} offene Chancen`,
      },
      {
        label: 'Offenes Projektpotential',
        value: fmtEurCompact(projectPotential),
        sub: `${myOpenProjects.length} offene Projekte`,
      },
      {
        label: 'Angebotswert',
        value: fmtEurCompact(quoteValue),
        sub: `${quotesThisMonth.length} Angebote diesen Monat`,
        delta: pctDelta(quoteValue, quoteValuePrev),
      },
      {
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
        <article className="kpi" key={kpi.label}>
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
        </article>
      ))}
    </section>
  )
}
