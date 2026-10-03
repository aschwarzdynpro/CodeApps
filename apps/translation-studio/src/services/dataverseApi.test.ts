import { describe, expect, it } from 'vitest'
import { DataverseError, mayTryNextRoute, routeUnavailable } from './dataverseApi'

describe('route fallback', () => {
  const unavailable = new DataverseError("No HTTP resource was found that matches the request URI 'https://x/api/data/v9.2/ExportTranslation'.")
  const timeout = new DataverseError('The request timed out after 180 seconds.')
  const privilege = new DataverseError('Principal user is missing prvImportCustomization privilege.')

  it('recognises a route that does not exist', () => {
    expect(routeUnavailable(unavailable.message)).toBe(true)
    expect(routeUnavailable("Resource not found for the segment 'solutions'.")).toBe(true)
    expect(routeUnavailable('Request failed with status code 404')).toBe(true)
    expect(routeUnavailable(timeout.message)).toBe(false)
    expect(routeUnavailable('The import file is invalid.')).toBe(false)
  })

  it('read-only actions try the next route on any error but a privilege error', () => {
    expect(mayTryNextRoute({}, timeout)).toBe(true)
    expect(mayTryNextRoute({}, unavailable)).toBe(true)
    expect(mayTryNextRoute({}, privilege)).toBe(false)
  })

  it('actions with side effects only move on when the route was not there', () => {
    // A timeout may mean the import is running — a second route would import twice.
    expect(mayTryNextRoute({ sideEffects: true }, timeout)).toBe(false)
    expect(mayTryNextRoute({ sideEffects: true }, new Error('Failed to fetch'))).toBe(false)
    expect(mayTryNextRoute({ sideEffects: true }, unavailable)).toBe(true)
    expect(mayTryNextRoute({ sideEffects: true }, privilege)).toBe(false)
  })
})
