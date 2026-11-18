import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { createInterface } from 'node:readline'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { getClaudeExtensionAssets } from '../claude-extension/product-assets.mjs'

test('Claude can probe a legacy extension before the local library is running', { timeout: 5000 }, async () => {
  const { manifest } = await getClaudeExtensionAssets()
  const entry = fileURLToPath(
    new URL(
      '../' +
        (manifest.server.entry_point.startsWith('node_modules/') ? '' : 'claude-extension/') +
        manifest.server.entry_point,
      import.meta.url,
    ),
  )
  const proxy = spawn(process.execPath, [entry, 'http://127.0.0.1:1/mcp', '--transport', 'http-only'], {
    stdio: ['pipe', 'pipe', 'ignore'],
  })
  const lines = createInterface({ input: proxy.stdout })
  try {
    const response = Promise.race([
      once(lines, 'line').then(([line]) => JSON.parse(line)),
      once(proxy, 'exit').then(() => assert.fail('The discovery probe closed the extension')),
    ])
    proxy.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 'probe', method: 'server/discover' }) + '\n')
    const message = await response
    assert.equal(message.id, 'probe')
    assert.equal(message.error?.code, -32601)
    assert.equal(proxy.exitCode, null, 'Claude must be able to initialize on the same stream')
  } finally {
    lines.close()
    proxy.kill()
  }
})
