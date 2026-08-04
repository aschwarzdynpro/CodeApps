/**
 * Normalisation applied to a component's text definition BEFORE it is hashed
 * or diffed in the content-drift check.
 *
 * WHY THIS EXISTS. The same web resource can sit in two environments with
 * different line endings — verified at Schulz on 2026-08-04:
 * `sst_/Scripts/Form/booking.js` is stored with LF in INT-11 (`… 3b 0a 69 66`)
 * and with CRLF in PROD (`… 3b 0d 0a 69 66`), byte-identical otherwise.
 * Without normalisation every single line differs by a trailing CR, so the
 * side-by-side diff paints the whole file as changed and the hash over the
 * raw payload reports "content drift" for a file nobody touched.
 *
 * WHAT IS DELIBERATELY NOT NORMALISED: trailing spaces inside a line, blank
 * lines, indentation. Those are edits someone made, however cosmetic, and the
 * check exists to surface differences — only the two things that a save
 * round-trip changes on its own (byte-order mark, line endings) are folded
 * away.
 */

/** U+FEFF, written as an escape — a literal BOM in source is invisible. */
const BOM = /^\uFEFF/

/** Strip a leading BOM and fold CRLF / lone CR to LF. */
export function normalizeContent(text: string): string {
  return text.replace(BOM, '').replace(/\r\n?/g, '\n')
}

/**
 * Whether two definitions differ ONLY in the things {@link normalizeContent}
 * folds away. Not used to decide drift (a normalised match is simply not
 * drift) — it is here so a caller can say WHY two byte-different payloads are
 * treated as equal.
 */
export function differsOnlyInLineEndings(a: string, b: string): boolean {
  return a !== b && normalizeContent(a) === normalizeContent(b)
}
