import { DEFAULT_TIME_ZONE_CODE } from '../config'

/**
 * Dataverse time zone codes (`timezonecode`, `bookableresource.timezone`,
 * `TimeZoneCode` of the Work Hours API) ↔ IANA zones for `Intl`.
 *
 * Codes and labels are the table "Time zone codes" of the Work Hours
 * Calendar API documentation (verified 2026-10-05). The IANA mapping is ours
 * — one representative zone per code, chosen so that offsets and DST rules
 * match the Windows zone behind the code.
 */

export interface TimeZoneInfo {
  code: number
  /** Microsoft's label, e.g. "(GMT+01:00) Amsterdam, Berlin, Bern, Rome, Stockholm, Vienna". */
  label: string
  iana: string
}

export const TIME_ZONES: TimeZoneInfo[] = [
  { code: 0, label: '(GMT-12:00) International Date Line West', iana: 'Etc/GMT+12' },
  { code: 1, label: '(GMT+13:00) Samoa', iana: 'Pacific/Apia' },
  { code: 2, label: '(GMT-10:00) Hawaii', iana: 'Pacific/Honolulu' },
  { code: 3, label: '(GMT-09:00) Alaska', iana: 'America/Anchorage' },
  { code: 4, label: '(GMT-08:00) Pacific Time (US & Canada)', iana: 'America/Los_Angeles' },
  { code: 5, label: '(GMT-08:00) Baja California', iana: 'America/Tijuana' },
  { code: 6, label: '(GMT-11:00) Coordinated Universal Time-11', iana: 'Etc/GMT+11' },
  { code: 7, label: '(GMT-10:00) Aleutian Islands', iana: 'America/Adak' },
  { code: 8, label: '(GMT-09:30) Marquesas Islands', iana: 'Pacific/Marquesas' },
  { code: 9, label: '(GMT-09:00) Coordinated Universal Time-09', iana: 'Etc/GMT+9' },
  { code: 10, label: '(GMT-07:00) Mountain Time (US & Canada)', iana: 'America/Denver' },
  { code: 11, label: '(GMT-08:00) Coordinated Universal Time-08', iana: 'Etc/GMT+8' },
  { code: 12, label: '(GMT-07:00) Chihuahua, La Paz, Mazatlan', iana: 'America/Chihuahua' },
  { code: 15, label: '(GMT-07:00) Arizona', iana: 'America/Phoenix' },
  { code: 20, label: '(GMT-06:00) Central Time (US & Canada)', iana: 'America/Chicago' },
  { code: 25, label: '(GMT-06:00) Saskatchewan', iana: 'America/Regina' },
  { code: 29, label: '(GMT-06:00) Guadalajara, Mexico City, Monterrey', iana: 'America/Mexico_City' },
  { code: 33, label: '(GMT-06:00) Central America', iana: 'America/Guatemala' },
  { code: 34, label: '(GMT-06:00) Easter Island', iana: 'Pacific/Easter' },
  { code: 35, label: '(GMT-05:00) Eastern Time (US & Canada)', iana: 'America/New_York' },
  { code: 40, label: '(GMT-05:00) Indiana (East)', iana: 'America/Indiana/Indianapolis' },
  { code: 43, label: '(GMT-05:00) Haiti', iana: 'America/Port-au-Prince' },
  { code: 44, label: '(GMT-05:00) Havana', iana: 'America/Havana' },
  { code: 45, label: '(GMT-05:00) Bogota, Lima, Quito, Rio Branco', iana: 'America/Bogota' },
  { code: 47, label: '(GMT-04:00) Caracas', iana: 'America/Caracas' },
  { code: 50, label: '(GMT-04:00) Atlantic Time (Canada)', iana: 'America/Halifax' },
  { code: 51, label: '(GMT-05:00) Turks and Caicos', iana: 'America/Grand_Turk' },
  { code: 55, label: '(GMT-04:00) Georgetown, La Paz, San Juan', iana: 'America/La_Paz' },
  { code: 56, label: '(GMT-04:00) Santiago', iana: 'America/Santiago' },
  { code: 58, label: '(GMT-04:00) Cuiaba', iana: 'America/Cuiaba' },
  { code: 59, label: '(GMT-04:00) Asuncion', iana: 'America/Asuncion' },
  { code: 60, label: '(GMT-03:30) Newfoundland', iana: 'America/St_Johns' },
  { code: 65, label: '(GMT-03:00) Brasilia', iana: 'America/Sao_Paulo' },
  { code: 69, label: '(GMT-03:00) Buenos Aires', iana: 'America/Argentina/Buenos_Aires' },
  { code: 70, label: '(GMT-03:00) Cayenne, Fortaleza', iana: 'America/Cayenne' },
  { code: 71, label: '(GMT-03:00) Salvador', iana: 'America/Bahia' },
  { code: 72, label: '(GMT-03:00) Saint Pierre and Miquelon', iana: 'America/Miquelon' },
  { code: 73, label: '(GMT-03:00) Greenland', iana: 'America/Nuuk' },
  { code: 74, label: '(GMT-03:00) Montevideo', iana: 'America/Montevideo' },
  { code: 75, label: '(GMT-02:00) Mid-Atlantic', iana: 'Etc/GMT+2' },
  { code: 76, label: '(GMT-02:00) Coordinated Universal Time-02', iana: 'Etc/GMT+2' },
  { code: 77, label: '(GMT-03:00) Araguaina', iana: 'America/Araguaina' },
  { code: 80, label: '(GMT-01:00) Azores', iana: 'Atlantic/Azores' },
  { code: 83, label: '(GMT-01:00) Cabo Verde Is.', iana: 'Atlantic/Cape_Verde' },
  { code: 84, label: '(GMT+01:00) Casablanca', iana: 'Africa/Casablanca' },
  { code: 85, label: '(GMT+00:00) Dublin, Edinburgh, Lisbon, London', iana: 'Europe/London' },
  { code: 90, label: '(GMT+00:00) Monrovia, Reykjavik', iana: 'Atlantic/Reykjavik' },
  { code: 92, label: '(GMT) Coordinated Universal Time', iana: 'UTC' },
  { code: 95, label: '(GMT+01:00) Belgrade, Bratislava, Budapest, Ljubljana, Prague', iana: 'Europe/Budapest' },
  { code: 100, label: '(GMT+01:00) Sarajevo, Skopje, Warsaw, Zagreb', iana: 'Europe/Warsaw' },
  { code: 105, label: '(GMT+01:00) Brussels, Copenhagen, Madrid, Paris', iana: 'Europe/Paris' },
  { code: 110, label: '(GMT+01:00) Amsterdam, Berlin, Bern, Rome, Stockholm, Vienna', iana: 'Europe/Berlin' },
  { code: 113, label: '(GMT+01:00) West Central Africa', iana: 'Africa/Lagos' },
  { code: 115, label: '(GMT+02:00) Chisinau', iana: 'Europe/Chisinau' },
  { code: 120, label: '(GMT+02:00) Cairo', iana: 'Africa/Cairo' },
  { code: 125, label: '(GMT+02:00) Helsinki, Kyiv, Riga, Sofia, Tallinn, Vilnius', iana: 'Europe/Helsinki' },
  { code: 129, label: '(GMT+02:00) Amman', iana: 'Asia/Amman' },
  { code: 130, label: '(GMT+02:00) Athens, Bucharest', iana: 'Europe/Bucharest' },
  { code: 131, label: '(GMT+02:00) Beirut', iana: 'Asia/Beirut' },
  { code: 133, label: '(GMT+02:00) Damascus', iana: 'Asia/Damascus' },
  { code: 134, label: '(GMT+03:00) Istanbul', iana: 'Europe/Istanbul' },
  { code: 135, label: '(GMT+02:00) Jerusalem', iana: 'Asia/Jerusalem' },
  { code: 140, label: '(GMT+02:00) Harare, Pretoria', iana: 'Africa/Johannesburg' },
  { code: 141, label: '(GMT+02:00) Windhoek', iana: 'Africa/Windhoek' },
  { code: 142, label: '(GMT+02:00) Gaza, Hebron', iana: 'Asia/Hebron' },
  { code: 145, label: '(GMT+03:00) Moscow, St. Petersburg', iana: 'Europe/Moscow' },
  { code: 150, label: '(GMT+03:00) Kuwait, Riyadh', iana: 'Asia/Riyadh' },
  { code: 151, label: '(GMT+03:00) Minsk', iana: 'Europe/Minsk' },
  { code: 155, label: '(GMT+03:00) Nairobi', iana: 'Africa/Nairobi' },
  { code: 158, label: '(GMT+03:00) Baghdad', iana: 'Asia/Baghdad' },
  { code: 159, label: '(GMT+02:00) Kaliningrad', iana: 'Europe/Kaliningrad' },
  { code: 160, label: '(GMT+03:30) Tehran', iana: 'Asia/Tehran' },
  { code: 165, label: '(GMT+04:00) Abu Dhabi, Muscat', iana: 'Asia/Dubai' },
  { code: 169, label: '(GMT+04:00) Baku', iana: 'Asia/Baku' },
  { code: 170, label: '(GMT+04:00) Yerevan', iana: 'Asia/Yerevan' },
  { code: 172, label: '(GMT+04:00) Port Louis', iana: 'Indian/Mauritius' },
  { code: 173, label: '(GMT+04:00) Tbilisi', iana: 'Asia/Tbilisi' },
  { code: 174, label: '(GMT+04:00) Izhevsk, Samara', iana: 'Europe/Samara' },
  { code: 175, label: '(GMT+04:30) Kabul', iana: 'Asia/Kabul' },
  { code: 176, label: '(GMT+04:00) Astrakhan, Ulyanovsk', iana: 'Europe/Astrakhan' },
  { code: 180, label: '(GMT+05:00) Ekaterinburg', iana: 'Asia/Yekaterinburg' },
  { code: 184, label: '(GMT+05:00) Islamabad, Karachi', iana: 'Asia/Karachi' },
  { code: 185, label: '(GMT+05:00) Toshkent', iana: 'Asia/Tashkent' },
  { code: 190, label: '(GMT+05:30) Chennai, Kolkata, Mumbai, New Delhi', iana: 'Asia/Kolkata' },
  { code: 193, label: '(GMT+05:45) Kathmandu', iana: 'Asia/Kathmandu' },
  { code: 195, label: '(GMT+06:00) Astana', iana: 'Asia/Almaty' },
  { code: 196, label: '(GMT+06:00) Dhaka', iana: 'Asia/Dhaka' },
  { code: 197, label: '(GMT+06:00) Omsk', iana: 'Asia/Omsk' },
  { code: 200, label: '(GMT+05:30) Sri Jayawardenepura', iana: 'Asia/Colombo' },
  { code: 201, label: '(GMT+07:00) Novosibirsk', iana: 'Asia/Novosibirsk' },
  { code: 203, label: '(GMT+06:30) Yangon (Rangoon)', iana: 'Asia/Yangon' },
  { code: 205, label: '(GMT+07:00) Bangkok, Hanoi, Jakarta', iana: 'Asia/Bangkok' },
  { code: 207, label: '(GMT+07:00) Krasnoyarsk', iana: 'Asia/Krasnoyarsk' },
  { code: 208, label: '(GMT+07:00) Barnaul, Gorno-Altaysk', iana: 'Asia/Barnaul' },
  { code: 209, label: '(GMT+07:00) Hovd', iana: 'Asia/Hovd' },
  { code: 210, label: '(GMT+08:00) Beijing, Chongqing, Hong Kong, Urumqi', iana: 'Asia/Shanghai' },
  { code: 211, label: '(GMT+07:00) Tomsk', iana: 'Asia/Tomsk' },
  { code: 215, label: '(GMT+08:00) Kuala Lumpur, Singapore', iana: 'Asia/Singapore' },
  { code: 220, label: '(GMT+08:00) Taipei', iana: 'Asia/Taipei' },
  { code: 225, label: '(GMT+08:00) Perth', iana: 'Australia/Perth' },
  { code: 227, label: '(GMT+08:00) Irkutsk', iana: 'Asia/Irkutsk' },
  { code: 228, label: '(GMT+08:00) Ulaanbaatar', iana: 'Asia/Ulaanbaatar' },
  { code: 229, label: '(GMT+09:00) Pyongyang', iana: 'Asia/Pyongyang' },
  { code: 230, label: '(GMT+09:00) Seoul', iana: 'Asia/Seoul' },
  { code: 231, label: '(GMT+08:45) Eucla', iana: 'Australia/Eucla' },
  { code: 235, label: '(GMT+09:00) Osaka, Sapporo, Tokyo', iana: 'Asia/Tokyo' },
  { code: 240, label: '(GMT+09:00) Yakutsk', iana: 'Asia/Yakutsk' },
  { code: 241, label: '(GMT+09:00) Chita', iana: 'Asia/Chita' },
  { code: 245, label: '(GMT+09:30) Darwin', iana: 'Australia/Darwin' },
  { code: 250, label: '(GMT+09:30) Adelaide', iana: 'Australia/Adelaide' },
  { code: 255, label: '(GMT+10:00) Canberra, Melbourne, Sydney', iana: 'Australia/Sydney' },
  { code: 260, label: '(GMT+10:00) Brisbane', iana: 'Australia/Brisbane' },
  { code: 265, label: '(GMT+10:00) Hobart', iana: 'Australia/Hobart' },
  { code: 270, label: '(GMT+10:00) Vladivostok', iana: 'Asia/Vladivostok' },
  { code: 274, label: '(GMT+10:30) Lord Howe Island', iana: 'Australia/Lord_Howe' },
  { code: 275, label: '(GMT+10:00) Guam, Port Moresby', iana: 'Pacific/Port_Moresby' },
  { code: 276, label: '(GMT+11:00) Bougainville Island', iana: 'Pacific/Bougainville' },
  { code: 277, label: '(GMT+11:00) Norfolk Island', iana: 'Pacific/Norfolk' },
  { code: 278, label: '(GMT+11:00) Sakhalin', iana: 'Asia/Sakhalin' },
  { code: 279, label: '(GMT+11:00) Chokurdakh', iana: 'Asia/Srednekolymsk' },
  { code: 280, label: '(GMT+11:00) Solomon Is., New Caledonia', iana: 'Pacific/Guadalcanal' },
  { code: 281, label: '(GMT+11:00) Magadan', iana: 'Asia/Magadan' },
  { code: 284, label: '(GMT+12:00) Coordinated Universal Time+12', iana: 'Etc/GMT-12' },
  { code: 285, label: '(GMT+12:00) Fiji', iana: 'Pacific/Fiji' },
  { code: 290, label: '(GMT+12:00) Auckland, Wellington', iana: 'Pacific/Auckland' },
  { code: 295, label: '(GMT+12:00) Anadyr, Petropavlovsk-Kamchatsky', iana: 'Asia/Kamchatka' },
  { code: 299, label: '(GMT+12:45) Chatham Islands', iana: 'Pacific/Chatham' },
  { code: 300, label: "(GMT+13:00) Nuku'alofa", iana: 'Pacific/Tongatapu' },
  { code: 301, label: '(GMT-05:00) Chetumal', iana: 'America/Cancun' },
  { code: 302, label: '(UTC+02:00) Khartoum', iana: 'Africa/Khartoum' },
  { code: 303, label: '(GMT-03:00) Punta Arenas', iana: 'America/Punta_Arenas' },
  { code: 304, label: '(GMT+04:00) Volgograd', iana: 'Europe/Volgograd' },
  { code: 305, label: '(GMT-07:00) Yukon', iana: 'America/Whitehorse' },
]

