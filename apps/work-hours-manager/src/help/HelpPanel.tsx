import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react'
import { DrawerBody, DrawerHeader, DrawerHeaderTitle, Input, OverlayDrawer } from '@fluentui/react-components'
import { DismissRegular, InfoRegular, SearchRegular, WarningRegular } from '@fluentui/react-icons'
import { S } from '../strings'
import { Btn } from '../components/ui'
import { searchHelp, type HelpBlock, type HelpSection } from './helpContent'

/**
 * Help as an overlay drawer over the current view (an open editor draft
 * survives looking something up). Table of contents with search on the
 * left, the sections on the right; `section` scrolls to one.
 */
export function HelpPanel({ open, section, onClose }: { open: boolean; section: string | null; onClose: () => void }) {
  const [query, setQuery] = useState('')
  const [current, setCurrent] = useState<string | null>(section)
  const body = useRef<HTMLDivElement>(null)

  const sections = searchHelp(query)
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)

  const jump = (id: string) => {
    setCurrent(id)
    body.current?.querySelector(`#help-${id}`)?.scrollIntoView({ block: 'start', behavior: 'smooth' })
  }

  // Deep link: scroll to the requested section once the drawer content exists.
  useEffect(() => {
    if (!open || !section) return
    const raf = requestAnimationFrame(() => body.current?.querySelector(`#help-${section}`)?.scrollIntoView({ block: 'start' }))
    return () => cancelAnimationFrame(raf)
  }, [open, section])

  const onScroll = () => {
    const root = body.current
    if (!root) return
    const top = root.getBoundingClientRect().top + 24
    let active: string | null = null
    for (const el of root.querySelectorAll<HTMLElement>('.help-section')) {
      if (el.getBoundingClientRect().top <= top) active = el.dataset.id ?? null
    }
    if (active && active !== current) setCurrent(active)
  }

  const groups = [...new Set(sections.map((s) => s.group))]

  return (
    <OverlayDrawer open={open} position="end" size="large" className="help-drawer" style={{ width: 'min(1040px, 100vw)' }} onOpenChange={(_, d) => !d.open && onClose()}>
      <DrawerHeader>
        <DrawerHeaderTitle action={<Btn kind="ghost" aria-label={S.app.help} icon={<DismissRegular />} onClick={onClose} />}>{S.app.help}</DrawerHeaderTitle>
      </DrawerHeader>
      <DrawerBody className="help">
        <nav className="help__toc" aria-label={S.app.help}>
          <Input
            size="small"
            contentBefore={<SearchRegular />}
            placeholder="Hilfe durchsuchen …"
            aria-label="Hilfe durchsuchen"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              body.current?.scrollTo({ top: 0 })
            }}
          />
          {groups.map((g) => (
            <div key={g} className="help__toc-group">
              <span className="help__toc-label">{g}</span>
              {sections
                .filter((s) => s.group === g)
                .map((s) => (
                  <button key={s.id} type="button" className={`help__toc-item${current === s.id ? ' is-active' : ''}`} aria-current={current === s.id ? 'location' : undefined} onClick={() => jump(s.id)}>
                    {s.title}
                  </button>
                ))}
            </div>
          ))}
          {sections.length === 0 ? <p className="muted small">Keine Treffer.</p> : null}
        </nav>
        <div className="help__content" ref={body} onScroll={onScroll}>
          {sections.map((s) => (
            <SectionView key={s.id} section={s} words={words} />
          ))}
          {sections.length === 0 ? <p className="muted">Nichts gefunden — anderes Wort versuchen, z. B. „Nachtschicht“, „Vorlage“ oder „Rückgängig“.</p> : null}
        </div>
      </DrawerBody>
    </OverlayDrawer>
  )
}

function SectionView({ section: s, words }: { section: HelpSection; words: string[] }) {
  return (
    <section id={`help-${s.id}`} data-id={s.id} className="help-section" aria-labelledby={`help-${s.id}-title`}>
      <h2 id={`help-${s.id}-title`}>{s.title}</h2>
      <p className="help-section__summary">{s.summary}</p>
      {s.blocks.map((b, i) => (
        <BlockView key={i} block={b} words={words} />
      ))}
    </section>
  )
}

function BlockView({ block: b, words }: { block: HelpBlock; words: string[] }) {
  const t = (text: string) => <Inline text={text} words={words} />
  if ('p' in b) return <p>{t(b.p)}</p>
  if ('h' in b) return <h3>{t(b.h)}</h3>
  if ('list' in b)
    return (
      <ul>
        {b.list.map((x, i) => (
          <li key={i}>{t(x)}</li>
        ))}
      </ul>
    )
  if ('steps' in b)
    return (
      <ol className="help-steps">
        {b.steps.map((x, i) => (
          <li key={i}>{t(x)}</li>
        ))}
      </ol>
    )
  if ('tip' in b)
    return (
      <div className="help-note help-note--tip">
        <InfoRegular aria-hidden />
        <span>{t(b.tip)}</span>
      </div>
    )
  if ('warn' in b)
    return (
      <div className="help-note help-note--warn">
        <WarningRegular aria-hidden />
        <span>{t(b.warn)}</span>
      </div>
    )
  return (
    <table className="help-table">
      <thead>
        <tr>
          {b.table.head.map((h) => (
            <th key={h}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {b.table.rows.map((r, i) => (
          <tr key={i}>
            {r.map((c, j) => (
              <td key={j}>{t(c)}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

/** `**fett**` and `` `code` `` plus highlighted search words. */
function Inline({ text, words }: { text: string; words: string[] }) {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).filter(Boolean)
  return (
    <>
      {parts.map((p, i) =>
        p.startsWith('**') ? (
          <strong key={i}>{mark(p.slice(2, -2), words)}</strong>
        ) : p.startsWith('`') ? (
          <code key={i}>{p.slice(1, -1)}</code>
        ) : (
          <Fragment key={i}>{mark(p, words)}</Fragment>
        ),
      )}
    </>
  )
}

function mark(text: string, words: string[]): ReactNode {
  if (words.length === 0) return text
  const re = new RegExp(`(${words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'gi')
  const pieces = text.split(re)
  return pieces.map((p, i) => (re.test(p) && words.some((w) => p.toLowerCase() === w) ? <mark key={i}>{p}</mark> : <Fragment key={i}>{p}</Fragment>))
}
