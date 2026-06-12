/**
 * Umgebungsspezifische App-Konfiguration.
 *
 * Die Dataverse-Org-URL wird bevorzugt aus dem App-Kontext gelesen
 * (`getContext().app.dataverseOrgUrl`). Das Feld ist laut SDK optional —
 * Hosts, die es (noch) nicht befüllen, lassen es leer. Für diesen Fall
 * dient diese Konstante als Fallback, damit die Datensatz-Deep-Links der
 * Listen trotzdem funktionieren.
 *
 * Beim Umzug in eine andere Umgebung zusammen mit power.config.json
 * (environmentId) anpassen.
 */
export const FALLBACK_DATAVERSE_ORG_URL = 'https://waldmann-dev.crm4.dynamics.com'
