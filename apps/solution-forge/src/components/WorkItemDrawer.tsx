import { useEffect, useMemo, useState } from 'react'
import type { WorkItemInfo } from '../types/solution'
import { renderWorkItemDescription } from '../utils/richText'
import { devOpsService } from '../services/devOpsService'
import { deriveStateVisual, type StateOrders } from '../utils/workItemProgress'

/**
 * Find the Azure DevOps attachment images in a sanitized description: their
 * exact `src` (for a literal string replace), the attachment GUID and the file
 * name. DevOps embeds description images as `…/_apis/wit/attachments/{guid}?…`,
 * which the browser can't load without the connector's auth — so we swap them
 * for connector-fetched data: URIs.
 */
function findAttachmentImages(
  html: string,
): { src: string; id: string; file: string }[] {
  const out: { src: string; id: string; file: string }[] = []
  const re = /<img\b[^>]*?\bsrc="([^"]*\/attachments\/[^"]+)"/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(html))) {
    const src = m[1]
    const id = /\/attachments\/([^/"?&]+)/i.exec(src)?.[1]
    if (!id) continue
    const file = decodeURIComponent(/[?&]fileName=([^&"]+)/i.exec(src)?.[1] ?? '')
    out.push({ src, id, file })
  }
  return out
}

interface Props {
  /** The Azure DevOps work item number this drawer is showing. */
  devOpsId: string
  /** Resolved work item, or null when it couldn't be read / doesn't exist. */
  workItem: WorkItemInfo | null
  loading: boolean
  /** Browser link into Azure DevOps, or null when org/project aren't configured. */
  url: string | null
  /** Ordered states per type — so the state badge colours by the real category,
   *  identical to the list row. */
  stateOrders?: StateOrders
  /** Re-fetch the work item from Azure DevOps (returns when done). */
  onRefresh: () => Promise<void> | void
  onClose: () => void
}

/**
 * Right slide-in drawer with the full Azure DevOps work item for one working
 * solution — opened from the row's DevOps cell, independent of the solution
 * detail pane (no need to expand the components). Shows type/title, state,
 * owner and the sanitized rich-text/Markdown description (embedded attachment
 * images are resolved through the connector into inline data: URIs), plus a
 * link into Azure DevOps and a refresh. Reuses the `.drawer*` styles.
 */
export function WorkItemDrawer({
  devOpsId,
  workItem,
  loading,
  url,
  stateOrders,
  onRefresh,
  onClose,
}: Props) {
  const [refreshing, setRefreshing] = useState(false)
  // Attachment src → data: URI, filled in as the connector resolves the images.
  const [imageMap, setImageMap] = useState<Record<string, string>>({})

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const baseHtml = useMemo(
    () => (workItem ? renderWorkItemDescription(workItem.description) : ''),
    [workItem],
  )

  // Resolve embedded DevOps attachment images to inline data: URIs so they
  // actually render (a plain <img> to the attachment endpoint 401s). Best
  // effort — anything that fails just stays a broken image, as before.
  useEffect(() => {
    const imgs = findAttachmentImages(baseHtml)
    if (imgs.length === 0) return
    let cancelled = false
    void Promise.all(
      imgs.map(async (img) => {
        const uri = await devOpsService.getAttachment(img.id, img.file)
        return uri ? ([img.src, uri] as const) : null
      }),
    ).then((pairs) => {
      if (cancelled) return
      const map: Record<string, string> = {}
      for (const p of pairs) if (p) map[p[0]] = p[1]
      if (Object.keys(map).length) setImageMap((prev) => ({ ...prev, ...map }))
    })
    return () => {
      cancelled = true
    }
  }, [baseHtml])

  // Swap the resolved attachment srcs in (literal replace — data: URIs and the
  // original URLs contain no HTML-special chars that would need escaping).
  const descHtml = useMemo(() => {
    let html = baseHtml
    for (const [src, uri] of Object.entries(imageMap)) {
      html = html.split(`src="${src}"`).join(`src="${uri}"`)
    }
    return html
  }, [baseHtml, imageMap])

  const refresh = () => {
    setRefreshing(true)
    Promise.resolve(onRefresh()).finally(() => setRefreshing(false))
  }

  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <aside
        className="drawer drawer--wide"
        role="dialog"
        aria-modal="true"
        aria-label={`Azure DevOps work item ${devOpsId}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="drawer-header">
          <div>
            <h2>Azure DevOps</h2>
            <p className="drawer-subtitle muted">#{devOpsId}</p>
          </div>
          <div className="drawer-header-actions">
            <button
              className="btn btn--small"
              onClick={refresh}
              disabled={refreshing}
              title="Reload this work item from Azure DevOps"
              aria-label="Reload work item"
            >
              <span className={refreshing ? 'wi-refresh-spin' : ''}>⟳</span>
            </button>
            <button className="modal-close" onClick={onClose} aria-label="Close">
              ✕
            </button>
          </div>
        </div>

        <div className="drawer-body wi-drawer-body">
          {loading && <div className="muted">Loading work item…</div>}
          {!loading && !workItem && (
            <div className="wi-drawer-notfound">
              <p className="muted">
                No details for work item #{devOpsId} — it may not exist in the
                configured project, or the connection can’t read it.
              </p>
              {url && (
                <a
                  className="btn btn--small wi-open-link"
                  href={url}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open #{devOpsId} in Azure DevOps ↗
                </a>
              )}
            </div>
          )}
          {!loading && workItem && (
            <>
              <div className="wi-drawer-title">
                <span className="wi-type muted">{workItem.type}</span>
                <span className="wi-drawer-name" title={workItem.title}>
                  {workItem.title}
                </span>
                {url && (
                  <a
                    className="btn btn--small wi-open-link"
                    href={url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open in Azure DevOps ↗
                  </a>
                )}
              </div>
              <dl className="wi-fields">
                <dt>Status</dt>
                <dd>
                  {(() => {
                    const v = deriveStateVisual(
                      workItem.state,
                      workItem.type,
                      stateOrders,
                    )
                    return (
                      <span
                        className="wi-state"
                        style={{ background: v.bg, color: v.fg }}
                      >
                        {workItem.state}
                      </span>
                    )
                  })()}
                </dd>
                <dt>Owner</dt>
                <dd>{workItem.assignedTo ?? 'Unassigned'}</dd>
              </dl>
              <section className="wi-desc">
                <div className="wi-desc-label">Description</div>
                {descHtml ? (
                  <div
                    className="wi-description wi-description--drawer"
                    // Sanitized DevOps rich text/Markdown (utils/richText); the
                    // only post-sanitize edit is swapping attachment image srcs
                    // for connector-fetched data: URIs.
                    dangerouslySetInnerHTML={{ __html: descHtml }}
                  />
                ) : (
                  <div className="wi-description muted">—</div>
                )}
              </section>
            </>
          )}
        </div>
      </aside>
    </div>
  )
}
