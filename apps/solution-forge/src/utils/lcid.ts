/**
 * Resolve a Windows LCID (as stored in `usersettings.uilanguageid` /
 * `localeid`) to a readable language name. Pure + Vitest-covered; unknown or
 * empty codes fall back to `#<lcid>` so the raw value is still visible.
 */

const LCID_NAMES: Record<number, string> = {
  1025: 'Arabic (ar-SA)',
  1026: 'Bulgarian (bg-BG)',
  1028: 'Chinese, Traditional (zh-TW)',
  1029: 'Czech (cs-CZ)',
  1030: 'Danish (da-DK)',
  1031: 'German (de-DE)',
  1032: 'Greek (el-GR)',
  1033: 'English (en-US)',
  1035: 'Finnish (fi-FI)',
  1036: 'French (fr-FR)',
  1038: 'Hungarian (hu-HU)',
  1040: 'Italian (it-IT)',
  1041: 'Japanese (ja-JP)',
  1042: 'Korean (ko-KR)',
  1043: 'Dutch (nl-NL)',
  1044: 'Norwegian (nb-NO)',
  1045: 'Polish (pl-PL)',
  1046: 'Portuguese (pt-BR)',
  1048: 'Romanian (ro-RO)',
  1049: 'Russian (ru-RU)',
  1050: 'Croatian (hr-HR)',
  1051: 'Slovak (sk-SK)',
  1053: 'Swedish (sv-SE)',
  1054: 'Thai (th-TH)',
  1055: 'Turkish (tr-TR)',
  1057: 'Indonesian (id-ID)',
  1058: 'Ukrainian (uk-UA)',
  1060: 'Slovenian (sl-SI)',
  1061: 'Estonian (et-EE)',
  1062: 'Latvian (lv-LV)',
  1063: 'Lithuanian (lt-LT)',
  1066: 'Vietnamese (vi-VN)',
  1081: 'Hindi (hi-IN)',
  1086: 'Malay (ms-MY)',
  2052: 'Chinese, Simplified (zh-CN)',
  2057: 'English (en-GB)',
  2070: 'Portuguese (pt-PT)',
  3082: 'Spanish (es-ES)',
}

/** Language name for an LCID, or `#<lcid>` when unknown / 0. */
export function lcidName(lcid: number): string {
  if (!lcid) return '—'
  return LCID_NAMES[lcid] ?? `#${lcid}`
}
