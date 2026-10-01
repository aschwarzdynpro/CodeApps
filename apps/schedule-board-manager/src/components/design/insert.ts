import { createContext, useContext } from 'react'

/** Inserts text at the cursor of the template editor. */
export type Insert = (text: string) => void

/** Null while the template is read-only (inherited or product default). */
export const InsertContext = createContext<Insert | null>(null)

export const useInsert = () => useContext(InsertContext)
