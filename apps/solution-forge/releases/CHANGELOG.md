# Release Notes — Solution Administration Console

Managed-Solution-Releases von `DynamicsProSolutionAdminConsole` (Export aus dem
Playground-Authoring-Env). Eine Sektion je Release, neueste oben. Import + Nach-
schritte: siehe [`README.md`](README.md).

---

## 1.0.0.29 — 2026-09-16

**Der Merge in eine Release-Solution startet sofort sichtbar — die stille
Wartezeit am Anfang ist weg. Keine Schema-Änderung, keine neue Flow-Version.**

- **Warum ein Merge minutenlang „nichts tat".** Vor dem ersten Fortschritts-
  Callback lief die **Release-Solution** — die größte beteiligte Solution —
  durch dieselbe Komponentenauflösung wie die Quellen: Summary-Join plus
  vollständige Namensauflösung (`EntityDefinitions` mit `$expand=Attributes`
  je 10 Tabellen, Lookups für Formulare/Ansichten). Für das Ziel wird davon
  nichts angezeigt; die Merge-Entscheidung braucht nur `objectId` +
  `rootcomponentbehavior`. Anschließend wurden alle Quellen **erneut und
  nacheinander** gelesen, obwohl die Workbench sie für den Plan gerade erst
  geladen hatte. Die UI zeigte dabei `Merging 0 / N (0 %)`.
- **Ziel wird nur roh gelesen.** Ein einziger paged Read der
  `solutioncomponent`-Zeilen der Release; die Summary-Tabelle und die
  Metadaten-Lookups entfallen für das Ziel komplett. Scheitert dieser Read,
  **bricht der Merge vor der ersten Änderung ab** — vorher fiel er still bis
  auf die Demo-Liste zurück und hätte alles neu hinzugefügt.
- **Der Plan wird wiederverwendet.** Die Workbench gibt dem Merge ihre
  Solution-Liste und die Komponenten je Quelle mit; nur fehlende Quellen
  werden nachgeladen, jetzt parallel. Die Reihenfolge der Queue (Tabellen vor
  ihren Spalten, Quellen in Auswahlreihenfolge) bleibt unverändert.
- **Fortschritt ab Sekunde 0.** Bis zur ersten hinzugefügten Komponente steht
  „Preparing — Reading the release solution…" statt einer leeren 0 %-Leiste.
- **Grenze:** Die `AddSolutionComponent`-Aufrufe selbst laufen weiterhin
  **sequenziell** (ein Roundtrip je Komponente). Parallelität ist als
  Roadmap-Punkt notiert, aber erst nach einem Test gegen Dataverse-Locking
  auf der Ziel-Solution — nicht blind.
- **Versucht und wieder ausgebaut: ein SQL-Tab im Data Browser.** Dataverse
  bietet eine Web-API-Option `?sql=` für eine T-SQL-Teilmenge; die Bedingung
  war, dass sie gegen **jede** konfigurierte Umgebung läuft. Dafür gibt es
  keinen Transport: der Konnektor kodiert den Pfad-Parameter (`?sql=` kommt
  als `%3Fsql%3D` an, IIS-Fehler), die native Data Source der Code App
  erreicht nur die eigene Umgebung, und für fremde Orgs existiert kein Token.
  Der Befund ist als Gotcha im Handbuch festgehalten, damit der Versuch nicht
  wiederholt wird; im Paket ist davon nichts enthalten.

---

## 1.0.0.28 — 2026-09-10

**Korrektur zu 1.0.0.27: In den Demo-Daten steckten noch zwei Kunden-Bezeichner.
Keine Schema-Änderung, keine neue Flow-Version.**

- **Import History und Dual-Write Maps zeigten Kundennamen.** Die Demo
  importierte eine Solution `SSTCoreV2` und bildete eine F&O-Entität
  `SSTTimeReportMainEntity` ab. Jetzt `ContosoCoreV2` und
  `ContosoTimeReportMainEntity`.
- ⚠ **Warum das drei Durchgänge überlebt hat.** Der Sweep suchte jeweils nach
  den **Schreibweisen**, die zuletzt gefunden wurden, statt nach dem Token:
  `sst_` kann `SSTCoreV2` nicht treffen, `hso_` nicht `hso`. Jede Runde
  entfernte damit genau das, was das Muster der Vorrunde beschrieb — und dieses
  Muster stammte aus dem, was schon entfernt war.
  Die Musterliste besteht jetzt aus **Tokens**, case-insensitiv und ohne
  Unterstrich. Einzige Ausnahme ist `SST`: klein geschrieben steckt es in
  `AccessTeams`, `ProcessType` und `getAccessToken` — 41 Fehltreffer gegen 5
  echte. Ein Sweep, der ständig falschen Alarm gibt, wird ignoriert, deshalb
  bleibt dieses eine Muster großgeschrieben.
  Neu ist außerdem die Regel, das Token eines Kunden **beim ersten Kontakt**
  aufzunehmen — so wächst die Liste mit dem Kundenstamm statt mit den Vorfällen.

**Wer 1.0.0.27 bereits importiert hat**, sollte auf 1.0.0.28 gehen: die beiden
Bezeichner sind dort in den Demo-Daten enthalten (sichtbar nur im Demo-Modus,
nicht in echten Daten).

---

## 1.0.0.27 — 2026-09-10

**Filter für die Effektiv-Rechte im Security Role Analyzer. Keine
Schema-Änderung, keine neue Flow-Version.**

- **User rights lässt sich jetzt eingrenzen.** Ein User mit einer Handvoll
  Rollen kommt schnell auf mehrere hundert Zeilen Tabelle × Aktion — eine
  Liste, die niemand von oben nach unten liest. Gefiltert wird nach
  **Tabelle**, **Privileg** und **gewährender Rolle**, alle drei mit UND.
