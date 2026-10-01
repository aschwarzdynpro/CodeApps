import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { powerApps } from "@microsoft/power-apps-vite/plugin"

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), powerApps()],
  // Port 3000 matches `localAppUrl` in power.config.json so the Local Play
  // URL from `power-apps run` reaches the dev server.
  server: { port: 3000, strictPort: true },
  // Fluent UI v9 puts the single bundle at ~870 kB (≈240 kB gzip) — fine for
  // a Code App, so don't warn at Vite's 500 kB default.
  build: { chunkSizeWarningLimit: 1000 },
});
