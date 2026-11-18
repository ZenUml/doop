import assert from 'node:assert/strict'
import { spawn, execFileSync } from 'node:child_process'
import { once } from 'node:events'
import { mkdtemp, readFile, mkdir, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { createInterface } from 'node:readline'
import { test } from 'node:test'
import JSZip from 'jszip'

test('the shipped Claude proxy handles discovery and initializes on the same stream', { timeout: 15000 }, async () => {
  const requests = []
  const server = createServer(async (req, res) => {
    if (req.url !== '/mcp' || req.method !== 'POST') {
      res.writeHead(404).end()
      return
    }
    const chunks = []
    for await (const chunk of req) chunks.push(chunk)
    const { id, method } = JSON.parse(Buffer.concat(chunks))
    requests.push(method)
    if (id === undefined) {
      res.writeHead(202).end()
      return
    }
    res.setHeader('Content-Type', 'application/json')
    let result
    if (method === 'initialize') {
      result = {
        protocolVersion: '2025-03-26',
        capabilities: { tools: {} },
        serverInfo: { name: 'Local library fixture', version: '1' },
      }
    } else if (method === 'tools/list') {
      result = { tools: [{ name: 'get_diagram', inputSchema: { type: 'object' } }] }
    }
    res.end(JSON.stringify({ jsonrpc: '2.0', id, ...(result ? { result } : { error: { code: -32001 } }) }))
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const root = await mkdtemp(join(tmpdir(), 'diagramly-claude-discovery-'))
  let proxy
  let lines
  try {
    execFileSync(process.execPath, ['scripts/build-claude-extension.mjs'])
    const zip = await JSZip.loadAsync(await readFile('public/claude-extension/diagramly.mcpb'))
    const manifest = JSON.parse(await zip.file('manifest.json').async('string'))
    for (const file of Object.values(zip.files)) {
      if (file.dir || !file.name.startsWith('node_modules/')) continue
      const destination = join(root, file.name)
      await mkdir(dirname(destination), { recursive: true })
      await writeFile(destination, await file.async('nodebuffer'))
    }
    proxy = spawn(
      process.execPath,
      [
        join(root, manifest.server.entry_point),
        `http://127.0.0.1:${server.address().port}/mcp`,
        '--transport',
        'http-only',
      ],
      { stdio: ['pipe', 'pipe', 'ignore'] },
    )
    lines = createInterface({ input: proxy.stdout })
    const responses = lines[Symbol.asyncIterator]()
    const send = (method, params, id) =>
      proxy.stdin.write(JSON.stringify({ jsonrpc: '2.0', method, params, id }) + '\n')
    const receive = async () => {
      const { value, done } = await responses.next()
      assert.equal(done, false, 'The extension must keep the stdio stream open')
      return JSON.parse(value)
    }

    send('server/discover', { _meta: { 'io.modelcontextprotocol/protocolVersion': '2026-07-28' } }, 'probe')
    assert.deepEqual(await receive(), {
      jsonrpc: '2.0',
      id: 'probe',
      error: { code: -32601, message: 'Method not found' },
    })
    assert.ok(!requests.includes('server/discover'))
    send(
      'initialize',
      { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'Test', version: '1' } },
      2,
    )
    assert.equal((await receive()).result.protocolVersion, '2025-03-26')
    send('notifications/initialized')
    send('tools/list', {}, 3)
    assert.equal((await receive()).result.tools[0].name, 'get_diagram')
  } finally {
    lines?.close()
    if (proxy && proxy.exitCode === null) proxy.kill()
    server.closeAllConnections()
    server.close()
    await rm(root, { recursive: true, force: true })
  }
})
