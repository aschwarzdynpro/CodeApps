/**
 * Feature guide, opened via the "?" icon in the header. Static content —
 * keep the sections in sync with the README when features change.
 */
export function HelpPanel({ onClose }: { onClose: () => void }) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal card modal--wide help"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header help-header">
          <div className="help-title">
            <span className="help-title-icon" aria-hidden="true">
              ?
            </span>
            <div className="help-title-text">
              <h2>Feature guide</h2>
              <p className="help-subtitle">
                How the Solution Administration Console works — tab by tab.
              </p>
            </div>
          </div>
          <button className="modal-close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        <div className="help-body">
          <section className="help-section">
            <h3>Concept</h3>
            <p>
              A <strong>working solution</strong> has two parts: a record in
              the <code>pro_workingsolution</code> table (title, DevOps id,
              type, owner, deployment status, merge log) and the{' '}
              <strong>real unmanaged solution</strong> carrying the
              components, linked by its unique name. A banner at the right edge
              of every row (<span className="sol-state sol-state--both">Synced</span>{' '}
              / <span className="sol-state sol-state--record-only">WS only</span>{' '}
              / <span className="sol-state sol-state--solution-only">Sol only</span>)
              shows which of the two parts exist — hover it for details.
            </p>
          </section>

          <section className="help-section">
            <h3>📊 Analyze (post-deployment)</h3>
            <ul>
              <li>
                Everything to review <strong>after</strong> a release reaches a
                target. In one toolbar row pick the release, the target (UAT /
                PROD) and which checks to include —{' '}
                <strong>Compare</strong> (incl. content drift),{' '}
                <strong>Layers</strong> and <strong>App Sharing</strong> — then
                hit <strong>Analyze</strong>.
              </li>
              <li>
                The sweep fills four tabs: a <strong>Summary</strong> dashboard
                plus one tab per selected check with its full content. (Things
                to check <em>before</em> deploying live in{' '}
                <strong>Deployment Readiness</strong>.)
              </li>
              <li>
                The sweep <strong>keeps running when you navigate away</strong>
                {' '}— a small bar at the bottom-left shows the progress and a{' '}
                <strong>View</strong> button to jump back; the result is ready
                when you return.
              </li>
              <li>
                A <strong>Deployment Risk Score</strong> gauge (0–100, higher is
                safer) bands the release as{' '}
                <span className="risk-band risk-band--low">Low Risk</span>,{' '}
                <span className="risk-band risk-band--medium">Medium Risk</span>{' '}
                or <span className="risk-band risk-band--high">High Risk</span>,
                with severity cards counting{' '}
                <span className="sev-pill sev-pill--critical">Critical</span>,{' '}
                <span className="sev-pill sev-pill--high">High</span>,{' '}
                <span className="sev-pill sev-pill--medium">Medium</span> and{' '}
                <span className="sev-pill sev-pill--low">Low</span> findings.
              </li>
              <li>
                The severity cards are <strong>clickable filters</strong>, and{' '}
                <strong>Issues</strong> lists every finding grouped by
                criticality in collapsible sections;{' '}
                <strong>Solution Components</strong> breaks the solution down by
                component type.
              </li>
              <li>
                <strong>Recommendations</strong> turn the findings into concrete
                next steps, and the <strong>Environment Readiness</strong>{' '}
                matrix shows per-area compatibility with the target plus an
                overall readiness percentage.
              </li>
              <li>
                Requires the “INT | Deployment Manager” role.
              </li>
            </ul>
          </section>

          <section className="help-section">
            <h3>🔍 ALM Detective</h3>
            <ul>
              <li>
                A phased <strong>pre-deployment audit</strong> for a release
                solution: it runs the selected ALM checks one after another
                and compiles everything into a single report ranked by
                criticality — instead of opening each tab separately.
              </li>
              <li>
                Pick the <strong>deployment target</strong> (UAT / PROD) and
                tick the checks: <strong>Dependency Check</strong>,{' '}
                <strong>Compare</strong> (incl. content drift),{' '}
                <strong>Layer Inspector</strong>, <strong>App Sharing</strong>.
                The target applies to Layer &amp; Dependency checks; Compare
                and App Sharing always span UAT &amp; PROD.
              </li>
              <li>
                A <strong>phase stepper</strong> lights up as the
                investigation runs — each phase shows its progress, then a ✓
                with the number of findings (or “skipped” / “failed”).
              </li>
              <li>
                Findings are grouped by severity and filterable:{' '}
                <span className="sev-pill sev-pill--critical">Critical</span>{' '}
                (missing dependency — import breaks),{' '}
                <span className="sev-pill sev-pill--high">High</span> (unmanaged
                layer over a managed component, canvas app not shared),{' '}
                <span className="sev-pill sev-pill--medium">Medium</span>{' '}
                (status / content drift),{' '}
                <span className="sev-pill sev-pill--low">Low</span> (missing in
                target, unmanaged-only, lookup failures). The verdict at the
                top says whether the release is deployment-ready.
              </li>
              <li>
                The report is intentionally compact — for the full detail of
                any finding, open the matching single-feature tab. Requires the
                “INT | Deployment Manager” role.
              </li>
            </ul>
          </section>

          <section className="help-section">
            <h3>Workbench</h3>
            <ul>
              <li>
                <strong>Filter chips</strong> (Features / Bugs / Releases /
                Other) plus the search box in the action row (title, unique
                name, DevOps id).
              </li>
              <li>
                <strong>Open</strong> and <strong>Tracked</strong> are on by
                default — they narrow the list to working solutions whose
                record is still <strong>active</strong> (statecode 0) and that
                have a working-solution record. The deployment status (e.g.
                “Merged into Deployment Solution”) does not close an entry —
                only deactivating its record does. Untick the filters to reach
                closed or untracked entries.
              </li>
              <li>
                The <strong>owner dropdown</strong> filters the list to a
                single owner (or all owners).
              </li>
              <li>
                <strong>⟳ Refresh</strong> reloads the list from the
                environment; an <strong>“Updated &lt;time&gt;”</strong> stamp
                next to it shows when it was last loaded.
              </li>
              <li>
                <strong>incl. components</strong> — builds a one-time index
                (across the <strong>open</strong> working solutions) so the
                search also matches component display names (e.g. find every
                open solution containing a specific security role). Matches
                appear as yellow chips on the rows.
              </li>
              <li>
                <strong>group by work item</strong> — groups the list by
                DevOps number; an amber counter marks numbers with several
                solutions. Entries without a number collect at the bottom.
              </li>
              <li>
                <strong>⚠ Scan collisions</strong> — loads the components of
                the <strong>open</strong> tracked working solutions (releases
                excluded) and flags components contained in more than one of
                them: whoever deploys last overwrites the others. Affected rows get a{' '}
                <span className="coll-chip">⚠ shared</span> chip; the detail
                pane lists each shared component and the other solutions
                carrying it.
              </li>
              <li>
                <span className="dup-chip">duplicate link</span> — more than
                one working-solution record points at the same solution;
                deactivate the redundant record in the table to clean up.
              </li>
              <li>
                <strong>⟳ Sync with DevOps</strong> — runs the cloud flow that
                refreshes each working solution's work item status from Azure
                DevOps. An in-progress note shows while it runs; when it
                finishes the list reloads and the{' '}
                <span className="tbc-chip">✓ to be completed</span> check
                re-evaluates against the new statuses.
              </li>
            </ul>
          </section>

          <section className="help-section">
            <h3>Create &amp; track</h3>
            <ul>
              <li>
                <strong>+ New Working Solution</strong> creates both parts:
                the record (type from Feature / Bug / Release, dedicated
                DevOps-id field) and the real solution. The unique name
                follows <code>feature_&lt;id&gt;</code> /{' '}
                <code>bug_&lt;id&gt;</code> / <code>deploy_&lt;name&gt;</code>{' '}
                with a live preview and duplicate check.
              </li>
              <li>
                <strong>Track an existing solution</strong>: open an entry
                without the WS chip — the detail pane offers “Create
                working-solution record” with type, title and DevOps id
                prefilled from what the solution reveals.
              </li>
              <li>
                <strong>Re-link an orphaned record</strong>: when the linked
                solution is missing, the detail pane offers a search over
                all unlinked unmanaged solutions (unique or display name,
                top 10) — pick one to repair the link.
              </li>
            </ul>
          </section>

          <section className="help-section">
            <h3>Detail pane</h3>
            <ul>
              <li>
                Click a row to <strong>expand its details inline</strong>,
                directly beneath the entry — it fades in; clicking the same row
                again fades it back out. This keeps the table at full width.
              </li>
              <li>
                Each row has <strong>quick actions</strong> in the last column,
                revealed on hover (and while the row is open):{' '}
                <strong>✎ Edit</strong> (change type / title / description in an
                overlay), <strong>✓ Complete</strong>, <strong>⇉ Merge</strong>{' '}
                (jumps to Merge with this solution pre-selected as a source),{' '}
                <strong>👤 Assign</strong> and <strong>🗑 Delete</strong>. Which
                appear depends on the entry (e.g. Merge only for tracked
                feature/bug solutions; <strong>Edit</strong> and{' '}
                <strong>Delete</strong> on a <strong>Release</strong> need the
                “INT | Deployment Manager” role).
              </li>
              <li>
                Open a solution in the <strong>Maker Portal</strong> via its{' '}
                <strong>unique name</strong> in the Solution column — it's a link
                (with a ↗ icon). The detail pane is kept short (type, title,
                description, components, merge history); the row actions and this
                link replace the old command bar and metadata block.
              </li>
              <li>
                The list is a <strong>columnar table</strong> — Type ·{' '}
                <strong>Working Solution</strong> (title, owner, status chips) ·{' '}
                <strong>Solution</strong> (unique name + version) ·{' '}
                <strong>DevOps Item</strong> · <strong>Status</strong>.
              </li>
              <li>
                The <strong>DevOps Item</strong> column shows the linked{' '}
                <strong>#number</strong>, the synced work-item{' '}
                <strong>status</strong> (colour-coded by stage) and a{' '}
                <strong>progress bar</strong> derived from the numbered workflow
                stage (e.g. “13a-UAT…” → ~87%, Closed → 100%; from{' '}
                <code>pro_devopsworkitemstatus</code>).
              </li>
              <li>
                When an open entry's DevOps work item is <strong>Closed</strong>,
                it's flagged{' '}
                <span className="tbc-chip">✓ to be completed</span> in the list
                and its <strong>Mark completed</strong> command is highlighted —
                a startup check over the synced work-item status
                (<code>pro_devopsworkitemstatus</code>).
              </li>
              <li>
                <strong>👤 Assign</strong> (tracked entries) opens a dialog to
                reassign the record's owner — <strong>Assign to me</strong>, or
                search a user by name and pick them.
              </li>
              <li>
                <strong>✎ Edit</strong> (tracked entries) opens an overlay to
                change the <strong>type</strong>, <strong>title</strong> and{' '}
                <strong>description</strong> — like the create dialog. The unique
                name and DevOps id stay fixed.
              </li>
              <li>
                <strong>Components</strong> grouped by type in collapsible
                sections — display names come from the same source the maker
                portal uses. Loaded once per solution;{' '}
                <strong>Refresh</strong> forces a reload.
              </li>
              <li>
                The Azure DevOps work item panel (status, assignee, link)
                appears here once the DevOps connection is active.
              </li>
              <li>
                <strong>Mark completed…</strong> (active tracked entries) sets
                the deployment status to <strong>Deployment completed</strong>{' '}
                (a label — open/closed is driven by the record's statecode, not
                this). You're asked whether to also delete the underlying
                solution; if so, a card pops up for 3 seconds to{' '}
                <strong>undo</strong> — undoing keeps the solution.
              </li>
              <li>
                <strong>Delete…</strong> removes the entry after a
                confirmation: the working-solution record, the solution
                container, or both — depending on what exists. A card pops
                up for 3 seconds to <strong>undo</strong>; only after that
                the deletion becomes final. Components inside a deleted
                solution stay in the system. If the final delete fails
                server-side (e.g. another solution import/uninstall is running),
                an error banner explains why and the entry reappears.
              </li>
            </ul>
          </section>

          <section className="help-section">
            <h3>Merge</h3>
            <ul>
              <li>
                Navigation is a left sidebar grouped into <strong>Manage</strong>{' '}
                (Workbench, Merge, Merge Rules) and <strong>Validate</strong>{' '}
                (<strong>Deployment Readiness</strong> = before, and{' '}
                <strong>Analyze</strong> = after, with Compare / Layers / App
                Sharing as tabs inside Analyze). The whole{' '}
                <strong>Validate</strong> group and <strong>Merge Rules</strong>{' '}
                require the security role{' '}
                <strong>“INT | Deployment Manager”</strong> (assigned directly
                to your user) — without it those appear locked. Workbench and
                Merge are open to everyone.
              </li>
              <li>
                Only <strong>tracked</strong> feature / bug solutions can be
                merged; the target must be a tracked <strong>Release</strong>{' '}
                solution.
              </li>
              <li>
                Sections <strong>1 / 2 / 3</strong> are stacked full width.
                Pick the sources from the{' '}
                <strong>multi-select dropdown</strong> — each option shows the
                kind as a colored dot, the title, owner, unique name and the
                Azure DevOps id. The selection survives filter changes and
                shows as removable chips.
              </li>
              <li>
                The <strong>component plan</strong> shows the distinct
                component set; entries contributed by several sources are
                marked as conflicts and applied once. Components already in
                the target are skipped.
              </li>
              <li>
                <strong>Merge rules</strong> (optional): each Release can
                restrict which component types it accepts — an{' '}
                <strong>allow-list</strong> (none = all allowed) and an{' '}
                <strong>exclude-list</strong> applied on top (a type is
                mergeable when it's allowed AND not excluded). Manage them in
                the <strong>Merge Rules</strong> tab (Deployment Manager only);
                the Workbench detail shows a read-only summary. Blocked
                components are greyed in the plan and reported as “excluded by
                merge rules” on merge.
              </li>
              <li>
                After a merge the source records get the “Merged into
                Deployment Solution” status and a timestamp automatically.
              </li>
              <li>
                Each merge is logged as a <strong>merge-run</strong> row. Open
                a Release solution to see its <strong>Merge history</strong>{' '}
                table — when, by whom, the counts and source solutions; click a
                row to open an <strong>overlay</strong> listing the components
                that merge added, grouped by component type.
              </li>
            </ul>
          </section>

          <section className="help-section">
            <h3>📝 Release Notes</h3>
            <ul>
              <li>
                Pick a <strong>release solution</strong> — the{' '}
                <strong>Draft</strong> is generated from its{' '}
                <strong>merge history</strong>: all included source solutions
                (with a DevOps <strong>#work-item link</strong> where the title
                resolves uniquely) and every added component grouped by type
                (App Elements rolled up to a counter).
              </li>
              <li>
                Release notes are <strong>incremental</strong>: after the first
                publish, each draft lists only what was merged{' '}
                <strong>since the last published version</strong> (the draft
                shows the “since” date; nothing new ⇒ nothing to publish).
              </li>
              <li>
                Toggle between <strong>Markdown</strong> (rendered) and{' '}
                <strong>Raw</strong> text and <strong>Copy</strong> the active
                format (the Markdown tab copies the Markdown source).
              </li>
              <li>
                <strong>Publish</strong> freezes the current draft as a
                versioned snapshot (both formats stored). It's disabled when the
                draft is identical to the latest published version. Publishing
                requires the “INT | Deployment Manager” role; viewing and copying
                are open to everyone.
              </li>
              <li>
                The <strong>History</strong> tab lists every published snapshot
                (date · author · summary) — click one to read it back exactly as
                published.
              </li>
            </ul>
          </section>

          <section className="help-section">
            <h3>Deployment Readiness (Dependency Check)</h3>
            <ul>
              <li>
                Pick a <strong>release solution</strong> and a target
                environment (UAT / PROD) — the check runs
                RetrieveMissingDependencies and lists every required
                component the solution doesn't contain.
              </li>
              <li>
                <strong>Missing in target</strong> = the component is
                neither in the solution nor in the target environment — the
                import would fail. <strong>Add to Solution</strong> pulls it
                into the release directly. Name-matched types (environment
                variables, connection references, web resources, canvas
                apps) count as present when the target has them under the
                same unique name, even with a different id.
              </li>
              <li>
                Everything else required (already present in the target, or
                metadata types that can't be verified from the app) is
                summarized in one line — nothing to do for those.
              </li>
              <li>
                The check <strong>keeps running when you navigate away</strong>{' '}
                — a bar at the bottom-left tracks progress and lets you jump
                back; the result is waiting when you return.
              </li>
              <li>Requires the “INT | Deployment Manager” role.</li>
            </ul>
          </section>

          <section className="help-section">
            <h3>Layer Inspector</h3>
            <ul>
              <li>
                With the release solution and target environment (UAT / PROD)
                chosen in the shared Validate selector, click{' '}
                <strong>Inspect Layers</strong> — every component's{' '}
                <strong>solution layers</strong> there
                are resolved (the same stack the maker portal shows under
                “See solution layers”). Results appear{' '}
                <strong>per component type as each section finishes</strong>,
                while the rest keep loading; each type group is collapsible.
              </li>
              <li>
                Per-component verdict:{' '}
                <span className="lv-badge lv-badge--overridden">
                  Unmanaged over managed
                </span>{' '}
                (customized directly in the target — the unmanaged “Active”
                layer masks deployed changes),{' '}
                <span className="lv-badge lv-badge--unmanagedonly">
                  Unmanaged only
                </span>
                ,{' '}
                <span className="lv-badge lv-badge--absent">Missing</span>{' '}
                (not present in the target — this is where you see whether
                plugin assemblies, custom APIs etc. were deployed),{' '}
                <span className="lv-badge lv-badge--clean">Clean</span>.
              </li>
              <li>
                Two chips above the list —{' '}
                <strong>Missing</strong> and <strong>Unmanaged layer</strong>{' '}
                — filter the results to that category (e.g. show only the
                components carrying an unmanaged layer); click again to clear.
              </li>
              <li>
                Rows with an unmanaged layer get a jump into the target
                environment's maker portal. For tables, canvas apps, custom
                pages, cloud flows, workflows, web resources, plugin assemblies,
                plugin steps and custom APIs (incl. their request/response
                parameters) it opens the component's{' '}
                <strong>solution layers</strong> page directly (<strong>↗
                layers in {'{env}'}</strong>); for entity sub-components
                (forms, views, columns, business rules) and other types it
                opens the solution there (<strong>↗ solution in {'{env}'}</strong>)
                — select the component, then{' '}
                <strong>Advanced → See solution layers</strong>. Either way,
                use <strong>Remove active customizations</strong> to strip the
                Active layer. Removal is deliberately done in the portal, not
                in this app — it can't be undone.
              </li>
              <li>
                <strong>Environment variables</strong> and{' '}
                <strong>connection references</strong> are skipped — by design
                they bind their current value/connection in an unmanaged
                (Active) layer, so they'd only show up as false positives.
              </li>
              <li>
                <strong>⇄ diff</strong> on a diffable component (flows,
                workflows, business rules, scripts) opens a side-by-side
                diff of its definition <strong>DEV vs the target</strong> —
                cloud-flow JSON pretty-printed, web resources decoded, binary
                web resources reduced to a size comparison.
              </li>
              <li>
                Component types the layer provider doesn't expose stay “No
                layer data”. One layer query per component, so large
                solutions take a moment — the spinner shows progress.
              </li>
              <li>Requires the “INT | Deployment Manager” role.</li>
            </ul>
          </section>

          <section className="help-section">
            <h3>App Sharing</h3>
            <ul>
              <li>
                Pick a solution — its <strong>canvas apps</strong> and{' '}
                <strong>custom pages</strong> are checked for who they're
                shared with in DEV, UAT and PROD (matched across environments
                by their import-stable unique name).
              </li>
              <li>
                Solution import <strong>never carries user sharing</strong>,
                so a canvas app can be deployed to UAT/PROD and reach nobody.
                Apps that are <span className="cell-missing">⚠ not shared</span>{' '}
                there are called out at the top — those need a Share in the
                target before users can open them.
              </li>
              <li>
                Each cell shows how many <strong>👤 users</strong> and{' '}
                <strong>👥 teams</strong> the app is shared with; open a row
                to see the principals and their access level (Read / Read,
                Write / Co-owner) per environment, plus the owner.
              </li>
              <li>
                <strong>Custom pages</strong> get access through the
                model-driven app's security roles, not direct sharing — so
                “no shares” is normal for them and not flagged as a gap.
              </li>
              <li>Requires the “INT | Deployment Manager” role.</li>
            </ul>
          </section>

          <section className="help-section">
            <h3>Compare (ALM)</h3>
            <ul>
              <li>
                With the release solution chosen in the shared Validate
                selector, click <strong>Compare</strong> — its cloud flows,
                workflows, business rules, plugin steps and scripts are compared
                across the configured environments (current / UAT / PROD),
                matched
                by their import-stable ids. Components are grouped by type in
                collapsible sections.
              </li>
              <li>
                Deviation tags: <strong>Missing</strong> (not in the target),
                <strong>Status drift</strong> (e.g. flow Draft in PROD, plugin
                step disabled) and <strong>Content drift</strong> (the
                definition differs from DEV). The summary chips filter the
                matrix; modified dates are shown for information only (solution
                import rewrites them).
              </li>
              <li>
                <strong>Content drift</strong> needs the heavier content pass:
                inside <strong>Analyze</strong> it runs automatically; on its
                own use the <strong>Check content drift</strong> button. Drifted
                rows get a <strong>⇄ diff</strong> link opening the DEV-vs-target
                side-by-side diff.
              </li>
              <li>
                “?” cells mean the environment could not be queried — the
                banner shows the reason.
              </li>
              <li>
                <strong>Unmanaged layers</strong> and the{' '}
                <strong>existence of every other component type</strong>{' '}
                (plugin assemblies, custom APIs, …) live in the{' '}
                <strong>Layer Inspector</strong>.
              </li>
            </ul>
          </section>

          <section className="help-section">
            <h3>🔧 Env Config (Validate)</h3>
            <p>
              The <strong>Environment Variable &amp; Connection Reference
              cockpit</strong> shows every configured environment's config side
              by side, matched by name. It flags the classic deployment gaps:
              an env var <strong>with no value</strong> (and no default) in an
              environment, a connection reference that is{' '}
              <strong>unbound</strong>, and a setting present in one
              environment but <strong>absent</strong> in another (a transport
              gap). Secrets are masked; a default fallback is tagged. Read-only.
            </p>
          </section>

          <section className="help-section">
            <h3>🔍 Audit Config (Validate)</h3>
            <p>
              The <strong>Audit Configuration Analyzer</strong> shows a chosen
              environment's auditing setup: the organization master switch and
              retention period, and per-table / per-column{' '}
              <code>IsAuditEnabled</code>. A table only records history when
              org auditing <em>and</em> the table are both on — the{' '}
              <strong>Effective</strong> column flags a table that is
              configured for audit while the org switch is off. Expand a table
              to see which columns are audited. Read-only.
            </p>
          </section>

          <section className="help-section">
            <h3>🕘 Timeline (Manage)</h3>
            <p>
              The <strong>Release Timeline</strong> shows "what went where,
              when" for one release on a single time axis: its merge runs
              (with counts and source solutions), its published release notes
              (with version) and its imports into every configured environment
              (matched by unique name, badge colored by outcome). Toggle event
              kinds with the chips; environments that cannot be read degrade
              to a notice. Pure visualization of existing data.
            </p>
          </section>

          <section className="help-section">
            <h3>📦 Import History (Validate)</h3>
            <p>
              The <strong>Solution Import History</strong> lists a chosen
              environment's <code>importjob</code> rows — started, solution,
              status, progress, duration, user. Expanding a row lazily loads
              and parses the import log:{' '}
              <strong>missing-dependency failures become a precise table</strong>{' '}
              — on the left the component that is missing in the target (type,
              name, source solution → install first), on the right the
              imported component that needs it (type, name, parent). Other
              failures and warnings are listed below, deduplicated. Read-only.
            </p>
          </section>

          <section className="help-section">
            <h3>🌐 Operate — target environment</h3>
            <p>
              Each Operate feature (Plugin Traces, Job Monitor, Role Analyzer)
              starts with a <strong>Target environment</strong> picker that
              chooses from the configured environments (host / UAT / PROD …).
              All <strong>reads</strong> work against any of them (via the
              connector). <strong>Writes</strong> — the trace-level switch and
              job cancel/retry — only apply to the <strong>host</strong>
              environment, so they turn read-only when another environment is
              selected. The selection is shared across the three features.
            </p>
          </section>

          <section className="help-section">
            <h3>🧵 Plugin Traces (Operate)</h3>
            <ul>
              <li>
                A usable frontend over <code>plugintracelog</code>: the{' '}
                <strong>Trace stream</strong> polls every 15 s (paused while
                the browser tab is hidden) with server-side filters — time
                window, plugin type, message, entity, sync/async,
                exceptions-only, opt-in message-text search (≤ 24 h).
              </li>
              <li>
                A row expands into the lazily-loaded{' '}
                <strong>message block</strong> (find-in-text, copy); the heavy
                payload is never loaded in the stream.
              </li>
              <li>
                <strong>⛓ Chain</strong> opens the correlation timeline: every
                trace of the request chain, indented by depth, bar length ∝
                duration — one request cascade at a glance.
              </li>
              <li>
                <strong>Performance</strong> aggregates duration per plugin ×
                message server-side (count / avg / p95≈ / max); a click jumps
                back into the pre-filtered stream.
              </li>
              <li>
                The <strong>trace level</strong> control (top right) shows{' '}
                <code>organization.plugintracelogsetting</code>; switching it
                requires the deployment-manager role and runs as you — “All”
                warns before enabling (log growth). The platform prunes
                traces: this is an explorer, not an archive.
              </li>
            </ul>
          </section>

          <section className="help-section">
            <h3>📡 Job Monitor (Operate)</h3>
            <ul>
              <li>
                <strong>Health</strong> answers “is async processing healthy?”
                in one look: failed jobs (24 h), waiting backlog with the
                oldest waiting operation, a sampled flow failure rate and the
                watchdog lights. Every tile drills into its detail tab.
              </li>
              <li>
                <strong>System jobs</strong> explores{' '}
                <code>asyncoperation</code> with an enforced look-back window
                and status/type/name filters. Deployment managers can{' '}
                <strong>bulk-cancel / retry</strong> (max 50 per batch,
                sequential, per-job outcome) — writes run as you.
              </li>
              <li>
                <strong>Flows</strong> lists the cloud flows; “Load failure
                rates” samples each flow's recent runs (marked as a sample —
                connector-friendly). Selecting a flow shows its runs with a
                deep link into the Power Automate portal run page.
              </li>
              <li>
                <strong>Watchdog</strong> compares each heartbeat definition
                (expected interval + grace) against the latest beat —
                🔴 overdue / never beaten, ⚪ inactive. Table names are
                configurable (<code>config.ts → WATCHDOG_TABLES</code>).
              </li>
              <li>
                <strong>Trends</strong> charts failed jobs per day over 7/30
                days (server-side aggregates).
              </li>
            </ul>
          </section>

          <section className="help-section">
            <h3>🛡 Role Analyzer (Operate, read-only)</h3>
            <ul>
              <li>
                Works on a snapshot of the security model, cached ~15 min;
                roles are aggregated on their <strong>root copy</strong>{' '}
                (<code>parentrootroleid</code> — BU copies collapse).
              </li>
              <li>
                <strong>Matrix</strong>: role × table × privilege with the
                classic depths (User / BU / Parent:Child / Organization).
              </li>
              <li>
                <strong>Diff</strong>: two roles side-by-side, deltas only,
                exportable as Markdown or CSV.
              </li>
              <li>
                <strong>User rights</strong>: effective table privileges of
                one user aggregated from direct + team roles — deepest depth
                wins — with the provenance path per grant (“role ‘Vertrieb
                Süd’ ← team ‘Sales DE’”).
              </li>
              <li>
                <strong>Reverse lookup</strong>: “who can Delete on account?”
                → all users/teams with their path.
              </li>
              <li>
                <strong>Hygiene</strong>: roles without any assignment and
                users above a role-count threshold.
              </li>
              <li>
                <strong>Field security</strong>: the column-level analog of
                the matrix — Field Security Profiles with their secured columns
                (Read / Create / Update / read-unmasked) and who they are
                assigned to, plus a column-centric view (“who can read/update
                secured column X?”). Flags profiles assigned to nobody and
                columns no profile grants read on (admins only — System
                Administrators bypass field security).
              </li>
              <li>
                <strong>Team &amp; BU map</strong>: an interactive org-chart
                of the business-unit hierarchy with the role-granting teams on
                each BU. Drag to pan, wheel to zoom, collapse a subtree. Click
                a BU or team for its roles and members; pick a user in{' '}
                <em>Trace user</em> to highlight their BU and teams and see the
                roles they inherit through team membership. A toggle adds the
                default / access teams.
              </li>
              <li>
                <strong>Core roles</strong> (write, host env only): analyzes
                the <strong>custom (unmanaged)</strong> roles for privileges
                shared by ≥ 2 of them and proposes a consolidated{' '}
                <strong>core role</strong> per shared role-set. Give it a name,
                pick a <strong>working solution</strong> and click{' '}
                <em>Create core role</em> — it creates the role in that
                solution, grants the consolidated privileges (deepest depth
                wins) and, if you opt in, removes the duplicates from the
                source roles (which then also go into the solution). Members
                holding only a source role need the new core role to keep
                their access.
              </li>
            </ul>
          </section>

          <section className="help-section">
            <h3>Chips at a glance</h3>
            <ul className="help-legend">
              <li>
                <span className="sol-state sol-state--both">Synced</span>{' '}
                fully synced — record and solution linked
              </li>
              <li>
                <span className="sol-state sol-state--record-only">
                  WS only
                </span>{' '}
                working solution only — no deployed solution (re-link in the
                detail pane)
              </li>
              <li>
                <span className="sol-state sol-state--solution-only">
                  Sol only
                </span>{' '}
                solution only — not tracked yet (track it in the detail pane)
              </li>
              <li>
                <span className="ado-chip">#13388</span> Azure DevOps work
                item number
              </li>
              <li>
                <span className="tbc-chip">✓ to be completed</span> open, but
                its DevOps work item is closed — ready to mark completed
              </li>
              <li>
                <span className="dup-chip">duplicate link</span> several
                records link the same solution
              </li>
              <li>
                <span className="coll-chip">⚠ 3 shared</span> components
                shared with other working solutions
              </li>
              <li>
                <span className="state-pill state-pill--on">Activated</span>{' '}
                <span className="state-pill state-pill--off">Draft</span>{' '}
                state in an environment (Compare)
              </li>
              <li>
                <span className="state-pill state-pill--unmanaged">
                  unmanaged
                </span>{' '}
                component has an unmanaged layer in the target
              </li>
              <li>
                <span className="drift-tag drift-tag--content">
                  Content drift
                </span>{' '}
                definition differs across environments (Compare → Check
                content drift)
              </li>
            </ul>
          </section>
        </div>
      </div>
    </div>
  )
}
