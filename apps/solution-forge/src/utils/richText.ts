import DOMPurify from 'dompurify'
import { marked } from 'marked'

// Sanitized links open in a new tab, safely (noopener/noreferrer).
DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  if (node instanceof Element && node.tagName === 'A') {
    node.setAttribute('target', '_blank')
    node.setAttribute('rel', 'noopener noreferrer')
  }
})

/**
 * Sanitize an Azure DevOps rich-text (HTML) value for safe rendering via
 * `dangerouslySetInnerHTML`. Keeps the standard formatting tags (bold, italic,
 * lists, links, headings, tables, …) and strips anything unsafe (scripts, event
 * handlers, javascript: URLs, styles). Returns '' for empty input.
 */
export function sanitizeHtml(html: string): string {
  if (!html || !html.trim()) return ''
  return DOMPurify.sanitize(html, { USE_PROFILES: { html: true } })
}

/**
 * Render an Azure DevOps work-item description to safe HTML. Descriptions can be
 * **Markdown** (newer Markdown fields) OR **rich text (HTML)** depending on the
 * field/process — `marked` converts the Markdown and passes any embedded HTML
 * through, then {@link sanitizeHtml} strips anything unsafe. GFM + single-newline
 * line breaks match how DevOps renders it. Returns '' for empty input.
 */
export function renderWorkItemDescription(text: string): string {
  if (!text || !text.trim()) return ''
  const html = marked.parse(text, { gfm: true, breaks: true, async: false })
  return sanitizeHtml(html)
}
