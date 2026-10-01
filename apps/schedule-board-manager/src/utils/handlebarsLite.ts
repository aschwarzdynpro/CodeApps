/**
 * A small Handlebars interpreter for previewing resource cell templates.
 *
 * The schedule board renders `msdyn_resourcecelltemplate` with Handlebars and
 * a few URS helpers. The real library compiles templates with `new Function`,
 * which a Code App host may forbid, and it would happily run helpers we
 * don't know. This interpreter covers what the Microsoft samples use —
 * mustaches, comments, `#if`/`#unless`/`#each`/`#with`, `else` and
 * `else if`, subexpressions, partials — and reports everything else instead
 * of guessing.
 *
 * Only helpers documented by Microsoft are registered by the caller (see
 * `ursHelpers` in `cellTemplate.ts`); unknown helpers render empty and show
 * up in `issues`.
 */

export type Helper = (...args: unknown[]) => unknown

export interface RenderOptions {
  helpers?: Record<string, Helper>
  /** Known partials as finished HTML (`{{> name}}`). */
  partials?: Record<string, string>
}

export type RenderResult =
  | { ok: true; html: string; issues: string[] }
  | { ok: false; error: string }

export class TemplateSyntaxError extends Error {
  constructor(message: string, src: string, pos: number) {
    super(`${message} (Zeile ${lineOf(src, pos)})`)
    this.name = 'TemplateSyntaxError'
  }
}

function lineOf(src: string, pos: number): number {
  return src.slice(0, pos).split('\n').length
}

// ---------------------------------------------------------------------------
// Tokens
// ---------------------------------------------------------------------------

type Tok =
  | { t: 'text'; v: string }
  | { t: 'mustache'; body: string; raw: boolean; pos: number }
  | { t: 'open'; body: string; inverted: boolean; pos: number }
  | { t: 'else'; body: string; pos: number }
  | { t: 'close'; name: string; pos: number }
  | { t: 'partial'; body: string; pos: number }

function tokenize(src: string): Tok[] {
  const out: Tok[] = []
  let i = 0
  while (i < src.length) {
    const start = src.indexOf('{{', i)
    if (start < 0) {
      out.push({ t: 'text', v: src.slice(i) })
      break
    }
    if (start > i) out.push({ t: 'text', v: src.slice(i, start) })

    const longComment = src.startsWith('{{!--', start) ? 5 : src.startsWith('{{~!--', start) ? 6 : 0
    if (longComment) {
      const end = src.indexOf('--', start + longComment)
      const close = end < 0 ? -1 : src.indexOf('}}', end)
      if (close < 0) throw new TemplateSyntaxError('Kommentar „{{!--“ wird nicht geschlossen', src, start)
      i = close + 2
      continue
    }
    if (src.startsWith('{{{', start)) {
      const end = src.indexOf('}}}', start + 3)
      if (end < 0) throw new TemplateSyntaxError('„{{{“ ohne schließendes „}}}“', src, start)
      out.push({ t: 'mustache', body: src.slice(start + 3, end).trim(), raw: true, pos: start })
      i = end + 3
      continue
    }
    const end = src.indexOf('}}', start + 2)
    if (end < 0) throw new TemplateSyntaxError('„{{“ ohne schließendes „}}“', src, start)
    i = end + 2
    // Whitespace control (`{{~ … ~}}`) only trims text; the preview ignores it.
    const body = src
      .slice(start + 2, end)
      .replace(/^~/, '')
      .replace(/~$/, '')
      .trim()
    if (body === '') throw new TemplateSyntaxError('Leerer Ausdruck „{{}}“', src, start)
    const head = body[0]
    const rest = body.slice(1).trim()
    if (head === '!') continue
    if (head === '#') out.push({ t: 'open', body: rest, inverted: false, pos: start })
    else if (body === '^') out.push({ t: 'else', body: '', pos: start })
    else if (head === '^') out.push({ t: 'open', body: rest, inverted: true, pos: start })
    else if (head === '/') out.push({ t: 'close', name: rest, pos: start })
    else if (head === '>') out.push({ t: 'partial', body: rest, pos: start })
    else if (head === '&') out.push({ t: 'mustache', body: rest, raw: true, pos: start })
    else if (body === 'else' || body.startsWith('else ')) out.push({ t: 'else', body: body.slice(4).trim(), pos: start })
    else out.push({ t: 'mustache', body, raw: false, pos: start })
  }
  return out
}

// ---------------------------------------------------------------------------
// Expressions
// ---------------------------------------------------------------------------

type Expr =
  | { k: 'lit'; v: string | number | boolean | null | undefined }
  | { k: 'path'; v: string }
  | { k: 'sub'; call: Call }

