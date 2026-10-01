import { describe, expect, it } from 'vitest'
import { analyzeQuery, describeUsage, queryOutputs } from './queryAnalysis'

const QUERY = `<fetch mapping="logical" aggregate="true">
  <entity name="bookableresource">
    <attribute name="bookableresourceid" groupby="true" alias="bookableresourceid" />
    <link-entity name="bookableresourcecategoryassn" from="resource" to="bookableresourceid" ufx:if="$input/Roles/bag">
      <filter>
        <condition attribute="statecode" operator="eq" value="0" />
        <condition operator="in" attribute="resourcecategory">
          <ufx:apply select="$input/Roles/bag"><value><ufx:value select="@ufx-id" /></value></ufx:apply>
        </condition>
      </filter>
    </link-entity>
    <link-entity name="pro_planningteammember" from="pro_resource_ref" to="bookableresourceid" ufx:if="$input/PlanningTeam/bag">
      <filter><condition attribute="pro_planningteam_ref" operator="in"><ufx:apply select="$input/PlanningTeam/bag"><value><ufx:value select="@ufx-id" /></value></ufx:apply></condition></filter>
    </link-entity>
    <filter type="and">
      <!-- Site filter $input/Commented must not count -->
      <condition operator="in" attribute= "pro_site_ref" ufx:if="$input/Site/bag">
        <ufx:apply select = "$input/Site/bag" ><value><ufx:value select = "@ufx-id" /></value ></ufx:apply>
      </condition>
      <condition ufx:if="$input/RestrictedResources/bag" attribute="bookableresourceid" operator="not-in">
        <ufx:apply select="$input/RestrictedResources/bag"><value><ufx:value select="@ufx-id" /></value></ufx:apply>
      </condition>
      <condition attribute="msdyn_displayonscheduleboard" operator="eq" value="1" ufx:if="$input/DisplayOnScheduleBoard[. = 'true']" />
    </filter>
  </entity>
</fetch>`

describe('analyzeQuery', () => {
  const u = analyzeQuery(QUERY)
  it('finds every key outside comments', () => {
    expect([...u.keys()].sort()).toEqual(['DisplayOnScheduleBoard', 'PlanningTeam', 'RestrictedResources', 'Roles', 'Site'])
  })
  it('attributes conditions to their table, column and operator', () => {
    expect(u.get('Site')).toMatchObject({ entity: 'bookableresource', attribute: 'pro_site_ref', operator: 'in' })
    expect(u.get('RestrictedResources')).toMatchObject({ entity: 'bookableresource', attribute: 'bookableresourceid', operator: 'not-in' })
  })
  it('takes the column of a link-entity key from the condition inside the link', () => {
    expect(u.get('PlanningTeam')).toMatchObject({ entity: 'pro_planningteammember', attribute: 'pro_planningteam_ref', operator: 'in' })
    expect(u.get('Roles')).toMatchObject({ entity: 'bookableresourcecategoryassn', attribute: 'resourcecategory' })
  })
  it('describes usages in German', () => {
    expect(describeUsage(u.get('RestrictedResources')!)).toBe('bookableresource.bookableresourceid ist keiner von')
  })
  it('handles empty input', () => {
    expect(analyzeQuery(null).size).toBe(0)
  })
})

describe('queryOutputs', () => {
  it('collects aliases, root attributes and bag entries (MS crew sample)', () => {
    const xml = `<fetch><entity name="bookableresource"><attribute name="name" />
      <link-entity name="bookableresourcegroup" alias="bgcount"><attribute name="name" aggregate="countcolumn" alias="crewcount" />
        <filter><condition attribute="fromdate" operator="le"><ufx:value select="$input/ScheduleBoard/EndDate" attribute="value" /></condition></filter>
        <attribute name="unaliased" />
        <link-entity name="bookableresource" alias="parentresource"><attribute name="name" alias="crewname" groupby="true" /></link-entity>
      </link-entity></entity>
      <bag><multipleCrews ufx:select="crewcount > 1" /><singleCrew ufx:select="crewcount = 1" /><ufx:if test="x"><nested /></ufx:if></bag></fetch>`
    expect(queryOutputs(xml).map((o) => `${o.source}:${o.name}`)).toEqual([
      'attribute:name',
      'attribute:crewcount',
      'attribute:crewname',
      'bag:multipleCrews',
      'bag:singleCrew',
    ])
    expect(queryOutputs(xml).find((o) => o.name === 'crewname')?.detail).toBe('bookableresource.name')
  })
  it('is empty without a query', () => {
    expect(queryOutputs(null)).toEqual([])
  })
})
