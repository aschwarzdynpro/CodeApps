import { Fragment, useState } from 'react'
import { ENVIRONMENTS, ORGANIZATION_ID_BY_ENVIRONMENT_ID } from '../config'
import {
  buildEnvLinkRows,
  buildGlobalLinks,
  ENV_LINK_GROUPS,
  type LinkItem,
} from '../utils/envLinks'

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

/** A global link rendered as a full-width row (label + hint + copy). */
function GlobalLinkRow({ item }: { item: LinkItem }) {
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

/** One matrix cell: a wide open-in-new-tab button plus a copy button. */
function LinkCell({ url, label }: { url: string; label: string }) {
  return (
    <span className="links-cell-inner">
      <a
        className="links-open"
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        title={url}
        aria-label={`Open ${label}`}
      >
        <span className="links-open-text">Open</span>
        <span aria-hidden="true">↗</span>
      </a>
      <CopyButton url={url} />
    </span>
  )
}

/**
 * Reference › Links — a static link collection. Everything is derived from the
 * configured environments (org url + environment id); there is no service call,
 * no connector and no gating. The per-environment links are shown as a matrix
 * (one row per link kind, one column per environment). See {@link
 * buildEnvLinkRows}.
 */
export function LinksWorkspace() {
  const envs = ENVIRONMENTS
  const rows = buildEnvLinkRows(envs, ORGANIZATION_ID_BY_ENVIRONMENT_ID)
  const globals = buildGlobalLinks()

  return (
    <div className="links-workspace">
      <p className="links-intro muted">
        Quick links to each configured environment and to the global Power
        Platform portals. Links open in a new tab; the ⧉ button copies the URL.
        Nothing is loaded — every link is derived from the environment
        configuration.
      </p>

      <section className="card links-card">
        <h3 className="card-title">Global</h3>
        <ul className="links-list">
          {globals.map((l) => (
            <GlobalLinkRow key={l.label} item={l} />
          ))}
        </ul>
      </section>

      <section className="card links-card">
        <h3 className="card-title">Environments</h3>
        <div className="links-table-wrap">
          <table className="links-table">
            <thead>
              <tr>
                <th className="links-th-label">Link</th>
                {envs.map((e) => (
                  <th key={e.key} className="links-th-env">
                    <span className="links-th-name">{e.label}</span>
                    {e.isCurrent && <span className="links-badge">host</span>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ENV_LINK_GROUPS.map((group) => {
                const groupRows = rows.filter((r) => r.group === group)
                if (groupRows.length === 0) return null
                return (
                  <Fragment key={group}>
                    <tr className="links-group-row">
                      <th className="links-group-cell" colSpan={envs.length + 1}>
                        {group}
                      </th>
                    </tr>
                    {groupRows.map((r) => (
                      <tr key={r.label} className="links-row-tr">
                        <th scope="row" className="links-cell-label">
                          <span className="links-label-text">{r.label}</span>
                          {r.hint && (
                            <span className="links-hint muted">{r.hint}</span>
                          )}
                        </th>
                        {r.urls.map((url, i) => (
                          <td key={envs[i].key} className="links-cell">
                            {url ? (
                              <LinkCell
                                url={url}
                                label={`${r.label} — ${envs[i].label}`}
                              />
                            ) : (
                              <span className="links-empty" aria-hidden="true">
                                –
                              </span>
                            )}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
