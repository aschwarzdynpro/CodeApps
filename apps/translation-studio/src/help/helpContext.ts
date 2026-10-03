import { createContext, useContext } from 'react'

/** Opens the help panel, optionally at a section id from `HELP_SECTIONS`. */
export type OpenHelp = (sectionId?: string) => void

export const HelpContext = createContext<OpenHelp>(() => {})

export const useHelp = () => useContext(HelpContext)
