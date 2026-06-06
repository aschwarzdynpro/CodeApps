# Ideen für Code Apps

Brainstorming-Katalog für Power Apps Code Apps. Jede Idee nennt das Problem,
den Kern-Nutzen, sinnvolle **Datenquellen/Konnektoren** und warum sie sich gut
für eine *Code* App eignet (statt einer klassischen Canvas App).

> Code Apps glänzen, wenn man **volle UI-Kontrolle**, eigene Logik/State,
> reichhaltige Komponenten-Bibliotheken (z. B. Fluent UI, Charts) oder
> Echtzeit-Interaktivität braucht – bei gleichzeitiger Anbindung an
> Power-Platform-Daten und Governance.

---

## ⭐ Top-Empfehlung für die erste App

### 1. Asset & Equipment Tracker ("InventoryHub")
**Problem:** Geräte, Werkzeuge, Lizenzen und Hardware werden in Excel-Listen
verwaltet – unübersichtlich, keine Historie, kein Self-Service.

**Was die App kann:**
- Übersicht aller Assets mit Filter/Suche, Status (verfügbar / ausgeliehen / in
  Wartung), Zuständigkeit und Standort
- **QR-/Barcode-Scan** per Webcam zum schnellen Aus-/Rückbuchen
- Ausleih-Historie & fällige Rückgaben, automatische Erinnerungen
- Dashboard mit Auslastung und Wartungskosten (Charts)

**Datenquellen/Konnektoren:** Dataverse (Assets, Ausleihen) · Office 365 Users
(Zuständige) · Outlook/Teams (Erinnerungen)

**Warum Code App:** Webcam-Scanning, individuelle Filter-/Tabellen-UI und
Diagramme lassen sich code-first deutlich eleganter umsetzen. Klar abgegrenzter
Scope → ideal als Erstprojekt.

---

## Weitere starke Kandidaten

### 2. Field Inspection & Audit App
Strukturierte Vor-Ort-Prüfungen (Sicherheit, Qualität, Wartung) mit
dynamischen Checklisten, **Foto-Upload**, Unterschrift und automatischer
PDF-/Report-Erstellung.
*Konnektoren:* Dataverse · SharePoint (Fotos/Reports) · Outlook (Versand) ·
optional AI Builder (Defekterkennung auf Fotos).
*Warum Code:* Offline-freundliche, geführte Multi-Step-Formulare mit
Mediencapture.

### 3. Approval Cockpit
Ein zentrales Dashboard, das **Genehmigungen aus mehreren Systemen** bündelt
(Urlaub, Bestellungen, Rechnungen) – bulk-approven, kommentieren, delegieren.
*Konnektoren:* Power Automate / Approvals · Dataverse · Outlook · Teams.
*Warum Code:* Aggregierte Echtzeit-Liste mit komplexem Filter-/Bulk-Verhalten.

### 4. Visitor Management / Reception Kiosk
Besucher-Check-in am Empfang: Selbstregistrierung, Badge-Druck,
**Host-Benachrichtigung** via Teams/Outlook, DSGVO-konforme Datenhaltung,
Auswertung der Besucherzahlen.
*Konnektoren:* Dataverse · Office 365 Users · Teams/Outlook (Notify).
*Warum Code:* Kiosk-/Touch-optimierte UI, individuelles Branding.

### 5. Desk- & Room-Booking ("FlexSpace")
Hot-Desking und Raumbuchung mit interaktivem **Grundriss/Plan** zum Anklicken
freier Plätze, Kalender-Sync und Team-Sichtbarkeit ("wer ist wann im Büro").
*Konnektoren:* Outlook Calendar · Office 365 Users · Dataverse.
*Warum Code:* Interaktive SVG-/Canvas-Grundrisse sind in Canvas Apps mühsam.

### 6. Expense & Receipt Assistant
Spesenerfassung mit **Beleg-Foto + OCR** (Betrag/Datum/Händler automatisch
auslesen), Kategorisierung, Einreichung und Status-Tracking.
*Konnektoren:* AI Builder (Receipt Processing) · Dataverse · SharePoint ·
Outlook.
*Warum Code:* Smooth Capture-Flow + sofortiges Feedback der Extraktion.

### 7. AI Knowledge Assistant
Chat-Oberfläche, die Fragen über interne **SharePoint-Dokumente / Wissensbasis**
beantwortet (RAG), mit Quellenangaben und Konversationsverlauf.
*Konnektoren:* SharePoint · Dataverse · Azure OpenAI / AI Builder.
*Warum Code:* Streaming-Chat-UI, Markdown-Rendering, Verlauf-State.

### 8. Customer 360 Dashboard
Aggregierte Kundensicht für Vertrieb/Service: Stammdaten, offene Tickets,
letzte Aufträge, Umsatz-Trends – alles auf einem Screen.
*Konnektoren:* Dataverse / Dynamics 365 · SQL · Outlook.
*Warum Code:* Datendichte Dashboards mit Charts und Drill-down.

---

## Auswahl-Hilfe

| Kriterium | Beste Einstiegs-Idee |
| --- | --- |
| Schnellster MVP, klarer Scope | **1. Asset Tracker** |
| Mobil / Außendienst | 2. Field Inspection |
| Sofort sichtbarer Org-Nutzen | 3. Approval Cockpit / 5. Desk Booking |
| "Wow"-Faktor mit KI | 6. Expense Assistant / 7. Knowledge Assistant |

**Empfehlung:** Mit **#1 Asset & Equipment Tracker** starten – abgegrenzter
Umfang, klarer Mehrwert und deckt die wichtigsten Bausteine ab (Dataverse-CRUD,
Listen/Detail-UI, Charts, ein Konnektor für Benachrichtigungen). Eine solide
Vorlage für alle weiteren Apps im Repo.
