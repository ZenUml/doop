/**
 * Diagram frames: a frame whose HTML is generated from diagram source text
 * (ZenUML or Mermaid) and renders it with a script. The source is the
 * document; the HTML is derived from it by `buildDiagramHtml` and read back
 * by `readDiagramFrame`, so the frame stays an ordinary Doop frame for
 * storage, realtime sync, screenshots and exports.
 *
 * Spike module: nothing here imports from the rest of the app.
 */

export const DIAGRAM_KINDS = ['zenuml', 'mermaid'] as const

export type DiagramKind = (typeof DIAGRAM_KINDS)[number]

export interface DiagramFrame {
  kind: DiagramKind
  source: string
  /** Compiled legacy styles, retained when the source is edited. */
  css?: string
  /** Editable original stylesheet; compiled CSS alone loses LESS/SCSS variables. */
  styleSource?: string
  styleMode?: string
  /** Recovery inputs for legacy Atomic CSS; retained as text, never executed. */
  styleConfig?: string
  styleHtml?: string
}

/** Where the server serves the renderers from, same origin as the app. */
export const DIAGRAM_VENDOR_PATH = '/vendor/diagram'

/** Set on <html> by the renderer: `rendered` or `error`, once it has run. */
export const DIAGRAM_STATE_ATTR = 'data-doop-diagram-state'

export const DEFAULT_DIAGRAM_SOURCE: Record<DiagramKind, string> = {
  zenuml: `title Order Service
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
}`,
  mermaid: `flowchart TD
  A[Client] --> B{Paid?}
  B -- yes --> C[Ship order]
  B -- no --> D[Hold order]
  C --> E[(DB)]
  D --> E`,
}

/* The renderer script has two parts. The first, per kind, imports the
   library and defines `renderDiagram(mount, source)` and `RENDERER_STYLE`.
   The second, shared, mounts the diagram and re-renders when the source
   changes.

   Three things follow from how the frame runtime updates a live frame
   (src/lib/frameRuntime.ts): it morphs <head> and <body> to match the new
   HTML and re-runs only a <script> whose text changed.

   - The import is static, so the load event waits for the renderer. The
     server's screenshot waits for load; a dynamic import renders too late.
   - The diagram is mounted on <html>, after <body>. The morph walks <head>
     and <body> only, so the rendered diagram is never wiped and an edit
     updates it in place with no flash.
   - A renderer may add its stylesheet to <head> when it loads, and the morph
     trims <head> back to the source. The stylesheet is put back when that
     happens.

   None of this text may depend on the diagram's source: it has to stay
   byte-identical across edits so the runtime does not re-run it. */
const RENDERER_PRELUDE: Record<DiagramKind, string> = {
  zenuml: `import ZenUml from '${DIAGRAM_VENDOR_PATH}/zenuml.mjs'

const RENDERER_STYLE = /\\.zenuml\\b/
let zenuml = null
async function renderDiagram(mount, source) {
  zenuml = zenuml || new ZenUml(mount)
  await zenuml.render(source, { theme: 'theme-default' })
}`,
  mermaid: `import mermaid from '${DIAGRAM_VENDOR_PATH}/mermaid/mermaid.esm.min.mjs'

const RENDERER_STYLE = null
mermaid.initialize({ startOnLoad: false, securityLevel: 'strict' })
let renders = 0
async function renderDiagram(mount, source) {
  if (!source.trim()) return void mount.replaceChildren()
  renders += 1
  const { svg } = await mermaid.render('doop-diagram-' + renders, source)
  mount.innerHTML = svg
}`,
}

