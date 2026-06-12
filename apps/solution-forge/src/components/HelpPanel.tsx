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
              components, linked by its unique name. The{' '}
              <span className="link-badge link-badge--both">
                <span className="lb-seg lb-ws">WS</span>
                <span className="lb-seg lb-sol">SOL</span>
              </span>{' '}
              badge on every row shows which of the two parts exist.
            </p>
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
                so the search also matches component display names (e.g.
                find every solution containing a specific security role).
                Matches appear as yellow chips on the rows.
              </li>
              <li>
                <strong>group by work item</strong> — groups the list by
                DevOps number; an amber counter marks numbers with several
                solutions. Entries without a number collect at the bottom.
              </li>
              <li>
                <strong>⚠ Scan collisions</strong> — loads the components of
                all tracked working solutions (releases excluded) and flags
                components contained in more than one of them: whoever
                deploys last overwrites the others. Affected rows get a{' '}
                <span className="coll-chip">⚠ shared</span> chip; the detail
                pane lists each shared component and the other solutions
                carrying it.
              </li>
              <li>
                <span className="dup-chip">duplicate link</span> — more than
                one working-solution record points at the same solution;
                deactivate the redundant record in the table to clean up.
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
                Metadata (version, publisher, owner, deployment status) and
                the <strong>Open in Maker Portal</strong> deep link.
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
                The Merge and Compare tabs require the security role{' '}
                <strong>“INT | Deployment Manager”</strong> (assigned
                directly to your user) — without it they appear grayed out.
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
                Pick a solution and a target environment (UAT / PROD) — the
                inspector resolves every component's{' '}
                <strong>solution layers</strong> there (the same stack the
                maker portal shows under “See solution layers”).
              </li>
              <li>
                <strong>Unmanaged layer over managed component</strong> =
                someone customized the component directly in the target. The
                unmanaged “Active” layer wins over all managed layers, so
                deployed changes are masked until the active customizations
                are removed in the target (maker portal: See solution layers
                → Remove active customizations).
              </li>
              <li>
                <strong>Unmanaged-only</strong> = the component exists in the
                target only as an unmanaged customization — it was created
                there directly, not deployed.
              </li>
              <li>
                The summary line counts clean components, components not
                present in the target, and component types without layer
                data (metadata-only types the virtual table doesn't serve).
              </li>
              <li>
                One layer query per component — large solutions take a
                moment; the button shows the progress.
              </li>
              <li>Requires the “INT | Deployment Manager” role.</li>
            </ul>
          </section>

          <section className="help-section">
            <h3>Compare (ALM)</h3>
            <ul>
              <li>
                Pick a solution — its cloud flows, workflows, business
                rules, plugin steps and scripts are compared across the
                configured environments (current / UAT / PROD), matched by
                their import-stable ids.
              </li>
              <li>
                Deviation tags: <strong>Missing</strong> (not in the
                target), <strong>Status drift</strong> (e.g. flow Draft in
                PROD, plugin step disabled), <strong>Unmanaged in target</strong>{' '}
                (unmanaged layer in UAT/PROD — classic ALM smell). The
                summary chips filter the matrix.
              </li>
              <li>
                “?” cells mean the environment or table could not be
                queried — the banner shows the reason. Modified dates are
                shown for information only (solution import rewrites them).
              </li>
            </ul>
          </section>

          <section className="help-section">
            <h3>Chips at a glance</h3>
            <ul className="help-legend">
              <li>
                <span className="link-badge link-badge--both">
                  <span className="lb-seg lb-ws">WS</span>
                  <span className="lb-seg lb-sol">SOL</span>
                </span>{' '}
                tracked — record and solution linked
              </li>
              <li>
                <span className="link-badge link-badge--record-only">
                  <span className="lb-seg lb-ws">WS</span>
                  <span className="lb-seg lb-sol">SOL</span>
                </span>{' '}
                record without solution (orphaned — re-link in the detail
                pane)
              </li>
              <li>
                <span className="link-badge link-badge--solution-only">
                  <span className="lb-seg lb-ws">WS</span>
                  <span className="lb-seg lb-sol">SOL</span>
                </span>{' '}
                solution without record (track it in the detail pane)
              </li>
              <li>
                <span className="ado-chip">#13388</span> Azure DevOps work
                item number
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
            </ul>
          </section>
        </div>
      </div>
    </div>
  )
}