- **Die gewährenden Rollen stehen als Chips darüber** und filtern selbst: Klick
  zeigt nur, was diese Rolle gewährt, Klick auf den aktiven Chip hebt auf.
  Jeder Chip trägt die **Anzahl der Privilegien**, die er beisteuert — das ist
  der eigentliche Gewinn: Man sieht, welche Zuweisung die Arbeit macht. Eine
  **0** sagt das Gegenteil und bleibt deshalb stehen (nur abgedunkelt): eine
  Rolle, die dem User nichts gewährt, ist ein Befund, kein Rauschen.
  ⚠ Ein Chip je **Rolle**, nicht je Zuweisungspfad. Eine Rolle, die direkt
  *und* über ein Team kommt, ist eine Rolle mit einem Rechte-Satz; zwei Chips
  würden identisch filtern und eine Doppelvergabe suggerieren, die es nicht
  gibt. Beide Herkünfte stehen im Tooltip.
  Das Privileg-Auswahlfeld bietet nur die tatsächlich vorkommenden Aktionen,
  und der Filter wird bei jedem Benutzerwechsel geleert — ein übrig gebliebener
  Filter würde bei der nächsten Person still Rechte ausblenden.
- **Letzter fremder Platzhalter aus der Oberfläche entfernt:** Das
  ADO-Projektfeld im Einrichtungs-Assistenten schlug noch das Projekt eines
  bestimmten Kunden vor.
- ⚠ **Und eine Korrektur an der eigenen Prüfung.** Der mit 1.0.0.26 eingeführte
  Sweep nach fremden Kundenspuren las wegen eines falschen `unzip`-Musters nur
  **836 KB von 2,17 MB** des Pakets. Die damalige Meldung „keine Treffer" war
  deshalb nicht belastbar — im vollständigen Durchlauf kam prompt noch ein
  Treffer zutage (siehe oben). Der Sweep läuft jetzt über das ganze Paket und
  **immer mit einer Kontrollsuche**, deren Treffer vorhanden sein müssen; sonst
  beweist „0 Treffer" nur, dass nichts gelesen wurde. Für dieses Release ist
  beides erfüllt.

---

## 1.0.0.26 — 2026-09-10

**Aufräumen für die Auslieferung an fremde Kunden: In Demo-Daten, Oberfläche
und Build-Werten steckt kein anderer Kunde mehr. Keine Schema-Änderung, keine
neue Flow-Version** — der Import braucht keine Nachschritte über das Übliche
hinaus.

- **Demo-Daten tragen keine echten Kundennamen mehr.** Der Plugin Trace
  Explorer zeigte `Schulz.Plugins.*`, die Env-Config `hso_`-Variablen und
  -Connection-References, die Dual-Write-Karten `sst_`-Tabellen, die
  Import-Historie einen realen Publisher. Alles jetzt `pro_` bzw. Contoso —
  keine willkürliche Wahl, sondern die Konvention, die in dieser Demo ohnehin
  überall galt: Die Umgebungen, User, Firmen, Teams und Business Units waren
  längst Contoso, Fabrikam und Northwind.
  `cust_` bleibt bewusst stehen: kein echtes Kundenpräfix, sondern der
  neutrale Platzhalter für die Geschäftsdaten, die ein Transfer-Paket bewegt.
  Die Trennung ist gewollt — **`pro_` ist die Welt der Konsole, `cust_` sind
  die Kundendaten, mit denen sie arbeitet.**
- **Auch echte Personennamen sind raus.** Der Name des Autors stand in neun
  Dateien als Solution-Owner, Import-Autor, Job-Besitzer und Run-Anforderer,
  dazu ein Kollegenname im Process Comparer. Jetzt Wissenschaftler wie überall
  sonst in dieser Demo.
- **Die Oberfläche nennt keine fremde Tabelle mehr.** Der Process Comparer
  hatte den Tooltip „Defined desired state (hso_cloudflow)" fest verdrahtet —
  sichtbar in **jeder** Installation, nicht nur in der Demo. Diese Tabelle
  gehört dem Kunden, die App hat für den Zweck keine eigene; jetzt steht dort
  die **tatsächlich konfigurierte** Tabelle. Die fünf Platzhalter im
  Einrichtungs-Assistenten sind neutral (`yourprefix_…`) statt `hso_`, und die
  Feldbeschreibung sagt jetzt ausdrücklich, dass es **die eigene** Tabelle des
  Kunden ist — dieses Schweigen war der Grund, warum dort ein fremdes Präfix
  wie eine Vorgabe aussehen konnte.
- ⚠ **Und der Fund, der vom Quellcode aus unsichtbar war:** Eine nicht
  versionierte `.env`-Datei im Projektordner buk die Azure-DevOps-Organisation
  eines Kunden in **jeden** Build — und damit in **jede** managed Solution, die
  je exportiert wurde. Das Deploy-Skript schreibt die Build-Werte jetzt selbst,
  je Umgebung aus seiner eigenen Registry und mit neutralem Standard, sodass
  eine lokale Datei nicht mehr in ein Auslieferungsartefakt durchschlagen kann.
  Zur Laufzeit gewinnt ohnehin `pro_workbenchsettings`; die Build-Werte sind
  nur der Fallback bis zur Hydrierung.
  Verifiziert wurde diesmal nicht der Quellcode, sondern **das fertige Zip**:
  keine Treffer mehr auf Kundenname, ADO-Organisation, Umgebungs-URLs,
  Personennamen oder Fremdpräfixe.

---

## 1.0.0.25 — 2026-09-09

**Data Transfer: Weg zum Executor-Lauf, und die Run-Liste lädt nicht mehr die
komplette Historie. ⚠ Diesmal MIT Schema- und Flow-Änderung** — neue Spalte
`pro_transferrun.pro_flowrun_str` und ein geänderter Parent-Flow. Beim
Skript-Install müssen `provision-model.ps1` **und**
`deploy-executor-flow.ps1` erneut laufen; der managed Import bringt beides mit.

- **Link zum Executor-Lauf im Run-Detail.** Bei Zeilenfehlern schrieb der
  Child-Flow bisher „see the flow run history" ins Zell-Log — viermal, für
  Update, Create, Delete und Deactivate. Vier Sackgassen: Es hielt **nichts
  fest, welcher Lauf** das war, und für Cloud-Flow-Runs gibt es keine
  Dataverse-Tabelle zum Nachschlagen. Der Parent schreibt jetzt seine eigene
  Lauf-Referenz in `pro_flowrun_str`, der Hub macht daraus einen
  Power-Automate-Deeplink.
  Geschrieben wird sie **beim Beanspruchen des Laufs, nicht beim Abschluss**:
  Ein abgestürzter Executor erreicht seinen Finish-Schritt nie — und genau der
  Lauf ist der, den man öffnen will. Aus demselben Grund klappt das Detail
  jetzt auch **ohne Log** auf, denn ein Absturz hinterlässt keins.
  ⚠ Die Form des Links ist noch nicht empirisch bestätigt. Deshalb liegt in der
  Spalte das **rohe Paar aus Flow- und Lauf-ID, keine fertige URL**: Stimmt sie
  nicht, ist die Korrektur ein App-Fix statt eines Flow-Redeploys in jeder
  Kundenumgebung.
