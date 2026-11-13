import { afterAll, beforeAll, expect, it } from 'vitest'
import { Client, startServer, type Server } from './harness.ts'
import WebSocket from 'ws'

let server: Server
beforeAll(async () => {
  server = await startServer()
}, 70_000)
afterAll(() => server?.stop())

it('counts a used Agent key as a connection for its owner without granting model credit', async () => {
  const owner = await new Client(server).signUp('connection-owner@example.test', 'Owner')
  const stranger = await new Client(server).signUp('connection-other@example.test', 'Other')
  const state = async (client: Client) => (await client.get('/api/agent-allowance')).json()
  expect(await state(owner)).toMatchObject({ connected: false, byoModel: false })
  const key = await (await owner.post('/api/agent-keys', { name: 'Connection test' })).json()
  expect(await state(owner)).toMatchObject({ connected: false })
  const response = await fetch(`${server.base}/mcp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', Authorization: `Bearer ${key.secret}` },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: { name: 'get_profile', arguments: {} },
    }),
  })
  expect(response.status).toBe(200)
  expect((await response.json()).result.isError).toBeFalsy()
  await expect.poll(async () => (await state(owner)).connected).toBe(true)
  expect(await state(owner)).toMatchObject({ byoModel: false, onOwnAccount: false })
  expect(await state(stranger)).toMatchObject({ connected: false })
  const canvas = await (await owner.post('/api/canvases', { name: 'Agent arrival' })).json()
  const messages: { type: string; presence?: { kind: string; name: string } }[] = []
  const room = new WebSocket(`ws://localhost:${server.port}/ws`, { headers: { Cookie: owner.header() } })
  room.on('message', (data) => messages.push(JSON.parse(String(data))))
  try {
    await new Promise<void>((resolve, reject) => {
      room.once('open', resolve)
      room.once('error', reject)
    })
    room.send(
      JSON.stringify({ type: 'join', canvasId: canvas.id, clientId: 'onboarding', name: 'Owner', kind: 'user' }),
    )
    await expect.poll(() => messages.some((message) => message.type === 'init')).toBe(true)
    const read = await fetch(`${server.base}/mcp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: `Bearer ${key.secret}`,
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: {
          name: 'get_canvas',
          arguments: { canvas_id: canvas.id },
        },
      }),
    })
    expect((await read.json()).result.isError).toBeFalsy()
    await expect
      .poll(() => messages.some((message) => message.type === 'presence:join' && message.presence?.kind === 'agent'))
      .toBe(true)
  } finally {
    room.close()
  }
  expect((await owner.delete(`/api/agent-keys/${key.id}`)).status).toBe(200)
  expect(await state(owner)).toMatchObject({ connected: false })
})
