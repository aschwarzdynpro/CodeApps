import { describe, expect, it } from 'vitest'
import {
  compareMapVersions,
  countFieldMappings,
  managedStateOf,
  mapNameKey,
  mappingFieldNames,
  overallDirection,
  parseDualWriteMapping,
  parseRuntimeMapVersion,
  pickCurrentVersion,
  runtimeMapKey,
  syncDirectionInfo,
} from './dualWriteMapping'

// A representative slice of a real `msdyn_mapping` payload: string sync
// directions (as they arrive from some records), a value-map transform, a
// lookup-resolved destination and a system-generated key field.
const SAMPLE = JSON.stringify({
  name: '[CDS purchase order line entity] - [msdyn_purchaseorderproducts]',
  leftEnvironmentType: 'AX',
  centerEnvironmentType: 'CRM',
  rightEnvironmentType: 'UNDEFINED',
  legs: [
    {
      id: '001',
      sourceSchema: 'CDS purchase order line entity',
      sourceEnvironmentType: 'AX',
      destinationSchema: 'msdyn_purchaseorderproducts',
      destinationEnvironmentType: 'CRM',
      sourceFilter: '',
      fieldMappings: [
        {
          syncDirection: '3',
          sourceField: 'LINEDESCRIPTION',
          destinationField: 'msdyn_description',
          isSystemGenerated: false,
        },
        {
          syncDirection: '1',
          sourceField: 'LINEAMOUNT',
          destinationField: 'msdyn_lineamount',
          isSystemGenerated: false,
        },
        {
          syncDirection: '3',
          sourceField: 'PRODUCTNUMBER',
          destinationField: 'msdyn_product.msdyn_productnumber',
          destinationLookupFieldRelatedEntity: 'products',
          isSystemGenerated: true,
        },
        {
          syncDirection: '3',
          sourceField: 'ISPARTIALDELIVERYPREVENTED',
          destinationField: 'msdyn_ispartialdeliveryprevented',
          valueTransforms: [
            {
              $type: 'Microsoft.Dynamics.Integrator...',
              transformType: 'ValueMap',
              valueMap: { yes: 'true', no: 'false' },
              createValuesOnDestination: false,
            },
          ],
          isSystemGenerated: false,
        },
      ],
    },
  ],
})

describe('parseDualWriteMapping', () => {
  it('parses envs, legs and field mappings', () => {
    const d = parseDualWriteMapping(SAMPLE)
    expect(d.unparsed).toBe(false)
    expect(d.leftEnvironmentType).toBe('AX')
    expect(d.centerEnvironmentType).toBe('CRM')
    expect(d.legs).toHaveLength(1)
    const leg = d.legs[0]
    expect(leg.sourceSchema).toBe('CDS purchase order line entity')
    expect(leg.destinationSchema).toBe('msdyn_purchaseorderproducts')
    expect(leg.fieldMappings).toHaveLength(4)
    expect(countFieldMappings(d)).toBe(4)
  })

  it('coerces string sync directions to numbers', () => {
    const [f1, f2] = parseDualWriteMapping(SAMPLE).legs[0].fieldMappings
    expect(f1.syncDirection).toBe(3)
    expect(f2.syncDirection).toBe(1)
  })

  it('flattens a value-map transform', () => {
    const fm = parseDualWriteMapping(SAMPLE).legs[0].fieldMappings.find(
      (f) => f.sourceField === 'ISPARTIALDELIVERYPREVENTED',
    )!
    expect(fm.valueMap).toEqual([
      { from: 'yes', to: 'true' },
      { from: 'no', to: 'false' },
    ])
  })

  it('captures the lookup related entity and system-generated flag', () => {
    const fm = parseDualWriteMapping(SAMPLE).legs[0].fieldMappings.find(
      (f) => f.sourceField === 'PRODUCTNUMBER',
    )!
    expect(fm.lookupRelatedEntity).toBe('products')
    expect(fm.isSystemGenerated).toBe(true)
  })

  it('never throws on garbage — flags it unparsed', () => {
    expect(parseDualWriteMapping('not json').unparsed).toBe(true)
    expect(parseDualWriteMapping('').unparsed).toBe(true)
    expect(parseDualWriteMapping('{}').legs).toEqual([])
  })
})

