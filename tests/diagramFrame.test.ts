import { describe, expect, it } from 'vitest'
import { buildDiagramHtml, DIAGRAM_VENDOR_PATH, readDiagramFrame } from '../shared/diagramFrame'

const SOURCE = `title Order Service
Client->OrderController.post(order) {
  if(a < b && c > d) {
    return "ok"
  }
}`

describe('diagram frames', () => {
  it('round-trips the source through the frame HTML', () => {
    const html = buildDiagramHtml({ kind: 'zenuml', source: SOURCE })
    expect(readDiagramFrame(html)).toEqual({ kind: 'zenuml', source: SOURCE })
  })

  it('keeps a source that starts with a newline', () => {
    const source = `\n\n${SOURCE}`
    expect(readDiagramFrame(buildDiagramHtml({ kind: 'zenuml', source }))?.source).toBe(source)
  })

  it('keeps an empty source', () => {
    expect(readDiagramFrame(buildDiagramHtml({ kind: 'zenuml', source: '' }))).toEqual({ kind: 'zenuml', source: '' })
  })

  it('cannot be broken out of by markup in the source', () => {
    const source = 'A->B: </pre><script>alert(1)</script>'
    const html = buildDiagramHtml({ kind: 'zenuml', source })
    expect(html).not.toContain('<script>alert(1)</script>')
    expect(readDiagramFrame(html)?.source).toBe(source)
  })

  it('loads the renderer from this server with a static import', () => {
    const html = buildDiagramHtml({ kind: 'zenuml', source: SOURCE })
    /* a static import holds the load event until the renderer is in, which is
       what the server's screenshot waits for; an absolute or CDN address
       would not work offline */
    expect(html).toContain(`import ZenUml from '${DIAGRAM_VENDOR_PATH}/zenuml.mjs'`)
    expect(html).not.toMatch(/https?:\/\//)
    expect(html).not.toContain('import(')
  })

  it('changes only the source block when the source changes', () => {
    const a = buildDiagramHtml({ kind: 'zenuml', source: 'A->B: one' })
    const b = buildDiagramHtml({ kind: 'zenuml', source: 'A->B: two' })
    /* the frame runtime re-runs a script whose text changed; the renderer
       script must stay byte-identical so an edit re-renders in place */
    const script = (html: string) => /<script type="module">[\s\S]*<\/script>/.exec(html)?.[0]
    expect(script(a)).toBeDefined()
    expect(script(a)).toBe(script(b))
  })

  it('reads an ordinary frame as not a diagram', () => {
    expect(readDiagramFrame('<!doctype html><html><body><h1>Hello</h1></body></html>')).toBeNull()
    expect(readDiagramFrame('')).toBeNull()
  })
})
