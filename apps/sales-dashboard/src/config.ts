/**
 * Umgebungsspezifische Konfiguration für die Datensatz-Deep-Links.
 *
 * Die Dataverse-Org-URL wird zur Laufzeit bevorzugt aus dem App-Kontext
 * gelesen (`getContext().app.dataverseOrgUrl`) — sie passt damit automatisch
 * zur Umgebung, in der die App läuft. Liefert der Host sie (noch) nicht, dient
 * die je Environment-ID hinterlegte `orgUrl` als Fallback.
 *
 * Die Sales-Hub-App-ID (`&appid=` im main.aspx-Deep-Link) gibt der Kontext
 * NICHT her und sie unterscheidet sich je Umgebung — daher wird sie hier je
 * Environment-ID gepflegt. Fehlt sie, entfällt der appid-Parameter (der Link
 * öffnet dann im Standard-App-Kontext der Umgebung).
 *
 * Neue Umgebung (Test/Prod): einfach mit ihrer Environment-ID ergänzen.
 */
export interface EnvironmentConfig {
  /** Klarname der Umgebung (nur Doku/Debug). */
  label?: string
  /** Fallback-Org-URL, falls der App-Kontext keine liefert. */
  orgUrl?: string
  /** Sales-Hub-App-ID dieser Umgebung (appid im Deep-Link). */
  salesHubAppId?: string
}

/** Mapping Environment-ID → Umgebungs-Konfiguration. */
export const ENVIRONMENTS: Record<string, EnvironmentConfig> = {
  // Waldmann · D365 DEV (waldmann-dev)
  '33146d71-4fe8-e1d7-af2f-f80fe968fc47': {
    label: 'Waldmann · D365 DEV',
    orgUrl: 'https://waldmann-dev.crm4.dynamics.com',
    salesHubAppId: '1273fbf5-a1ff-ee11-9f89-000d3aad2055',
  },
  // Weitere Umgebungen hier ergänzen, z. B.:
  // '<environment-id-test>': {
  //   label: 'Waldmann · D365 TEST',
  //   orgUrl: 'https://waldmann-test.crm4.dynamics.com',
  //   salesHubAppId: '<sales-hub-appid-test>',
  // },
}

/** Konfiguration zur Environment-ID (oder undefined, wenn nicht hinterlegt). */
export function environmentConfig(environmentId?: string): EnvironmentConfig | undefined {
  return environmentId ? ENVIRONMENTS[environmentId] : undefined
}
