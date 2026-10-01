/**
 * Renders a preview document in an iframe with an empty `sandbox`: no
 * scripts, no forms, no same-origin access. Template HTML comes from
 * Dataverse and is shown as-is, so `<img onerror>` and friends must not run
 * inside the app — and the template's CSS must not leak into it.
 */
export function PreviewFrame({ doc, height, title }: { doc: string; height: number; title: string }) {
  return <iframe className="preview-frame" title={title} sandbox="" srcDoc={doc} style={{ height }} />
}
