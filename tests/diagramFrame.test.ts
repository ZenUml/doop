import { describe, expect, it } from 'vitest'
import {
  buildDiagramHtml,
  DEFAULT_DIAGRAM_SOURCE,
  DIAGRAM_KINDS,
  DIAGRAM_VENDOR_PATH,
  readDiagramFrame,
  type DiagramKind,
} from '../shared/diagramFrame'

const SOURCE = `title Order Service
Client->OrderController.post(order) {
  if(a < b && c > d) {
    return "ok"
  }
}`

const RENDERER: Record<DiagramKind, string> = {
  zenuml: `import ZenUml from '${DIAGRAM_VENDOR_PATH}/zenuml.mjs'`,
  mermaid: `import mermaid from '${DIAGRAM_VENDOR_PATH}/mermaid/mermaid.esm.min.mjs'`,
}

const script = (html: string) => /<script type="module">[\s\S]*<\/script>/.exec(html)?.[0]

describe('diagram frames', () => {
  it('offers ZenUML and Mermaid, each with a starter source', () => {
    expect([...DIAGRAM_KINDS]).toEqual(['zenuml', 'mermaid'])
    for (const kind of DIAGRAM_KINDS) expect(DEFAULT_DIAGRAM_SOURCE[kind].trim()).not.toBe('')
  })

  describe.each(DIAGRAM_KINDS)('%s', (kind) => {
    it('round-trips the source through the frame HTML', () => {
      const html = buildDiagramHtml({ kind, source: SOURCE })
      expect(readDiagramFrame(html)).toEqual({ kind, source: SOURCE })
    })

    it('keeps a source that starts with a newline', () => {
      const source = `\n\n${SOURCE}`
      expect(readDiagramFrame(buildDiagramHtml({ kind, source }))?.source).toBe(source)
    })

    it('keeps an empty source', () => {
      expect(readDiagramFrame(buildDiagramHtml({ kind, source: '' }))).toEqual({ kind, source: '' })
    })

    it('cannot be broken out of by markup in the source', () => {
      const source = 'A->B: </pre><script>alert(1)</script>'
      const html = buildDiagramHtml({ kind, source })
      expect(html).not.toContain('<script>alert(1)</script>')
      expect(readDiagramFrame(html)?.source).toBe(source)
    })

    it('loads the renderer from this server with a static import', () => {
      const html = buildDiagramHtml({ kind, source: SOURCE })
      /* a static import holds the load event until the renderer is in, which is
         what the server's screenshot waits for; an absolute or CDN address
         would not work offline */
      expect(html).toContain(RENDERER[kind])
      expect(html).not.toMatch(/https?:\/\//)
      expect(html).not.toContain('import(')
    })

    it('changes only the source block when the source changes', () => {
      const a = buildDiagramHtml({ kind, source: 'A->B: one' })
      const b = buildDiagramHtml({ kind, source: 'A->B: two' })
      /* the frame runtime re-runs a script whose text changed; the renderer
         script must stay byte-identical so an edit re-renders in place */
      expect(script(a)).toBeDefined()
      expect(script(a)).toBe(script(b))
    })
  })

  it('gives each kind its own renderer script', () => {
    const zenuml = buildDiagramHtml({ kind: 'zenuml', source: SOURCE })
    const mermaid = buildDiagramHtml({ kind: 'mermaid', source: SOURCE })
    expect(script(zenuml)).not.toBe(script(mermaid))
    expect(zenuml).not.toContain('mermaid')
  })

  it('reads an ordinary frame, or a kind it does not know, as not a diagram', () => {
    expect(readDiagramFrame('<!doctype html><html><body><h1>Hello</h1></body></html>')).toBeNull()
    expect(readDiagramFrame('')).toBeNull()
    const unknown = buildDiagramHtml({ kind: 'zenuml', source: SOURCE }).replace(
      'data-doop-diagram="zenuml"',
      'data-doop-diagram="plantuml"',
    )
    expect(readDiagramFrame(unknown)).toBeNull()
  })
})

it('keeps imported styles through source edits without letting styles inject markup', () => {
  const css = '#diagram .message {color:red} /* </style><script>bad()</script> */'
  const original = buildDiagramHtml({ kind: 'zenuml', source: 'A->B: old', css })
  const diagram = readDiagramFrame(original)!
  expect(diagram.css).toBe(css)
  const edited = buildDiagramHtml({ ...diagram, source: 'A->B: edited' })
  expect(readDiagramFrame(edited)).toEqual({ kind: 'zenuml', source: 'A->B: edited', css })
  expect(edited).not.toContain('<script>bad()</script>')
})

it('retains editable preprocessor text and mode independently of the compiled stylesheet', () => {
  const style = { styleSource: '@ink: red; .message { color: @ink; }', styleMode: 'less' }
  const original = buildDiagramHtml({ kind: 'zenuml', source: 'A->B', css: '.message {color:red}', ...style })
  expect(readDiagramFrame(original)).toMatchObject(style)
  const edited = buildDiagramHtml({ ...readDiagramFrame(original)!, source: 'A->B.next()' })
  expect(readDiagramFrame(edited)).toMatchObject({ ...style, css: '.message {color:red}', source: 'A->B.next()' })
})
