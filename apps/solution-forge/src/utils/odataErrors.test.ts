import { describe, expect, it } from 'vitest'
import {
  OdataQueryError,
  describeOdataFault,
  nearestEntitySet,
  unwrapMessage,
} from './odataErrors'

describe('unwrapMessage', () => {
  it('reads the connector error shape', () => {
    expect(unwrapMessage({ error: { message: 'boom' } })).toBe('boom')
  })

  it('digs the message out of an embedded OData payload', () => {
    const err = new Error(
      '{"error":{"code":"0x0","message":"Could not find a property named \'foo\'"}}',
    )
    expect(unwrapMessage(err)).toBe("Could not find a property named 'foo'")
  })

  it('passes a plain message through', () => {
    expect(unwrapMessage(new Error('plain'))).toBe('plain')
    expect(unwrapMessage('text')).toBe('text')
  })
})

describe('nearestEntitySet', () => {
  it('suggests a close entity set', () => {
    expect(nearestEntitySet('webresources', ['webresourceset', 'accounts'])).toBe(
      'webresourceset',
    )
  })

  it('gives up when nothing is close', () => {
    expect(nearestEntitySet('zzzzzzzz', ['accounts', 'contacts'])).toBeNull()
  })
})

describe('describeOdataFault', () => {
  it('explains a missing property and points at _x_value', () => {
    const fault = describeOdataFault(
      new Error("Could not find a property named 'primarycontactid'"),
    )
    expect(fault.hint).toContain('_primarycontactid_value')
  })

  it('explains a wrong entity-set name and suggests a near match', () => {
    const fault = describeOdataFault(
      new Error('No HTTP resource was found that matches the request URI'),
      { entitySet: 'webresources', knownEntitySets: ['webresourceset'] },
    )
    expect(fault.hint).toContain('webresourceset')
  })

  it('names the service principal on a privilege fault', () => {
    const fault = describeOdataFault(
      new Error('Principal user is missing prvReadPluginTraceLog privilege'),
      { entitySet: 'plugintracelogs', envLabel: 'PROD' },
    )
    expect(fault.hint).toContain('service principal')
    expect(fault.hint).toContain('plugintracelogs')
    expect(fault.hint).toContain('PROD')
  })

  it('explains a format exception', () => {
    const fault = describeOdataFault(new Error('error 0x80040203'))
    expect(fault.hint).toContain('wrong type')
  })

  it('leaves an unknown fault without a hint but keeps the message', () => {
    const fault = describeOdataFault(new Error('something odd happened'))
    expect(fault.message).toBe('something odd happened')
    expect(fault.hint).toBeNull()
  })
})

describe('OdataQueryError', () => {
  it('carries the hint alongside the message', () => {
    const err = new OdataQueryError('bad', 'try this')
    expect(err).toBeInstanceOf(Error)
    expect(err.message).toBe('bad')
    expect(err.hint).toBe('try this')
    expect(new OdataQueryError('bad').hint).toBeNull()
  })
})
