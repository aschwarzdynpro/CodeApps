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

/**
 * Model-driven App, in deren Kontext die Datensatz-Deep-Links öffnen sollen
 * (`&appid=…` in main.aspx). Hier die **Sales Hub**-App, damit Verkaufschancen,
 * Angebote etc. mit dem gewohnten Formular/Befehlsband erscheinen statt im
 * Standardkontext. Ohne appid würde Dataverse irgendeine zugewiesene App wählen.
 *
 * Leeren String setzen, um die appid wegzulassen.
 */
export const RECORD_LINK_APP_ID = '1273fbf5-a1ff-ee11-9f89-000d3aad2055'
