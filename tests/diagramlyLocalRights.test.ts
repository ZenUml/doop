import { afterAll, beforeAll, expect, it } from 'vitest'
import { Client, startServer, type Server } from './harness'
import { buildDiagramHtml, readDiagramFrame } from '../shared/diagramFrame'

let server: Server
let owner: Client
beforeAll(async () => {
  server = await startServer({ DOOP_PRODUCT: 'diagramly' })
  owner = new Client(server)
  await owner.signUp('local-rights@test.dev', 'Legacy desktop owner')
}, 60_000)
afterAll(async () => {
  server?.stop()
  await server?.stopped
})

it('starts a local library without the old HTML design demo', async () => {
  expect(await (await owner.get('/api/canvases')).json()).toEqual([])
})

it('keeps legacy import, editing and backup available without a cloud account or subscription', async () => {
  const imported = await owner.post('/api/import/zenuml', {
    items: [{ id: 'paid-desktop-document', title: 'Existing paid work', js: 'Customer->Order: create' }],
  })
  expect(imported.status).toBe(200)
  const result = (await imported.json()) as { imported: number; canvases: { id: string }[] }
  expect(result.imported).toBe(1)
  const id = result.canvases[0]!.id
  const document = (await (await owner.get(`/api/canvases/${id}`)).json()) as {
    frames: { id: string; html: string }[]
  }
  const frame = document.frames[0]!
  const edited = buildDiagramHtml({ ...readDiagramFrame(frame.html)!, source: 'Customer->Order: keep editing' })
  expect((await owner.patch(`/api/frames/${frame.id}`, { html: edited })).status).toBe(200)
  const backup = await owner.get('/api/desktop/document-backup')
  expect(backup.status).toBe(200)
  expect(JSON.stringify(await backup.json())).toContain('Customer->Order: keep editing')
  const cloud = await owner.get('/api/diagramly/connection')
  expect(await cloud.json()).toMatchObject({ status: 'disconnected' })
})

it('edits the whole diagram stylesheet locally, preserving source and rejecting stale or unsafe changes', async () => {
  const document = await (await owner.post('/api/canvases', { name: 'Styled old diagram' })).json()
  const frame = await (
    await owner.post(`/api/canvases/${document.id}/frames`, {
      name: 'Styled',
      html: buildDiagramHtml({ kind: 'zenuml', source: 'Customer->Order.create()' }),
    })
  ).json()
  const apply = (source: string, mode: string, expectedUpdatedAt: number) =>
    owner.req(`/api/frames/${frame.id}/diagram-style`, {
      method: 'POST',
      headers: { Origin: server.base },
      body: JSON.stringify({ source, mode, expectedUpdatedAt }),
    })
  const response = await apply('@ink: red; .message { color: @ink; }', 'less', frame.updatedAt)
  expect(response.status).toBe(200)
  const styled = await response.json()
  expect(readDiagramFrame(styled.html)).toMatchObject({
    source: 'Customer->Order.create()',
    styleMode: 'less',
    styleSource: '@ink: red; .message { color: @ink; }',
  })
  expect(readDiagramFrame(styled.html)?.css).toContain('color: red')
  expect((await apply('body { color: blue; }', 'css', frame.updatedAt)).status).toBe(409)
  expect((await apply('@import (inline) "/etc/passwd";', 'less', styled.updatedAt)).status).toBe(400)
  const current = await (await owner.get(`/api/canvases/${document.id}`)).json()
  expect(current.frames[0].html).toBe(styled.html)
})

it('styles a specified inner page without switching the active page and rejects stale writes', async () => {
  const document = await (await owner.post('/api/canvases', { name: 'Inner styles' })).json()
  expect(document.pages[0].name).toBe('Board 1')
  const pages = [
    { id: 'one', title: 'One', kind: 'zenuml' as const, source: 'A->B' },
    { id: 'two', title: 'Two', kind: 'zenuml' as const, source: 'B->C' },
  ]
  const frame = await (
    await owner.post(`/api/canvases/${document.id}/frames`, {
      name: 'Diagram',
      html: buildDiagramHtml({ ...pages[0]!, pages, activePageId: 'one' }),
    })
  ).json()
  const apply = (expectedUpdatedAt: number) =>
    owner.req(`/api/frames/${frame.id}/diagram-style`, {
      method: 'POST',
      headers: { Origin: server.base },
      body: JSON.stringify({
        diagramPageId: 'two',
        source: '.message { color: blue; }',
        mode: 'css',
        expectedUpdatedAt,
      }),
    })
  const result = await apply(frame.updatedAt)
  expect(result.status).toBe(200)
  const saved = await result.json()
  const diagram = readDiagramFrame(saved.html)!
  expect(diagram.activePageId).toBe('one')
  expect(diagram.source).toBe('A->B')
  expect(diagram.pages?.[1]).toMatchObject({
    source: 'B->C',
    styleMode: 'css',
    styleSource: '.message { color: blue; }',
  })
  expect((await apply(frame.updatedAt)).status).toBe(409)
})
