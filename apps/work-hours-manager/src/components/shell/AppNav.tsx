import { NavDrawer, NavDrawerBody, NavDrawerHeader, NavItem, NavSectionHeader } from '@fluentui/react-components'
import { CalendarClockRegular, CalendarLtrRegular, HistoryRegular, PeopleTeamRegular, SettingsRegular, StethoscopeRegular, TaskListSquareLtrRegular } from '@fluentui/react-icons'
import type { ReactElement } from 'react'
import { S } from '../../strings'

export type View = 'resources' | 'templates' | 'holidays' | 'diagnostics' | 'runs' | 'setup'

/** Left navigation: the five areas of the concept plus "Einrichtung". */
export function AppNav({ view, onChange, badges }: { view: View; onChange: (view: View) => void; badges?: Partial<Record<View, number>> }) {
  const item = (value: View, icon: ReactElement, label: string) => (
    <NavItem value={value} icon={icon}>
      {label}
      {badges?.[value] ? <span className="nav-badge">{badges[value]}</span> : null}
    </NavItem>
  )
  return (
    <NavDrawer open type="inline" selectedValue={view} onNavItemSelect={(_, d) => onChange(d.value as View)} size="small" className="app-nav" aria-label={S.app.navLabel}>
      <NavDrawerHeader>
        <div className="app-nav__brand">
          <CalendarClockRegular aria-hidden />
          <span>{S.app.title}</span>
        </div>
      </NavDrawerHeader>
      <NavDrawerBody>
        {item('resources', <PeopleTeamRegular />, S.app.nav.resources)}
        {item('templates', <TaskListSquareLtrRegular />, S.app.nav.templates)}
        {item('holidays', <CalendarLtrRegular />, S.app.nav.holidays)}
        {item('diagnostics', <StethoscopeRegular />, S.app.nav.diagnostics)}
        {item('runs', <HistoryRegular />, S.app.nav.runs)}
        <NavSectionHeader>{S.app.nav.setup}</NavSectionHeader>
        {item('setup', <SettingsRegular />, S.app.nav.setup)}
      </NavDrawerBody>
    </NavDrawer>
  )
}
