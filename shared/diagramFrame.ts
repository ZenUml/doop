/**
 * Diagram frames: a frame whose HTML is generated from diagram source text
 * (ZenUML for now) and renders it with a script. The source is the document;
 * the HTML is derived from it by `buildDiagramHtml` and read back by
 * `readDiagramFrame`, so the frame stays an ordinary Doop frame for storage,
 * realtime sync, screenshots and exports.
 *
 * Spike module: nothing here imports from the rest of the app.
 */

export type DiagramKind = 'zenuml'

export interface DiagramFrame {
  kind: DiagramKind
  source: string
}

/** Where the server serves the renderers from, same origin as the app. */
export const DIAGRAM_VENDOR_PATH = '/vendor/diagram'

export const DEFAULT_ZENUML_SOURCE = `title Order Service
@Actor Client
@Boundary OrderController
@EC2 OrderService
@Database DB
Client->OrderController.post(order) {
  OrderService.create(order) {
    DB.save(order)
    if(paid) {
      return ok
    } else {
      return pending
    }
  }
}`

const KINDS: readonly DiagramKind[] = ['zenuml']

/* The renderer. Three things here follow from how the frame runtime updates a
   live frame (src/lib/frameRuntime.ts): it morphs <head> and <body> to match
   the new HTML and re-runs only a <script> whose text changed.

   - The import is static, so the load event waits for the renderer. The
     server's screenshot waits for load; a dynamic import renders too late.
   - The diagram is mounted on <html>, after <body>. The morph walks <head>
     and <body> only, so the rendered diagram is never wiped and an edit
     updates it in place with no flash.
   - The renderer adds its stylesheet to <head> when it loads, and the morph
     trims <head> back to the source. The stylesheet is put back when that
     happens.

   This text must not depend on the diagram's source: it has to stay
   byte-identical across edits so the runtime does not re-run it. */
const ZENUML_RUNTIME = `import ZenUml from '${DIAGRAM_VENDOR_PATH}/zenuml.mjs'

const root = document.documentElement
const rendererStyles = Array.from(document.head.querySelectorAll('style')).filter((style) =>
  /\\.zenuml\\b/.test(style.textContent || ''),
)
new MutationObserver(() => {
  for (const style of rendererStyles) if (!style.isConnected) document.head.appendChild(style)
}).observe(document.head, { childList: true })

let mount = root.querySelector(':scope > [data-doop-diagram-mount]')
if (mount) mount.remove()
mount = document.createElement('div')
mount.setAttribute('data-doop-diagram-mount', '')
root.appendChild(mount)

const zenuml = new ZenUml(mount)
let shown = null
let busy = false

async function sync() {
  if (busy) return
  const holder = document.querySelector('[data-doop-diagram-source]')
  const source = holder ? holder.textContent || '' : ''
  if (source === shown) return
  busy = true
  shown = source
  try {
    await zenuml.render(source, { theme: 'theme-default' })
    root.setAttribute('data-doop-diagram-state', 'rendered')
  } catch (error) {
    root.setAttribute('data-doop-diagram-state', 'error')
    console.error(error)
  } finally {
    busy = false
    void sync()
  }
}

new MutationObserver(() => void sync()).observe(document.body, {
  subtree: true,
  childList: true,
  characterData: true,
})
void sync()`

const BASE_STYLE =
  'html,body{margin:0;background:#fff}body{height:0;overflow:hidden}[data-doop-diagram-mount]{padding:16px;box-sizing:border-box}'

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function unescapeHtml(text: string): string {
  return text.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
}

export function buildDiagramHtml({ kind, source }: DiagramFrame): string {
  /* the HTML parser drops one newline right after <pre>, so one is always
     written there and the source's own leading newlines survive */
  return [
    '<!doctype html>',
    '<html>',
    `<head><meta charset="utf-8"><style data-doop-diagram-base>${BASE_STYLE}</style></head>`,
    `<body data-doop-diagram="${kind}">`,
    `<pre hidden data-doop-diagram-source>\n${escapeHtml(source)}</pre>`,
    `<script type="module">${ZENUML_RUNTIME}</script>`,
    '</body>',
    '</html>',
  ].join('\n')
}

export function readDiagramFrame(html: string): DiagramFrame | null {
  const kind = /<body\b[^>]*\bdata-doop-diagram="([a-z]+)"/.exec(html)?.[1]
  if (!kind || !KINDS.includes(kind as DiagramKind)) return null
  const source = /<pre\b[^>]*\bdata-doop-diagram-source\b[^>]*>\n?([\s\S]*?)<\/pre>/.exec(html)?.[1]
  if (source === undefined) return null
  return { kind: kind as DiagramKind, source: unescapeHtml(source) }
}