- **Run-Liste wird in der Abfrage gedeckelt.** Sie lud bisher die **gesamte**
  Run-Historie eines Pakets und warf sie danach bis auf 20 Zeilen weg —
  inklusive `pro_log_txt`, einem Memo mit 500.000 Zeichen. Während eines
  laufenden Transfers passiert das alle 10 Sekunden, die Kosten wuchsen also
  mit jedem je gelaufenen Run. Jetzt eine begrenzte Abfrage statt einer
  Paging-Schleife.
  Nebenbefund: Damit ist **Run-Housekeeping kein Speicherthema**, wie bisher
  angenommen, sondern ein Laufzeitthema — und es verschlimmert sich von selbst.
- **Fix:** Die beiden Timer der Run-Ansicht (Status-Poll und Laufzeit-Anzeige)
  hingen am Run-Array statt an einem Zustand. Jeder Poll riss dadurch sein
  eigenes Intervall ab und startete neu, sodass ein beliebiger Reload den
  nächsten Poll um volle 10 Sekunden verschob.

---

## 1.0.0.24 — 2026-08-19

**Nachbesserung zu 1.0.0.23: die Zeilenfehler-Meldung funktionierte dort nicht.
Jetzt nennt sie die echte Fehlermeldung UND die Anzahl betroffener Zeilen.
Keine Schema-Änderung, aber eine NEUE FLOW-VERSION** (Execute Cell) — nach dem
Import prüfen, dass die drei Transfer-Flows aktiv sind; bei einer
Skript-Installation stattdessen `installer/deploy-executor-flow.ps1` erneut
laufen lassen.

