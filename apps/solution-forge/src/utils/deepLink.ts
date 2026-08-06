/**
 * Shareable links into a workspace of the console.
 *
 * WHY IT LOOKS LIKE THIS. The app runs inside the Power Apps player's iframe,
 * so the browser address bar belongs to the player, not to us — `pushState`
 * here would change an URL nobody sees or copies. A link therefore cannot be
 * *read off* the address bar; it has to be *composed* by the app and put on
 * the clipboard. Reading one back is the supported direction: the player hands
 * the play URL's query string to the app as `IAppContext.queryParams`.
 *
 * Scope is deliberately one parameter: which workspace to open. Per-workspace
 * selections (environment, table, query) are not encoded — see the roadmap.
 */

/** Query parameter carrying the workspace key. Short, it ends up in a URL. */
export const DEEP_LINK_PARAM = 'p'

/**
 * Player host for the commercial cloud. Sovereign clouds (GCC, China, ...)
 * serve apps from a different host; the app context reports the environment
 * and app id but NOT the host it was loaded from, and the parent frame's URL
 * is cross-origin, so there is nothing to derive it from. If the console ever
 * ships into such a tenant, this is the line to change.
 */
const PLAYER_ORIGIN = 'https://apps.powerapps.com'

/**
 * The workspace a deeplink asks for, or null.
 *
 * `knownKeys` is passed in rather than imported so this stays free of the
 * app shell. Matching is case-insensitive and returns the CANONICAL key —
 * links get retyped and lower-cased by chat clients and ticket systems, and
 * failing on that would be gratuitous.
 */
export function deepLinkTarget(
  params: Record<string, string> | null | undefined,
  knownKeys: readonly string[],
): string | null {
  const raw = params?.[DEEP_LINK_PARAM]
  if (typeof raw !== 'string') return null
  const wanted = raw.trim().toLowerCase()
  if (!wanted) return null
  return knownKeys.find((key) => key.toLowerCase() === wanted) ?? null
}

/**
 * The link to share for a workspace. Returns '' when the ids are missing —
 * standalone against mock data there is no app to link to, and a URL with
 * `undefined` in it is worse than no button.
 */
export function buildDeepLink(
  appId: string | null | undefined,
  environmentId: string | null | undefined,
  tabKey: string,
): string {
  if (!appId || !environmentId || !tabKey) return ''
  return (
    `${PLAYER_ORIGIN}/play/e/${encodeURIComponent(environmentId)}` +
    `/app/${encodeURIComponent(appId)}` +
    `?${DEEP_LINK_PARAM}=${encodeURIComponent(tabKey)}`
  )
}
