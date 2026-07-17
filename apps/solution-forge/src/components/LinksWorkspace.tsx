import { useState } from 'react'
import { ENVIRONMENTS } from '../config'
import { buildEnvLinkGroups, buildGlobalLinks, type LinkItem } from '../utils/envLinks'

/** Copy-to-clipboard button with a transient "copied" state. */
function CopyButton({ url }: { url: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      type="button"
      className="links-copy"
      title={copied ? 'Copied' : 'Copy URL'}
      aria-label="Copy URL"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(url)
          setCopied(true)
          window.setTimeout(() => setCopied(false), 1200)
        } catch {
          // Clipboard blocked (permissions / insecure context) — ignore.
        }
      }}
    >
      {copied ? '✓' : '⧉'}
    </button>
  )
}

function LinkRow({ item }: { item: LinkItem }) {
  return (
    <li className="links-row">
      <div className="links-main">
        <a
          className="links-a"
          href={item.url}
          target="_blank"
          rel="noopener noreferrer"
          title={item.url}
        >
          {item.label}
        </a>
        {item.hint && <span className="links-hint muted">{item.hint}</span>}
      </div>
      <CopyButton url={item.url} />
    </li>
  )
}

/**
 * Reference › Links — a static link collection. Everything is derived from the
 * configured environments (org url + environment id); there is no service call,
 * no connector and no gating. See {@link buildEnvLinkGroups}.
 */
export function LinksWorkspace() {
  const globals = buildGlobalLinks()
  return (
    <div className="links-workspace">
      <p className="links-intro muted">
        Quick links to each configured environment and to the global Power
        Platform portals. Links open in a new tab; the copy button grabs the
        URL. Nothing is loaded — every link is derived from the environment
        configuration.
      </p>

      <section className="card links-card">
        <h3 className="card-title">Global</h3>
        <ul className="links-list">
          {globals.map((l) => (
            <LinkRow key={l.label} item={l} />
          ))}
        </ul>
      </section>

      {ENVIRONMENTS.map((env) => (
        <section className="card links-card" key={env.key}>
          <h3 className="card-title links-env-title">
            {env.label}
            {env.isCurrent && <span className="links-badge">host</span>}
          </h3>
          {buildEnvLinkGroups(env).map((group) => (
            <div className="links-group" key={group.title}>
              <h4 className="links-group-title">{group.title}</h4>
              <ul className="links-list">
                {group.links.map((l) => (
                  <LinkRow key={l.label} item={l} />
                ))}
              </ul>
            </div>
          ))}
        </section>
      ))}
    </div>
  )
}
