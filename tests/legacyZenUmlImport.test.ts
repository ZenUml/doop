import { afterAll, beforeAll, expect, it } from 'vitest'
import { Client, startServer, type Server } from './harness'
import { buildDiagramHtml, readDiagramFrame } from '../shared/diagramFrame'

let server: Server
let owner: Client
let outsider: Client
beforeAll(async () => {
  server = await startServer()
  owner = new Client(server)
  await owner.signUp('legacy-owner@test.dev', 'Legacy Owner')
  outsider = new Client(server)
  await outsider.signUp('legacy-other@test.dev', 'Other')
}, 60_000)
afterAll(() => server?.stop())

it('imports a private editable library, preserves pages and LESS, and safely retries after edits and restart', async () => {
  const items = [
    {
      id: 'old',
      title: 'Old library',
      cssMode: 'less',
      currentPageId: 'b',
      pages: [
        { id: 'a', title: 'Order', js: 'User->Order: create', css: '@ink: red; #diagram .message { color: @ink; }' },
        { id: 'b', title: 'Payment', js: 'Order->Payment: pay', css: '' },
      ],
    },
  ]
  const response = await owner.post('/api/import/zenuml', { items })
  expect(response.status).toBe(200)
  const result = await response.json()
  expect(result).toMatchObject({ imported: 1, skipped: 0, warnings: [] })
  const id = result.canvases[0].id
  const canvas = await (await owner.get(`/api/canvases/${id}`)).json()
  expect(canvas.name).toBe('Old library')
  expect(canvas.pages.map((page: { name: string }) => page.name)).toEqual(['Order', 'Payment'])
  expect(result.canvases[0].pageId).toBe(canvas.pages[1].id)
  expect(canvas.frames.map((frame: { pageId: string }) => frame.pageId)).toEqual(
    canvas.pages.map((page: { id: string }) => page.id),
  )
  expect((await outsider.get(`/api/canvases/${id}`)).status).toBe(403)
  const frame = canvas.frames[0]
  const diagram = readDiagramFrame(frame.html)!
  expect(diagram.source).toBe('User->Order: create')
  expect(diagram.css).toContain('color: red')
  expect(diagram.styleMode).toBe('less')
  expect(diagram.styleSource).toBe(items[0]!.pages[0]!.css)
  const html = buildDiagramHtml({ ...diagram, source: 'User->Order: edited' })
  expect((await owner.patch(`/api/frames/${frame.id}`, { html })).status).toBe(200)
  // Quit immediately after acknowledgement: shutdown must flush its debounce.
  server.stop({ keepData: true })
  await server.stopped
  server = await startServer({}, server.dataDir)
  const retry = await (await owner.post('/api/import/zenuml', { items })).json()
  expect(retry).toMatchObject({ imported: 0, skipped: 1 })
  expect(retry.canvases[0].id).toBe(id)
  const persisted = await (await owner.get(`/api/canvases/${id}`)).json()
  expect(readDiagramFrame(persisted.frames.find((item: { id: string }) => item.id === frame.id).html)).toMatchObject({
    source: 'User->Order: edited',
    css: diagram.css,
  })
}, 60_000)

it('rejects a malformed library without importing an earlier valid document', async () => {
  const before = await (await owner.get('/api/canvases')).json()
  const response = await owner.post('/api/import/zenuml', {
    items: [
      { id: 'should-not-import', title: 'Atomic failure', js: 'A->B' },
      { id: 'broken', pages: [{ js: { invalid: true } }] },
    ],
  })
  expect(response.status).toBe(400)
  expect(await (await owner.get('/api/canvases')).json()).toEqual(before)
})

it('retains ordinary CSS including font imports, while denying preprocessor file access', async () => {
  const css = '@import url("https://fonts.googleapis.com/css2?family=Roboto"); #diagram { color: red; }'
  const response = await owner.post('/api/import/zenuml', {
    items: [
      { id: 'css-font', title: 'Font', js: 'A->B', css },
      { id: 'less-file', title: 'File', js: 'A->B', cssMode: 'less', css: '@import (inline) "/etc/passwd";' },
    ],
  })
  expect(response.status).toBe(200)
  const result = await response.json()
  expect(result.warnings).toHaveLength(1)
  const canvas = await (await owner.get(`/api/canvases/${result.canvases[0].id}`)).json()
  expect(readDiagramFrame(canvas.frames[0].html)?.css).toBe(css)
})

it('preserves unsupported AtomicCSS inputs for recovery without claiming converted appearance', async () => {
  const source = 'A->B: original'
  const config = '{"custom":{"D(b)":"display:block"}}'
  const html = '<div class="D(b)">Original</div>'
  const response = await owner.post('/api/import/zenuml', {
    items: [
      {
        id: 'atomic-recovery',
        js: source,
        html,
        css: '/* original CSS */',
        cssMode: 'acss',
        cssSettings: { acssConfig: config },
      },
    ],
  })
  expect(response.status).toBe(200)
  const result = await response.json()
  expect(result.warnings).toHaveLength(1)
  const document = await (await owner.get(`/api/canvases/${result.canvases[0].id}`)).json()
  expect(readDiagramFrame(document.frames[0].html)).toMatchObject({
    source,
    styleMode: 'acss',
    styleSource: '/* original CSS */',
    styleConfig: config,
    styleHtml: html,
  })
})
