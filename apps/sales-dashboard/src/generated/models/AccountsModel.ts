/*!
 * HAND-WRITTEN replacement for a generated file.
 *
 * Like LeadsModel.ts: `pac code add-data-source -a dataverse -t account`
 * registers the data source but fails to emit the TypeScript files. Fields
 * from .power/schemas/dataverse/accounts.Schema.json, reduced to the join
 * columns the dashboard needs (Kundennummer + GVL/KAM des Kunden für
 * Angebote/Aufträge — die Code-App-API unterstützt kein $expand).
 */

export interface Accounts {
  accountid: string
  name?: string
  accountnumber?: string
  wal_areasalesmanager_idname?: string
  _wal_areasalesmanager_id_value?: string
  wal_keyaccountmanager_idname?: string
  _wal_keyaccountmanager_id_value?: string
}
