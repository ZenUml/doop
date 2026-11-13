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

export interface DiagramPage extends DiagramContent {
  id: string
  title: string
  width?: number
  height?: number
}

export interface DiagramFrame extends DiagramContent {
  pages?: DiagramPage[]
  activePageId?: string
}

export interface DiagramContent {
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

const RENDERER_KIND = 'zenuml'
const RENDERER_STYLE = /\\.zenuml\\b/
let zenuml = null
async function renderDiagram(mount, source) {
  zenuml = zenuml || new ZenUml(mount)
  await zenuml.render(source, { theme: 'theme-default' })
}`,
  mermaid: `import mermaid from '${DIAGRAM_VENDOR_PATH}/mermaid/mermaid.esm.min.mjs'

const RENDERER_KIND = 'mermaid'
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
// One style keeper per iframe survives head morphs and renderer switches.
// Cache the original nodes: module imports execute only once per document.
const runtime = window.__doopDiagramRuntime ||= { styles: {}, dispose: null }
runtime.dispose?.()
const importedStyles = RENDERER_STYLE
  ? Array.from(document.head.querySelectorAll('style')).filter((style) => RENDERER_STYLE.test(style.textContent || ''))
  : []
if (importedStyles.length) runtime.styles[RENDERER_KIND] = importedStyles
if (!runtime.styleObserver) {
  runtime.restoreStyles = () => {
    const kind = document.body.getAttribute('data-doop-diagram')
    for (const style of runtime.styles[kind] || []) if (!style.isConnected) document.head.appendChild(style)
  }
  runtime.styleObserver = new MutationObserver(runtime.restoreStyles)
  runtime.styleObserver.observe(document.head, { childList: true })
}
runtime.restoreStyles()

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
let disposed = false
const observer = new MutationObserver(() => void sync())
runtime.dispose = () => {
  disposed = true
  observer.disconnect()
  mount.remove()
  customStyle.remove()
}

function current() {
  return !disposed && mount.isConnected && document.body.getAttribute('data-doop-diagram') === RENDERER_KIND
}

async function sync() {
  if (busy || !current()) return
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
    if (!current()) return
    root.setAttribute('${DIAGRAM_STATE_ATTR}', 'rendered')
    await new Promise(requestAnimationFrame)
    if (!current()) return
    const content = mount.querySelector('.sequence-diagram, svg') || mount
    const bounds = content.getBoundingClientRect()
    parent.postMessage({ type: 'doop:diagram-size', source, width: Math.ceil(bounds.right + 16), height: Math.ceil(bounds.bottom + 16) }, '*')
  } catch (error) {
    if (!current()) return
    /* the last good diagram stays up while the source does not parse */
    root.setAttribute('${DIAGRAM_STATE_ATTR}', 'error')
    console.error(error)
  } finally {
    busy = false
    void sync()
  }
}

