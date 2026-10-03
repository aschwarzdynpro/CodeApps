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
 * Category of a label from the `Entity Name` column of "Localized Labels".
 * The values are the metadata types that own the label (Entity, Attribute,
 * SystemForm, SavedQuery …). Matching is by substring so variants
 * (AttributePicklistValue, OptionSetValue, FormXml …) land in the right group;
 * anything unknown is "other" — see README „Offen“.
 */
export function componentKind(type: string): ComponentKind {
  const t = type.toLowerCase()
  if (!t) return 'other'
  if (t === 'entity' || t === 'entitymetadata') return 'table'
  if (t.includes('picklist') || t.includes('optionset') || t.includes('option') || t.includes('statusvalue') || t.includes('statevalue'))
    return 'choice'
  if (t === 'attribute' || t === 'attributemetadata') return 'column'
  if (t.includes('form') || t === 'tab' || t === 'section' || t === 'cell' || t === 'label') return 'form'
  if (t.includes('savedquery') || t.includes('view')) return 'view'
  return 'other'
}
