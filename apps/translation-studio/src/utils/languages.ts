import type { ComponentKind, Lcid } from '../types/translation'

/** Names of the languages Dataverse offers most often; others show their code. */
const NAMES: Record<number, string> = {
  1025: 'Arabisch',
  1026: 'Bulgarisch',
  1027: 'Katalanisch',
  1028: 'Chinesisch (traditionell)',
  1029: 'Tschechisch',
  1030: 'Dänisch',
  1031: 'Deutsch',
  1032: 'Griechisch',
  1033: 'Englisch',
  1035: 'Finnisch',
  1036: 'Französisch',
  1037: 'Hebräisch',
  1038: 'Ungarisch',
  1040: 'Italienisch',
  1041: 'Japanisch',
  1042: 'Koreanisch',
  1043: 'Niederländisch',
  1044: 'Norwegisch',
  1045: 'Polnisch',
  1046: 'Portugiesisch (Brasilien)',
  1048: 'Rumänisch',
  1049: 'Russisch',
  1050: 'Kroatisch',
  1051: 'Slowakisch',
  1053: 'Schwedisch',
  1054: 'Thai',
  1055: 'Türkisch',
  1057: 'Indonesisch',
  1058: 'Ukrainisch',
  1060: 'Slowenisch',
  1061: 'Estnisch',
  1062: 'Lettisch',
  1063: 'Litauisch',
  1066: 'Vietnamesisch',
  2052: 'Chinesisch (vereinfacht)',
  2070: 'Portugiesisch (Portugal)',
  3082: 'Spanisch',
  3098: 'Serbisch (kyrillisch)',
  2074: 'Serbisch (lateinisch)',
}

export function languageName(lcid: Lcid): string {
  return NAMES[lcid] ?? `Sprache ${lcid}`
}

/** "Deutsch (1031)". */
export function languageLabel(lcid: Lcid): string {
  return `${languageName(lcid)} (${lcid})`
}

/** Plausible LCID: a header cell of a language column. */
export function isLcid(text: string): boolean {
  if (!/^\d{4,5}$/.test(text.trim())) return false
  const n = Number(text)
  return n >= 1025 && n <= 58380
}

export const KIND_ORDER: ComponentKind[] = ['table', 'column', 'choice', 'form', 'view', 'other']

/**
 * `Entity name` values of "Localized Labels" that are not a table (checked
 * against real exports, 2026-10-03). Anything else that isn't a logical name
 * is a dashboard, listed under its display name ("Dashboard GVL").
 */
const NON_TABLE_TYPES = new Set([
  'Solution',
  'Publisher',
  'RibbonCustomization',
  'Workflow Categories',
  'AppModule',
  'SiteMap',
  'AppSetting',
  'CustomAPI',
  'CustomAPIRequestParameter',
  'CustomAPIResponseProperty',
])

/** `Entity name` is a table's logical name (`account`, `wal_project`). */
export function isTableName(type: string): boolean {
  return /^[a-z][a-z0-9_]*$/.test(type)
}

/**
 * Category of a "Localized Labels" row. In the real export `Entity name` is
 * the table's logical name and the kind follows from `Object Column Name`
 * (case matters):
 *
 * - `LocalizedName`, `LocalizedCollectionName` → table; `Description` of the
 *   same object id too (`tableLabel`)
 * - `DisplayName`, `Description` → column — or a choice value, which only
 *   the metadata tells apart (`resolveComponents` refines it)
 * - `displayname` → form element (tab, section, field label); `name`,
 *   `description` → form or view name (refined from metadata as well)
 */
export function componentKind(type: string, column: string, tableLabel = false): ComponentKind {
  if (!type || NON_TABLE_TYPES.has(type)) return 'other'
  if (!isTableName(type)) return column === 'displayname' || column === 'name' || column === 'description' ? 'form' : 'other'
  switch (column) {
    case 'LocalizedName':
    case 'LocalizedCollectionName':
      return 'table'
    case 'DisplayName':
      return 'column'
    case 'Description':
      return tableLabel ? 'table' : 'column'
    case 'displayname':
    case 'name':
    case 'description':
      return 'form'
    default:
      return 'other'
  }
}
