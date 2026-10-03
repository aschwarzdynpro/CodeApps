import type { Lcid } from '../types/translation'

/**
 * Layout of a model-driven form from `systemform.formxml`, as far as the
 * preview needs it: tabs → columns → sections → rows → cells, plus header
 * and footer fields. Element ids are normalized like the translation file's
 * `Object ID` (no braces, lower case) — tabs, sections and cells carry their
 * labels there as `displayname` rows of the form's table.
 */

export type FormLabels = Record<Lcid, string>

export type ControlKind = 'field' | 'subgrid' | 'quickview' | 'webresource' | 'timeline' | 'spacer' | 'other'

export interface FormCell {
  id: string
  showLabel: boolean
  visible: boolean
  /** Labels stored in the formxml itself (fallback when the file has no row). */
  labels: FormLabels
  /** `datafieldname` of a field control; '' otherwise. */
  field: string
  /** Control id (subgrid name, web resource name …). */
  controlId: string
  control: ControlKind
  colspan: number
}

export interface FormSection {
  id: string
  name: string
  showLabel: boolean
  visible: boolean
  labels: FormLabels
  columns: number
  rows: FormCell[][]
}

export interface FormColumn {
  width: string
  sections: FormSection[]
}

export interface FormTab {
  id: string
  name: string
  showLabel: boolean
  visible: boolean
  labels: FormLabels
  columns: FormColumn[]
}

export interface FormLayout {
  tabs: FormTab[]
  header: FormCell[]
  footer: FormCell[]
}

const CLASS_IDS: Record<string, ControlKind> = {
  'E7A81278-8635-4D9E-8D4D-59480B391C5B': 'subgrid',
  '5C5600E0-1D6E-4205-A272-BE80DA87FD42': 'quickview',
  '9FDF5F91-88B1-47F4-AD53-C11EFC01A01D': 'webresource',
  'FD2A7985-3187-444E-908D-6624B21F69C0': 'webresource',
  '06375649-C143-495E-A496-C962E5B4488E': 'timeline',
  '5546E6CD-394C-4BEE-94A8-4425E17EF6C6': 'spacer',
}

/** Id as in the translation file: without braces, lower case. */
export const normalizeId = (id: string | null | undefined): string => (id ?? '').replace(/[{}]/g, '').trim().toLowerCase()

const children = (el: Element, name: string): Element[] => Array.from(el.children).filter((c) => c.localName.toLowerCase() === name)
const child = (el: Element, name: string): Element | undefined => children(el, name)[0]
const flag = (el: Element, attr: string, fallback: boolean): boolean => {
  const v = el.getAttribute(attr)
  return v === null ? fallback : v.toLowerCase() !== 'false'
}

function labelsOf(el: Element): FormLabels {
  const out: FormLabels = {}
  const list = child(el, 'labels')
  if (!list) return out
  for (const l of children(list, 'label')) {
    const code = Number(l.getAttribute('languagecode'))
    if (code > 0) out[code] = l.getAttribute('description') ?? ''
  }
  return out
}

function parseCell(el: Element): FormCell {
  const control = child(el, 'control')
  const field = control?.getAttribute('datafieldname') ?? ''
  const classId = (control?.getAttribute('classid') ?? '').replace(/[{}]/g, '').toUpperCase()
  const kind: ControlKind = !control ? 'spacer' : (CLASS_IDS[classId] ?? (field ? 'field' : 'other'))
  return {
    id: normalizeId(el.getAttribute('id')),
    showLabel: flag(el, 'showlabel', true),
    visible: flag(el, 'visible', true),
    labels: labelsOf(el),
    field,
    controlId: control?.getAttribute('id') ?? '',
    control: kind,
    colspan: Math.max(1, Number(el.getAttribute('colspan')) || 1),
  }
}

const rowsOf = (el: Element | undefined): FormCell[][] =>
  el ? children(child(el, 'rows') ?? el, 'row').map((r) => children(r, 'cell').map(parseCell)) : []

/** "1", "2" … or the older pattern notation "11", "111". */
function sectionColumns(value: string | null): number {
  if (!value) return 1
  if (/^1{2,}$/.test(value)) return value.length
  return Math.max(1, Number.parseInt(value, 10) || 1)
}

function parseSection(el: Element): FormSection {
  return {
    id: normalizeId(el.getAttribute('id')),
    name: el.getAttribute('name') ?? '',
    showLabel: flag(el, 'showlabel', true),
    visible: flag(el, 'visible', true),
    labels: labelsOf(el),
    columns: sectionColumns(el.getAttribute('columns')),
    rows: rowsOf(el),
  }
}

function parseTab(el: Element): FormTab {
  const columns = children(child(el, 'columns') ?? el, 'column').map((c) => ({
    width: c.getAttribute('width') ?? '',
    sections: children(child(c, 'sections') ?? c, 'section').map(parseSection),
  }))
  return {
    id: normalizeId(el.getAttribute('id')),
    name: el.getAttribute('name') ?? '',
    showLabel: flag(el, 'showlabel', true),
    visible: flag(el, 'visible', true),
    labels: labelsOf(el),
    columns,
  }
}

export function parseFormXml(xml: string): FormLayout {
  const doc = new DOMParser().parseFromString(xml, 'application/xml')
  if (doc.getElementsByTagName('parsererror').length > 0) throw new Error('Die Formulardefinition (formxml) ist kein gültiges XML.')
  const form = doc.documentElement
  const tabsEl = child(form, 'tabs')
  return {
    tabs: tabsEl ? children(tabsEl, 'tab').map(parseTab) : [],
    header: rowsOf(child(form, 'header')).flat(),
    footer: rowsOf(child(form, 'footer')).flat(),
  }
}

/** All label-carrying element ids of a layout (tabs, sections, cells), for counts. */
export function layoutIds(layout: FormLayout): { tabs: string[]; sections: string[]; cells: FormCell[] } {
  const sections = layout.tabs.flatMap((t) => t.columns.flatMap((c) => c.sections))
  return {
    tabs: layout.tabs.map((t) => t.id),
    sections: sections.map((s) => s.id),
    cells: [...layout.header, ...sections.flatMap((s) => s.rows.flat()), ...layout.footer],
  }
}

/** Width of a tab column as a CSS flex basis ("33%" → "33%", "" → equal share). */
export function columnBasis(width: string, count: number): string {
  return /^\d+(\.\d+)?%$/.test(width.trim()) ? width.trim() : `${100 / Math.max(1, count)}%`
}
