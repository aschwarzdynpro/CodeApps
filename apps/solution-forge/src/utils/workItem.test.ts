import { describe, expect, it } from 'vitest'
import { htmlToPlainText, workItemInfoFrom, workItemPickFrom } from './workItem'

describe('workItemInfoFrom', () => {
  it('returns null for a missing row', () => {
    expect(workItemInfoFrom('4711', undefined, null)).toBeNull()
    expect(workItemInfoFrom('4711', null, 'https://x')).toBeNull()
  })

  it('maps the System.* fields (incl. description) and keeps the url', () => {
    const wi = workItemInfoFrom(
      '4711',
      {
        System_WorkItemType: 'Bug',
        System_Title: 'Login broken',
        System_State: 'Active',
        System_AssignedTo: 'Marie Curie',
        System_Description: '<div>Users cannot sign in.</div>',
      },
      'https://dev.azure.com/acme/proj/_workitems/edit/4711',
    )
    expect(wi).toEqual({
      id: '4711',
      type: 'Bug',
      title: 'Login broken',
      state: 'Active',
      assignedTo: 'Marie Curie',
      description: 'Users cannot sign in.',
      url: 'https://dev.azure.com/acme/proj/_workitems/edit/4711',
    })
  })

  it('falls back for blank fields, blank assignee → null, empty description', () => {
    expect(workItemInfoFrom('99', { System_State: '  ' }, null)).toEqual({
      id: '99',
      type: 'Work item',
      title: '#99',
      state: 'Unknown',
      assignedTo: null,
      description: '',
      url: null,
    })
  })

  it('trims whitespace on the fields it keeps', () => {
    const wi = workItemInfoFrom(
      '7',
      { System_Title: '  Padded  ', System_AssignedTo: '  Bob  ' },
      null,
    )
    expect(wi?.title).toBe('Padded')
    expect(wi?.assignedTo).toBe('Bob')
  })

  it('resolves dotted System.* keys (connector variant)', () => {
    const wi = workItemInfoFrom(
      '6',
      {
        'System.WorkItemType': 'User Story',
        'System.Title': 'Lead Scanner einrichten',
        'System.State': 'New',
        'System.AssignedTo': 'Andy Schwarz',
        'System.Description': '<div>Viel Text<br>Noch mehr Text</div>',
      },
      null,
    )
    expect(wi).toMatchObject({
      type: 'User Story',
      title: 'Lead Scanner einrichten',
      state: 'New',
      assignedTo: 'Andy Schwarz',
      description: 'Viel Text Noch mehr Text',
    })
  })

  it('digs into a nested fields object and an identity-object assignee', () => {
    const wi = workItemInfoFrom(
      '6',
      {
        fields: {
          'System.Title': 'Nested title',
          'System.State': 'Active',
          'System.AssignedTo': { displayName: 'Marie Curie', uniqueName: 'm@x' },
        },
      },
      null,
    )
    expect(wi).toMatchObject({
      title: 'Nested title',
      state: 'Active',
      assignedTo: 'Marie Curie',
    })
  })

  it('resolves friendly lower-case keys', () => {
    const wi = workItemInfoFrom('9', { title: 'Friendly', state: 'Closed' }, null)
    expect(wi?.title).toBe('Friendly')
    expect(wi?.state).toBe('Closed')
  })
})

describe('workItemPickFrom', () => {
  it('reads the id from the row and resolves title/type/state/assignee', () => {
    expect(
      workItemPickFrom({
        'System.Id': 6,
        'System.Title': 'Lead Scanner',
        'System.WorkItemType': 'User Story',
        'System.State': 'New',
        'System.AssignedTo': { displayName: 'Andy Schwarz' },
      }),
    ).toEqual({
      id: '6',
      title: 'Lead Scanner',
      type: 'User Story',
      state: 'New',
      assignedTo: 'Andy Schwarz',
    })
  })
  it('returns null without an id', () => {
    expect(workItemPickFrom({ 'System.Title': 'no id' })).toBeNull()
    expect(workItemPickFrom(undefined)).toBeNull()
  })
})

describe('htmlToPlainText', () => {
  it('strips tags, decodes entities and collapses whitespace', () => {
    expect(
      htmlToPlainText('<p>Line&nbsp;one</p><p>Line two &amp; more</p>'),
    ).toBe('Line one Line two & more')
  })
  it('turns <br> into spaces', () => {
    expect(htmlToPlainText('a<br>b<br/>c')).toBe('a b c')
  })
  it('returns empty for empty input', () => {
    expect(htmlToPlainText('')).toBe('')
  })
})