/** Codes offered first in pickers (DACH and neighbours, then the usual suspects). */
export const COMMON_TIME_ZONE_CODES = [110, 105, 95, 100, 85, 92, 125, 130, 35, 20, 10, 4, 190, 210, 235, 255]

const byCode = new Map(TIME_ZONES.map((z) => [z.code, z]))

export function timeZoneInfo(code: number | null | undefined): TimeZoneInfo | null {
  return code === null || code === undefined ? null : (byCode.get(code) ?? null)
}

/** IANA zone of a Dataverse code; unknown codes fall back to the app default (Berlin). */
export function ianaOf(code: number | null | undefined): string {
  return timeZoneInfo(code)?.iana ?? timeZoneInfo(DEFAULT_TIME_ZONE_CODE)!.iana
}

/** Dataverse code of an IANA zone (first match in the table), null when the zone isn't listed. */
export function codeOf(iana: string): number | null {
  return TIME_ZONES.find((z) => z.iana === iana)?.code ?? null
}

/** Short label for the UI: "Berlin (GMT+01:00)" from the Microsoft label; unknown → "Code 999". */
export function timeZoneLabel(code: number | null | undefined): string {
  const z = timeZoneInfo(code)
  if (!z) return code === null || code === undefined ? '—' : `Code ${code}`
  const m = /^\((?:GMT|UTC)([^)]*)\)\s*(.*)$/.exec(z.label)
  if (!m) return z.label
  const cities = m[2].split(',').map((s) => s.trim())
  const city = cities.find((c) => z.iana.endsWith(`/${c.replace(/ /g, '_')}`)) ?? cities[0]
  return `${city} (GMT${m[1]})`
}

/** Full label for pickers: "110 · (GMT+01:00) Amsterdam, Berlin, Bern, Rome, Stockholm, Vienna". */
export const timeZoneOptionLabel = (z: TimeZoneInfo): string => `${z.code} · ${z.label}`

/** Picker list: common zones first, then the rest by code. */
export function timeZoneOptions(): TimeZoneInfo[] {
  const common = COMMON_TIME_ZONE_CODES.map((c) => byCode.get(c)!).filter(Boolean)
  const rest = TIME_ZONES.filter((z) => !COMMON_TIME_ZONE_CODES.includes(z.code))
  return [...common, ...rest]
}

/** The viewer's zone as a Dataverse code when the table knows it (else Berlin). */
export function viewerTimeZoneCode(iana: string): number {
  return codeOf(iana) ?? DEFAULT_TIME_ZONE_CODE
}