- **Was in 1.0.0.23 schiefging.** Der Ausdruck, der die Meldung lesen sollte,
  war ungültig und schlug zur Laufzeit fehl („property 'body' cannot be
  selected. Array elements can only be selected using an integer index").
  Ausgelesen am echten fehlgeschlagenen Lauf beim Kunden. **Das eingebaute
  Sicherheitsnetz hat dabei gehalten:** die Auswertung durfte scheitern, die
  Zelle fiel auf den alten generischen Satz zurück, der Transfer lief durch.
  Schlimmstenfalls keine Verbesserung — genau wie vorgesehen.
- **Die Ursache war ein falscher Befund in unserer eigenen Dokumentation.**
  Dort stand, die Flow-Engine liefere für eine Schleife nur die letzte
  Wiederholung zurück. Tatsächlich liefert sie **ein Element je Aktion**, und
  dessen `outputs` ist ein **Array mit einem Eintrag je Wiederholung** — bei
  einer Schleife über 68 Zeilen also 68 Einträge, jeder mit eigenem Status und
  eigener Antwort. Der alte Befund hatte die äußere Länge gemessen und für die
  Zahl der Wiederholungen gehalten. Das ist korrigiert; genau diese Fehldeutung
  hatte mich in 1.0.0.23 die schwächere Variante bauen lassen.
- **Dadurch ist jetzt mehr möglich als geplant.** Statt einer
  „repräsentativen" Meldung liest der Flow **alle** fehlgeschlagenen Zeilen,
  fasst identische Meldungen zusammen und nennt die Anzahl:
  `update — 52 row(s) failed: Entity 'msdyn_decisioncontract' With Id = d22f…
  Does Not Exist`. Ein fehlender Elterndatensatz, den 52 Zeilen treffen, ist
  ein Satz statt 52.
- ⚠ **Der eigentlich wichtige Nebeneffekt: die Zähler waren irreführend.** Ein
  Lauf meldete „6 created, 68 updated, 2 errors" — tatsächlich waren 52 der 68
  Updates und **alle** 6 Creates gescheitert, real geschrieben wurden 16
  Updates und kein Create. `created`/`updated` zählen laut Contract **Versuche**,
  aber auf dem Schirm stand das nirgends. Die Zeilenzahl in der Meldung ist
  derzeit der einzige Ort, an dem diese Lücke sichtbar wird.
- Diesmal **vor** der Auslieferung gegen die echten Laufdaten durchgerechnet
  statt angenommen: dieselbe JSON-Antwort der Engine, durch denselben Filter
  und dieselbe Abbildung.

---

## 1.0.0.23 — 2026-08-19

**Fehlgeschlagene Zeilen im Data Transfer nennen jetzt die echte Fehlermeldung
statt nur „see the flow run history". Keine Schema-Änderung, aber eine NEUE
FLOW-VERSION** (Execute Cell) — nach dem Import prüfen, dass die drei
Transfer-Flows aktiv sind; bei einer Skript-Installation stattdessen
`installer/deploy-executor-flow.ps1` erneut laufen lassen.

- **Die Meldung, die der Connector ohnehin liefert, steht jetzt im Log.** Bei
  einem fehlgeschlagenen Schreibvorgang meldete die Zelle bisher „update loop
  reported row failures — see the flow run history", während die Aktion daneben
  längst die Antwort hatte: `Entity 'msdyn_decisioncontract' With Id = d22f… Does
  Not Exist`. Genau dieser Text erscheint nun in der Fehlerliste des Laufs.
  Je Schreib-Loop filtert ein Query das Ergebnis des Loops auf
  `status = 'Failed'` und liest die Meldung über die Kette
  `outputs.body.error.message → outputs.body.message → error.message → code`.
  Diese Reihenfolge ist aus der Microsoft-Doku übernommen und nicht geraten:
  ein Connector-4xx legt das Detail in den Response-Body, während ein Fehler
  **ohne** Antwort — Expression, Timeout, Folgefehler — nur die Meldung auf
  Aktionsebene hat. Der Text wird auf 400 Zeichen gedeckelt, weil der
  Eltern-Flow jedes Zell-JSON per Read-Modify-Write an das Run-Log anhängt und
  ein ungedeckelter Text jedes spätere Anhängen aufblähen würde.
- **Zwei Dinge tut die Änderung bewusst nicht.** Sie fängt den Fehler *nicht*
  in der Schleife ab: das wäre der naheliegende Weg gewesen, hätte die Schleife
  aber auf „erfolgreich" gedreht und damit das bestehende Fehlersignal außer
  Kraft gesetzt — die Erkennung eines Fehlers hinge dann daran, dass der neue
  Meldungs-Pfad funktioniert. Die Schleifen scheitern unverändert; die Meldung
  wird danach gelesen und ist rein additiv.
  Und sie behauptet **keine Anzahl**: die Flow-Engine liefert nur die letzte
  Wiederholung einer Schleife zurück, also ist genau **eine** Meldung
  verfügbar. Deshalb heißt es „at least one row" und nicht „2 rows"; die
  vollständige Liste aller Zeilenfehler bleibt in der Run-History des
  Child-Flows.
- ⚠ **Wirkungsradius war die bestimmende Randbedingung.** Die Fehlerliste wird
  bei *jedem* Transfer erzeugt. Deshalb ist die Meldungs-Auswertung so
  verdrahtet, dass ihr eigenes Scheitern akzeptiert wird und auf den alten
  generischen Satz zurückfällt. Schlimmstenfalls gibt es keine Verbesserung —
  nie einen kaputten Transfer.
- ⚠ **Noch nicht an einem echten Fehlerfall verifiziert.** Der reproduzierbare
  Fall liegt in einer Umgebung, für die hier kein Zugang eingerichtet ist. Die
  Sicherheitseigenschaft oben ist konstruktiv, dass die Meldung tatsächlich
  erscheint, bestätigt der nächste echte Fehlversuch.

---

## 1.0.0.22 — 2026-08-17

**Der Spalten-Picker im Data Transfer zeigt nur noch Spalten, die sich
übertragen lassen. Keine Schema-Änderung, keine neuen Flow-Versionen** — der
Import braucht weder `provision-model.ps1` noch ein erneutes Aktivieren der
Executor-Flows.

- **Die abgeleiteten Geschwister-Spalten sind raus.** Der Picker listete
  alles, was die Metadaten hergeben — also auch jede Spalte, die Dataverse
  neben einer echten generiert: `inv_priorityname` als Label der Choice
  `inv_priority`, `<lookup>name`, `<money>_base`. Bei einer Tabelle mit einer
  Handvoll Choices verdoppelt das die Liste grob, und **keine** davon ist ein
  Kandidat für einen Transfer: das Ziel leitet sie selbst ab, der Executor
  könnte sie also nie schreiben.
  Zwei Entscheidungen dahinter, die im Betrieb den Unterschied machen:
  **Der Dienst filtert nicht, er markiert nur.** Selektiert eine bestehende
  Query bereits eine solche Spalte, bleibt sie im Picker stehen und lässt sich
  abwählen — würde stattdessen serverseitig gefiltert, hätte man die Spalte im
  FetchXML und kein Bedienelement mehr, das sie entfernt. Die Merkliste wird
  beim Öffnen **eingefroren**, nicht aus den aktuellen Häkchen abgeleitet:
  sonst verschwindet die Zeile beim Abwählen unter dem Cursor.
  ⚠ **Eine MultiSelect-Choice meldet sich wie die echten virtuellen Spalten**
  und musste über ihren Typnamen gerettet werden. Ohne das wäre eine echte,
  transportierbare Spalte aus dem Picker verschwunden — ein stiller Verlust,
  und der wäre hier schlimmer als eine Zeile zu viel.
  Dasselbe Filter gilt für die **Match-Spalten**: ein generiertes Label ist
  keine Grundlage, um einen Zieldatensatz zu finden. Was die Query selbst
  nennt, bleibt auch dort stehen, damit kein bestehender Eintrag seine
  Match-Spalte verliert.
- **Deploy-Skript: das pac-Profil wird direkt vor dem Push erneut aktiviert.**
  Bisher stand im Handbuch, das aktive Profil überlebe den Wechsel zwischen
  zwei Aufrufen nicht. Es kippt aber auch **innerhalb eines Laufs**: beim
  Deploy nach Schulz meldete der Eingangs-Guard korrekt INT-11, danach lief die
  Flow-Registrierung über die npm-CLI, und beim Pre-Push-Check war das
  **Waldmann**-Profil aktiv — der Stand von vor der Sitzung. Der zweite Guard
  hat abgebrochen und ist der einzige Grund, warum die Console nicht in eine
  fremde Kundenumgebung gepusht wurde.
  ⚠ Was **nicht** geholfen hätte: Waldmann steht in der Registry auf
  `Enabled = $false` — das blockiert nur den Aufruf *für* diese Umgebung, nicht
  einen Push für eine andere, der dort landet. Der Guard bleibt deshalb
  zusätzlich zum Re-Select bestehen und nennt jetzt auch die Umgebung, die er
  tatsächlich vorgefunden hat.
  (Betrifft nur die Entwicklung; im managed Paket ist das Skript nicht
  enthalten.)

---

## 1.0.0.21 — 2026-08-17

**Lookup- und Choice-Spalten zeigen wieder Namen statt GUIDs und Zahlen — und
die Ursache dahinter war eine Zeile, die mehrere über Monate getrennt notierte
„Eigenheiten des Konnektors" erklärt. Keine Schema-Änderung, keine neuen
Flow-Versionen** — der Import braucht weder `provision-model.ps1` noch ein
erneutes Aktivieren der Executor-Flows.

- **Im Data Transfer blieben Lookup-Spalten in der Preview leer.** Eine
  Abfrage fordert `<attribute name="inv_subject"/>` an, die Web API liefert die
  Spalte aber **nie** unter diesem Namen zurück, sondern als
  `_inv_subject_value`. Die Preview las den Klarnamen — also stand unter einer
  Überschrift, die Daten versprach, nichts.
  **Die Übertragungen selbst waren nie betroffen**: der Executor gleicht seit
  immer beide Schreibweisen ab (`coalesce(item()?[col],
  item()?['_'+col+'_value'])`). Falsch war ausschließlich die Anzeige — und das
  ist die unangenehmere Hälfte, weil die Preview das ist, woran jemand
  entscheidet, ob ein Entry fertig ist. Dasselbe Muster steckte im Fallback für
  `<all-attributes/>`-Abfragen, wo alle Schlüssel mit führendem `_`
  herausgefiltert wurden: dort fehlten die Lookups nicht nur inhaltlich,
  sondern ganz.
- **Danach standen GUIDs da statt Namen — und das führte auf die eigentliche
  Ursache.** `prefer` ist der dritte Parameter der Konnektor-Operation, und die
  zentrale FetchXML-Abfrage der App übergab dort immer `undefined`. Ohne
  `odata.include-annotations="*"` liefert der Konnektor **überhaupt keine**
  Anzeigetexte: jeder Lookup ist eine nackte GUID, jede Choice eine nackte
  Zahl, egal wie sorgfältig der Aufrufer danach sucht.
  Das erklärt rückwirkend mehrere Befunde, die bisher als getrennte
  Konnektor-Eigenheiten dokumentiert waren — ein Optionsset, das als
  `864640001` ankam und deshalb über `stringmap` aufgelöst wird; ein
  Owner-Feld ohne verlässlichen Anzeigetext, weshalb der Process Comparer
  stattdessen die Benutzertabelle dazujoint; und die Owner-Spalte, die im
  Dual-Write-Cockpit aus demselben Grund weggelassen wurde. Der OData Browser
  war das einzige Feature mit Labels — weil er das einzige ist, das danach
  fragt.
  Die Annotationen sind jetzt **einschaltbar, aber nicht Standard**: sie
  verdoppeln eine breite Zeile grob, und die schweren Abfragen der App
  (Rollen-Privilegien, Plugin-Traces, Freigaben — Zehntausende Zeilen) lesen
  nur Rohwerte und würden für nichts bezahlen. Eingeschaltet ist es dort, wo
  ein Mensch das Ergebnis liest: Data-Transfer-Preview und Import-History.
  ⚠ **Die bestehenden Umgehungen bleiben absichtlich stehen.** Sie
  funktionieren und sind an echten Daten erprobt; sie durch die Annotationen zu
  ersetzen ist eine eigene Änderung mit eigener Prüfung.
- **Import History: „Erstellt von" war immer leer.** Auch `createdby` ist ein
  Lookup und wurde unter dem Klarnamen gelesen, konnte also nie einen Wert
  haben. Aufgefallen war es nie, weil daneben der Publisher steht und der
  Import-Benutzer ohnehin meist das Systemkonto ist.
- Beide Schreibweisen laufen nun durch **eine** gemeinsame Stelle, damit die
  Auflösungsreihenfolge einmal festgelegt und einmal getestet ist:
  Anzeigetext zuerst, dann Rohwert — und `0` sowie `false` sind Werte, nicht
  Abwesenheit. Genau dieser Fall kippt bei solchen Ketten gern still.

---

## 1.0.0.20 — 2026-08-10

**Nur die Dual-Write Maps — dort aber zwei stille Falschaussagen abgestellt und
das Cockpit auf alle Umgebungen geöffnet. Keine Schema-Änderung, keine neuen
Flow-Versionen** — der Import braucht weder `provision-model.ps1` noch ein
erneutes Aktivieren der Executor-Flows.

- **Die angezeigte Version war nicht die laufende.** Das Cockpit setzte
  „aktuelle Version" mit der **höchsten Versionsnummer** gleich. Auf
  `msdyn_dualwriteentitymap` markiert aber **kein Feld** die Version, die im
  Dienst ist — jede gespeicherte Version ist ein eigener Datensatz, und alle
  sind aktiv, veröffentlicht und unmanaged. Wo eine Sonderversion geparkt liegt,
  gewann sie den Zahlenvergleich: An INT-11 traf das 3 von 91 Maps, darunter
  `sst_[msdyn_projects - Projects]`, das seit November 2023 eine `9.9.9.9`
  („für Datenmigration") anzeigte statt der 2.0.2.1 vom August 2026.
  **Den neuesten Datensatz zu nehmen wäre keine Lösung, nur eine
  Verschiebung**: `sst_[salesorders - CDS sales order headers]` läuft mit
  2.0.1.8, sein zuletzt angelegter Datensatz ist dieselbe 9.9.9.9.
  Die laufende Version steht woanders — in **`msdyn_dualwriteruntimeconfig`**,
  wo jede aktive Zeile die Version des Mappings samt Quell- und Zieltabelle
  führt. Die liest das Cockpit jetzt und zeigt sie mit dem Marker **`live`**.
  ⚠ **Die Abdeckung ist prinzipbedingt teilweise**: Dataverse führt diese
  Laufzeit-Konfiguration nur für Maps, bei denen es die **Quelle** ist
  (CRM → AX) — 45 von 91 an INT-11; bei den übrigen liegt sie auf der
  F&O-Seite. Ein fehlender Eintrag heißt deshalb „Version unbekannt", nicht
  „läuft nicht", und die Zeile sagt genau das: **`latest saved`** statt einer
  Behauptung. Liegt eine gespeicherte Version **über** der laufenden, ist das
  ein eigener Befund in der Zeile — jemand hat eine Version gespeichert und nie
  in Betrieb genommen.
- **Maps sind jetzt je Umgebung einsehbar** (Auswahl oben, Vorgabe = Host).
  Die Abfragen laufen umgebungsübergreifend über den Konnektor; jeder Cache
  liegt pro Umgebung, damit nicht beim Umschalten UATs Maps unter PRODs
  Überschrift stehen. Ist Dual-Write in der gewählten Umgebung nicht
  installiert, steht das im Klartext da statt eines Abfragefehlers.
- **Dabei kam heraus, dass der bisherige Filter eine Host-Annahme war.** Das
  Cockpit zeigte nur **unmanaged** Maps — richtig für die Entwicklungsumgebung,
  wo autorisiert wird, aber falsch für alles danach: Maps erreichen UAT und
  PROD **in einer Solution und sind dort managed**, in PROD 223 von 236
  Map-Namen. Der Filter hätte 19 Maps gezeigt und dabei ausgesehen wie eine
  vollständige Antwort. Er ist weg; stattdessen stehen **Custom / Managed /
  All als Filter mit Zählern** in der Leiste, mit *Custom* als Vorgabe im Host
  (dort sind die rund 120 Standard-Maps Rauschen) und *All* in den anderen
  Umgebungen.
- **Neuer Befund „unmanaged layer".** Aus der Managed-Auswertung fallen zwei
  verschiedene Aussagen: ob eine Map ausschließlich über eine Solution kam —
  und ob eine **transportierte Map zusätzlich unmanaged Datensätze trägt**,
  also direkt in der Zielumgebung bearbeitet wurde. In PROD betrifft das
  **6 Maps**, `sst_[msdyn_projects - Projects]` darunter. Sie sind jetzt
  markiert; das ist für Dual-Write dasselbe, was der Layer Inspector für
  Solution-Komponenten meldet. Ob dort eine inhaltlich abweichende Definition
  steckt oder nur ein folgenloser Speichervorgang, sagt der Marker **nicht** —
  er nennt die Kandidaten, das Mapping selbst zeigt das Overlay.
- ⚠ **Voraussetzung**: Der Service Principal hinter dem Konnektor braucht
  Leserecht auf `msdyn_dualwriteruntimeconfig` — je Umgebung. Fehlt es, wird
  der Fehler geschluckt (die Liste bleibt vollständig) und **jede** Zeile
  fällt auf `latest saved` zurück. Das Erkennungszeichen ist also kein Fehler,
  sondern das Ausbleiben jedes `live`-Markers.

---

## 1.0.0.19 — 2026-08-06

**Teilbare Links auf einen Arbeitsbereich, dazu eine Feldsuche im
Datensatz-Panel des OData Browsers. Keine Schema-Änderung, keine neuen
Flow-Versionen** — der Import braucht weder `provision-model.ps1` noch ein
erneutes Aktivieren der Executor-Flows.

- **Deeplinks**: `?p=<bereich>` an der Play-URL öffnet den Arbeitsbereich; das
  **🔗 in der Topbar** legt den Link zum gerade offenen Bereich in die
  Zwischenablage, inklusive `&hidenavbar=true` (blendet die Leiste des Players
  aus — die Konsole bringt ihre eigene Navigation mit, und der Platz fehlt
  vertikal ohnehin).
  Die Form folgt aus einer Tatsache, nicht aus Geschmack: Die App läuft im
  iframe des Players, **die Adresszeile gehört also dem Player**. Ein Link
  lässt sich dort nicht ablesen, nur komponieren — daher der Button statt
  einer mitwandernden URL. Gelesen wird er über die dafür vorgesehene
  SDK-Schnittstelle.
  **Gated Bereiche öffnet ein Link erst nach bestandener Rollenprüfung**: Sonst
  landete man auf einer Seite, zu der die Sidebar gar nicht navigiert, und säße
  vor einer leeren Hülle. Bis dahin — und für alle ohne die Rolle — führt der
  Link auf den Standardbereich, wo das Ziel wie gewohnt als gesperrt erscheint.
  Unbekannte Bereichs-Namen degradieren ebenso, statt zu scheitern; die
  Zuordnung ist außerdem groß-/kleinschreibungstolerant, weil Chat- und
  Ticketsysteme URLs gern kleinschreiben.
  ⚠ Erzeugte Links zeigen auf die **kommerzielle Cloud** — der Host-Kontext
  meldet Umgebung und App, aber nicht den Host, von dem geladen wurde.
- **Feldsuche im Datensatz-Panel** (OData Browser → Datensatz → Fields): Eine
  Dataverse-Zeile bringt 30 bis 200 Felder mit; sie zu finden hieß bisher
  scrollen. Gesucht wird über **drei** Achsen, weil nicht vorhersagbar ist,
  welche jemand im Kopf hat: **Anzeigename**, **technischer Name** (mit *und*
  ohne die `_…_value`-Dekoration eines Lookups) und **Inhalt** — und zwar in
  **beiden** Darstellungen, formatiert und roh. Nur eine davon zu prüfen wäre
  eine Falle: Ein Betrag zeigt sich als `€4.200,00`, enthält wegen des
  Trennzeichens also gar kein „4200" — wer die gespeicherte Zahl tippt, fände
  nichts. Umgekehrt findet man `statecode` über „Active", obwohl dort `0` steht.
  Reiner Teilstring, **kein** Zerlegen an Leerzeichen: Ein Feld, das Wörter
  still ver-UNDet, überrascht beim Einfügen eines Werts mit Leerzeichen. Leer
  gefilterte Gruppen verschwinden samt Überschrift, die Suche bleibt beim
  Scrollen oben stehen und wird bei jedem Datensatzwechsel geleert.

---

## 1.0.0.18 — 2026-08-05

**Nur OData Browser. Keine Schema-Änderung, keine neuen Flow-Versionen** —
der Import braucht diesmal weder `provision-model.ps1` noch ein erneutes
Aktivieren der Executor-Flows.

- **Spalten werden nicht mehr als Chip-Liste geführt.** Jede gewählte Spalte
  war ein eigener entfernbarer Chip; bei zwanzig Spalten und Namen wie
  `_pro_package_ref_value` lief das über mehrere Zeilen und schob die Query
  aus dem Bild. Die Liste war ohnehin die **dritte** Darstellung derselben
  Information: Der Button daneben zählt sie, die stets sichtbare Query-Zeile
  zeigt `$select=…` als maßgebliche, editierbare Fassung, und nach dem Lauf
  stehen sie nochmal als Grid-Kopfzeilen da — mit Daten darunter.
  **Einzelne Spalten wirft man jetzt in der Grid-Kopfzeile per ✕ raus**,
  also dort, wo einem beim Lesen auffällt, dass man sie nicht braucht. Der
  Klick auf den Titel sortiert weiter wie bisher.
  Zwei Fälle zeigen bewusst **kein** ✕, weil es dort lügen würde: ohne
  `$select` bestimmt der Server die Spalten (Entfernen müsste erst ein
  `$select` mit allen übrigen erfinden), und bei nur noch einer Spalte
  bedeutet ein leeres `$select` „alle Spalten" — die letzte zu entfernen
  würde die Query also *erweitern*.
- **Copy-Buttons für `$select`, `$filter` und `$expand`** unter der
  Query-Zeile, für die Felder einer „List rows"-Aktion im Cloud Flow. Sie
  kopieren den **nackten, unkodierten** Wert — nicht den Ausschnitt aus der
  URL: Der Konnektor kodiert diese Felder selbst, ein mitkopiertes `%20` oder
  `%27` zerlegt dort jeden Filter. Deaktiviert, wenn der jeweilige Teil leer
  ist (der Tooltip sagt welcher fehlt, statt still `""` zu kopieren) und
  solange die Query-Zeile eine **nicht angewendete** Änderung hat — dann
  hielte der Builder noch die alte Query und gäbe etwas anderes aus als auf
  dem Schirm steht. Der Tooltip zeigt vorab den exakten String.

---

## 1.0.0.17 — 2026-08-05

**Transfer Hub: Delta-Transfers und ein sichtbarer Write Plan. Drei neue
Spalten auf `pro_transferentry` (`pro_deltamode_opt`, `pro_deltafetchxml_txt`,
`pro_deltawatermarks_txt`) — der managed Import bringt sie mit, beim
Skript-Install muss `provision-model.ps1` erneut laufen. Die drei
Executor-Flows sind ebenfalls neu und müssen nach dem Import wieder aktiviert
werden.**

- **Delta-Transfers**: Ein Entry überträgt auf Wunsch nur noch Zeilen, deren
  `modifiedon` seit dem letzten sauberen Lauf liegt. Vier Regeln, jede davon
  gegen einen konkreten Datenverlust:
  - **Ein Wasserstand je Ziel**, nicht je Entry — ein Lauf, der in UAT landet
    und in PROD scheitert, darf PROD diese Zeilen nicht für immer überspringen.
  - **Der Stempel ist die Lesezeit, zwei Minuten zurückdatiert**, nicht die
    Fertigzeit: Zeilen, die während des Laufs geändert werden, muss der nächste
    Lauf noch fangen; die Marge deckt Uhr-Versatz ab. Doppelt übertragen ist
    gratis (es sind Upserts), verloren nicht.
  - **Er rückt nur bei sauberer Zelle vor** — nicht beim Dry Run, nicht bei
    gezogener 5000er-Notbremse, nicht bei Fehlern. Sonst würden ausgerechnet
    die gescheiterten Zeilen beim nächsten Mal übersprungen.
  - **Delta und Orphan-Handling schließen sich aus**, blockierend im Save-Gate
    statt als Warnung: Ein Delta-Set ist unvollständig, also sähe jede
    unveränderte Zielzeile verwaist aus — mit Handling *Delete* leert der
    zweite Lauf die Tabelle.
  Die gefilterte Query baut der Hub vor (`pro_deltafetchxml_txt` mit genau
  einer `__DELTA__`-Lücke), weil der Flow kein XML-Werkzeug hat. Die
  Delta-Bedingung **umschließt** vorhandene Filter in einem neuen
  `<filter type="and">`, statt sich in sie hineinzuhängen — in einem
  `<filter type="or">` des Autors wäre aus „geändert seit X" sonst still
  „geändert seit X ODER sein Filterkriterium" geworden.
  Zwei ehrliche Grenzen stehen in der UI: Delta hebt die **5000er-Grenze
  nicht auf** (das Ziel wird weiter vollständig für den Match-Index gelesen),
  und eine nachträglich erweiterte Query füllt **nicht rückwirkend** auf —
  dafür gibt es **„Reset delta"**.
- **Write Plan im Entry-Dialog**: Welche Spalte geschrieben, welche als
  Referenz gebunden und welche mit welcher Begründung übersprungen wird, stand
  bisher nur im Rezept für den Executor. Jetzt zeigt der Dialog es an — gespeist
  aus **derselben Berechnung**, die auch gespeichert wird, damit Anzeige und
  Executor-Rezept nicht auseinanderlaufen können. Die Hinweise sind der
  eigentliche Gewinn: eine **fallengelassene Referenz** (polymorpher Lookup,
  unauflösbares Ziel) lässt die Zeile ohne ihren Bezug im Ziel landen, während
  der Lauf Erfolg meldet; je Lookup sagt der Dialog, ob die Zieltabelle von
  **keinem**, einem **inaktiven** oder einem **später laufenden** Entry
  übertragen wird. Ein **leerer Plan blockiert das Speichern**.
- **Fix — Zeilenenden sind kein Inhalts-Drift**: Dieselbe Web Resource mit LF
  in der einen und CRLF in der anderen Umgebung wurde als kompletter Drift
  gemeldet und im Diff vollständig eingefärbt. Hash und Diff laufen jetzt über
  normalisierten Text (BOM entfernt, CRLF/CR → LF). **Nicht** normalisiert
  werden Trailing Spaces, Leerzeilen und Einrückung — das sind Änderungen.
  Nebenbefund mitbehoben: der Hash lief über das rohe Base64, der Diff über den
  dekodierten Text.
- **Fix — Lesbarkeit**: Der Bestätigen-Button eines PROD-Transfer-Laufs trug
  dunkelroten Text auf brand-lila Fläche. Jetzt ein durchgehend roter
  Destruktiv-Button.

---

## 1.0.0.16 — 2026-08-04

**Security-Ausbau: Role Comparer, eingefrorene Baselines und
Security-Konzept-Dokument. Neue Tabelle `pro_securitysnapshot` (9. Tabelle).**

- **Role Comparer** (Validate, gated, lazy): dieselbe Sicherheitsrolle über alle
  konfigurierten Umgebungen als Matrix — je Zelle Privilegienzahl,
  managed/unmanaged und wie viele Privilegien gegenüber der Baseline-Umgebung
  abweichen. **Match über den Rollen-NAMEN**, nicht die GUID (die überlebt nur
  sauberen Transport); Name gleich + ID verschieden ⇒ Badge „rebuilt".
  Scope-Vorauswahl: standardmäßig nur Custom-Rollen, optional auf die
  Rollen-Komponenten einer Release-Solution eingeschränkt. Read-only —
  eine driftende Rolle wird transportiert, nicht im Ziel repariert.
- **Baselines einfrieren** (`pro_securitysnapshot`): der Ist-Zustand als
  benannter Snapshot; „Compare against" prüft danach jede Umgebung gegen **ihr
  eigenes eingefrorenes Ich** („was hat sich seit dem Audit geändert?") mit den
  Verdikten changed / new / gone since freeze.
- **Security-Konzept-Dokument** (Sub-Tab „Document"): Baseline als lesbares
  Dokument — Umgebungen, je Rolle die Privilegien-Matrix, Abweichungen. Zweiter
  Baseline wählbar ⇒ Kapitel „Changes since …" mit jedem verschobenen Privileg.
  Umgebungen einzeln ab-/anwählbar; Markdown- und Text-Export.
- **Role Analyzer wieder in der App** (Operate) — lädt aber **erst auf Klick**
  („Analyze"), damit das Öffnen nicht die falsche Umgebung zieht. Damit sind
  auch Core Role Extractor, Team-&-BU-Map und Field-Level Security wieder
  erreichbar.
- **Solution Import History**: bei fehlenden Abhängigkeiten zeigt die Tabelle
  jetzt auch den **Parent der fehlenden Komponente** (welche Tabelle eine View
  oder ein Formular gehört) — vorher stand der Parent nur auf der
  abhängigen Seite.
- **Fix:** „Mark completed" schließt den Working-Solution-Record jetzt wirklich
  (`statecode`), vorher blieb der Eintrag trotz Status-Label unter „Open"
  stehen. Neue **Reopen**-Aktion (↺) macht das rückgängig.
- **UI:** Sidebar-Gruppen sind aufklappbar (21 Menüpunkte passten nicht mehr auf
  einen Notebook-Bildschirm), **Data Transfer** ist von Manage nach **Operate**
  gewandert, Erklärtexte liegen hinter einem ⓘ neben dem Seitentitel.
- **Bundle:** Role Analyzer und Role Comparer werden **bei Bedarf nachgeladen**
  (`React.lazy`) — im Player verifiziert, dass zur Laufzeit geholte Chunks
  ausgeliefert werden.

Datenmodell-Änderung: `installer/provision-model.ps1` legt zusätzlich
`pro_securitysnapshot` an (idempotent, bestehende Tabellen werden übersprungen).

## 1.0.0.14 — 2026-07-25

**Fix — Transfer-Executor-Flows sind beim Kunden aktivierbar und im Designer lesbar.**

In 1.0.0.13 hatten die drei Executor-Flows (Execute Package / Execute Cell /
Scheduler) die **Host-URL der Authoring-Umgebung fest im `organization`-Parameter
eingebacken**. Beim Import in eine ANDERE Umgebung zeigte der Wert auf eine
fremde, für die dortige Connection unerreichbare Org → Aktivierung (Maker
„Turn on" wie auch Managed-Import) scheiterte an
`GetMetadataForGetEntityWithOrganization … 401 … "The response is not in a JSON
format."`, und der Designer rendere die Flows nur teilweise (~14 von 35 Actions).

- **Host-Operationen nutzen jetzt `organization: "current"`** (löst gegen die
  eigene Umgebung der gebundenen Connection auf) → portabel über Umgebungen,
  Designer rendert vollständig, Turn-on validiert normal, Run-Only konfigurierbar.
- Die echten cross-env-Operationen des Child-Flows (Quelle lesen, Ziel schreiben)
  behalten die dynamische Ziel-URL als Runtime-Ausdruck — ein *non-foldable* Wert,
  der den Design-Zeit-Schema-Check überspringt.
- Verifiziert: Aktivierung + Dry-Run + echter Update-Write im Playground;
  Managed-Import + Aktivierung in einer Fremd-Umgebung bestätigt.
- Doku/Skripte nachgezogen (`activate-flows.ps1`, Release-README): der Maker-
  „Turn on"-Button ist nicht mehr als gesperrt beschrieben.

Sonst funktional identisch zu 1.0.0.13.

---

## 1.0.0.13 — 2026-07-24

Erster dokumentierter Release — **Gesamtstand, stark verkürzt.** Power Apps
**Code App** (React 19) zur Verwaltung von Dataverse-Solutions über den ALM-Zyklus,
mit dem `pro_`-Datenmodell (8 Tabellen), 3 Transfer-Executor-Flows und 1 Security Role.

**Neu in diesem Release**
- ⭐ **Self-Provisioning Wizard** (Reference › „Environment Setup"): geführtes
  Erst-Setup, blendet beim Start ohne Konfiguration hart blockierend vor und legt
  die Steuer-Datensätze an (`pro_workbenchsettings` + je Umgebung
  `pro_environmentconfig`). Bietet erreichbare Umgebungen zur Auswahl, liest
  Organization-/Environment-ID automatisch, schlägt Publisher/Rolle vor;
  freie Environment-Keys (DEV/TEST/UAT/QS/INT/PAR/PROD), idempotenter Upsert.

**Funktionsumfang (Überblick)**
- **Manage:** Workbench (Working Solutions anlegen/tracken/mergen), Merge (Plan,
  Konfliktmarkierung, Historie), Merge Rules, Release-Notes-Generator, Release
  Timeline, Configuration Data Transfer Hub (deklarative Transfer-Pakete mit
  Executor-Flows, Dry-Run, Zeitplan).
- **Validate:** Deployment Readiness (Dependency Check), Analyze-Dashboard (Risk
  Score), Env Config Cockpit (EnvVars/Connection References cross-env), Audit-
  Config-Analyzer, Dual-Write-Table-Maps, Import History, User Settings, Process
  Comparer, Plugin Comparer.
- **Operate:** Plugin Trace Explorer (Job Monitor / Role Analyzer als Preview).
- **Reference:** Environment Links, Environment Setup (Wizard).

**Technik:** Cross-Env-Reads über den Dataverse-Konnektor (Service Principal),
Writes nativ als angemeldeter User; Laufzeit-Konfiguration data-driven aus
`pro_workbenchsettings` / `pro_environmentconfig`.

**Import-Nachschritte:** Connection Reference der Executor-Flows binden + die 3
Flows aktivieren, `pro_*`-Rechte/Security-Role zuweisen, Code App ggf. zur
App-Liste hinzufügen (Details in [`README.md`](README.md)).
