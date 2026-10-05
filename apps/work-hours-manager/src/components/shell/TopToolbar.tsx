import { Combobox, Option, Switch, Toolbar, ToolbarButton, ToolbarDivider } from '@fluentui/react-components'
import { ArrowSyncRegular, CalendarTodayRegular, ChevronLeftRegular, ChevronRightRegular, QuestionCircleRegular } from '@fluentui/react-icons'
import type { PowerMode } from '../../PowerProvider'
import { S } from '../../strings'
import { shiftRange, visibleRange, type RangeState } from '../../utils/range'
import { todayIn } from '../../utils/dates'
import { timeZoneLabel, timeZoneOptionLabel, timeZoneOptions } from '../../utils/timezones'
import { Btn } from '../ui'

interface Props {
  range: RangeState
  onRange: (range: RangeState) => void
  /** Range controls hidden on views without a calendar. */
  showRange: boolean
  viewerTz: string
  onViewerTz: (iana: string) => void
  useV2: boolean
  onUseV2: (v: boolean) => void
  mode: PowerMode
  ready: boolean
  readOnly: boolean
  onHelp: () => void
  onReload: () => void
}

/** Top toolbar: range navigation, week/month, viewer time zone, UseV2, mode badge, help. */
export function TopToolbar(p: Props) {
  const visible = visibleRange(p.range)
  const zones = timeZoneOptions()
  const current = zones.find((z) => z.iana === p.viewerTz)
  return (
    <Toolbar aria-label={S.toolbar.viewMode} className="topbar">
      {p.showRange ? (
        <>
          <ToolbarButton appearance={p.range.mode === 'week' ? 'primary' : 'subtle'} aria-pressed={p.range.mode === 'week'} onClick={() => p.onRange({ ...p.range, mode: 'week' })}>
            {S.toolbar.week}
          </ToolbarButton>
          <ToolbarButton appearance={p.range.mode === 'month' ? 'primary' : 'subtle'} aria-pressed={p.range.mode === 'month'} onClick={() => p.onRange({ ...p.range, mode: 'month' })}>
            {S.toolbar.month}
          </ToolbarButton>
          <ToolbarDivider />
          <ToolbarButton aria-label={S.toolbar.prev} icon={<ChevronLeftRegular />} onClick={() => p.onRange(shiftRange(p.range, -1))} />
          <ToolbarButton aria-label={S.toolbar.next} icon={<ChevronRightRegular />} onClick={() => p.onRange(shiftRange(p.range, 1))} />
          <ToolbarButton icon={<CalendarTodayRegular />} onClick={() => p.onRange({ ...p.range, anchor: todayIn(p.viewerTz) })}>
            {S.toolbar.today}
          </ToolbarButton>
          <span className="topbar__range">{visible.label}</span>
          <ToolbarDivider />
        </>
      ) : null}
      <Combobox
        aria-label={S.toolbar.viewerZone}
        className="topbar__zone"
        size="small"
        value={current ? timeZoneLabel(current.code) : p.viewerTz}
        selectedOptions={current ? [current.iana] : []}
        onOptionSelect={(_, d) => {
          if (d.optionValue) p.onViewerTz(d.optionValue)
        }}
      >
        {zones.map((z) => (
          <Option key={z.code} value={z.iana} text={timeZoneOptionLabel(z)}>
            {timeZoneOptionLabel(z)}
          </Option>
        ))}
      </Combobox>
      <Switch label={S.toolbar.useV2} title={S.toolbar.useV2Title} checked={p.useV2} onChange={(_, d) => p.onUseV2(d.checked)} className="topbar__v2" />
      <div className="topbar__spacer" />
      <ToolbarButton aria-label={S.app.reload} icon={<ArrowSyncRegular />} onClick={p.onReload} />
      <Btn kind="ghost" icon={<QuestionCircleRegular />} onClick={p.onHelp} title={S.app.helpTitle}>
        {S.app.help}
      </Btn>
      {p.readOnly ? (
        <span className="mode mode--readonly" title={S.app.readOnlyTitle}>
          {S.app.readOnly}
        </span>
      ) : null}
      <span className={`mode mode--${p.mode}`} title={p.mode === 'local-mock' ? S.app.modeMockTitle : S.app.modeDataverse}>
        {p.ready ? (p.mode === 'local-mock' ? S.app.modeMock : S.app.modeDataverse) : '…'}
      </span>
    </Toolbar>
  )
}
