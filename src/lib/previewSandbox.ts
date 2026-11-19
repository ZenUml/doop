/** Sandbox for an iframe that previews a saved version of a frame.
 *
 *  A diagram frame is a hidden source `<pre>` plus a module script that draws
 *  it, so a preview with scripts off shows an empty page. The live frame runs
 *  the same HTML under `allow-scripts` (opaque origin, no same-origin access),
 *  so a diagram version gets exactly that. Any other saved HTML stays inert. */
export function previewSandbox(html: string): '' | 'allow-scripts' {
  return html.includes('data-diagramly-diagram=') ? 'allow-scripts' : ''
}
