import type { ChartDef } from '../dashboard/types'

/**
 * Aggregation der Kachel-Diagramme: Zeilen → Kategorien (+ optionale Stapel).
 * Entspricht den FetchXML-Aggregaten der Legacy-Visualizations
 * (groupby + count/sum), nur eben clientseitig über die aktuelle Ansicht.
 */

export interface ChartSegment {
  key: string
  value: number
}

export interface ChartCategory {
  key: string
  total: number
  /** Chronologischer Sortierschlüssel, falls das Diagramm einen definiert. */
  sortKey: number | null
  /** Sammelkategorie "Weitere" (gekappte Kategorien). */
  isRest: boolean
  /** Bei "Weitere": die zusammengefassten Gruppen (für den Cross-Filter). */
  memberKeys: string[]
  segments: ChartSegment[]
}

export interface ChartData {
  categories: ChartCategory[]
  /** Stapel-Schlüssel in stabiler Reihenfolge (für Legende & Farben). */
  stackKeys: string[]
  total: number
}

/** Aktive Diagramm-Auswahl — filtert das Grid der Kachel (Cross-Filter). */
export interface ChartSelection {
  group: string
  stack?: string
  /** Bei "Weitere": alle Gruppen, die der Sammelbalken repräsentiert. */
  groups?: string[]
}

export const REST_KEY = 'Weitere'

export function buildChartData<T>(rows: T[], def: ChartDef<T>): ChartData {
  const cats = new Map<
    string,
    { total: number; sortKey: number | null; segments: Map<string, number> }
  >()
  const stackTotals = new Map<string, number>()

  for (const row of rows) {
    const group = def.groupBy(row)
    const stack = def.stackBy?.(row) ?? ''
    const value = def.measure?.(row) ?? 1
    let cat = cats.get(group)
    if (!cat) {
      cat = { total: 0, sortKey: null, segments: new Map() }
      cats.set(group, cat)
    }
    cat.total += value
    cat.segments.set(stack, (cat.segments.get(stack) ?? 0) + value)
    stackTotals.set(stack, (stackTotals.get(stack) ?? 0) + value)
    if (def.groupSortKey) {
      const key = def.groupSortKey(row)
      cat.sortKey = cat.sortKey === null ? key : Math.min(cat.sortKey, key)
    }
  }

  let categories: ChartCategory[] = [...cats.entries()]
    .map(([key, cat]) => ({
      key,
      total: cat.total,
      sortKey: cat.sortKey,
      isRest: false,
      memberKeys: [key],
      segments: [...cat.segments.entries()].map(([k, v]) => ({ key: k, value: v })),
    }))
    // Leere Summen (z. B. Umsatz 0 bei offenen Projekten) ausblenden.
    .filter((c) => c.total > 0)

  if (def.groupOrder) {
    const order = def.groupOrder
    categories.sort((a, b) => {
      const ia = order.indexOf(a.key)
      const ib = order.indexOf(b.key)
      return (ia === -1 ? order.length : ia) - (ib === -1 ? order.length : ib)
    })
  } else if (categories.some((c) => c.sortKey !== null)) {
    categories.sort(
      (a, b) =>
        (a.sortKey ?? Number.MAX_SAFE_INTEGER) -
        (b.sortKey ?? Number.MAX_SAFE_INTEGER),
    )
  } else {
    categories.sort((a, b) => b.total - a.total)
  }

  // Lange Achsen kappen: kleinste Kategorien zu "Weitere" zusammenfassen.
  const max = def.maxCategories ?? (def.kind === 'donut' ? 6 : 9)
  if (categories.length > max) {
    const head = categories.slice(0, max - 1)
    const rest = categories.slice(max - 1)
    const segments = new Map<string, number>()
    for (const cat of rest) {
      for (const seg of cat.segments) {
        segments.set(seg.key, (segments.get(seg.key) ?? 0) + seg.value)
      }
    }
    head.push({
      key: REST_KEY,
      total: rest.reduce((sum, c) => sum + c.total, 0),
      sortKey: null,
      isRest: true,
      memberKeys: rest.map((c) => c.key),
      segments: [...segments.entries()].map(([k, v]) => ({ key: k, value: v })),
    })
    categories = head
  }

  const stackKeys = def.stackBy
    ? [...stackTotals.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k)
    : []

  return {
    categories,
    stackKeys,
    total: categories.reduce((sum, c) => sum + c.total, 0),
  }
}

/** Prüft, ob eine Zeile zur aktiven Diagramm-Auswahl gehört. */
export function matchesSelection<T>(
  row: T,
  def: ChartDef<T>,
  selection: ChartSelection,
): boolean {
  const group = def.groupBy(row)
  // "Weitere" steht für mehrere zusammengefasste Gruppen.
  if (selection.groups ? !selection.groups.includes(group) : group !== selection.group) {
    return false
  }
  if (selection.stack !== undefined && def.stackBy) {
    return def.stackBy(row) === selection.stack
  }
  return true
}
