import { tint } from '../../utils/colors'

/**
 * HTML documents for the sandboxed template previews. The CSS approximates
 * the schedule board (Segoe UI, 12px, URS class names from the Microsoft
 * samples); the product's own stylesheet is not available outside the board.
 * Font Awesome 4 is not loaded — common icons get stand-in characters.
 */

const BASE_CSS = `
*{box-sizing:border-box}
html,body{margin:0;padding:0;background:#fff;color:#323130;font:12px/1.35 'Segoe UI',system-ui,-apple-system,sans-serif}
b,strong,.bold{font-weight:600}
.fa{display:inline-block;font-style:normal;font-weight:normal;line-height:1;min-width:1em;text-align:center}
.fa::before{content:'\\25A0'}
.fa-star::before{content:'\\2605'}.fa-star-o::before{content:'\\2606'}.fa-check::before{content:'\\2713'}
.fa-times::before{content:'\\2715'}.fa-circle::before{content:'\\25CF'}.fa-circle-o::before{content:'\\25CB'}
.fa-clock-o::before{content:'\\25F7'}.fa-wrench::before{content:'\\2692'}.fa-warning::before,.fa-exclamation-triangle::before{content:'\\26A0'}
.fa-euro::before,.fa-eur::before{content:'\\20AC'}.fa-usd::before,.fa-dollar::before{content:'$'}.fa-gbp::before{content:'\\00A3'}
.fa-users::before{content:'\\2687'}.fa-user::before{content:'\\263A'}.fa-phone::before{content:'\\260E'}
.fa-map-marker::before{content:'\\2316'}.fa-flag::before{content:'\\2691'}.fa-info-circle::before{content:'\\24D8'}
`

const doc = (css: string, body: string) =>
  `<!doctype html><html><head><meta charset="utf-8"><style>${BASE_CSS}${css}</style></head><body>${body}</body></html>`

// ---------------------------------------------------------------------------
// Booking tile in the hourly view
// ---------------------------------------------------------------------------

export const LANE_HOUR_PX = 100
export const LANE_START_HOUR = 8
export const LANE_HOURS = 6
const RES_COL = 170

const LANE_CSS = `
body{padding:8px}
.lane{border:1px solid #e1dfdd;width:${RES_COL + LANE_HOURS * LANE_HOUR_PX}px}
.lane__head,.lane__row{display:flex}
.lane__head{height:24px;border-bottom:1px solid #e1dfdd;background:#faf9f8;color:#605e5c}
.lane__corner,.lane__res{width:${RES_COL}px;flex-shrink:0;border-right:1px solid #e1dfdd}
.lane__res{display:flex;align-items:center;gap:6px;padding:0 8px;font-weight:600;overflow:hidden;white-space:nowrap}
.lane__avatar{width:24px;height:24px;border-radius:50%;flex-shrink:0;background:radial-gradient(circle at 50% 36%,#fff 0 18%,transparent 19%),radial-gradient(ellipse at 50% 100%,#fff 0 38%,transparent 39%),#c8c6c4}
.lane__ruler{display:flex}
.lane__hour{width:${LANE_HOUR_PX}px;padding:4px 6px;border-right:1px solid #edebe9}
.lane__track{position:relative;flex:1;background:repeating-linear-gradient(90deg,#fff 0 ${LANE_HOUR_PX / 2 - 1}px,#f3f2f1 ${LANE_HOUR_PX / 2 - 1}px ${LANE_HOUR_PX / 2}px)}
.booking{position:absolute;top:3px;bottom:3px;border-radius:2px;overflow:hidden;padding:3px 6px 3px 9px;border:1px solid rgba(0,0,0,.08)}
.booking__bar{position:absolute;left:0;top:0;bottom:0;width:4px}
.booking--open{overflow:visible;z-index:1}
`

