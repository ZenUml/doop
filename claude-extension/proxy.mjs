import { spawn } from 'node:child_process'
import { createInterface } from 'node:readline'
import { fileURLToPath } from 'node:url'

const input = createInterface({ input: process.stdin, crlfDelay: Infinity })
let child

function startProxy() {
  const entry = fileURLToPath(new URL('./node_modules/mcp-remote/dist/proxy.js', import.meta.url))
  const proxy = spawn(process.execPath, [entry, ...process.argv.slice(2)], {
    stdio: ['pipe', 'inherit', 'inherit'],
  })
  proxy.stdin.on('error', (error) => {
    if (error.code !== 'EPIPE') console.error(error.message)
  })
  proxy.on('error', (error) => console.error(error.message))
  proxy.on('close', (code) => {
    process.exitCode = code ?? 1
    input.close()
    process.stdin.pause()
  })
  return proxy
}

input.on('line', (line) => {
  let request
  try {
    request = JSON.parse(line)
  } catch {
    // Leave invalid input handling to the underlying MCP transport.
  }

  // This proxy speaks the legacy initialize handshake. Answer the stdio probe
  // locally so newer clients can fall back before the proxy starts OAuth.
  if (request?.jsonrpc === '2.0' && request.method === 'server/discover' && Object.hasOwn(request, 'id')) {
    const response = { jsonrpc: '2.0', id: request.id, error: { code: -32601, message: 'Method not found' } }
    process.stdout.write(JSON.stringify(response) + '\n')
    return
  }

  child ??= startProxy()
  child.stdin.write(line + '\n')
})

input.on('close', () => child?.stdin.end())
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    child?.kill(signal)
    input.close()
    process.stdin.pause()
  })
}
