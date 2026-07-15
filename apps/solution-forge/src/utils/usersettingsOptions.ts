/**
 * Option maps for the coded `usersettings` format/behaviour fields. These are
 * STANDARD (non-customizable) Dataverse choices, so the value→label maps are
 * hardcoded from the MS `usersettings` reference (+ verified via stringmap on a
 * live org) rather than read per environment. Pure + Vitest-covered.
 */

export interface Choice {
  value: number
  label: string
}

/** Negative NUMBER format (how a minus is applied). Pattern uses `n`/`-`. */
export const NEGATIVE_NUMBER: Choice[] = [
  { value: 0, label: 'Brackets — (1.1)' },
  { value: 1, label: 'Dash — -1.1' },
  { value: 2, label: 'Dash + space — - 1.1' },
  { value: 3, label: 'Trailing dash — 1.1-' },
  { value: 4, label: 'Space + trailing dash — 1.1 -' },
]

/** Positive CURRENCY symbol position. `$` = symbol, `n` = amount. */
export const CURRENCY_FORMAT: Choice[] = [
  { value: 0, label: 'Symbol before — $1.1' },
  { value: 1, label: 'Symbol after — 1.1$' },
  { value: 2, label: 'Symbol before + space — $ 1.1' },
  { value: 3, label: 'Symbol after + space — 1.1 $' },
]

/** Negative CURRENCY format (.NET CurrencyNegativePattern 0–15). */
export const NEGATIVE_CURRENCY: Choice[] = [
  { value: 0, label: '($1.1)' },
  { value: 1, label: '-$1.1' },
  { value: 2, label: '$-1.1' },
  { value: 3, label: '$1.1-' },
  { value: 4, label: '(1.1$)' },
  { value: 5, label: '-1.1$' },
  { value: 6, label: '1.1-$' },
  { value: 7, label: '1.1$-' },
  { value: 8, label: '-1.1 $' },
  { value: 9, label: '-$ 1.1' },
  { value: 10, label: '1.1 $-' },
  { value: 11, label: '$ 1.1-' },
  { value: 12, label: '$ -1.1' },
  { value: 13, label: '1.1- $' },
  { value: 14, label: '($ 1.1)' },
  { value: 15, label: '(1.1 $)' },
]

/** Incoming email tracking ("Track" in personal options). */
export const EMAIL_TRACKING: Choice[] = [
  { value: 0, label: 'All email messages' },
  { value: 1, label: 'Email messages in response to Dynamics 365 email' },
  { value: 2, label: 'Email from Dynamics 365 Leads, Contacts and Accounts' },
  { value: 3, label: 'Email from Dynamics 365 records that are email enabled' },
  { value: 4, label: 'No email messages' },
]

/** Error-notification preference (reportscripterrors). */
export const ERROR_NOTIFICATION: Choice[] = [
  { value: 0, label: 'No preference' },
  { value: 1, label: 'Ask me for permission' },
  { value: 2, label: 'Automatically send without asking' },
  { value: 3, label: 'Never send' },
]

/** Lookup a choice label, falling back to `#<value>` for unknown codes. */
export function choiceLabel(choices: Choice[], value: number | undefined): string {
  if (value == null) return '—'
  return choices.find((c) => c.value === value)?.label ?? `#${value}`
}
