/**
 * Onboarding How-To for the Workbench, opened from the sidebar. A concise but
 * complete walk-through: how to create solutions and what happens behind the
 * scenes, then how to merge into a release and what that actually does. Keep
 * it in sync with the README / Help when the flow changes.
 */
export function HowToPanel({ onClose }: { onClose: () => void }) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal card modal--wide help howto"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header help-header">
          <div className="help-title">
            <span className="help-title-icon" aria-hidden="true">
              📖
            </span>
            <div className="help-title-text">
              <h2>How-To — Workbench</h2>
              <p className="help-subtitle">
                From creating a solution to shipping it in a release.
              </p>
            </div>
          </div>
          <button className="modal-close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        <div className="help-body">
          <section className="help-section">
            <h3>The model in one minute</h3>
            <p>
              Everything here works on a <strong>working solution</strong>,
              which has two parts:
            </p>
            <ul>
              <li>
                the <strong>real unmanaged Dataverse solution</strong> that
                actually holds your components (tables, flows, web resources, …)
                — the same thing you see in the maker portal;
              </li>
              <li>
                a <strong>tracking record</strong> (the{' '}
                <code>pro_workingsolution</code> table) that adds the title,
                type (Feature / Bug / Release), owner, Azure DevOps id,
                deployment status and merge log on top, linked to the real
                solution by its unique name.
              </li>
            </ul>
            <p>
              The Workbench list is that pairing. The banner on the right of
              each row tells you which parts exist:{' '}
              <span className="sol-state sol-state--both">Synced</span> (both),{' '}
              <span className="sol-state sol-state--record-only">WS only</span>{' '}
              (record, no solution) or{' '}
              <span className="sol-state sol-state--solution-only">Sol only</span>{' '}
              (solution, not tracked yet).
            </p>
          </section>

          <section className="help-section">
            <h3>1 · Create a working solution</h3>
            <ol>
              <li>
                In the Workbench, click <strong>+ New Working Solution</strong>.
              </li>
              <li>
                Pick the <strong>type</strong> (Feature / Bug / Release), enter a{' '}
                <strong>title</strong>, the <strong>Azure DevOps id</strong> of
                the work item (features &amp; bugs), and the{' '}
                <strong>publisher</strong>. The unique name is generated for you
                (<code>feature_&lt;id&gt;</code> / <code>bug_&lt;id&gt;</code> /{' '}
                <code>deploy_&lt;name&gt;</code>) with a live duplicate check.
              </li>
              <li>
                On save the app creates <strong>both parts at once</strong>: the
                real unmanaged solution in Dataverse (it shows up in the maker
                portal immediately) and the tracking record linking to it. The
                deployment status starts at <em>None</em>.
              </li>
              <li>
                Now <strong>develop as usual</strong> in the maker portal — add
                your tables, columns, flows and web resources to that solution.
                The Workbench just keeps track of it; it doesn't change how you
                build.
              </li>
            </ol>
            <p className="howto-note muted">
              Already have a solution? Open it (it shows{' '}
              <span className="sol-state sol-state--solution-only">Sol only</span>)
              and use <strong>Create working-solution record</strong> to start
              tracking it. If a record lost its solution (
              <span className="sol-state sol-state--record-only">WS only</span>),
              the detail pane lets you <strong>re-link</strong> it.
            </p>
          </section>

          <section className="help-section">
            <h3>2 · Merge into a release</h3>
            <ol>
              <li>
                Create one working solution of type <strong>Release</strong> —
                it's the empty <strong>deployment container</strong> that will
                collect everything for a release train (no DevOps id).
              </li>
              <li>
                Open <strong>Merge</strong> (needs the{' '}
                <strong>“INT | Deployment Manager”</strong> role). Step{' '}
                <strong>1</strong>: tick the source <strong>feature / bug</strong>{' '}
                solutions in the multi-select. Step <strong>2</strong>: choose
                the <strong>Release</strong> solution as the target.
              </li>
              <li>
                Step <strong>3</strong> shows the <strong>component plan</strong>{' '}
                — the distinct set of components that will be added. A component
                contributed by several sources is flagged as a{' '}
                <strong>conflict</strong> and added once; components already in
                the target are <strong>skipped</strong>.
              </li>
              <li>
                Click <strong>Merge into deployment solution</strong>.
              </li>
            </ol>
            <p>
              <strong>What happens behind it:</strong> for each component the app
              calls Dataverse's <code>AddSolutionComponent</code>. That adds the
              component's <strong>membership</strong> to the release solution —
              it does <strong>not</strong> copy or duplicate the component, both
              solutions simply reference the same object. The source's
              subcomponent behaviour (include all / do-not-include / shell only)
              is carried over, and components already present are skipped instead
              of failing, so a re-merge is always safe.
            </p>
            <p>
              Afterwards each source is stamped with the status{' '}
              <strong>“Merged into Deployment Solution”</strong> and a timestamp,
              and a <strong>merge-run</strong> row is logged on the release. Open
              the Release solution to see its <strong>Merge history</strong> —
              who merged what and when; click a row for the exact components that
              merge added, grouped by type.
            </p>
          </section>

          <section className="help-section">
            <h3>3 · Validate &amp; ship</h3>
            <ul>
              <li>
                The Release solution now contains the combined component set.
                Before deploying, run the <strong>Validate</strong> checks
                (Dependencies, Layers, Compare, App Sharing) — or the{' '}
                <strong>ALM Detective</strong> for all of them at once — to catch
                missing dependencies, unmanaged layers or unshared apps.
              </li>
              <li>
                Generate <strong>Release Notes</strong> for the release from its
                merge history — included solutions and components as Markdown or
                raw text — and <strong>Publish</strong> a versioned snapshot you
                can revisit later.
              </li>
              <li>
                <strong>Export / deployment of the release itself runs through
                your normal pipeline</strong>, outside this app — the Workbench
                prepares and tracks the release, it doesn't push it.
              </li>
              <li>
                When a feature / bug is done, use <strong>Mark completed</strong>{' '}
                on its entry (optionally deleting the now-merged underlying
                solution) so it leaves the Open list. The{' '}
                <span className="tbc-chip">✓ to be completed</span> flag and{' '}
                <strong>⟳ Sync with DevOps</strong> help you spot entries whose
                work item is already closed.
              </li>
            </ul>
          </section>

          <section className="help-section">
            <h3>Good to know</h3>
            <ul>
              <li>
                Merging copies <strong>membership, not components</strong> —
                editing a table stays one table, referenced by every solution it
                belongs to.
              </li>
              <li>
                Deleting a solution <strong>container</strong> (e.g. after
                completing) removes only the container; the components inside
                stay in the environment.
              </li>
              <li>
                The <strong>unique name</strong> is the stable key used to match
                solutions and components across environments — keep to the
                generated convention.
              </li>
              <li>
                <strong>⚠ Scan collisions</strong> warns when the same component
                sits in several open working solutions (whoever deploys last
                wins) — worth a look before a release.
              </li>
            </ul>
          </section>
        </div>
      </div>
    </div>
  )
}
