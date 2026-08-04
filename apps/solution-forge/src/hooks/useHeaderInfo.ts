/**
 * Lets the active workspace put an ⓘ next to the page title in the app shell.
 *
 * The title lives in `App.tsx`'s content header, the explanatory copy belongs
 * to the feature — and for a lazily loaded workspace the copy must not be
 * pulled into the main chunk. A module singleton bridges the two: the
 * workspace registers its content on mount, the shell renders whatever is
 * registered. Same subscribe/emit + `useSyncExternalStore` shape as
 * {@link file://./useFlowRun}.
 *
 * The registered content must have a STABLE identity — declare the JSX at
 * module scope in the workspace, not inline in the component body, or the
 * effect re-registers on every render.
 */
import { useEffect, useSyncExternalStore, type ReactNode } from 'react'

export interface HeaderInfo {
  /** Accessible name of the button, e.g. "About the Role Comparer". */
  label: string
  content: ReactNode
}

let current: HeaderInfo | null = null
const listeners = new Set<() => void>()

function emit() {
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

const snapshot = () => current

/** Read the currently registered header info (the shell). */
export function useHeaderInfo(): HeaderInfo | null {
  return useSyncExternalStore(subscribe, snapshot, snapshot)
}

/**
 * Register header info for as long as the calling component is mounted (a
 * workspace). Clears on unmount, so switching tabs never leaves a stale ⓘ.
 */
export function useProvideHeaderInfo(label: string, content: ReactNode): void {
  useEffect(() => {
    current = { label, content }
    emit()
    return () => {
      current = null
      emit()
    }
  }, [label, content])
}
