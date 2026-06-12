import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { powerApps } from "@microsoft/power-apps-vite/plugin"

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), powerApps()],
  // Port 3000 matches `localAppUrl` in power.config.json so the Local Play
  // URL from `pac code run` (…&_localAppUrl=http://localhost:3000) reaches
  // the dev server. `strictPort` fails fast instead of silently roaming.
  server: { port: 3000, strictPort: true },
});