interface Call {
  head: Expr
  params: Expr[]
  hash: Record<string, Expr>
}

function parseCall(text: string, src: string, pos: number): Call {
  let i = 0
  const fail = (msg: string): never => {
    throw new TemplateSyntaxError(msg, src, pos)
  }
  const ws = () => {
    while (i < text.length && /\s/.test(text[i])) i++
  }

  const atom = (): Expr => {
    ws()
    const c = text[i]
    if (c === undefined) return fail(`Ausdruck „${text}“ ist unvollständig`)
    if (c === '(') {
      i++
      const call = callUntil(')')
      if (text[i] !== ')') fail(`„(“ ohne „)“ in „${text}“`)
      i++
      return { k: 'sub', call }
    }
    if (c === '"' || c === "'") {
      const end = text.indexOf(c, i + 1)
      if (end < 0) fail(`Zeichenkette ohne schließendes ${c} in „${text}“`)
      const v = text.slice(i + 1, end)
      i = end + 1
      return { k: 'lit', v }
    }
    const m = /^[^\s()=]+/.exec(text.slice(i))
    if (!m) return fail(`Unerwartetes Zeichen „${c}“ in „${text}“`)
    i += m[0].length
    const word = m[0]
    if (word === 'true') return { k: 'lit', v: true }
    if (word === 'false') return { k: 'lit', v: false }
    if (word === 'null') return { k: 'lit', v: null }
    if (word === 'undefined') return { k: 'lit', v: undefined }
    if (/^-?\d+(\.\d+)?$/.test(word)) return { k: 'lit', v: Number(word) }
    return { k: 'path', v: word }
  }

  const callUntil = (stop?: string): Call => {
    const head = atom()
    const params: Expr[] = []
    const hash: Record<string, Expr> = {}
    for (;;) {
      ws()
      if (i >= text.length || (stop && text[i] === stop)) break
      const before = i
      const a = atom()
      ws()
      if (text[i] === '=' && a.k === 'path') {
        i++
        hash[a.v] = atom()
      } else {
        params.push(a)
      }
      if (i === before) fail(`Ausdruck „${text}“ nicht lesbar`)
    }
    return { head, params, hash }
  }

  const call = callUntil()
  ws()
  if (i < text.length) fail(`Unerwartetes „${text.slice(i)}“`)
  return call
}

// ---------------------------------------------------------------------------
// AST
// ---------------------------------------------------------------------------

type Node =
  | { k: 'text'; v: string }
  | { k: 'mustache'; call: Call; raw: boolean }
  | { k: 'block'; name: string; call: Call; inverted: boolean; body: Node[]; inverse: Node[]; pos: number }
  | { k: 'partial'; name: string }

function parse(src: string): Node[] {
  const toks = tokenize(src)
  let i = 0

  // Parses until a close/else that belongs to the caller.
  const nodes = (): Node[] => {
    const out: Node[] = []
    while (i < toks.length) {
      const tok = toks[i]
      if (tok.t === 'close' || tok.t === 'else') return out
      i++
      if (tok.t === 'text') out.push({ k: 'text', v: tok.v })
      else if (tok.t === 'mustache') out.push({ k: 'mustache', call: parseCall(tok.body, src, tok.pos), raw: tok.raw })
      else if (tok.t === 'partial') {
        const call = parseCall(tok.body, src, tok.pos)
        if (call.head.k !== 'path') throw new TemplateSyntaxError(`Partial „{{> ${tok.body}}}“ braucht einen Namen`, src, tok.pos)
        out.push({ k: 'partial', name: call.head.v })
      } else out.push(block(tok.body, tok.inverted, tok.pos, true))
    }
    return out
  }

  /** `ownsClose`: false for an `else if` chain link — the outer block consumes `{{/if}}`. */
  const block = (body: string, inverted: boolean, pos: number, ownsClose: boolean): Node => {
    const call = parseCall(body, src, pos)
    if (call.head.k !== 'path') throw new TemplateSyntaxError(`Block „{{#${body}}}“ braucht einen Namen`, src, pos)
    const name = call.head.v
    const main = nodes()
    let inverse: Node[] = []
    const next = toks[i]
    if (next?.t === 'else') {
      i++
      if (next.body) {
        // `{{else if x}}` is a nested block that shares this block's close tag.
        inverse = [block(next.body, false, next.pos, false)]
      } else {
        inverse = nodes()
      }
    }
    if (ownsClose) {
      const close = toks[i]
      if (close?.t !== 'close') throw new TemplateSyntaxError(`Block „{{#${name}}}“ wird nicht geschlossen`, src, pos)
      if (close.name !== name) {
        throw new TemplateSyntaxError(`„{{/${close.name}}}“ schließt „{{#${name}}}“ — erwartet „{{/${name}}}“`, src, close.pos)
      }
      i++
    }
    return { k: 'block', name, call, inverted, body: main, inverse, pos }
  }

  const out = nodes()
  const stray = toks[i]
  if (stray?.t === 'close') throw new TemplateSyntaxError(`„{{/${stray.name}}}“ ohne passenden Block`, src, stray.pos)
  if (stray?.t === 'else') throw new TemplateSyntaxError('„{{else}}“ außerhalb eines Blocks', src, stray.pos)
  return out
}

