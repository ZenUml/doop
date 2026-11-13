import { afterAll, beforeAll, expect, it } from 'vitest'
import { Client, startServer, type Server } from './harness'
import { readDiagramFrame } from '../shared/diagramFrame'

let server: Server
let owner: Client
beforeAll(async () => {
  server = await startServer({ DOOP_PRODUCT: 'diagramly' })
  owner = await new Client(server).signUp('desktop-owner@test.dev', 'Desktop owner')
}, 60_000)
afterAll(() => server?.stop())

it('enforces the product profile at API entry points and keeps local import available', async () => {
  expect(await (await fetch(server.base + '/api/product-config')).json()).toMatchObject({
    mode: 'diagramly',
    capabilities: { externalMcp: true, upstreamBilling: false },
  })
  expect((await owner.get('/api/billing/plans')).status).toBe(404)
  expect((await owner.post('/api/model-account/chatgpt/authorize')).status).toBe(404)
  expect((await owner.get('/api/automations')).status).toBe(404)
  const imported = await owner.post('/api/import/zenuml', {
    items: [{ id: 'portable', title: 'Portable sequence', js: 'A->B.first()' }],
  })
  expect(imported.status).toBe(200)
  const { canvases } = await imported.json()
  const document = await (await owner.get(`/api/canvases/${canvases[0].id}`)).json()
  for (const path of [
    `/api/canvases/${document.id}/components`,
    `/api/CANVASES/${document.id}/COMPONENTS`,
    `/api/canvases/${document.id}/components/import`,
    `/api/canvases/${document.id}/component-libraries`,
    `/api/canvases/${document.id}/component-candidates`,
    `/api/frames/${document.frames[0].id}/instances`,
  ]) {
    expect((await owner.get(path)).status, path).toBe(404)
    expect((await owner.post(path, {})).status, path).toBe(404)
  }
})

it('restores documents privately, keeps pages/source and skips duplicates without losing edits', async () => {
  const backupResponse = await owner.get('/api/desktop/document-backup')
  expect(backupResponse.status).toBe(200)
  expect(backupResponse.headers.get('cache-control')).toBe('no-store')
  const backup = await backupResponse.json()
  expect(backup.documents.some((document: { name: string }) => document.name === 'Portable sequence')).toBe(true)
  const restore = () =>
    owner.req('/api/desktop/document-backup', {
      method: 'POST',
      headers: { Origin: server.base },
      body: JSON.stringify(backup),
    })
  const restored = await (await restore()).json()
  expect(restored.imported).toBe(backup.documents.length)
  const target = restored.documents.find((document: { name: string }) => document.name === 'Portable sequence')
  const document = await (await owner.get(`/api/canvases/${target.id}`)).json()
  expect(document.linkAccess ?? 'none').toBe('none')
  expect(readDiagramFrame(document.frames[0].html)?.source).toBe('A->B.first()')
  await owner.patch(`/api/frames/${document.frames[0].id}`, { name: 'Edited after restore' })
  expect(await (await restore()).json()).toMatchObject({ imported: 0, skipped: backup.documents.length })
  const reloaded = await (await owner.get(`/api/canvases/${target.id}`)).json()
  expect(reloaded.frames[0].name).toBe('Edited after restore')
  expect(
    (
      await owner.req('/api/desktop/document-backup', {
        method: 'POST',
        headers: { Origin: 'https://foreign.test' },
        body: JSON.stringify(backup),
      })
    ).status,
  ).toBe(403)
})

it('requires local authentication and same-origin connection mutations; purchase delivery denies random tickets', async () => {
  expect((await fetch(server.base + '/api/diagramly/connection')).status).toBe(401)
  expect(await (await owner.get('/api/diagramly/connection')).json()).toEqual({ status: 'disconnected' })
  expect((await owner.post('/api/diagramly/connection/start', {})).status).toBe(403)
  const unauthorized = await fetch(server.base + '/api/diagramly/apple/deliver', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ deliveryTicket: 'random', transactionId: '123', signedTransaction: 'forged' }),
  })
  expect(unauthorized.status).toBe(403)
})
