/**
 * Live-preview helpers for the User Settings detail dialog: render a sample
 * number / currency / time / date the way a user's `usersettings` would.
 * Pure + Vitest-covered. Deliberately lightweight — enough to preview the
 * effect of the format fields, not a full CLR format engine.
 */

export interface FormatSettings {
  decimalSymbol: string
  /** Digit grouping symbol (`numberseparator`). */
  numberSeparator: string
  /** `numbergroupformat` — e.g. "3" (by 3), "3;2" (Indian), "0"/"" (none). */
  numberGroupFormat: string
  negativeFormatCode: number
  currencySymbol: string
  currencyFormatCode: number
  negativeCurrencyFormatCode: number
  currencyDecimalPrecision: number
  timeFormatString: string
  timeSeparator: string
  amDesignator: string
  pmDesignator: string
  dateFormatString: string
  dateSeparator: string
}

const digits = (g: string): number[] =>
  (g || '')
    .split(/[;,]/)
    .map((x) => parseInt(x, 10))
    .filter((n) => !Number.isNaN(n))

const noGrouping = (g: string): boolean => {
  const n = digits(g)
  return n.length === 0 || n.every((x) => x === 0)
}
const indianGrouping = (g: string): boolean => {
  const n = digits(g)
  return n.includes(3) && n.includes(2)
}

/** Group an integer-digit string with the given separator + grouping style. */
export function groupInteger(
  intDigits: string,
  sep: string,
  groupFmt: string,
): string {
  if (noGrouping(groupFmt) || intDigits.length <= 3) return intDigits
  if (indianGrouping(groupFmt)) {
    const last3 = intDigits.slice(-3)
    const rest = intDigits
      .slice(0, -3)
      .replace(/\B(?=(\d{2})+(?!\d))/g, sep)
    return rest + sep + last3
  }
  return intDigits.replace(/\B(?=(\d{3})+(?!\d))/g, sep)
}

function applyNegativeNumber(num: string, code: number): string {
  switch (code) {
    case 0:
      return `(${num})`
    case 2:
      return `- ${num}`
    case 3:
      return `${num}-`
    case 4:
      return `${num} -`
    default:
      return `-${num}`
  }
}

/** Sample negative number, e.g. "-1.234.567,89". */
export function numberPreview(f: FormatSettings): string {
  const grouped = groupInteger('1234567', f.numberSeparator, f.numberGroupFormat)
  const abs = `${grouped}${f.decimalSymbol}89`
  return applyNegativeNumber(abs, f.negativeFormatCode)
}

function placeCurrency(num: string, symbol: string, code: number): string {
  switch (code) {
    case 1:
      return `${num}${symbol}`
    case 2:
      return `${symbol} ${num}`
    case 3:
      return `${num} ${symbol}`
    default:
      return `${symbol}${num}`
  }
}

/** .NET CurrencyNegativePattern 0–15, `$`=symbol, `n`=amount. */
const NEG_CURRENCY: Record<number, string> = {
  0: '($n)',
  1: '-$n',
  2: '$-n',
  3: '$n-',
  4: '(n$)',
  5: '-n$',
  6: 'n-$',
  7: 'n$-',
  8: '-n $',
  9: '-$ n',
  10: 'n $-',
  11: '$ n-',
  12: '$ -n',
  13: 'n- $',
  14: '($ n)',
  15: '(n $)',
}

/** Sample positive · negative currency, e.g. "1.234,50 € · -1.234,50 €". */
export function currencyPreview(f: FormatSettings): string {
  const prec = Math.max(0, Math.min(4, f.currencyDecimalPrecision ?? 2))
  const frac = prec > 0 ? f.decimalSymbol + '5'.padEnd(prec, '0') : ''
  const num = groupInteger('1234', f.numberSeparator, f.numberGroupFormat) + frac
  const pos = placeCurrency(num, f.currencySymbol || '¤', f.currencyFormatCode)
  const pattern = NEG_CURRENCY[f.negativeCurrencyFormatCode] ?? '-$n'
  const neg = pattern
    .replace('$', f.currencySymbol || '¤')
    .replace('n', num)
  return `${pos} · ${neg}`
}

/** Format a sample time from a .NET-ish time pattern (HH:mm, h:mm tt, …). */
export function timePreview(f: FormatSettings, sample = new Date()): string {
  const H = sample.getHours()
  const m = sample.getMinutes()
  const s = sample.getSeconds()
  const isPm = H >= 12
  const h12 = H % 12 || 12
  const pad = (n: number) => String(n).padStart(2, '0')
  const tt = isPm ? f.pmDesignator || 'PM' : f.amDesignator || 'AM'
  let out = f.timeFormatString || 'HH:mm'
  out = out
    .replace(/HH/g, pad(H))
    .replace(/H/g, String(H))
    .replace(/hh/g, pad(h12))
    .replace(/h/g, String(h12))
    .replace(/mm/g, pad(m))
    .replace(/m/g, String(m))
    .replace(/ss/g, pad(s))
    .replace(/s/g, String(s))
    .replace(/tt/g, tt)
    .replace(/t/g, tt.charAt(0))
  if (f.timeSeparator) out = out.replace(/:/g, f.timeSeparator)
  return out
}

/** Format a sample date from a .NET-ish short-date pattern (dd/MM/yyyy, …). */
export function dateShortPreview(f: FormatSettings, sample = new Date()): string {
  const d = sample.getDate()
  const mo = sample.getMonth() + 1
  const y = sample.getFullYear()
  const pad = (n: number) => String(n).padStart(2, '0')
  let out = f.dateFormatString || 'dd/MM/yyyy'
  out = out
    .replace(/yyyy/g, String(y))
    .replace(/yy/g, String(y).slice(-2))
    .replace(/MM/g, pad(mo))
    .replace(/M/g, String(mo))
    .replace(/dd/g, pad(d))
    .replace(/d/g, String(d))
  if (f.dateSeparator) out = out.replace(/[/.-]/g, f.dateSeparator)
  return out
}