// ---------------------------------------------------------------------------
// Evaluation
// ---------------------------------------------------------------------------

const ESCAPE: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#x27;',
  '`': '&#x60;',
  '=': '&#x3D;',
}

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"'`=]/g, (c) => ESCAPE[c])
}

/** Handlebars truthiness: false, null, undefined, '', 0 and [] are falsy. */
export function truthy(v: unknown): boolean {
  if (Array.isArray(v)) return v.length > 0
  return Boolean(v)
}

function toText(v: unknown): string {
  if (v === null || v === undefined) return ''
  return String(v)
}

interface Frame {
  ctx: unknown
  data: Record<string, unknown>
}

const BLOCK_BUILTINS = new Set(['if', 'unless', 'each', 'with'])

class Renderer {
  issues = new Set<string>()
  private readonly helpers: Record<string, Helper>
  private readonly partials: Record<string, string>

  constructor(options: RenderOptions) {
    this.helpers = {
      lookup: (obj, key) => (obj !== null && typeof obj === 'object' ? (obj as Record<string, unknown>)[String(key)] : undefined),
      log: () => '',
      ...options.helpers,
    }
    this.partials = options.partials ?? {}
  }

  render(nodes: Node[], stack: Frame[]): string {
    return nodes.map((n) => this.node(n, stack)).join('')
  }

  private node(n: Node, stack: Frame[]): string {
    switch (n.k) {
      case 'text':
        return n.v
      case 'mustache': {
        const v = this.call(n.call, stack, false)
        return n.raw ? toText(v) : escapeHtml(toText(v))
      }
      case 'partial':
        if (n.name in this.partials) return this.partials[n.name]
        this.issues.add(`Partial „${n.name}“ ist der Vorschau unbekannt — bleibt leer.`)
        return ''
      case 'block':
        return this.block(n, stack)
    }
  }

  private block(n: Extract<Node, { k: 'block' }>, stack: Frame[]): string {
    const arg = () => (n.call.params[0] ? this.expr(n.call.params[0], stack) : undefined)
    const frame = stack[stack.length - 1]
    if (n.inverted) {
      const v = BLOCK_BUILTINS.has(n.name) ? arg() : this.call(n.call, stack, true)
      return truthy(v) ? this.render(n.inverse, stack) : this.render(n.body, stack)
    }
    switch (n.name) {
      case 'if':
        return truthy(arg()) ? this.render(n.body, stack) : this.render(n.inverse, stack)
      case 'unless':
        return truthy(arg()) ? this.render(n.inverse, stack) : this.render(n.body, stack)
      case 'with': {
        const v = arg()
        return truthy(v) ? this.render(n.body, [...stack, { ctx: v, data: frame.data }]) : this.render(n.inverse, stack)
      }
      case 'each':
        return this.each(arg(), n, stack)
    }
    if (n.name in this.helpers) {
      this.issues.add(`Block-Helper „${n.name}“ wird in der Vorschau nicht nachgebildet — bleibt leer.`)
      return ''
    }
    if (n.call.params.length > 0) {
      this.issues.add(`Unbekannter Block-Helper „${n.name}“ — bleibt leer.`)
      return ''
    }
    // Mustache sections: `{{#value}}` iterates arrays, enters objects, tests the rest.
    const v = this.lookup(n.name, stack)
    if (Array.isArray(v)) return this.each(v, n, stack)
    if (!truthy(v)) return this.render(n.inverse, stack)
    if (v !== null && typeof v === 'object') return this.render(n.body, [...stack, { ctx: v, data: frame.data }])
    return this.render(n.body, stack)
  }

