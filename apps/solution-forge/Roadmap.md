# Roadmap — Solution Administration Console

Ideen-Katalog für den weiteren Ausbau (Stand 2026-06-12). Erledigtes wandert
nach unten in „Umgesetzt". Die SP-Migration hat ihre eigene Checkliste in
[`TODO.md`](TODO.md).

## Qualität & Pre-Flight (vor Merge/Deployment)

- [ ] ⭐ **Kollisions-Auflösung**: Aus dem Kollisions-Radar heraus Komponenten
      per Klick aus einer Working Solution entfernen
      (`RemoveSolutionComponent`) oder in die andere verschieben.
- [x] ⭐ **Dependency-Check** (`RetrieveMissingDependencies`): Release-Solution
      gegen Ziel-Umgebung prüfen — Missing/Required Dependencies, optional
      „Add to Solution" je fehlender Komponente. *(Tab „Dependency Check")*
- [ ] **Solution-Checker-Anbindung**: Critical/High-Findings des Microsoft
      Solution Checkers als Badge pro Working Solution.
- [ ] **Pre-Merge-Diff**: Zwei Solutions gegenüberstellen — „was würde der
      Merge dem Release hinzufügen?"

## Release-Zug & Deployment

- [ ] ⭐ **Release-Notes-Generator**: Aus den gemergten Working Solutions
      (`sst_DeploymentSolution_id`) + Work-Item-Titeln Markdown-Release-Notes
      erzeugen (Copy-Button).
- [ ] **Deployment-Kanban**: `ssid_deploymentstatus` als Board mit
      Drag & Drop (None → To be deployed → In progress → Completed).
- [ ] **Power-Platform-Pipelines-Integration**: Pipeline-Run aus der App
      starten, Run-Status nach `ssid_deploymentstatus` zurückspiegeln.
- [ ] **Version-Bump & Export**: Versionsnummer der Release-Solution
      hochzählen und Export anstoßen.

## Drift & Governance

- [ ] ⭐ **Drift-Report über alles**: Compare über alle getrackten Solutions
      aggregiert (X missing in PROD, Y Status-Drift) mit CSV-Export.
- [x] **Layer-Inspektor** (`msdyn_componentlayer`): Aktive unmanaged Layer
      über managed Komponenten in UAT/PROD aufdecken. *(Tab „Layer
      Inspector")*
- [ ] **Präfix-Wächter**: Komponenten mit fremdem Publisher-Präfix in einer
      Working Solution flaggen.
- [ ] **Housekeeping-Cockpit**: Duplikate, Orphans, leere Solutions,
      „Work Item zu / Solution offen" als Aufräum-Seite mit Direkt-Aktionen.
- [ ] **Compare: Inhalts-Drift** via Hash (`clientdata` / `xaml` / `content`)
      + Side-by-side-Diff.

## DevOps-Synergien (sobald der Service Principal steht, siehe TODO.md)

- [ ] **Work-Item-Sync**: `sst_devopsworkitemstatus/-type`, Area/Iteration
      Path automatisch aktuell halten; „WI: Done, Solution: offen" markieren.
- [ ] **Working Solution aus Work Item anlegen**: „Meine zugewiesenen Work
      Items" listen, Klick → Dialog vorbefüllt.
- [ ] **Branch/PR-Verknüpfung**: PRs zur Branch-Konvention `feature/<id>` am
      Eintrag zeigen (`ssid_devopslink`).
- [ ] **DevOps-Panel reaktivieren** (`DEVOPS_PANEL_ENABLED`, siehe TODO.md).

## Team & Komfort

- [ ] **Merge-Historie als Tabelle** (statt nur „letzter Merge") — Grundlage
      für die Release Notes.
- [ ] **Teams-Benachrichtigungen**: neuer Konflikt im Radar / Merge fertig →
      Post in den Dev-Channel.
- [ ] **Notizen am Eintrag** (Annotations im Detail-Panel).
- [ ] **Steuertabelle ausbauen** (`ssid_workbenchsetting`): Umgebungs-URLs,
      Rollen-Name, Feature-Flags konfigurierbar statt hart in `config.ts`.
- [ ] **Rollen-Check um Team-Vererbung erweitern** (aktuell nur direkte
      Zuweisung von „INT | Deployment Manager").

## Umgesetzt

- [x] Darstellungs-Schicht `ssid_workingsolution` (Join, Anlage, Nacherfassen,
      Re-Link, Typ-Pflege, Löschen mit Undo)
- [x] Kollisions-Radar, Komponenten-Suche, Work-Item-Gruppierung
- [x] Merge mit Plan, Konflikt-Markierung und Status-Logging
- [x] Compare über INT-11 / UAT / PROD
- [x] Standard-Filter Open/Tracked/Mine, Rollen-Gating Merge & Compare
- [x] Layer Inspector: unmanaged Active-Layer über managed Komponenten in
      UAT/PROD (`msdyn_componentlayer`)