describe('mappingFieldNames', () => {
  it('collects distinct lower-cased source + destination field names', () => {
    const names = mappingFieldNames(parseDualWriteMapping(SAMPLE))
    expect(names).toContain('linedescription')
    expect(names).toContain('msdyn_description')
    expect(names).toContain('lineamount')
    // Distinct, lower-cased.
    expect(names).toEqual([...new Set(names)])
    expect(names.every((n) => n === n.toLowerCase())).toBe(true)
  })

  it('also indexes the bare last segment of a dotted lookup destination', () => {
    const names = mappingFieldNames(parseDualWriteMapping(SAMPLE))
    // Searching the plain column name still hits the dotted destination.
    expect(names).toContain('msdyn_product.msdyn_productnumber')
    expect(names).toContain('msdyn_productnumber')
  })

  it('is empty for an unparsable mapping', () => {
    expect(mappingFieldNames(parseDualWriteMapping('nonsense'))).toEqual([])
  })
})

describe('compareMapVersions', () => {
  it('orders dotted versions numerically', () => {
    expect(compareMapVersions('2.0.1.5', '2.0.0.9')).toBeGreaterThan(0)
    expect(compareMapVersions('2.0.0.9', '2.0.1.5')).toBeLessThan(0)
    expect(compareMapVersions('1.0.0.0', '1.0.0.0')).toBe(0)
    // 10 > 2 numerically (not lexically)
    expect(compareMapVersions('10.0.383.25', '2.0.0.0')).toBeGreaterThan(0)
  })
})

describe('overallDirection', () => {
  const mk = (dirs: number[]) =>
    parseDualWriteMapping(
      JSON.stringify({
        legs: [
          {
            fieldMappings: dirs.map((d) => ({
              syncDirection: d,
              sourceField: 'a',
              destinationField: 'b',
            })),
          },
        ],
      }),
    )
  it('is bidirectional when any field is bidirectional', () => {
    expect(overallDirection(mk([1, 1, 3]))).toBe(3)
  })
  it('is bidirectional when both one-way directions occur', () => {
    expect(overallDirection(mk([1, 2]))).toBe(3)
  })
  it('is one-way when all fields share a single one-way direction', () => {
    expect(overallDirection(mk([1, 1, 1]))).toBe(1)
    expect(overallDirection(mk([2, 2]))).toBe(2)
  })
  it('is 0 with no field mappings', () => {
    expect(overallDirection(mk([]))).toBe(0)
  })
})

describe('mapNameKey', () => {
  it('extracts the source/destination pair from a map name', () => {
    expect(mapNameKey('sst_[uoms - Units]')).toBe('uoms - units')
    expect(mapNameKey('sst_[msdyn_projects - Projects]')).toBe(
      'msdyn_projects - projects',
    )
  })
  it('matches the key a runtime-config entry produces', () => {
    expect(mapNameKey('hso_[accounts - SST CDS Parties]')).toBe(
      runtimeMapKey('accounts', 'SST CDS Parties'),
    )
  })
  it('is empty when the name carries no brackets', () => {
    expect(mapNameKey('plain map name')).toBe('')
    expect(mapNameKey('sst_[unclosed')).toBe('')
  })
})

describe('parseRuntimeMapVersion', () => {
  // Shape of a real `msdyn_dualwriteruntimeconfig.msdyn_unsecure` payload,
  // trimmed to the fields we read.
  const RUNTIME = JSON.stringify({
    ProjectId: 'be881e8c-9b73-4583-b13b-7dd3bff2e399',
    SourceEntityName: 'msdyn_projecttasks',
    SourceEnvironmentType: 1,
    DestinationEntityName: 'CE project tasks',
    DestinationEnvironmentType: 3,
    EntityMapVersion: { Major: 2, Minor: 0, Build: 0, Revision: 2 },
    FieldMappings: [],
  })

  it('reads the live version and its join key', () => {
    expect(parseRuntimeMapVersion(RUNTIME)).toEqual({
      key: 'msdyn_projecttasks - ce project tasks',
      version: '2.0.0.2',
    })
  })

  it('keys the same map its name does', () => {
    expect(parseRuntimeMapVersion(RUNTIME)!.key).toBe(
      mapNameKey('sst_[msdyn_projecttasks - CE project tasks]'),
    )
  })

  it('returns null for anything it does not understand — never throws', () => {
    expect(parseRuntimeMapVersion('')).toBeNull()
    expect(parseRuntimeMapVersion('not json')).toBeNull()
    expect(parseRuntimeMapVersion('{}')).toBeNull()
    expect(
      parseRuntimeMapVersion(
        JSON.stringify({ SourceEntityName: 'a', DestinationEntityName: 'b' }),
      ),
    ).toBeNull()
  })
})

