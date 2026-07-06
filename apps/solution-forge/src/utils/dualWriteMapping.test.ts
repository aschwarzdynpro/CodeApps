import { describe, expect, it } from 'vitest'
import {
  compareMapVersions,
  countFieldMappings,
  parseDualWriteMapping,
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

describe('compareMapVersions', () => {
  it('orders dotted versions numerically', () => {
    expect(compareMapVersions('2.0.1.5', '2.0.0.9')).toBeGreaterThan(0)
    expect(compareMapVersions('2.0.0.9', '2.0.1.5')).toBeLessThan(0)
    expect(compareMapVersions('1.0.0.0', '1.0.0.0')).toBe(0)
    // 10 > 2 numerically (not lexically)
    expect(compareMapVersions('10.0.383.25', '2.0.0.0')).toBeGreaterThan(0)
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
