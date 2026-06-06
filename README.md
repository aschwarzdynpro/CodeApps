# CodeApps

Monorepo für mehrere **Power Apps Code Apps** – code-first Business-Web-Apps,
die lokal in der IDE entwickelt und auf der Power Platform betrieben werden.

> Code Apps bringen Power-Apps-Fähigkeiten in eigene Web-Apps: gebaut mit
> React/Vue + TypeScript + Vite, angebunden über Microsoft Entra Auth und
> 1.500+ Konnektoren an Power-Platform-Datenquellen (Dataverse, SharePoint,
> SQL, Office 365, …).
> Mehr dazu: <https://learn.microsoft.com/en-us/power-apps/developer/code-apps/overview>

## Repo-Struktur

```
CodeApps/
├── apps/              # Eine eigenständige Code App pro Unterordner
│   └── <app-name>/    # Vite + React + TypeScript + @microsoft/power-apps
├── docs/
│   ├── IDEAS.md       # Brainstorming-Katalog für Code-App-Ideen
│   └── SETUP.md       # Schritt-für-Schritt: neue Code App anlegen
├── .gitignore
└── README.md
```

Jede App unter `apps/` ist ein eigenständiges, deploybares Projekt mit eigener
`package.json` und eigener `power.config.json`. So lassen sich mehrere Apps
unabhängig voneinander entwickeln, versionieren und veröffentlichen.

## Voraussetzungen

- [Node.js](https://nodejs.org/) (LTS)
- [Git](https://git-scm.com/)
- Power-Platform-Umgebung mit aktivierten **Code Apps**
  ([Anleitung](https://learn.microsoft.com/en-us/power-apps/developer/code-apps/overview#enable-code-apps-on-a-power-platform-environment))
- Power Apps Client-Bibliothek / CLI: `npm install -g @microsoft/power-apps`
- **Power Apps Premium**-Lizenz für Endbenutzer

## Neue Code App anlegen

Kurzfassung (Details in [`docs/SETUP.md`](docs/SETUP.md)):

```bash
# Vom Repo-Root aus – Template ins apps/-Verzeichnis ziehen
npx degit github:microsoft/PowerAppsCodeApps/templates/vite apps/<app-name>
cd apps/<app-name>

npm install
power-apps init --display-name "<Anzeigename>" --environment-id <ENV-ID>

npm run dev            # lokal testen (URL "Local Play" öffnen)

npm run build          # Produktions-Build
power-apps push        # in die Power-Platform-Umgebung veröffentlichen
```

## Ideen für die erste Code App

Eine kuratierte Liste mit konkreten Vorschlägen, Datenquellen und
Konnektoren findest du in [`docs/IDEAS.md`](docs/IDEAS.md).
