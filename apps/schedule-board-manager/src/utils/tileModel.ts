/**
 * Line model for `{field}` templates (booking tile, booking alert).
 *
 * Real templates are almost always a wrapper `<div>` with lines separated by
 * `<br>`, each line plain text, `{field}` placeholders and bold parts:
 *
 *   <div style="…">
 *       💼: <b>{…projectid.msdyn_subject}</b><br/>
 *       🕝: <b>{duration}</b><br/>
 *   </div>
 *
 * That shape is edited as lines instead of HTML. Everything the model can't
 * represent (other tags, nested divs, mixed bold tags) makes {@link parseTile}
 * return null and the designer stays in HTML mode. The source's layout —
 * wrapper tag with its attributes, bold tag, `<br>` spelling, one line per
 * row and its indent — is kept, so an edit shows up in the diff as just that.
 */

export type Segment = { kind: 'text'; text: string; bold: boolean } | { kind: 'field'; path: string; bold: boolean }

export interface TileLine {
  segments: Segment[]
}

export interface TileModel {
  /** Opening wrapper tag verbatim, e.g. `<div style="…">`; null without wrapper. */
  open: string | null
  lines: TileLine[]
  /** Opening bold tag verbatim (`<b>`, `<strong class="bold">`). */
  boldOpen: string
  /** `<br />` or `<br/>` as written in the source. */
  br: string
  /** Every line ends with a `<br>`, the last one included. */
  trailingBreak: boolean
  /** Lines on rows of their own, with this indent; null = all on one row. */
  indent: string | null
}

const TOKEN = /<\s*(\/?)\s*([a-z0-9]+)\b[^>]*>|[^<]+/gi
const FIELD = /\{([^{}]+)\}/g

const closeOf = (open: string) => `</${/^<\s*([a-z0-9]+)/i.exec(open)?.[1] ?? 'b'}>`

/** Text with `{field}` placeholders → segments. */
function splitText(text: string, bold: boolean): Segment[] {
  const out: Segment[] = []
  let last = 0
  for (const m of text.matchAll(FIELD)) {
    if (m.index! > last) out.push({ kind: 'text', text: text.slice(last, m.index), bold })
    out.push({ kind: 'field', path: m[1].trim(), bold })
    last = m.index! + m[0].length
  }
  if (last < text.length) out.push({ kind: 'text', text: text.slice(last), bold })
  return out
}

/** Drops layout whitespace at the start and end of a line, merges neighbours. */
function tidy(segments: Segment[]): Segment[] {
  const out: Segment[] = []
  for (const s of segments) {
    const prev = out[out.length - 1]
    if (s.kind === 'text' && prev?.kind === 'text' && prev.bold === s.bold) prev.text += s.text
    else out.push({ ...s })
  }
  // Only layout whitespace (indent around line breaks) — a typed space stays.
  const first = out[0]
  if (first?.kind === 'text') first.text = first.text.replace(/^\s*\n\s*/, '')
  const last = out[out.length - 1]
  if (last?.kind === 'text') last.text = last.text.replace(/\s*\n\s*$/, '')
  return out.filter((s) => s.kind === 'field' || s.text !== '').map((s) => (s.kind === 'text' ? { ...s, text: s.text.replace(/\s*\n\s*/g, ' ') } : s))
}

export function parseTile(html: string): TileModel | null {
  const src = html.trim()
  let inner = src
  let open: string | null = null
  const wrap = /^(<div\b[^>]*>)([\s\S]*)<\/div>$/i.exec(src)
  if (wrap) {
    open = wrap[1]
    inner = wrap[2]
  }

  let boldOpen: string | null = null
  let br: string | null = null
  let bold = false
  let current: Segment[] = []
  const raw: Segment[][] = []
  for (const m of inner.matchAll(TOKEN)) {
    if (m[2] === undefined) {
      current.push(...splitText(m[0], bold))
      continue
    }
    const tag = m[2].toLowerCase()
    const closing = m[1] === '/'
    if (tag === 'br') {
      if (closing) return null
      br ??= m[0]
      raw.push(current)
      current = []
    } else if (tag === 'b' || tag === 'strong') {
      if (closing) {
        if (!bold) return null
        bold = false
      } else {
        if (bold) return null
        if (boldOpen !== null && !sameTag(boldOpen, m[0])) return null
        boldOpen ??= m[0]
        bold = true
      }
    } else {
      return null
    }
  }
  if (bold) return null
  const trailingBreak = current.every((s) => s.kind === 'text' && s.text.trim() === '') && raw.length > 0
  if (!trailingBreak) raw.push(current)

  const indentMatch = /^\r?\n([ \t]*)\S/.exec(inner)
  return {
    open,
    lines: raw.map((segs) => ({ segments: tidy(segs) })),
    boldOpen: boldOpen ?? '<b>',
    br: br ?? '<br />',
    trailingBreak,
    indent: indentMatch ? indentMatch[1] : null,
  }
}

function sameTag(a: string, b: string): boolean {
  return a.replace(/\s+/g, ' ').toLowerCase() === b.replace(/\s+/g, ' ').toLowerCase()
}

function lineHtml(line: TileLine, boldOpen: string): string {
  let out = ''
  let inBold = false
  for (const s of line.segments) {
    if (s.bold !== inBold) {
      out += s.bold ? boldOpen : closeOf(boldOpen)
      inBold = s.bold
    }
    out += s.kind === 'field' ? `{${s.path}}` : s.text
  }
  if (inBold) out += closeOf(boldOpen)
  return out
}

export function serializeTile(m: TileModel): string {
  const lines = m.lines.map((l) => lineHtml(l, m.boldOpen))
  if (m.indent !== null) {
    const body = lines.map((l, i) => m.indent + l + (i < lines.length - 1 || m.trailingBreak ? m.br : '')).join('\n')
    return m.open ? `${m.open}\n${body}\n</div>` : body
  }
  const body = lines.join(m.br) + (m.trailingBreak ? m.br : '')
  return m.open ? `${m.open}${body}</div>` : body
}

const norm = (s: string) => s.replace(/\s+/g, ' ').replace(/>\s+/g, '>').replace(/\s+</g, '<').trim()

/** The template can be edited as lines without changing what the board renders. */
export function tileEditable(html: string): TileModel | null {
  const m = parseTile(html)
  return m && norm(serializeTile(m)) === norm(html) ? m : null
}

/** Readable name for a placeholder path: relationship and column names without prefixes. */
export function fieldLabel(path: string, specials: { path: string; label: string }[] = []): string {
  const special = specials.find((s) => s.path === path)
  if (special) return special.label
  const parts = path.split('.')
  // Relationship schema names end in the navigation property (…_WorkOrder).
  return parts.map((p, i) => (i < parts.length - 1 ? (p.split('_').pop() ?? p) : p)).join(' › ')
}

export const emptyLine = (): TileLine => ({ segments: [] })
