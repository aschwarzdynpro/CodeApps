import { Fragment, useContext, useState } from 'react'
import { Input, Menu, MenuGroup, MenuGroupHeader, MenuItemRadio, MenuList, MenuPopover, MenuTrigger } from '@fluentui/react-components'
import { ChevronDownRegular, ChevronRightRegular, HomeRegular, SearchRegular } from '@fluentui/react-icons'
import { S } from '../../strings'
import { CrumbContext, isSelf, type CrumbNav, type CrumbTrail } from './crumbs'

/** From this many neighbours on, the menu gets a filter. */
const FILTER_FROM = 12

/**
 * Breadcrumb of the canvas head: Übersicht › table › what this canvas is.
 * Ancestors are links (Alt+↑ goes one up); the last part opens the
 * neighbours — the table's other forms and views, other apps. Without a
 * trail (outside the designer) it shows `fallback`.
 */
export function Breadcrumb({ fallback }: { fallback: string }) {
  const nav = useContext(CrumbContext)
  const trail = nav?.trail
  if (!nav || !trail) return <span className="canvas__kicker">{fallback}</span>
  return (
    <nav className="crumbs" aria-label={S.designer.crumbs}>
      {trail.path.map((c, i) => {
        const body = (
          <>
            {c.target.kind === 'home' ? <HomeRegular aria-hidden /> : null}
            {c.label}
            {c.sub && c.sub !== c.label ? <span className="crumbs__sub">{c.sub}</span> : null}
          </>
        )
        return (
          <Fragment key={i}>
            {isSelf(trail, c) ? (
              <span className="crumbs__link crumbs__link--self">{body}</span>
            ) : (
              <button type="button" className="crumbs__link" onClick={() => nav.onSelect(c.target)} title={c.sub ? `${c.label} (${c.sub})` : c.label}>
                {body}
              </button>
            )}
            <ChevronRightRegular className="crumbs__sep" aria-hidden />
          </Fragment>
        )
      })}
      {trail.siblings.length > 0 ? (
        <Siblings trail={trail} onSelect={nav.onSelect} />
      ) : (
        <span className="crumbs__current" aria-current="page">
          {trail.current}
        </span>
      )}
    </nav>
  )
}

/** The last part with its menu of neighbours; scrolls inside itself and filters long lists. */
function Siblings({ trail, onSelect }: { trail: CrumbTrail; onSelect: CrumbNav['onSelect'] }) {
  const [query, setQuery] = useState('')
  const total = trail.siblings.reduce((n, g) => n + g.items.length, 0)
  const q = query.trim().toLowerCase()
  const groups = trail.siblings
    .map((g) => ({ ...g, items: q ? g.items.filter((it) => it.label.toLowerCase().includes(q) || it.sub?.toLowerCase().includes(q)) : g.items }))
    .filter((g) => g.items.length > 0)
  return (
    <Menu
      checkedValues={{ nav: [trail.currentKey] }}
      onCheckedValueChange={() => undefined}
      onOpenChange={(_, data) => {
        if (!data.open) setQuery('')
      }}
      positioning="below-start"
    >
      <MenuTrigger disableButtonEnhancement>
        <button type="button" className="crumbs__current crumbs__current--menu" aria-current="page" title={S.designer.crumbSwitch}>
          {trail.current}
          <ChevronDownRegular aria-hidden />
        </button>
      </MenuTrigger>
      <MenuPopover className="crumbs__menu">
        {total >= FILTER_FROM ? (
          <div className="crumbs__filter">
            <Input
              size="small"
              contentBefore={<SearchRegular />}
              placeholder={S.designer.crumbFilter}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              // The menu's arrow-key and letter navigation must not take the keys meant for the field.
              onKeyDown={(e) => {
                if (e.key !== 'Escape' && e.key !== 'ArrowDown') e.stopPropagation()
              }}
              aria-label={S.designer.crumbFilter}
              autoFocus
            />
          </div>
        ) : null}
        <MenuList>
          {groups.length === 0 ? <div className="crumbs__none muted small">{S.designer.noMatch}</div> : null}
          {groups.map((g) => (
            <MenuGroup key={g.title}>
              <MenuGroupHeader>{g.title}</MenuGroupHeader>
              {g.items.map((it) => (
                <MenuItemRadio key={it.key} name="nav" value={it.key} secondaryContent={it.sub} onClick={() => onSelect(it.target)}>
                  {it.label}
                </MenuItemRadio>
              ))}
            </MenuGroup>
          ))}
        </MenuList>
      </MenuPopover>
    </Menu>
  )
}
