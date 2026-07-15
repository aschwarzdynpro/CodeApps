import { useEffect, useMemo, useRef, useState } from 'react'
import type {
  EditableUserSettings,
  UserSettingsDetail,
  UserSettingsPickers,
  UserSettingsRow,
} from '../types/userSettings'
import { userSettingsService } from '../services/userSettingsService'
import { ConfirmDialog } from './ConfirmDialog'
import { lcidName } from '../utils/lcid'
import {
  CURRENCY_FORMAT,
  EMAIL_TRACKING,
  ERROR_NOTIFICATION,
  NEGATIVE_CURRENCY,
  NEGATIVE_NUMBER,
  type Choice,
} from '../utils/usersettingsOptions'
import {
  currencyPreview,
  dateShortPreview,
  numberPreview,
  timePreview,
} from '../utils/usersettingsFormat'

interface Props {
  envKey: string
  envLabel: string
  row: UserSettingsRow
  canManage: boolean
  onClose: () => void
  /** Called after a successful save so the list can refresh the row. */
  onSaved: () => void
}

type Tab = 'general' | 'formats' | 'email' | 'privacy' | 'languages'
const TABS: { key: Tab; label: string }[] = [
  { key: 'general', label: 'General' },
  { key: 'formats', label: 'Formats' },
  { key: 'email', label: 'Email' },
  { key: 'privacy', label: 'Privacy' },
  { key: 'languages', label: 'Languages' },
]

/** Keys that participate in the change diff. */
const EDITABLE_KEYS: (keyof EditableUserSettings)[] = [
  'pagingLimit', 'timeZoneCode', 'currencyId', 'defaultCountryCode',
  'decimalSymbol', 'numberSeparator', 'numberGroupFormat', 'negativeFormatCode',
  'currencySymbol', 'currencyFormatCode', 'negativeCurrencyFormatCode',
  'currencyDecimalPrecision', 'timeFormatString', 'timeSeparator', 'amDesignator',
  'pmDesignator', 'showWeekNumber', 'dateFormatString', 'dateSeparator',
  'longDateFormatCode', 'isSendAsAllowed', 'incomingEmailFilteringMethod',
  'isEmailConversationViewEnabled', 'reportScriptErrors', 'uiLanguageId',
  'helpLanguageId',
]

/**
 * Detail dialog for one user's personal `usersettings`, grouped by area, with
 * live format previews and — for deployment managers — inline editing + Save
 * (writes the changed fields via the connector). Reused across environments.
 */