describe('pickCurrentVersion', () => {
  const rec = (version: string, createdOn: string) => ({
    id: `id-${version}`,
    version,
    createdOn,
    modifiedOn: createdOn,
    isManaged: false,
  })

  // The real sst_[msdyn_projects - Projects] shape: a parked 9.9.9.9 sits on
  // top of the live line, so the highest number is NOT the current version.
  const PROJECTS = [
    rec('2.0.1.2', '2023-11-29T11:45:00Z'),
    rec('9.9.9.9', '2023-11-27T19:11:00Z'),
    rec('2.0.2.1', '2026-08-06T09:58:00Z'),
    rec('2.0.2.0', '2026-03-24T13:48:00Z'),
  ]

  it('never picks a parked sentinel version just because it is the highest', () => {
    const pick = pickCurrentVersion(PROJECTS)!
    expect(pick.record.version).toBe('2.0.2.1')
    expect(pick.kind).toBe('saved')
  })

  it('prefers the proven running version over the newest saved one', () => {
    // sst_[salesorders - …]: runs 2.0.1.8 although 9.9.9.9 was saved later.
    const salesorders = [
      rec('2.0.1.8', '2025-02-10T08:00:00Z'),
      rec('9.9.9.9', '2025-06-01T08:00:00Z'),
    ]
    const pick = pickCurrentVersion(salesorders, '2.0.1.8')!
    expect(pick.record.version).toBe('2.0.1.8')
    expect(pick.kind).toBe('live')
    // The parked version stays visible as a finding.
    expect(pick.latestSavedVersion).toBe('9.9.9.9')
  })

  it('falls back to the newest saved record when the live version has no record', () => {
    const pick = pickCurrentVersion(PROJECTS, '1.2.3.4')!
    expect(pick.record.version).toBe('2.0.2.1')
    expect(pick.kind).toBe('saved')
  })

  it('breaks a created-on tie by version number', () => {
    const sameDay = [
      rec('2.0.1.6', '2025-03-05T14:25:00Z'),
      rec('2.0.1.7', '2025-03-05T14:25:00Z'),
    ]
    expect(pickCurrentVersion(sameDay)!.record.version).toBe('2.0.1.7')
  })

  it('tolerates missing timestamps and empty input', () => {
    expect(pickCurrentVersion([])).toBeNull()
    const undated = [rec('2.0.0.1', ''), rec('2.0.0.3', '')]
    expect(pickCurrentVersion(undated)!.record.version).toBe('2.0.0.3')
  })
})

describe('managedStateOf', () => {
  const r = (isManaged: boolean) => ({ isManaged })

  it('calls a map managed only when every record is', () => {
    expect(managedStateOf([r(true), r(true)])).toEqual({
      isManaged: true,
      hasUnmanagedLayer: false,
    })
  })

  it('calls a map custom when nothing is managed', () => {
    expect(managedStateOf([r(false), r(false)])).toEqual({
      isManaged: false,
      hasUnmanagedLayer: false,
    })
  })

  it('flags a transported map that was edited in place', () => {
    // The real PROD shape: managed records from the solution plus a local edit.
    expect(managedStateOf([r(true), r(true), r(false)])).toEqual({
      isManaged: false,
      hasUnmanagedLayer: true,
    })
  })

  it('claims nothing for an empty record set', () => {
    expect(managedStateOf([])).toEqual({
      isManaged: false,
      hasUnmanagedLayer: false,
    })
  })
})

describe('syncDirectionInfo', () => {
  it('maps codes to arrows', () => {
    expect(syncDirectionInfo(1).arrow).toBe('→')
    expect(syncDirectionInfo(2).arrow).toBe('←')
    expect(syncDirectionInfo(3).arrow).toBe('↔')
    expect(syncDirectionInfo(9).key).toBe('unknown')
  })
})
