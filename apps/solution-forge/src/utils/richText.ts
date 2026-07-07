import DOMPurify from 'dompurify'

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