export function UserSettingsDetailDialog({
  envKey,
  envLabel,
  row,
  canManage,
  onClose,
  onSaved,
}: Props) {
  const [detail, setDetail] = useState<UserSettingsDetail | null>(null)
  const [draft, setDraft] = useState<UserSettingsDetail | null>(null)
  const [pickers, setPickers] = useState<UserSettingsPickers | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('general')
  const [confirming, setConfirming] = useState(false)
  const [saving, setSaving] = useState(false)
  const reloadRef = useRef(0)

  useEffect(() => {
    let cancelled = false
    const req = ++reloadRef.current
    Promise.all([
      userSettingsService.getDetail(envKey, row.userId),
      userSettingsService.pickers(envKey),
    ])
      .then(([d, p]) => {
        if (cancelled || req !== reloadRef.current) return
        setDetail(d)
        setDraft(d)
        setPickers(p)
      })
      .catch((err) => {
        if (!cancelled)
          setError(err instanceof Error ? err.message : String(err))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [envKey, row.userId])

  const changes = useMemo<Partial<EditableUserSettings>>(() => {
    if (!detail || !draft) return {}
    const out: Record<string, unknown> = {}
    for (const k of EDITABLE_KEYS)
      if (draft[k] !== detail[k]) out[k] = draft[k]
    return out as Partial<EditableUserSettings>
  }, [detail, draft])
  const dirty = Object.keys(changes).length > 0

  const set = <K extends keyof UserSettingsDetail>(
    key: K,
    value: UserSettingsDetail[K],
  ) => setDraft((d) => (d ? { ...d, [key]: value } : d))

  const save = async () => {
    setSaving(true)
    setError(null)
    try {
      await userSettingsService.updateUserSettings(envKey, row.userId, changes)
      setDetail(draft)
      setConfirming(false)
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  // --- field renderers (read-only when !canManage) ---
  const ro = !canManage
  const text = (key: keyof UserSettingsDetail, label: string, w = 14) => (
    <label className="us-field">
      <span className="us-field-label">{label}</span>
      <input
        className="us-input"
        style={{ width: `${w}ch` }}
        value={String(draft?.[key] ?? '')}
        disabled={ro}
        onChange={(e) => set(key, e.target.value as never)}
      />
    </label>
  )
  const num = (key: keyof UserSettingsDetail, label: string) => (
    <label className="us-field">
      <span className="us-field-label">{label}</span>
      <input
        className="us-input"
        type="number"
        style={{ width: '8ch' }}
        value={Number(draft?.[key] ?? 0)}
        disabled={ro}
        onChange={(e) => set(key, Number(e.target.value) as never)}
      />
    </label>
  )
  const choice = (
    key: keyof UserSettingsDetail,
    label: string,
    choices: Choice[],
  ) => (
    <label className="us-field">
      <span className="us-field-label">{label}</span>
      <select
        value={Number(draft?.[key] ?? 0)}
        disabled={ro}
        onChange={(e) => set(key, Number(e.target.value) as never)}
      >
        {choices.map((c) => (
          <option key={c.value} value={c.value}>
            {c.label}
          </option>
        ))}
      </select>
    </label>
  )
  const bool = (key: keyof UserSettingsDetail, label: string) => (
    <label className="us-field us-field--check">
      <input
        type="checkbox"
        checked={!!draft?.[key]}
        disabled={ro}
        onChange={(e) => set(key, e.target.checked as never)}
      />
      <span className="us-field-label">{label}</span>
    </label>
  )
  const preview = (value: string) => (
    <div className="us-preview">
      <span className="us-preview-tag">Preview</span>
      <code>{value}</code>
    </div>
  )

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal card modal--wide"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h2>
            {row.fullName}
            <span className="muted us-detail-env"> · {envLabel}</span>
          </h2>
          <button className="modal-close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <p className="muted us-detail-sub">{row.email}</p>

        {loading && <div className="state">Loading settings…</div>}
        {error && <div className="state state--error">{error}</div>}

        {draft && pickers && (
          <>
            <div className="subtabs">
              {TABS.map((t) => (
                <button
                  key={t.key}
                  className={`subtab ${tab === t.key ? 'subtab--active' : ''}`}
                  onClick={() => setTab(t.key)}
                >
                  {t.label}
                </button>
              ))}
            </div>

            <div className="us-form">
              {tab === 'general' && (
                <>
                  {num('pagingLimit', 'Records per page')}
                  <label className="us-field">
                    <span className="us-field-label">Time zone</span>
                    <select
                      value={draft.timeZoneCode}
                      disabled={ro}
                      onChange={(e) =>
                        set('timeZoneCode', Number(e.target.value))
                      }
                    >
                      {pickers.timeZones.map((t) => (
                        <option key={t.code} value={t.code}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="us-field">
                    <span className="us-field-label">Default currency</span>
                    <select
                      value={draft.currencyId}
                      disabled={ro}
                      onChange={(e) => set('currencyId', e.target.value)}
                    >
                      <option value="">— (org default)</option>
                      {pickers.currencies.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.code} — {c.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  {text('defaultCountryCode', 'Country/Region code prefix', 8)}
                </>
              )}

              {tab === 'formats' && (
                <>
                  <div className="us-group">
                    <h4>Number</h4>
                    <div className="us-fields">
                      {text('decimalSymbol', 'Decimal symbol', 4)}
                      {text('numberSeparator', 'Digit grouping symbol', 4)}
                      {text('numberGroupFormat', 'Digit group', 6)}
                      {choice('negativeFormatCode', 'Negative number', NEGATIVE_NUMBER)}
                    </div>
                    {preview(numberPreview(draft))}
                  </div>
                  <div className="us-group">
                    <h4>Currency</h4>
                    <div className="us-fields">
                      {text('currencySymbol', 'Currency symbol', 5)}
                      {choice('currencyFormatCode', 'Currency format', CURRENCY_FORMAT)}
                      {choice('negativeCurrencyFormatCode', 'Negative currency', NEGATIVE_CURRENCY)}
                      {num('currencyDecimalPrecision', 'Decimals')}
                    </div>
                    {preview(currencyPreview(draft))}
                  </div>
                  <div className="us-group">
                    <h4>Time</h4>
                    <div className="us-fields">
                      {text('timeFormatString', 'Time format', 12)}
                      {text('timeSeparator', 'Time separator', 4)}
                      {text('amDesignator', 'AM symbol', 6)}
                      {text('pmDesignator', 'PM symbol', 6)}
                    </div>
                    {preview(timePreview(draft))}
                  </div>
                  <div className="us-group">
                    <h4>Date</h4>
                    <div className="us-fields">
                      {text('dateFormatString', 'Short date format', 12)}
                      {text('dateSeparator', 'Date separator', 4)}
                      {bool('showWeekNumber', 'Show week numbers on calendar views')}
                    </div>
                    {preview(dateShortPreview(draft))}
                  </div>
                </>
              )}

              {tab === 'email' && (
                <>
                  {bool('isSendAsAllowed', 'Allow other users to send email on your behalf')}
                  {choice('incomingEmailFilteringMethod', 'Track', EMAIL_TRACKING)}
                  {bool('isEmailConversationViewEnabled', 'Show emails as conversation')}
                </>
              )}

              {tab === 'privacy' &&
                choice('reportScriptErrors', 'Error notification preference', ERROR_NOTIFICATION)}

              {tab === 'languages' && (
                <>
                  <div className="us-field">
                    <span className="us-field-label">Base language</span>
                    <span className="us-readonly">
                      {lcidName(draft.baseLanguageLcid)}
                    </span>
                  </div>
                  <label className="us-field">
                    <span className="us-field-label">User interface language</span>
                    <select
                      value={draft.uiLanguageId}
                      disabled={ro}
                      onChange={(e) => set('uiLanguageId', Number(e.target.value))}
                    >
                      {pickers.languages.map((l) => (
                        <option key={l.lcid} value={l.lcid}>
                          {l.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="us-field">
                    <span className="us-field-label">Help language</span>
                    <select
                      value={draft.helpLanguageId}
                      disabled={ro}
                      onChange={(e) => set('helpLanguageId', Number(e.target.value))}
                    >
                      <option value={0}>— (same as UI)</option>
                      {pickers.languages.map((l) => (
                        <option key={l.lcid} value={l.lcid}>
                          {l.name}
                        </option>
                      ))}
                    </select>
                  </label>
                </>
              )}
            </div>

            {canManage && (
              <div className="us-detail-actions">
                <span className="muted">
                  {dirty
                    ? `${Object.keys(changes).length} change${Object.keys(changes).length === 1 ? '' : 's'}`
                    : 'No changes'}
                </span>
                <button className="btn" onClick={onClose}>
                  Cancel
                </button>
                <button
                  className="btn btn--primary"
                  disabled={!dirty || saving}
                  onClick={() => setConfirming(true)}
                >
                  Save
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {confirming && (
        <ConfirmDialog
          title="Save user settings"
          confirmLabel="Save"
          danger={envKey === 'prod'}
          busy={saving}
          onConfirm={() => void save()}
          onCancel={() => setConfirming(false)}
          message={
            <>
              <p className="confirm-item">{row.fullName}</p>
              <p>
                Write {Object.keys(changes).length} changed setting
                {Object.keys(changes).length === 1 ? '' : 's'} to this user in{' '}
                <strong>{envLabel}</strong>.
              </p>
              {envKey === 'prod' && (
                <p className="confirm-warn">
                  This is <strong>production</strong> — the change takes effect
                  immediately.
                </p>
              )}
            </>
          }
        />
      )}
    </div>
  )
}
