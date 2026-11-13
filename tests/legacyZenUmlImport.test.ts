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

it('keeps separately keyed legacy records with equal payloads, and retries without overwriting edits', async () => {
  const items = [
    { id: 'shared-payload-id', sourceRecordId: `idb1_${'1'.repeat(64)}`, title: 'Twin', js: 'A->B: same' },
    { id: 'shared-payload-id', sourceRecordId: `idb1_${'2'.repeat(64)}`, title: 'Twin', js: 'A->B: same' },
  ]
  const first = await (await owner.post('/api/import/zenuml', { items })).json()
  expect(first).toMatchObject({ imported: 2, skipped: 0 })
  expect(first.canvases[0].id).not.toBe(first.canvases[1].id)
  const original = await (await owner.get(`/api/canvases/${first.canvases[1].id}`)).json()
  const html = buildDiagramHtml({ ...readDiagramFrame(original.frames[0].html)!, source: 'A->B: edited' })
  expect((await owner.patch(`/api/frames/${original.frames[0].id}`, { html })).status).toBe(200)
  const retry = await (await owner.post('/api/import/zenuml', { items })).json()
  expect(retry).toMatchObject({ imported: 0, skipped: 2 })
  const kept = await (await owner.get(`/api/canvases/${first.canvases[1].id}`)).json()
  expect(readDiagramFrame(kept.frames[0].html)?.source).toBe('A->B: edited')
  expect((await outsider.get(`/api/canvases/${first.canvases[0].id}`)).status).toBe(403)
})

it('retains two identical records without source keys even when selected separately', async () => {
  const record = { id: 'identical-old-json', title: 'Same', js: 'A->B: original' }
  const items = [record, { ...record }]
  const first = await (await owner.post('/api/import/zenuml', { items, selected: [0] })).json()
  const second = await (await owner.post('/api/import/zenuml', { items, selected: [1] })).json()
  expect(first.imported).toBe(1)
  expect(second.imported).toBe(1)
  expect(first.canvases[0].id).not.toBe(second.canvases[0].id)
  expect(await (await owner.post('/api/import/zenuml', { items })).json()).toMatchObject({ imported: 0, skipped: 2 })
})

it('uses source key across source edits and preserves the first imported work', async () => {
  const item = { id: 'changed-keyed', sourceRecordId: `idb1_${'a'.repeat(64)}`, title: 'Before', js: 'A->B: before' }
  const first = await (await owner.post('/api/import/zenuml', { items: [item] })).json()
  const retry = await (
    await owner.post('/api/import/zenuml', { items: [{ ...item, title: 'After', js: 'A->B: after' }] })
  ).json()
  expect(retry).toMatchObject({ imported: 0, skipped: 1 })
  expect(retry.canvases[0].id).toBe(first.canvases[0].id)
  const kept = await (await owner.get(`/api/canvases/${first.canvases[0].id}`)).json()
  expect(readDiagramFrame(kept.frames[0].html)?.source).toBe('A->B: before')
})

it('rejects a repeated source key instead of merging two records', async () => {
  const item = { id: 'same-key', sourceRecordId: 'idb1_duplicate', title: 'Before', js: 'A->B' }
  const response = await owner.post('/api/import/zenuml', { items: [item, { ...item, js: 'B->C' }] })
  expect(response.status).toBe(400)
  expect((await response.json()).error).toMatch(/repeated source record ID/)
})

it('keeps unkeyed identities stable when different records are reordered', async () => {
  const item = { id: 'reorder-same-id', title: 'Twin', js: 'A->B' }
  const other = { ...item, js: 'B->C' }
  const first = await (await owner.post('/api/import/zenuml', { items: [item, other, { ...item }] })).json()
  expect(first).toMatchObject({ imported: 3, skipped: 0 })
  const retry = await (await owner.post('/api/import/zenuml', { items: [{ ...item }, item, other] })).json()
  expect(retry).toMatchObject({ imported: 0, skipped: 3 })
})