observer.observe(document.body, {
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

function content(diagram: DiagramContent): DiagramContent {
  const { kind, source, css, styleSource, styleMode, styleConfig, styleHtml } = diagram
  return {
    kind,
    source,
    ...(css !== undefined ? { css } : {}),
    ...(styleSource !== undefined ? { styleSource } : {}),
    ...(styleMode !== undefined ? { styleMode } : {}),
    ...(styleConfig !== undefined ? { styleConfig } : {}),
    ...(styleHtml !== undefined ? { styleHtml } : {}),
  }
}

/** The renderer projection must describe the same content as its active page. */
export function sameDiagramContent(a: DiagramContent, b: DiagramContent): boolean {
  const fields = ['kind', 'source', 'styleSource', 'styleMode', 'styleConfig', 'styleHtml'] as const
  return fields.every((field) => a[field] === b[field]) && (a.css ?? '') === (b.css ?? '')
}

/** Promote a legacy single-page frame without changing its content. */
export function ensureDiagramPages(diagram: DiagramFrame): DiagramFrame {
  if (diagram.pages) return diagram
  const page = { id: 'page-1', title: 'Page 1', ...content(diagram) }
  return { ...content(diagram), pages: [page], activePageId: page.id }
}

/** Persist the current projection before changing the active inner page. */
export function updateDiagramPage(diagram: DiagramFrame, id: string, patch: Partial<DiagramContent>): DiagramFrame {
  const current = ensureDiagramPages(diagram)
  const pages = syncPages(current)
  const target = pages.find((page) => page.id === id)
  if (!target) throw new Error('Diagram page not found.')
  const updated = { ...target, ...patch }
  const next = pages.map((page) => (page.id === id ? updated : page))
  return id === current.activePageId
    ? { ...content(updated), pages: next, activePageId: id }
    : { ...content(current), pages: next, activePageId: current.activePageId }
}

export function activateDiagramPage(diagram: DiagramFrame, id: string): DiagramFrame {
  const current = ensureDiagramPages(diagram)
  const pages = syncPages(current)
  const target = pages.find((page) => page.id === id)
  if (!target) throw new Error('Diagram page not found.')
  return { ...content(target), pages, activePageId: id }
}

function syncPages(diagram: DiagramFrame): DiagramPage[] {
  const pages = diagram.pages
  if (!pages?.length || pages.length > 1000 || !diagram.activePageId) throw new Error('Invalid diagram pages.')
  const ids = new Set<string>()
  for (const page of pages) {
    if (
      !page ||
      typeof page !== 'object' ||
      typeof page.id !== 'string' ||
      !page.id.trim() ||
      page.id.length > 300 ||
      typeof page.title !== 'string' ||
      !page.title.trim() ||
      page.title.length > 300 ||
      ids.has(page.id) ||
      !isDiagramKind(page.kind) ||
      typeof page.source !== 'string'
    )
      throw new Error('Invalid diagram page.')
    for (const field of ['css', 'styleSource', 'styleMode', 'styleConfig', 'styleHtml'] as const)
      if (page[field] !== undefined && typeof page[field] !== 'string') throw new Error('Invalid diagram page.')
    for (const dimension of ['width', 'height'] as const)
      if (
        page[dimension] !== undefined &&
        (!Number.isFinite(page[dimension]) || page[dimension]! <= 0 || page[dimension]! > 100_000)
      )
        throw new Error('Invalid diagram page size.')
    ids.add(page.id)
  }
  if (!ids.has(diagram.activePageId)) throw new Error('Diagram page not found.')
  return pages.map((page) =>
    page.id === diagram.activePageId
      ? {
          id: page.id,
          title: page.title,
          ...(page.width !== undefined ? { width: page.width } : {}),
          ...(page.height !== undefined ? { height: page.height } : {}),
          ...content(diagram),
        }
      : page,
  )
}

export function buildDiagramHtml(diagram: DiagramFrame): string {
  const { kind, source, css, styleSource, styleMode, styleConfig, styleHtml } = diagram
  const pages = diagram.pages ? syncPages(diagram) : undefined
  /* the HTML parser drops one newline right after <pre>, so one is always
     written there and the source's own leading newlines survive */
  return [
    '<!doctype html>',
    '<html>',
    `<head><meta charset="utf-8"><style data-doop-diagram-base>${BASE_STYLE}</style></head>`,
    `<body data-doop-diagram="${kind}">`,
    `<pre hidden data-doop-diagram-source>\n${escapeHtml(source)}</pre>`,
    ...(pages
      ? [
          `<pre hidden data-doop-diagram-pages>\n${escapeHtml(JSON.stringify({ version: 1, activePageId: diagram.activePageId, pages }))}</pre>`,
        ]
      : []),
    ...(css || (pages && css !== undefined) ? [`<pre hidden data-doop-diagram-css>\n${escapeHtml(css!)}</pre>`] : []),
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
  const projection: DiagramFrame = {
    kind,
    source: unescapeHtml(source),
    ...(css !== undefined ? { css: unescapeHtml(css) } : {}),
    ...(styleSource !== undefined ? { styleSource: unescapeHtml(styleSource) } : {}),
    ...(styleMode !== undefined ? { styleMode: unescapeHtml(styleMode) } : {}),
    ...(styleConfig !== undefined ? { styleConfig: unescapeHtml(styleConfig) } : {}),
    ...(styleHtml !== undefined ? { styleHtml: unescapeHtml(styleHtml) } : {}),
  }
  const encodedPages = /<pre\b[^>]*\bdata-doop-diagram-pages\b[^>]*>\n?([\s\S]*?)<\/pre>/.exec(html)?.[1]
  if (encodedPages === undefined) return projection
  try {
    const metadata: unknown = JSON.parse(unescapeHtml(encodedPages))
    if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return null
    const { version, pages, activePageId } = metadata as { version?: unknown; pages?: unknown; activePageId?: unknown }
    if (version !== 1 || !Array.isArray(pages) || typeof activePageId !== 'string') return null
    const result = { ...projection, pages: pages as DiagramPage[], activePageId }
    syncPages(result)
    const active = result.pages.find((page) => page.id === activePageId)!
    // Earlier v1 writers omitted the rendered block for empty CSS. It paints
    // the same as no CSS; return the canonical active value in both views.
    if (!sameDiagramContent(active, projection)) return null
    return { ...content(active), pages: result.pages, activePageId }
  } catch {
    return null
  }
}
