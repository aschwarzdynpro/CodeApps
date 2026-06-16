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
        <div className="modal-header">
          <h2>Help — feature guide</h2>
          <button className="modal-close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        <div className="help-body">
          <section className="help-section">
            <h3>Concept</h3>
            <p>
              A <strong>working solution</strong> has two parts: a record in
              the <code>ssid_workingsolution</code> table (title, DevOps id,
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
                deployment status is not Completed/Merged and that have a
                working-solution record. Untick them to reach finished or
                untracked entries.
              </li>
              <li>
                <strong>👤 Mine</strong> — only working solutions you own
                (matched via the owner of the working-solution record).
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
                A <strong>command bar</strong> with the entry's actions —{' '}
                <strong>Open in Maker Portal</strong> on the left, and{' '}
                <strong>Mark completed</strong> / <strong>Delete</strong> as
                icons on the right (hover for their tooltips) — above the
                metadata (version, publisher, owner, deployment status).
              </li>
              <li>
                When an open entry's DevOps work item is <strong>Closed</strong>,
                it's flagged{' '}
                <span className="tbc-chip">✓ to be completed</span> in the list
                and its <strong>Mark completed</strong> command is highlighted —
                a startup check over the synced work-item status
                (<code>sst_devopsworkitemstatus</code>).
              </li>
              <li>
                For tracked entries the type badge has a <strong>✎</strong>{' '}
                button — change Feature / Bug / Release there; it updates
                the record's type choice.
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
                <strong>Mark completed…</strong> (open tracked entries) sets
                the deployment status to <strong>Deployment completed</strong>,
                so the entry leaves the Open list. You're asked whether to also
                delete the underlying solution; if so, a card pops up for 5
                seconds to <strong>undo</strong> — undoing keeps the solution
                and reopens the working solution.
              </li>
              <li>
                <strong>Delete…</strong> removes the entry after a
                confirmation: the working-solution record, the solution
                container, or both — depending on what exists. A card pops
                up for 5 seconds to <strong>undo</strong>; only after that
                the deletion becomes final. Components inside a deleted
                solution stay in the system.
              </li>
            </ul>
          </section>

          <section className="help-section">
            <h3>Merge</h3>
            <ul>
              <li>
                Navigation is a left sidebar grouped into <strong>Manage</strong>{' '}
                (Workbench, Merge) and <strong>Validate</strong> (Compare,
                Dependencies, Layers, App Sharing). Merge and the whole Validate
                group require the security role{' '}
                <strong>“INT | Deployment Manager”</strong> (assigned directly
                to your user) — without it they appear locked.
              </li>
              <li>
                In <strong>Validate</strong>, pick the release solution once at
                the top; each check has its own row below it (target-env toggle
                for Dependencies / Layers, environment status for Compare / App
                Sharing) plus its run button. The selection stays put as you
                switch between the four checks.
              </li>
              <li>
                Only <strong>tracked</strong> feature / bug solutions can be
                merged; the target must be a tracked <strong>Release</strong>{' '}
                solution.
              </li>
              <li>
                Filter the source list, tick solutions — the selection
                survives search changes and shows as removable chips.
              </li>
              <li>
                The <strong>component plan</strong> shows the distinct
                component set; entries contributed by several sources are
                marked as conflicts and applied once. Components already in
                the target are skipped.
              </li>
              <li>
                After a merge the source records get the “Merged into
                Deployment Solution” status and a timestamp automatically.
              </li>
              <li>
                Each merge is logged as a <strong>merge-run</strong> row. Open
                a Release solution to see its <strong>Merge history</strong>{' '}
                table — when, by whom, the counts and source solutions; expand
                a row’s <em>Added</em> count to see exactly which components
                that merge contributed.
              </li>
            </ul>
          </section>

          <section className="help-section">
            <h3>Dependency Check</h3>
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
                Deviation tags: <strong>Missing</strong> (not in the target)
                and <strong>Status drift</strong> (e.g. flow Draft in PROD,
                plugin step disabled). The summary chips filter the matrix;
                modified dates are shown for information only (solution
                import rewrites them).
              </li>
              <li>
                “?” cells mean the environment could not be queried — the
                banner shows the reason.
              </li>
              <li>
                <strong>Unmanaged layers</strong>, the <strong>existence of
                every other component type</strong> (plugin assemblies,
                custom APIs, …) and the <strong>definition diff</strong> now
                live in the <strong>Layer Inspector</strong>.
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
