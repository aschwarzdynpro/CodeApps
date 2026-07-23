import type { DualWriteMapSummary } from '../types/dualWrite'
import type { DualWriteService } from './dualWriteService'
import {
  mappingFieldNames,
  parseDualWriteMapping,
} from '../utils/dualWriteMapping'

/**
 * Mock {@link DualWriteService} — a small, seeded set of custom dual-write
 * table maps so the cockpit and the mapping overlay are fully demoable offline.
 * One map has several field mappings with a value-map transform and a
 * lookup-resolved destination; another is a lean custom map.
 */

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms))

const PO_LINE_MAPPING = `{
  "name": "[CDS purchase order line entity] - [msdyn_purchaseorderproducts]",
  "leftEnvironmentType": "AX",
  "centerEnvironmentType": "CRM",
  "rightEnvironmentType": "UNDEFINED",
  "legs": [
    {
      "id": "001",
      "sourceSchema": "CDS purchase order line entity",
      "sourceEnvironmentType": "AX",
      "destinationSchema": "msdyn_purchaseorderproducts",
      "destinationEnvironmentType": "CRM",
      "sourceFilter": "",
      "fieldMappings": [
        { "syncDirection": 3, "sourceField": "LINEDESCRIPTION", "destinationField": "msdyn_description", "isSystemGenerated": false },
        { "syncDirection": 3, "sourceField": "LINENUMBER", "destinationField": "msdyn_lineorder", "isSystemGenerated": false },
        { "syncDirection": 3, "sourceField": "PRODUCTNUMBER", "destinationField": "msdyn_product.msdyn_productnumber", "destinationLookupFieldRelatedEntity": "products", "isSystemGenerated": true },
        { "syncDirection": 3, "sourceField": "PURCHASEORDERNUMBER", "destinationField": "msdyn_purchaseorder.msdyn_name", "destinationLookupFieldRelatedEntity": "msdyn_purchaseorders", "isSystemGenerated": true },
        { "syncDirection": 3, "sourceField": "ORDEREDPURCHASEQUANTITY", "destinationField": "msdyn_quantity", "isSystemGenerated": false },
        { "syncDirection": 1, "sourceField": "LINEAMOUNT", "destinationField": "msdyn_lineamount", "isSystemGenerated": false },
        { "syncDirection": 1, "sourceField": "PURCHASEPRICE", "destinationField": "msdyn_unitcost", "isSystemGenerated": false },
        {
          "syncDirection": 3,
          "sourceField": "ISPARTIALDELIVERYPREVENTED",
          "destinationField": "msdyn_ispartialdeliveryprevented",
          "valueTransforms": [
            { "transformType": "ValueMap", "valueMap": { "yes": "true", "no": "false" }, "createValuesOnDestination": false }
          ],
          "isSystemGenerated": false
        },
        {
          "syncDirection": 1,
          "sourceField": "PURCHASEORDERLINESTATUS",
          "destinationField": "msdyn_purchaseorderlinestatus",
          "valueTransforms": [
            { "transformType": "ValueMap", "valueMap": { "none": "192350000", "backorder": "192350001", "received": "192350002", "invoiced": "192350003", "canceled": "192350004" }, "createValuesOnDestination": false }
          ],
          "isSystemGenerated": false
        },
        { "syncDirection": 1, "sourceField": "CURRENCYCODE", "destinationField": "transactioncurrencyid.isocurrencycode", "destinationLookupFieldRelatedEntity": "transactioncurrencies", "isSystemGenerated": false }
      ]
    }
  ]
}`

const UNITS_MAPPING = `{
  "name": "[Units] - [uoms]",
  "leftEnvironmentType": "AX",
  "centerEnvironmentType": "CRM",
  "rightEnvironmentType": "UNDEFINED",
  "legs": [
    {
      "id": "001",
      "sourceSchema": "Units",
      "sourceEnvironmentType": "AX",
      "destinationSchema": "uoms",
      "destinationEnvironmentType": "CRM",
      "sourceFilter": "",
      "fieldMappings": [
        { "syncDirection": 1, "sourceField": "UNITSYMBOL", "destinationField": "msdyn_symbol", "isSystemGenerated": true },
        { "syncDirection": 1, "sourceField": "DESCRIPTION", "destinationField": "msdyn_description", "isSystemGenerated": false },
        { "syncDirection": 1, "sourceField": "DECIMALPRECISION", "destinationField": "msdyn_decimalprecision", "isSystemGenerated": false },
        { "syncDirection": 1, "sourceField": "SYSTEMOFUNITS", "destinationField": "msdyn_systemofunits", "valueTransforms": [ { "transformType": "ValueMap", "valueMap": { "metric": "192350000", "imperial": "192350001" }, "createValuesOnDestination": false } ], "isSystemGenerated": false }
      ]
    }
  ]
}`

