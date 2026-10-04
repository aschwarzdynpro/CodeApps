import { Fragment, useContext } from 'react'
import { Menu, MenuGroup, MenuGroupHeader, MenuItemRadio, MenuList, MenuPopover, MenuTrigger } from '@fluentui/react-components'
import { ChevronDownRegular, ChevronRightRegular, HomeRegular } from '@fluentui/react-icons'
import { S } from '../../strings'
import { CrumbContext, isSelf } from './crumbs'

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
        <Menu checkedValues={{ nav: [trail.currentKey] }} onCheckedValueChange={() => undefined} positioning="below-start">
          <MenuTrigger disableButtonEnhancement>
            <button type="button" className="crumbs__current crumbs__current--menu" aria-current="page" title={S.designer.crumbSwitch}>
              {trail.current}
              <ChevronDownRegular aria-hidden />
            </button>
          </MenuTrigger>
          <MenuPopover>
            <MenuList>
              {trail.siblings.map((g) => (
                <MenuGroup key={g.title}>
                  <MenuGroupHeader>{g.title}</MenuGroupHeader>
                  {g.items.map((it) => (
                    <MenuItemRadio key={it.key} name="nav" value={it.key} secondaryContent={it.sub} onClick={() => nav.onSelect(it.target)}>
                      {it.label}
                    </MenuItemRadio>
                  ))}
                </MenuGroup>
              ))}
            </MenuList>
          </MenuPopover>
        </Menu>
      ) : (
        <span className="crumbs__current" aria-current="page">
          {trail.current}
        </span>
      )}
    </nav>
  )
}
