import { defaultDatePickerStrings, type CalendarStrings } from '@fluentui/react-datepicker-compat'
import { MONTH_LONG, WEEKDAY_LONG, WEEKDAY_SHORT } from './dates'

/** German strings of the Fluent DatePicker (compat). */
export const DE_CALENDAR: CalendarStrings = {
  ...defaultDatePickerStrings,
  months: [...MONTH_LONG],
  shortMonths: ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'],
  days: ['Sonntag', ...WEEKDAY_LONG.slice(0, 6)],
  shortDays: ['So', ...WEEKDAY_SHORT.slice(0, 6)],
  goToToday: 'Heute',
  prevMonthAriaLabel: 'Voriger Monat',
  nextMonthAriaLabel: 'Nächster Monat',
  prevYearAriaLabel: 'Voriges Jahr',
  nextYearAriaLabel: 'Nächstes Jahr',
  closeButtonAriaLabel: 'Schließen',
  monthPickerHeaderAriaLabel: '{0}, Jahr wählen',
  yearPickerHeaderAriaLabel: '{0}, Monat wählen',
}

