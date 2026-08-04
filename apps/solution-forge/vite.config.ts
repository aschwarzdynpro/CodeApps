import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { powerApps } from "@microsoft/power-apps-vite/plugin"

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), powerApps()],
  // Port 3000 matches `localAppUrl` in power.config.json so the Local Play
  // URL from `power-apps run` (…&_localAppUrl=http://localhost:3000) reaches
  // the dev server. `strictPort` fails fast instead of silently roaming.
  server: { port: 3000, strictPort: true },
  build: {
    rollupOptions: {
      output: {
        // These chunks are STATIC — Vite emits a <link rel="modulepreload">
        // for each of them in index.html, and the Code Apps player only serves
        // files referenced from index.html (gotcha #10 in CLAUDE.md). The
        // split keeps the vendor and generated-client code in their own
        // long-lived cache entries so an app change no longer invalidates the
        // whole ~1 MB bundle.
        //
        // ONE exception is deliberate: App.tsx loads the Role Analyzer through
        // React.lazy, which emits a chunk that index.html does NOT reference.
        // That is the live probe for whether the player serves runtime-fetched
        // chunks at all — the open roadmap item. It is contained by
        // LazyWorkspace (a 404 shows a message instead of blanking the app).
        // Until that probe has run in a real player session, do NOT convert
        // further workspaces to React.lazy.
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('react-dom') || id.includes('/react/') || id.includes('scheduler'))
              return 'vendor-react'
            return 'vendor'
          }
          if (id.includes('src/generated') || id.includes('src\\generated'))
            return 'dataverse-client'
          return undefined
        },
      },
    },
    // The app chunk stays chunky by design (see above) — keep the warning for
    // real growth, just above the current baseline.
    chunkSizeWarningLimit: 700,
  },
});
