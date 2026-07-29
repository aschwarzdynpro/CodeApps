/**
 * Feature guide, opened via the "?" icon in the header. Static content —
 * sections follow the sidebar menu structure (Manage → Validate → Operate →
 * Reference); keep them in sync with the README when features change.
 * Features hidden from the menu (ALM Detective, Job Monitor, Role Analyzer)
 * are deliberately not documented here.
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
                How the Solution Administration Console works — in the order of
                the menu.
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
            <h3>Navigation &amp; access</h3>
            <p>
              The left sidebar groups the features: <strong>Manage</strong>{' '}
              (day-to-day solution work), <strong>Validate</strong>{' '}
              (pre-/post-deployment checks), <strong>Operate</strong>{' '}
              (live-environment diagnostics) and <strong>Reference</strong>.
              Locked entries require the security role{' '}
              <strong>“INT | Deployment Manager”</strong> (assigned directly to
              your user) — Workbench, Merge, Release Notes, Timeline, Plugin
              Traces and Links are open to everyone.
            </p>
          </section>

          <section className="help-section">
            <h3>🧰 Workbench (Manage)</h3>
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
            <h3>🧰 Workbench — create &amp; track</h3>
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
            <h3>🧰 Workbench — detail pane &amp; row actions</h3>
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
                (with a ↗ icon).
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
                and its <strong>Mark completed</strong> command is highlighted.
              </li>
              <li>
                <strong>👤 Assign</strong> (tracked entries) opens a dialog to
                reassign the record's owner — <strong>Assign to me</strong>, or
                search a user by name and pick them.
              </li>
              <li>
                <strong>Components</strong> grouped by type in collapsible
                sections — display names come from the same source the maker
                portal uses. Loaded once per solution;{' '}
                <strong>Refresh</strong> forces a reload.
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
            <h3>⇉ Merge (Manage)</h3>
            <ul>
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
                the target are skipped. Components blocked by the release's{' '}
                <strong>merge rules</strong> are greyed out and reported as
                “excluded by merge rules”.
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
            <h3>⚙ Merge Rules (Manage)</h3>
            <p>
              Each Release can restrict which <strong>component types</strong>{' '}
              it accepts: an <strong>allow-list</strong> (empty = all allowed)
              and an <strong>exclude-list</strong> applied on top — a type is
              mergeable when it's allowed AND not excluded. Manage the lists
              here (Deployment Manager only); the Workbench detail shows a
              read-only summary and the merge plan enforces them.
            </p>
          </section>

          <section className="help-section">
            <h3>📝 Release Notes (Manage)</h3>
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
            <h3>🚚 Data Transfer (Manage)</h3>
            <p>
              The <strong>Configuration Data Transfer Hub</strong> authors
              declarative <strong>transfer packages</strong> for configuration
              data (source query → target environments). Transfers are executed
              by <strong>cloud flows installed with the app</strong> (executor +
              scheduler) — never inside the app session itself.
            </p>
            <ul>
              <li>
                <strong>Packages</strong> live in the strip at the top (“+ New
                package” stays leftmost). A package groups entries, carries the
                target environments and runs its entries in ascending order;
                inactive packages are skipped.
              </li>
              <li>
                <strong>Entries</strong> define one source query each: source
                environment → table → filter &amp; columns via a{' '}
                <strong>system saved view</strong> or hand-written{' '}
                <strong>FetchXML</strong> (pretty-printed in the editor, live
                validation, searchable column picker, data preview + a
                refreshable row-count column). <strong>Click a row</strong> to
                edit it; hovering the Query cell shows the executable FetchXML.
              </li>
              <li>
                A saved view is stored as a <strong>snapshot</strong> (the
                view's FetchXML at save time) so the configuration is
                self-contained; “⟳” re-reads the view when it changed.
              </li>
              <li>
                <strong>Record matching</strong> per entry: GUID upsert (ids
                stay identical across environments) or match by business
                columns (up to <strong>5</strong> — the picker stops there).
                Ambiguous matches are skipped and reported as errors.
              </li>
              <li>
                <strong>Orphan handling</strong> per entry: ignore / deactivate
                / delete target records missing from the source. The scope is
                the entry's <strong>query on both sides</strong> — only target
                rows the query returns can become orphans (a filter on
                countries starting with “A” never touches B–Z). Entry order
                matters — lookup parents first.
              </li>
              <li>
                <strong>5000 rows per query.</strong> A read returns at most
                5000 rows. If the source or the target hits that limit, the
                executor <strong>writes nothing for that entry</strong> and
                reports the cap as an error — a truncated result would invent
                orphans (and delete real target rows). Narrow the entry query
                with a filter and split it across entries.
              </li>
              <li>
                While a run is <strong>queued or running</strong>, the
                package's configuration is locked (add / edit / reorder /
                delete) so the executor reads a consistent state; the lock
                releases automatically when the run finishes.
              </li>
              <li>
                <strong>▶ Run</strong> queues a <strong>Transfer Run</strong>.
                Pick the <strong>mode</strong> —{' '}
                <strong>✍ Transfer</strong> (writes) or{' '}
                <strong>🧪 Dry run</strong> (simulation: the executor reads,
                matches and logs exactly as usual but writes{' '}
                <em>nothing</em>, so the log shows what <em>would</em> be
                created, updated, deactivated or deleted) — and the{' '}
                <strong>timing</strong>: <strong>Run now</strong> (status
                Queued, picked up within seconds) or{' '}
                <strong>Run later</strong> via the built-in date/time picker
                with quick-pick chips (status Scheduled; a scheduler flow
                promotes due runs every few minutes). The package's targets
                are snapshotted onto the run.
              </li>
              <li>
                <strong>Recurring runs</strong>: a package can carry a{' '}
                <strong>schedule</strong> (Edit → <em>Daily</em> /{' '}
                <em>Weekly</em> plus the first run's date and time — the time
                of day, and the weekday for Weekly, repeat from there). The
                package card shows a 🔁 chip; the scheduler queues each due
                run and moves the next date forward. Missed windows (e.g. the
                environment was down) do <strong>not</strong> pile up — only
                the next one is queued.
              </li>
              <li>
                The <strong>Runs</strong> card shows status (simulations carry
                a 🧪 marker), requested / scheduled / finished times, a
                live-ticking <strong>Duration</strong> column and the result
                summary. The result log fills{' '}
                <strong>live while the run executes</strong>; click a row to
                expand the structured result table — created / updated /
                deactivated / deleted / errors per entry × target. Queued and
                Scheduled runs can be cancelled (✕).
              </li>
              <li>
                The pipeline contract and executor internals are documented in{' '}
                <code>docs/transfer-hub-contract.md</code>.
              </li>
            </ul>
          </section>

          <section className="help-section">
            <h3>🚦 Deployment Readiness (Validate)</h3>
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
            <h3>📊 Analyze (Validate, post-deployment)</h3>
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
            <h3>📊 Analyze → Compare</h3>
            <ul>
              <li>
                The release's cloud flows, workflows, business rules, plugin
                steps and scripts are compared across the configured
                environments (current / UAT / PROD), matched by their
                import-stable ids. Components are grouped by type in
                collapsible sections.
              </li>
              <li>
                Deviation tags: <strong>Missing</strong> (not in the target),
                <strong> Status drift</strong> (e.g. flow Draft in PROD, plugin
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
            </ul>
          </section>

          <section className="help-section">
            <h3>📊 Analyze → Layer Inspector</h3>
            <ul>
              <li>
                Every component's <strong>solution layers</strong> in the
                target are resolved (the same stack the maker portal shows
                under “See solution layers”). Results appear{' '}
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
                — filter the results to that category; click again to clear.
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
            </ul>
          </section>

          <section className="help-section">
            <h3>📊 Analyze → App Sharing</h3>
            <ul>
              <li>
                The release's <strong>canvas apps</strong> and{' '}
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
            <p>
              The two sections (Environment Variables, Connection References)
              are <strong>collapsed by default</strong> and sorted by display
              name. Use the <strong>search box</strong> to filter both by name,
              and click a <strong>counter chip</strong> (e.g. “4 env vars
              without a value”) to narrow the tables to exactly those rows —
              click it again or “Clear filter” to reset.
            </p>
            <p>
              The loaded picture is <strong>cached for the session</strong> —
              switching to this tab does not re-read; use <strong>Refresh</strong>{' '}
              (the “Updated …” time shows how fresh it is). Pick a{' '}
              <strong>release solution</strong> to restrict the cockpit to that
              solution's env vars &amp; connection references (its components in
              the host environment); changing or clearing the selection
              re-reads.
            </p>
            <p>
              Expanding <strong>Connection References</strong> also counts how
              many <strong>cloud flows use each one</strong> in the host
              environment (a “N flows” chip — 0 flags an orphaned reference),
              split into <strong>active</strong> vs <strong>inactive</strong>{' '}
              flows and read from each flow's definition, loaded once per
              session. <strong>Click a reference row</strong> to list the flows
              underneath, each with a deep link to open it in Power Automate.
            </p>
          </section>

          <section className="help-section">
            <h3>🗄️ OData Browser (Operate)</h3>
            <p>
              Browse the <strong>Dataverse Web API of any configured
              environment</strong>: pick a table, pick the columns, run, read
              the grid. The table list and the column list come from live
              metadata — the picker greys out what <code>$select</code> cannot
              return (derived, virtual, file/image columns) and selects lookups
              as <code>_x_value</code> for you. Column headers sort, values are
              shown <strong>formatted</strong> (choices as labels, lookups as
              names) with a toggle for the raw payload, and{' '}
              <strong>Load more</strong> follows the server's paging cursor.{' '}
              <strong>Copy URL</strong> yields the real
              <code>/api/data/v9.2/…</code> URL.
            </p>
            <p>
              The <strong>filter builder</strong> offers only the operators that
              fit each column's type — <em>contains</em> on text,{' '}
              <em>in the last X days</em> on dates,{' '}
              <em>is the current user</em> on lookups — and choice columns get a
              dropdown of their real labels. Groups nest, so{' '}
              <code>A and (B or C)</code> works. Sort by clicking a header,
              shift-click to sort by a second column. <strong>∑ Count</strong>{' '}
              gives the true total via an aggregate (Dataverse caps it at
              50,000).
            </p>
            <p>
              The <strong>query line is editable</strong> and is the same query
              as the builder, seen from the other side: type into it, press
              Enter, and it parses back into the builder. Anything the builder
              cannot model — a lambda like{' '}
              <code>roles/any(r:r/roleid eq …)</code> — is{' '}
              <strong>kept exactly as written</strong> and marked{' '}
              <em>advanced filter</em>, never rewritten. That is also why Count
              switches off there: it cannot translate a raw filter to FetchXML,
              so it refuses rather than counting something else.
            </p>
            <p>
              ⚠ <strong>Queries run as the connector service principal</strong>,
              not as you — results deliberately ignore your personal row-level
              and field-level security, which is why the menu item is
              deployment-manager gated. <strong>Read-only.</strong> IntelliSense
              and the single-record view with lookup drill-through are the next
              steps (see <code>docs/odata-browser-plan.md</code>).
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
            <h3>🔀 Dual-Write Maps (Validate)</h3>
            <p>
              The <strong>Dual-Write Table Maps</strong> cockpit lists the{' '}
              <strong>custom (unmanaged)</strong> dual-write table maps in the
              current environment (<code>msdyn_dualwriteentitymap</code>) — one
              row per map at its <strong>current (highest) version</strong>,
              its <strong>source → target table</strong> with the sync
              direction (↔ / → / ←) and how many older version records exist.
              Click a map to open an overlay that renders the mapping from its{' '}
              <code>msdyn_mapping</code> definition: each leg's source ↔
              destination schema and a <strong>field-mapping table</strong> with
              the sync direction (↔ bidirectional, → to destination, ← to
              source), value-map transforms, lookup-resolved destinations and a
              tag on system-generated (integration key) fields. Toggle{' '}
              <em>Hide system-generated</em> or <em>Show raw JSON</em>.
              Read-only.
            </p>
          </section>

          <section className="help-section">
            <h3>📦 Import History (Validate)</h3>
            <p>
              The <strong>Solution Import History</strong> lists a chosen
              environment's <code>importjob</code> rows — started, solution,
              status, progress, duration, publisher (resolved from the
              imported solution, since the import user is usually the system).
              The list is capped at the
              latest 100, so all narrowing is <strong>server-side</strong>:{' '}
              a <strong>status chip</strong> (e.g. <em>Failed</em> → the latest
              100 failed imports), a <strong>solution-name search</strong>, and
              a <strong>picker over the release solutions</strong>. Expanding a
              row lazily loads and parses the import log:{' '}
              <strong>missing-dependency failures become a precise table</strong>{' '}
              — on the left the component that is missing in the target (type,
              name, source solution → install first), on the right the
              imported component that needs it (type, name, parent). Other
              failures and warnings are listed below, deduplicated. Read-only.
            </p>
          </section>

          <section className="help-section">
            <h3>🧑‍💼 User Settings (Validate)</h3>
            <p>
              A per-environment inventory of every enabled user's{' '}
              <strong>personal settings</strong> (<code>usersettings</code>). The
              list is compact — <strong>user, login, time zone, currency, UI
              language</strong>; search by name/login, hide application/service
              users, click a header to sort. Switch the{' '}
              <strong>environment</strong> picker to compare a user across
              systems (e.g. why UAT differs from PROD).
            </p>
            <p>
              <strong>Click a user</strong> to open the detail dialog with all
              settings grouped into <strong>General · Formats · Email · Privacy ·
              Languages</strong>. The Formats tab shows a{' '}
              <strong>live preview</strong> of the number, currency, time and
              date formats as you edit them. Deployment managers can{' '}
              <strong>edit and Save</strong> — only the changed fields are written
              (confirm first; <strong>PROD</strong> extra-strong). Reads/writes
              run through the connector (SP identity).
            </p>
            <p>
              <strong>Copy to users…</strong> (in the detail dialog) takes the
              shown settings as a template: pick which groups to copy and the
              target users, then apply to all of them serially with a progress
              bar and per-user result — for rolling a proven configuration out to
              a team.
            </p>
          </section>

          <section className="help-section">
            <h3>🔁 Process Comparer (Validate)</h3>
            <ul>
              <li>
                Pick a <strong>release solution</strong> → <strong>Compare</strong>.
                Its <strong>processes</strong> — cloud flows, classic workflows,
                business rules, actions and business process flows — are read from
                the current environment and looked up, by their import-stable id,
                in every configured environment.
              </li>
              <li>
                A <strong>matrix</strong> shows each process's{' '}
                <strong>status</strong> (Activated / Draft / Missing) and last
                change per environment. Only the <strong>cells</strong> that
                drift are highlighted; the item name carries a{' '}
                <strong>drift</strong> marker. A filter shows only the processes
                that break with the reference (off-definition in definition mode,
                drifting from current otherwise).
              </li>
              <li>
                A <strong>search box</strong> filters by name. A{' '}
                <strong>Group by</strong> dropdown organises the matrix into{' '}
                <strong>collapsible sections</strong>: by <strong>process type</strong>{' '}
                (the default — Cloud flows, Workflows, Business rules, Actions,
                Business process flows), or — when an <strong>Area</strong> column
                is configured in the Workbench Settings (an OptionSet on the
                definition table) — by <strong>area</strong>, or <strong>None</strong>{' '}
                for a flat list. Each section header shows its item count and any
                drift.
              </li>
              <li>
                Every row is <strong>marked with a process-type icon</strong> —
                ☁️ cloud flow, ⚙️ workflow, 📏 business rule, ⚡ action, 🧭
                business process flow — so the kind is obvious even in a flat or
                area-grouped list.
              </li>
              <li>
                A <strong>Definition</strong> switch (next to Compare) chooses
                what drift is measured against. The definition source is{' '}
                <strong>configurable in the Workbench Settings</strong> (a table
                + status / name / unique columns) — no fixed table dependency; it
                stays off until configured. <strong>On:</strong> a{' '}
                <strong>Definition</strong> column shows the flow's{' '}
                <strong>defined state</strong> (On / Off) and drift = an
                environment differs from that defined state (every env, including
                current). A <strong>Definition status</strong> filter (All / On /
                Off) narrows the list to flows with that defined state — and,
                independently, an <strong>Only off-definition</strong> toggle
                keeps just the flows that break with their definition.{' '}
                <strong>Off:</strong> the column is hidden and drift = a target
                environment differs from <strong>current</strong>.
              </li>
              <li>
                <strong>↗</strong> per cell jumps to that flow in the
                environment's Power Automate portal (cloud flows only — the other
                process kinds have no single-record portal link).
              </li>
              <li>
                <strong>Turn on / Turn off</strong> per cell activates/deactivates
                the flow in <em>that</em> environment. Each write confirms first
                (<strong>PROD</strong> extra-strong); needs the deployment-manager
                role, runs as the connection identity and writes to the selected
                environment.
              </li>
              <li>
                Each cell shows the flow's <strong>owner</strong> in that
                environment (owners can differ per system).
              </li>
              <li>
                <strong>Bulk actions</strong> (deployment-manager): tick the row
                checkboxes to select flows, pick a <strong>target environment</strong>{' '}
                in the bar, then <strong>Activate</strong>, <strong>Deactivate</strong>{' '}
                or <strong>Change owner…</strong> (search a user in that
                environment). The action runs serially over the selection with a
                progress bar that names the current step, plus a per-item result
                summary; flows not present in the target are skipped. Works for one
                or many flows.
              </li>
              <li>
                The compare <strong>result and solution stay put</strong> when you
                switch tabs, and a compare or bulk run <strong>keeps going in the
                background</strong> — a bar at the bottom shows its progress and
                jumps you back. Top-right, a <strong>Refresh</strong> re-reads all
                environments and shows the last sync time.
              </li>
            </ul>
          </section>

          <section className="help-section">
            <h3>🧩 Plugin Comparer (Validate)</h3>
            <ul>
              <li>
                The same idea for a release solution's{' '}
                <strong>plugin (SDK message processing) steps</strong>, each with
                its <strong>assembly version</strong>. Steps are matched across
                environments by their import-stable id.
              </li>
              <li>
                The <strong>matrix</strong> shows each step's{' '}
                <strong>status</strong> (Enabled / Disabled / Missing) and{' '}
                <strong>assembly version</strong> per environment; status drift
                vs. current is highlighted.
              </li>
              <li>
                <strong>Enable / Disable</strong> per cell toggles the step in
                that environment (confirm first, PROD extra-strong; deployment
                managers only). Turn on/off is a direct, live change — not a
                deployment artefact — so use it deliberately in UAT/PROD.
              </li>
            </ul>
          </section>

          <section className="help-section">
            <h3>🧵 Plugin Traces (Operate)</h3>
            <ul>
              <li>
                Starts with a <strong>Target environment</strong> picker —
                all <strong>reads</strong> work against any configured
                environment (via the connector); the{' '}
                <strong>trace-level switch</strong> writes only to the{' '}
                <strong>host</strong> environment and turns read-only elsewhere.
              </li>
              <li>
                A usable frontend over <code>plugintracelog</code>: the{' '}
                <strong>Trace stream</strong> polls every 15 s (paused while
                the browser tab is hidden) with server-side filters — time
                window, plugin type, message, entity, sync/async,
                exceptions-only, opt-in message-text search (≤ 24 h).
              </li>
              <li>
                Rows are colour-coded by outcome: <strong>soft green</strong>{' '}
                on success, <strong>red with ⚠</strong> when the trace carries{' '}
                <code>exceptiondetails</code> (a real exception — note the field
                is a non-empty string, so the flag &amp; the “exceptions only”
                filter test for content, not merely not-null).
              </li>
              <li>
                A row expands into the lazily-loaded{' '}
                <strong>message block</strong> (find-in-text, copy); a failed
                trace also shows its <strong>Exception details</strong> block.
                The heavy payload is never loaded in the stream.
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
            <h3>🔗 Links (Reference)</h3>
            <ul>
              <li>
                A static collection of the URLs you reach for constantly. The{' '}
                <strong>per-environment</strong> links are laid out as a{' '}
                <strong>matrix</strong> — one row per link kind (system app,
                OData / Web API, diagnostics, classic Advanced Settings / roles /
                system jobs, Maker &amp; Power Automate, and the Power Platform
                admin center hub / settings / backup pages),{' '}
                <strong>one column per environment</strong> — plus a{' '}
                <strong>Global</strong> block (admin center, capacity, release
                planner, service health).
              </li>
              <li>
                Everything is derived from the configured environments — there
                is <strong>no data load, no connector and no gating</strong>.
                Links open in a new tab; the <strong>⧉</strong> button copies a
                URL. A couple of admin-center deep links are best-effort (the
                portal is a single-page app whose slugs can shift) and are
                labelled as such.
              </li>
            </ul>
          </section>

          <section className="help-section">
            <h3>⚙️ Environment Setup (Reference)</h3>
            <ul>
              <li>
                Opens the <strong>Self-Provisioning Wizard</strong> that creates
                (or edits) the app’s configuration records —{' '}
                <code>pro_workbenchsettings</code> and one{' '}
                <code>pro_environmentconfig</code> row per environment. The same
                wizard appears automatically, hard-blocking, the first time the
                app starts in an environment that has no configuration yet.
              </li>
              <li>
                It guides you through the <strong>environments</strong> (offering
                the organizations the connector can reach), the{' '}
                <strong>publisher</strong> for new working solutions, the{' '}
                <strong>deployment-manager role</strong>, and optional{' '}
                <strong>Azure DevOps</strong> / <strong>Flow-Comparer</strong>{' '}
                settings. Defaults are pre-filled wherever possible; nothing is
                written until the final step. Saving re-reads the config live —
                no reload needed.
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
