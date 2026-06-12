/*!
 * HAND-WRITTEN replacement for a generated file.
 *
 * `pac code add-data-source -a dataverse -t lead` (pac 2.8.1) registers the
 * data source (power.config.json, .power/schemas) but silently fails to emit
 * the TypeScript model/service for this table. The fields below are taken
 * from .power/schemas/dataverse/leads.Schema.json and reduced to what the
 * dashboard reads. If a future generator run emits a full LeadsModel.ts, it
 * may safely overwrite this file — the dashboard only relies on the fields
 * listed here.
 */

export const Leadsstatecode = {
  0: 'Open',
  1: 'Qualified',
  2: 'Disqualified',
} as const
export type Leadsstatecode = keyof typeof Leadsstatecode

export interface Leads {
  leadid: string
  subject?: string
  companyname?: string
  fullname?: string
  statecode?: Leadsstatecode
  statuscode?: number
  createdon?: string
  /** Multiselect-Optionset; OData liefert kommaseparierte Codes. */
  wal_application_opts?: string
  wal_application_optsname?: string
  wal_leadsource_opt?: number
  wal_leadsource_optname?: string
  owneridname?: string
  _ownerid_value?: string
  createdbyname?: string
  _createdby_value?: string
  wal_areasalesmanager_idname?: string
  _wal_areasalesmanager_id_value?: string
}