const TIME_REPORT_MAPPING = `{
  "name": "[Time Report Main Table] - [sst_timereportses]",
  "leftEnvironmentType": "AX",
  "centerEnvironmentType": "CRM",
  "rightEnvironmentType": "UNDEFINED",
  "legs": [
    {
      "id": "001",
      "sourceSchema": "SSTTimeReportMainEntity",
      "sourceEnvironmentType": "AX",
      "destinationSchema": "sst_timereportses",
      "destinationEnvironmentType": "CRM",
      "sourceFilter": "",
      "fieldMappings": [
        { "syncDirection": 3, "sourceField": "TIMEREPORTID", "destinationField": "sst_name", "isSystemGenerated": true },
        { "syncDirection": 3, "sourceField": "WORKERPERSONNELNUMBER", "destinationField": "sst_worker.cdm_workernumber", "destinationLookupFieldRelatedEntity": "cdm_workers", "isSystemGenerated": false },
        { "syncDirection": 3, "sourceField": "REPORTINGPERIOD", "destinationField": "sst_reportingperiod", "isSystemGenerated": false },
        { "syncDirection": 2, "sourceField": "APPROVALSTATUS", "destinationField": "sst_approvalstatus", "valueTransforms": [ { "transformType": "ValueMap", "valueMap": { "draft": "1", "submitted": "2", "approved": "3", "rejected": "4" }, "createValuesOnDestination": false } ], "isSystemGenerated": false }
      ]
    }
  ]
}`

/** Summaries + their mapping payloads (payload served lazily via getMapping). */
const MAPS: DualWriteMapSummary[] = [
  {
    id: 'dw-po-line',
    name: 'sst_[msdyn_purchaseorderproducts - CDS purchase order line entity]',
    version: '2.0.2.3',
    versionCount: 4,
    sourceSchema: 'CDS purchase order line entity',
    sourceEnv: 'AX',
    destinationSchema: 'msdyn_purchaseorderproducts',
    destinationEnv: 'CRM',
    direction: 3,
    modifiedOn: '2026-05-14T09:12:00Z',
  },
  {
    id: 'dw-units',
    name: 'sst_[uoms - Units]',
    version: '2.0.0.2',
    versionCount: 3,
    sourceSchema: 'Units',
    sourceEnv: 'AX',
    destinationSchema: 'uoms',
    destinationEnv: 'CRM',
    direction: 1,
    modifiedOn: '2026-04-02T11:00:00Z',
  },
  {
    id: 'dw-timereport',
    name: 'sst_[sst_timereportses - Time Report Main Table]',
    version: '0.0.0.1',
    versionCount: 1,
    sourceSchema: 'SSTTimeReportMainEntity',
    sourceEnv: 'AX',
    destinationSchema: 'sst_timereportses',
    destinationEnv: 'CRM',
    direction: 3,
    modifiedOn: '2026-06-20T14:30:00Z',
  },
]

const MAPPINGS: Record<string, string> = {
  'dw-po-line': PO_LINE_MAPPING,
  'dw-units': UNITS_MAPPING,
  'dw-timereport': TIME_REPORT_MAPPING,
}

class MockDualWriteService implements DualWriteService {
  async isInstalled(): Promise<boolean> {
    return true
  }

  async listTableMaps(): Promise<DualWriteMapSummary[]> {
    await delay(200)
    // Index each map's mapped field names (mirrors the real service) so field
    // search works offline too.
    return MAPS.map((m) => ({
      ...m,
      fields: mappingFieldNames(parseDualWriteMapping(MAPPINGS[m.id] ?? '')),
    }))
  }

  async getMapping(id: string): Promise<string> {
    await delay(150)
    return MAPPINGS[id] ?? ''
  }
}

export const mockDualWriteService: DualWriteService = new MockDualWriteService()
