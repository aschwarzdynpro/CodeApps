import type { DaySegment } from '../types/calendar'
import { formatTime } from './dates'

/** `08:00–12:00`; a segment ending at midnight shows `24:00`. */
export const spanLabel = (s: Pick<DaySegment, 'startMin' | 'endMin'>): string => `${formatTime(s.startMin)}–${s.endMin >= 1440 ? '24:00' : formatTime(s.endMin)}`
