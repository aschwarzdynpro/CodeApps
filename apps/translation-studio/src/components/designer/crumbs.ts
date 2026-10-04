import { createContext } from 'react'
import type { ExplorerTree } from '../../utils/designerTree'
import { S } from '../../strings'
import { targetKey, type DesignerTarget } from './context'

/**
 * Where the canvas sits in the solution — Übersicht › table › form — and
 * what sits next to it (the table's other forms and views, other apps), for
 * the breadcrumb in the canvas head.
 */
export interface Crumb {
  label: string
  /** Muted addition (logical name). */
  sub?: string
  target: DesignerTarget
}

export interface SiblingGroup {
  title: string
  items: (Crumb & { key: string })[]
}

export interface CrumbTrail {
  /** Ancestors, from the top. */
  path: Crumb[]
  /** What the canvas is (Tabelle & Spalten, Hauptformular, Ansicht …). */
  current: string
  currentKey: string
  /** Neighbours to switch to; empty when there is nothing to switch to. */
  siblings: SiblingGroup[]
}

export interface CrumbNav {
  trail: CrumbTrail | null
  onSelect: (t: DesignerTarget) => void
}

export const CrumbContext = createContext<CrumbNav | null>(null)

const home: Crumb = { label: S.designer.home, target: { kind: 'home' } }
const item = (label: string, target: DesignerTarget, sub?: string) => ({ label, sub, target, key: targetKey(target) })

export function crumbsFor(target: DesignerTarget, tree: ExplorerTree): CrumbTrail | null {
  const currentKey = targetKey(target)
  switch (target.kind) {
    case 'home':
      return null
    case 'table':
    case 'form':
    case 'view': {
      const t = tree.tables.find((x) => x.table === target.table)
      const table: Crumb = { label: t?.label ?? target.table, sub: target.table, target: { kind: 'table', table: target.table } }
      const siblings: SiblingGroup[] = [{ title: table.label, items: [item(S.designer.tableAndColumns, table.target)] }]
      if (t?.forms.length) siblings.push({ title: S.designer.forms, items: t.forms.map((f) => item(f.name, { kind: 'form', table: target.table, id: f.id }, f.type !== undefined ? S.preview.formTypes[f.type] : undefined)) })
      if (t?.views.length) siblings.push({ title: S.designer.views, items: t.views.map((v) => item(v.name, { kind: 'view', table: target.table, id: v.id })) })
      if (target.kind === 'table') return { path: [home, table], current: S.designer.tableAndColumns, currentKey, siblings: siblings.length > 1 ? siblings : [] }
      const form = target.kind === 'form' ? t?.forms.find((f) => f.id === target.id) : undefined
      const current = target.kind === 'view' ? S.designer.kinds.view : ((form?.type !== undefined ? S.preview.formTypes[form.type] : undefined) ?? S.preview.formTypeOther)
      return { path: [home, table], current, currentKey, siblings }
    }
    case 'app': {
      const apps = tree.apps.map((a) => item(a.name, { kind: 'app', id: a.id }))
      return { path: [home], current: target.sitemapOnly ? S.designer.sitemapOnly : S.designer.kinds.app, currentKey, siblings: apps.length > 1 ? [{ title: S.designer.apps, items: apps }] : [] }
    }
    case 'dashboard': {
      const boards = tree.dashboards.map((b) => item(b.name, { kind: 'dashboard', id: b.id }))
      return { path: [home], current: S.preview.formTypes[0], currentKey, siblings: boards.length > 1 ? [{ title: S.preview.dashboards, items: boards }] : [] }
    }
  }
}

/** A crumb that is the canvas itself (the table on its own "Tabelle & Spalten" page): shown, but no link. */
export const isSelf = (trail: CrumbTrail, c: Crumb) => targetKey(c.target) === trail.currentKey

/** One level up: the nearest ancestor that isn't the canvas itself (null on the overview). */
export function parentOf(trail: CrumbTrail | null): DesignerTarget | null {
  if (!trail) return null
  for (let i = trail.path.length - 1; i >= 0; i--) if (!isSelf(trail, trail.path[i])) return trail.path[i].target
  return null
}
