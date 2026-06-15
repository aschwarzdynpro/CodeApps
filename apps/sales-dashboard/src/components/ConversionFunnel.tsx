import { useMemo, type CSSProperties } from 'react'
import type { SalesData } from '../types/sales'
import type { ViewContext } from '../dashboard/types'
import { fmtEurCompact, fmtNumber } from '../utils/format'

/**
 * Conversion-Funnel über die Stufen Leads → Verkaufschancen → Angebote →
 * Aufträge, bezogen auf die aktuelle GVL (ctx.userId). Volumen-Trichter:
 * Bestände je Stufe + Stufenquoten (kein Cohort-Tracking — die Entitäten sind
 * nicht je Deal verknüpft). Wert (€) ab der Stufe Verkaufschancen.
 */

interface ConversionFunnelProps {
  data: SalesData
  ctx: ViewContext
}

interface Stage {
  id: string
  label: string
  accent: string
  count: number
  /** Summenwert (€) der Stufe; Leads haben keinen Wert. */
  value?: number
}

/** Quote b/a in Prozent, oder „–" wenn a = 0. */
function pct(a: number, b: number): string {
  return b > 0 ? `${Math.round((a / b) * 100)} %` : '–'
}

export function ConversionFunnel({ data, ctx }: ConversionFunnelProps) {
  const stages = useMemo<Stage[]>(() => {
    const u = ctx.userId
    const sum = <T,>(rows: T[], val: (r: T) => number) =>
      rows.reduce((acc, r) => acc + val(r), 0)

    const leads = data.leads.filter((l) => l.owner.id === u)
    const opps = data.opportunities.filter((o) => o.areaSalesManager.id === u)
    const quotes = data.quotes.filter((q) => q.areaSalesManager.id === u)
    const orders = data.orders.filter((o) => o.areaSalesManager.id === u)

    return [
      { id: 'leads', label: 'Leads', accent: '#8e5cd9', count: leads.length },
      {
        id: 'opportunities',
        label: 'Verkaufschancen',
        accent: '#12a594',
        count: opps.length,
        value: sum(opps, (o) => o.estimatedValue),
      },
      {
        id: 'quotes',
        label: 'Angebote',
        accent: '#d6409f',
        count: quotes.length,
        value: sum(quotes, (q) => q.totalAmount),
      },
      {
        id: 'orders',
        label: 'Aufträge',
        accent: '#46a758',
        count: orders.length,
        value: sum(orders, (o) => o.totalAmount),
      },
    ]
  }, [data, ctx])

  const overall = pct(stages[stages.length - 1].count, stages[0].count)

  return (
    <section className="funnel" aria-label="Conversion-Funnel">
      <header className="funnel__head">
        <span className="funnel__icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 4h18l-7 8v6l-4 2v-8L3 4Z" />
          </svg>
        </span>
        <h2 className="funnel__title">Pipeline · Conversion</h2>
        <span className="funnel__overall">
          Gesamt (Auftrag/Lead): <strong>{overall}</strong>
        </span>
      </header>

      <div className="funnel__chain">
        {stages.map((s, i) => (
          <div className="funnel__step" key={s.id}>
            <div className="funnel-chip" style={{ '--row-accent': s.accent } as CSSProperties}>
              <span className="funnel-chip__label">{s.label}</span>
              <span className="funnel-chip__count">{fmtNumber(s.count)}</span>
              <span className="funnel-chip__value">
                {s.value !== undefined ? fmtEurCompact(s.value) : ' '}
              </span>
            </div>
            {i < stages.length - 1 && (
              <div className="funnel-arrow" aria-hidden="true">
                <span className="funnel-arrow__pct">{pct(stages[i + 1].count, s.count)}</span>
                <span className="funnel-arrow__line">→</span>
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  )
}
