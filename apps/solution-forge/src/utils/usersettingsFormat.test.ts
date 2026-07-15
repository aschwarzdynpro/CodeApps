import { describe, expect, it } from 'vitest'
import {
  currencyPreview,
  dateShortPreview,
  groupInteger,
  numberPreview,
  timePreview,
  type FormatSettings,
} from './usersettingsFormat'

const german: FormatSettings = {
  decimalSymbol: ',',
  numberSeparator: '.',
  numberGroupFormat: '3',
  negativeFormatCode: 1,
  currencySymbol: '€',
  currencyFormatCode: 3,
  negativeCurrencyFormatCode: 8,
  currencyDecimalPrecision: 2,
  timeFormatString: 'HH:mm',
  timeSeparator: ':',
  amDesignator: '',
  pmDesignator: '',
  dateFormatString: 'dd/MM/yyyy',
  dateSeparator: '.',
}
const us: FormatSettings = {
  ...german,
  numberSeparator: ',',
  decimalSymbol: '.',
  currencyFormatCode: 0,
  timeFormatString: 'h:mm tt',
  amDesignator: 'AM',
  pmDesignator: 'PM',
  dateFormatString: 'M/d/yyyy',
  dateSeparator: '/',
  currencySymbol: '$',
}
const at2pm = new Date(2026, 6, 9, 14, 5, 0) // 9 Jul 2026, 14:05

describe('groupInteger', () => {
  it('groups by 3', () => {
    expect(groupInteger('1234567', '.', '3')).toBe('1.234.567')
  })
  it('does not group when disabled', () => {
    expect(groupInteger('1234567', '.', '0')).toBe('1234567')
    expect(groupInteger('12', '.', '3')).toBe('12')
  })
  it('supports Indian grouping', () => {
    expect(groupInteger('1234567', ',', '3;2')).toBe('12,34,567')
  })
})

describe('previews', () => {
  it('formats a German negative number', () => {
    expect(numberPreview(german)).toBe('-1.234.567,89')
  })
  it('formats German currency (positive · negative)', () => {
    expect(currencyPreview(german)).toBe('1.234,50 € · -1.234,50 €')
  })
  it('formats US currency with symbol before', () => {
    expect(currencyPreview(us)).toBe('$1,234.50 · -1,234.50 $')
  })
  it('formats 24h and 12h time', () => {
    expect(timePreview(german, at2pm)).toBe('14:05')
    expect(timePreview(us, at2pm)).toBe('2:05 PM')
  })
  it('formats a short date with the separator', () => {
    expect(dateShortPreview(german, at2pm)).toBe('09.07.2026')
    expect(dateShortPreview(us, at2pm)).toBe('7/9/2026')
  })
})