const RENDERER_LOOP = `
const root = document.documentElement
const rendererStyles = RENDERER_STYLE
  ? Array.from(document.head.querySelectorAll('style')).filter((style) => RENDERER_STYLE.test(style.textContent || ''))
  : []
if (rendererStyles.length) {
  new MutationObserver(() => {
    for (const style of rendererStyles) if (!style.isConnected) document.head.appendChild(style)
  }).observe(document.head, { childList: true })
}

const stale = root.querySelector(':scope > [data-doop-diagram-mount]')
if (stale) stale.remove()
const mount = document.createElement('div')
mount.setAttribute('data-doop-diagram-mount', '')
mount.id = 'diagram'
root.appendChild(mount)

const oldCustomStyle = root.querySelector(':scope > [data-doop-diagram-custom-style]')
if (oldCustomStyle) oldCustomStyle.remove()
const customStyle = document.createElement('style')
customStyle.setAttribute('data-doop-diagram-custom-style', '')
root.appendChild(customStyle)

let shown = null
let shownCss = null
let busy = false

async function sync() {
  if (busy) return
  const holder = document.querySelector('[data-doop-diagram-source]')
  const source = holder ? holder.textContent || '' : ''
  const css = document.querySelector('[data-doop-diagram-css]')?.textContent || ''
  if (css !== shownCss) {
    customStyle.textContent = css
    shownCss = css
  }
  if (source === shown) return
  busy = true
  shown = source
  try {
    await renderDiagram(mount, source)
    root.setAttribute('${DIAGRAM_STATE_ATTR}', 'rendered')
    await new Promise(requestAnimationFrame)
    const content = mount.querySelector('.sequence-diagram, svg') || mount
    const bounds = content.getBoundingClientRect()
    parent.postMessage({ type: 'doop:diagram-size', source, width: Math.ceil(bounds.right + 16), height: Math.ceil(bounds.bottom + 16) }, '*')
  } catch (error) {
    /* the last good diagram stays up while the source does not parse */
    root.setAttribute('${DIAGRAM_STATE_ATTR}', 'error')
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

function isDiagramKind(kind: string): kind is DiagramKind {
  return (DIAGRAM_KINDS as readonly string[]).includes(kind)
}

export function buildDiagramHtml({
  kind,
  source,
  css,
  styleSource,
  styleMode,
  styleConfig,
  styleHtml,
}: DiagramFrame): string {
  /* the HTML parser drops one newline right after <pre>, so one is always
     written there and the source's own leading newlines survive */
  return [
    '<!doctype html>',
    '<html>',
    `<head><meta charset="utf-8"><style data-doop-diagram-base>${BASE_STYLE}</style></head>`,
    `<body data-doop-diagram="${kind}">`,
    `<pre hidden data-doop-diagram-source>\n${escapeHtml(source)}</pre>`,
    ...(css ? [`<pre hidden data-doop-diagram-css>\n${escapeHtml(css)}</pre>`] : []),
    ...(styleSource !== undefined
      ? [`<pre hidden data-doop-diagram-style-source>\n${escapeHtml(styleSource)}</pre>`]
      : []),
    ...(styleMode !== undefined ? [`<pre hidden data-doop-diagram-style-mode>\n${escapeHtml(styleMode)}</pre>`] : []),
    ...(styleConfig !== undefined
      ? [`<pre hidden data-doop-diagram-style-config>\n${escapeHtml(styleConfig)}</pre>`]
      : []),
    ...(styleHtml !== undefined ? [`<pre hidden data-doop-diagram-style-html>\n${escapeHtml(styleHtml)}</pre>`] : []),
    `<script type="module">${RENDERER_PRELUDE[kind]}\n${RENDERER_LOOP}</script>`,
    '</body>',
    '</html>',
  ].join('\n')
}

export function readDiagramFrame(html: string): DiagramFrame | null {
  const kind = /<body\b[^>]*\bdata-doop-diagram="([a-z]+)"/.exec(html)?.[1]
  if (!kind || !isDiagramKind(kind)) return null
  const source = /<pre\b[^>]*\bdata-doop-diagram-source\b[^>]*>\n?([\s\S]*?)<\/pre>/.exec(html)?.[1]
  if (source === undefined) return null
  const css = /<pre\b[^>]*\bdata-doop-diagram-css\b[^>]*>\n?([\s\S]*?)<\/pre>/.exec(html)?.[1]
  const styleSource = /<pre\b[^>]*\bdata-doop-diagram-style-source\b[^>]*>\n?([\s\S]*?)<\/pre>/.exec(html)?.[1]
  const styleMode = /<pre\b[^>]*\bdata-doop-diagram-style-mode\b[^>]*>\n?([\s\S]*?)<\/pre>/.exec(html)?.[1]
  const styleConfig = /<pre\b[^>]*\bdata-doop-diagram-style-config\b[^>]*>\n?([\s\S]*?)<\/pre>/.exec(html)?.[1]
  const styleHtml = /<pre\b[^>]*\bdata-doop-diagram-style-html\b[^>]*>\n?([\s\S]*?)<\/pre>/.exec(html)?.[1]
  return {
    kind,
    source: unescapeHtml(source),
    ...(css !== undefined ? { css: unescapeHtml(css) } : {}),
    ...(styleSource !== undefined ? { styleSource: unescapeHtml(styleSource) } : {}),
    ...(styleMode !== undefined ? { styleMode: unescapeHtml(styleMode) } : {}),
    ...(styleConfig !== undefined ? { styleConfig: unescapeHtml(styleConfig) } : {}),
    ...(styleHtml !== undefined ? { styleHtml: unescapeHtml(styleHtml) } : {}),
  }
}
