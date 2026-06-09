export interface Crumb {
  label: string
  onClick?: () => void
}

export function Breadcrumb({ items }: { items: Crumb[] }) {
  return (
    <nav className="breadcrumb">
      {items.map((c, i) => {
        const last = i === items.length - 1
        return (
          <span key={i} className="crumb">
            {c.onClick && !last ? (
              <button className="crumb-link" onClick={c.onClick}>
                {c.label}
              </button>
            ) : (
              <span className={last ? 'crumb-current' : ''}>{c.label}</span>
            )}
            {!last && <span className="crumb-sep">›</span>}
          </span>
        )
      })}
    </nav>
  )
}
