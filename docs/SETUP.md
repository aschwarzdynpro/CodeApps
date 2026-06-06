# Setup: Neue Power Apps Code App anlegen

Diese Anleitung beschreibt, wie du innerhalb dieses Monorepos eine neue
Code App im Ordner `apps/<app-name>/` erstellst und veröffentlichst.

## 1. Voraussetzungen prüfen

- Node.js (LTS) und Git installiert
- Power-Platform-Umgebung mit aktivierten Code Apps
  (Power Platform Admin Center → Environments → Settings → Product → Features →
  *Power Apps code apps* aktivieren)
- Client-Bibliothek global installiert:
  ```bash
  npm install -g @microsoft/power-apps
  ```

## 2. Template ziehen

Vom **Repo-Root** aus (ersetze `<app-name>`):

```bash
npx degit github:microsoft/PowerAppsCodeApps/templates/vite apps/<app-name>
cd apps/<app-name>
```

Das offizielle Vite-Template liefert ein React + TypeScript + Vite Projekt.

## 3. Abhängigkeiten installieren

```bash
npm install
```

## 4. Code App initialisieren

Interaktiv (CLI fragt nach Anzeigename & Umgebung):

```bash
power-apps init
```

Oder direkt mit Parametern:

```bash
power-apps init --display-name "<Anzeigename>" --environment-id <ENV-ID>
```

Beim `init` authentifiziert dich die CLI automatisch – mit dem
Power-Platform-Konto anmelden, wenn du dazu aufgefordert wirst. Dabei wird die
`power.config.json` erzeugt und ein `PowerProvider` in die App eingebunden.

## 5. Lokal entwickeln

```bash
npm run dev
```

Öffne die als **Local Play** ausgewiesene URL – im **selben Browser-Profil**
wie dein Power-Platform-Tenant.

> Hinweis: Seit Dez. 2025 blockieren Chrome/Edge standardmäßig Zugriffe von
> öffentlichen Origins auf lokale Endpunkte. Ggf. Browser-Berechtigung für
> *Local Network Access* erteilen.

## 6. Daten anbinden (Konnektoren)

Datenquellen (Dataverse, SharePoint, SQL, Office 365, …) werden über die
Power-Platform-Konnektoren hinzugefügt und als typisierte Services in der App
genutzt. Für Dataverse-Aktionen/-Funktionen:

```bash
power-apps find-dataverse-api
```

Siehe: <https://learn.microsoft.com/en-us/power-apps/developer/code-apps/how-to/add-dataverse-action-function>

## 7. Build & Deploy

```bash
npm run build          # tsc -b && vite build
power-apps push        # veröffentlicht eine neue Version in die Umgebung
```

Nach erfolgreichem `push` gibt die CLI eine Power-Apps-URL zum Starten der App
zurück. Verwaltung (teilen, ausführen, Details) unter
<https://make.powerapps.com>.

## CLI-Befehle im Überblick

| Befehl | Beschreibung |
| --- | --- |
| `power-apps init` | Code App initialisieren |
| `power-apps run` / `npm run dev` | Lokalen Dev-Server starten |
| `power-apps push` | Neue Version veröffentlichen |
| `power-apps find-dataverse-api` | Dataverse-Aktion/-Funktion einbinden |
