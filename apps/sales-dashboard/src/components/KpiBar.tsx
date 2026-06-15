import { useMemo, type CSSProperties } from 'react'
import type { SalesData } from '../types/sales'
import type { TileIconName, ViewContext } from '../dashboard/types'
import { TileIcon } from './TileIcon'
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

/** Bereichs-Meta (Icon/Titel/Akzent/Anzahl) zum Verschmelzen mit der Kennzahl. */
interface SectionMeta {
  id: string
  icon: TileIconName
  title: string
  accent: string
  count: number
}

interface KpiBarProps {
  data: SalesData
  ctx: ViewContext
  /** Bereichs-Metadaten je Kachel — verschmilzt Kennzahl + Menüpunkt. */
  sections: SectionMeta[]
  /** Aktuell gewählter Bereich — die zugehörige Karte wird hervorgehoben. */
  activeTileId: string
  /** Klick auf eine Karte wählt den zugehörigen Bereich. */
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

export function KpiBar({ data, ctx, sections, activeTileId, onSelectTile }: KpiBarProps) {
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
    <section className="kpis" aria-label="Bereiche & Kennzahlen">
      {kpis.map((kpi) => {
        const section = sections.find((s) => s.id === kpi.tileId)
        const active = activeTileId === kpi.tileId
        return (
          <button
            type="button"
            key={kpi.tileId}
            className={`kpi${active ? ' is-active' : ''}`}
            style={section ? ({ '--tile-accent': section.accent } as CSSProperties) : undefined}
            onClick={() => onSelectTile(kpi.tileId)}
            aria-pressed={active}
            title={`Bereich „${section?.title ?? kpi.label}" anzeigen`}
          >
            <span className="kpi__head">
              {section && (
                <span className="kpi__icon">
                  <TileIcon name={section.icon} />
                </span>
              )}
              <span className="kpi__title">{section?.title ?? kpi.label}</span>
              {section && <span className="kpi__count">{section.count}</span>}
            </span>
            <span className="kpi__label">{kpi.label}</span>
            <span className="kpi__value">
              {kpi.value}
              {kpi.delta !== undefined && (
                <span
                  className={`kpi__delta ${kpi.delta >= 0 ? 'kpi__delta--up' : 'kpi__delta--down'}`}
                  title="Veränderung zum Vormonat"
                >
                  {kpi.delta >= 0 ? '▲' : '▼'} {Math.abs(Math.round(kpi.delta))} %
                </span>
              )}
            </span>
            <span className="kpi__sub">{kpi.sub}</span>
          </button>
        )
      })}
    </section>
  )
}