export function bookingLaneDoc(opts: {
  html: string
  rowHeight: number
  durationMinutes: number
  statusColor: string
  clip: boolean
}): string {
  const left = LANE_HOUR_PX / 2
  const width = Math.max(24, (opts.durationMinutes / 60) * LANE_HOUR_PX)
  const hours = Array.from({ length: LANE_HOURS }, (_, i) => `<div class="lane__hour">${String(LANE_START_HOUR + i).padStart(2, '0')}:00</div>`).join('')
  const style = `.booking{left:${left}px;width:${width}px;background:${tint(opts.statusColor, 0.75)}}.booking__bar{background:${opts.statusColor}}.lane__row{height:${opts.rowHeight}px}`
  return doc(
    LANE_CSS + style,
    `<div class="lane">
      <div class="lane__head"><div class="lane__corner"></div><div class="lane__ruler">${hours}</div></div>
      <div class="lane__row">
        <div class="lane__res"><span class="lane__avatar"></span>Mara Lindqvist</div>
        <div class="lane__track"><div class="booking${opts.clip ? '' : ' booking--open'}"><div class="booking__bar"></div>${opts.html}</div></div>
      </div>
    </div>`,
  )
}

/** Frame height for the lane: padding, ruler, row, borders. */
export const laneHeight = (rowHeight: number, clip: boolean) => 16 + 24 + rowHeight + 4 + (clip ? 0 : 60)

// ---------------------------------------------------------------------------
// Resource cells
// ---------------------------------------------------------------------------

export const CELL_WIDTH = 280

const CELL_CSS = `
.cellrow{display:flex;border-bottom:1px solid #edebe9}
.cellrow__cell{width:${CELL_WIDTH}px;flex-shrink:0;border-right:1px solid #e1dfdd;overflow:hidden;position:relative}
.cellrow__track{flex:1;position:relative;background:repeating-linear-gradient(90deg,#fff 0 49px,#f3f2f1 49px 50px)}
.cellrow__state{position:absolute;left:10px;top:50%;transform:translateY(-50%);font-size:11px;color:#8a8886}
.resource-card-wrapper{display:flex;align-items:center;gap:8px;height:100%;padding:4px 8px;position:relative;background:#fff}
.resource-cell-selected{background:#deecf9}
.resource-unavailable{opacity:.45}
.availability-match{box-shadow:inset 3px 0 0 #107c10}
.resource-image{width:32px;height:32px;border-radius:50%;object-fit:cover;flex-shrink:0;background:#c8c6c4}
.unknown-resource{background:radial-gradient(circle at 50% 36%,#fff 0 18%,transparent 19%),radial-gradient(ellipse at 50% 100%,#fff 0 38%,transparent 39%),#c8c6c4}
.resource-info{min-width:0;flex:1;display:flex;flex-direction:column;gap:2px}
.primary-text{font-weight:600;color:#323130}
.secondary-text{color:#605e5c}
.secondary-text>div{display:inline-flex;align-items:center;gap:3px;margin-right:10px}
.ellipsis{overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
.fo-sch-clock::before{content:'\\25F7'}
.resource-map-pin{position:absolute;right:8px;bottom:8px;width:10px;height:10px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:#0078d4}
`

export function cellRowsDoc(rows: { html: string; state: string }[], rowHeight: number): string {
  return doc(
    CELL_CSS + `.cellrow{height:${rowHeight}px}`,
    rows
      .map(
        (r) =>
          `<div class="cellrow"><div class="cellrow__cell">${r.html}</div><div class="cellrow__track"><span class="cellrow__state">${r.state}</span></div></div>`,
      )
      .join(''),
  )
}

export const cellRowsHeight = (rows: number, rowHeight: number) => rows * (rowHeight + 1) + 2

// ---------------------------------------------------------------------------
// Booking alert in the details pane
// ---------------------------------------------------------------------------

const ALERT_CSS = `
body{padding:8px}
.pane{width:340px;border:1px solid #e1dfdd;background:#faf9f8}
.pane__title{padding:8px 12px;font-weight:600;font-size:13px;border-bottom:1px solid #e1dfdd;background:#fff}
.alert{display:flex;gap:10px;margin:10px;padding:10px;background:#fff;border:1px solid #edebe9;border-left:3px solid #d83b01}
.alert__icon{width:18px;height:18px;border-radius:50%;background:#d83b01;color:#fff;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0}
.alert__body{min-width:0;overflow-wrap:anywhere}
`

export function alertDoc(html: string): string {
  return doc(
    ALERT_CSS,
    `<div class="pane"><div class="pane__title">Buchungswarnungen</div><div class="alert"><div class="alert__icon">!</div><div class="alert__body">${html}</div></div></div>`,
  )
}