  private each(v: unknown, n: Extract<Node, { k: 'block' }>, stack: Frame[]): string {
    const frame = stack[stack.length - 1]
    const entries: [string | number, unknown][] = Array.isArray(v)
      ? v.map((x, idx) => [idx, x])
      : v !== null && typeof v === 'object'
        ? Object.entries(v as Record<string, unknown>)
        : []
    if (entries.length === 0) return this.render(n.inverse, stack)
    return entries
      .map(([key, item], idx) =>
        this.render(n.body, [
          ...stack,
          {
            ctx: item,
            data: { ...frame.data, index: idx, key, first: idx === 0, last: idx === entries.length - 1 },
          },
        ]),
      )
      .join('')
  }

  /** `asBlockValue`: a section head without params is a value, not a helper call. */
  private call(call: Call, stack: Frame[], asBlockValue: boolean): unknown {
    const { head, params } = call
    if (head.k === 'path' && head.v in this.helpers) {
      const fn = this.helpers[head.v]
      return fn(...params.map((p) => this.expr(p, stack)))
    }
    if (params.length > 0 && head.k === 'path') {
      this.issues.add(`Unbekannter Helper „${head.v}“ — bleibt leer.`)
      return undefined
    }
    if (asBlockValue && head.k === 'path') return this.lookup(head.v, stack)
    return this.expr(head, stack)
  }

  private expr(e: Expr, stack: Frame[]): unknown {
    if (e.k === 'lit') return e.v
    if (e.k === 'sub') return this.call(e.call, stack, false)
    if (e.v in this.helpers) return this.helpers[e.v]()
    return this.lookup(e.v, stack)
  }

  private lookup(path: string, stack: Frame[]): unknown {
    let depth = stack.length - 1
    let p = path
    while (p.startsWith('../')) {
      depth = Math.max(0, depth - 1)
      p = p.slice(3)
    }
    const frame = stack[depth]
    if (p.startsWith('@')) {
      const [name, ...rest] = p.slice(1).split(/[./]/)
      const base = name === 'root' ? stack[0].ctx : frame.data[name]
      return walk(base, rest)
    }
    if (p === 'this' || p === '.') return frame.ctx
    if (p.startsWith('this.') || p.startsWith('this/')) p = p.slice(5)
    else if (p.startsWith('./')) p = p.slice(2)
    return walk(frame.ctx, p.split(/[./]/))
  }
}

function walk(base: unknown, segments: string[]): unknown {
  let cur = base
  for (const seg of segments) {
    if (seg === '') continue
    if (cur === null || cur === undefined || typeof cur !== 'object') return undefined
    cur = (cur as Record<string, unknown>)[seg]
  }
  return cur
}

/** Renders `template` against `context`. Syntax errors come back as `ok: false`. */
export function renderTemplate(template: string, context: Record<string, unknown>, options: RenderOptions = {}): RenderResult {
  try {
    const ast = parse(template)
    const r = new Renderer(options)
    const html = r.render(ast, [{ ctx: context, data: { root: context } }])
    return { ok: true, html, issues: [...r.issues] }
  } catch (err) {
    if (err instanceof TemplateSyntaxError) return { ok: false, error: err.message }
    throw err
  }
}

/**
 * Root-context variables a template reads — for the sample-value editor.
 * Helper names, `this`, `@data` and paths inside `#each`/`#with` (which
 * refer to the item, not the resource) are left out. Static, so variables
 * in branches that don't render are listed too.
 */
export function templateVariables(template: string, helperNames: Iterable<string> = []): string[] {
  let ast: Node[]
  try {
    ast = parse(template)
  } catch {
    return []
  }
  const helpers = new Set(['lookup', 'log', ...helperNames])
  const found: string[] = []
  const add = (path: string) => {
    if (path === 'this' || path === '.' || path.startsWith('@') || path.startsWith('../') || helpers.has(path)) return
    const root = path.replace(/^this[./]/, '').split(/[./]/)[0]
    if (root && !found.includes(root)) found.push(root)
  }
  const expr = (e: Expr) => {
    if (e.k === 'path') add(e.v)
    else if (e.k === 'sub') call(e.call)
  }
  const call = (c: Call) => {
    if (c.head.k === 'path' && (helpers.has(c.head.v) || c.params.length > 0)) {
      c.params.forEach(expr)
      Object.values(c.hash).forEach(expr)
      return
    }
    expr(c.head)
  }
  const visit = (nodes: Node[]) => {
    for (const n of nodes) {
      if (n.k === 'mustache') call(n.call)
      else if (n.k === 'block') {
        if (BLOCK_BUILTINS.has(n.name)) n.call.params.forEach(expr)
        else call(n.call)
        // Inside each/with the context is the item — those paths aren't resource variables.
        if (n.name !== 'each' && n.name !== 'with') visit(n.body)
        visit(n.inverse)
      }
    }
  }
  visit(ast)
  return found
}
