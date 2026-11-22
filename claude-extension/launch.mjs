/* Entry point of the Claude extension.

   The bundled mcp-remote proxy exits as soon as it cannot reach the Diagramly
   server, and Claude then shows only "Diagramly couldn't start". When the
   local server is down (Diagramly Desktop is closed), stay up instead as a
   small stdio MCP server whose instructions and single tool say what is wrong
   and how to fix it. When the server answers at all, hand over to the proxy
   in this same process, with the same arguments. */
import { createInterface } from 'node:readline'

const serverUrl = process.argv[2] ?? ''
const PROBE_TIMEOUT_MS = 3000

/** True when anything answers HTTP at the URL. A 401 or 404 still means the
    server runs; only a network failure (refused, unknown host, timeout) means
    it is not there. */
async function reachable(url) {
  try {
    const response = await fetch(url, { method: 'GET', signal: AbortSignal.timeout(PROBE_TIMEOUT_MS) })
    await response.body?.cancel()
    return true
  } catch {
    return false
  }
}

function isLocal(url) {
  try {
    return ['127.0.0.1', 'localhost', '[::1]'].includes(new URL(url).hostname)
  } catch {
    return false
  }
}

function offlineMessage() {
  if (isLocal(serverUrl)) {
    return (
      `Diagramly Desktop is not running, so Claude cannot reach its local server at ${serverUrl}. ` +
      'Open Diagramly Desktop, then turn the Diagramly extension off and on again in Claude ' +
      '(Settings → Extensions), or restart Claude. If it still fails, check that the URL under ' +
      'Diagramly Desktop → Connect AI → Claude matches the extension\'s "Diagramly server URL".'
    )
  }
  return (
    `Diagramly Desktop is not running or the Diagramly server at ${serverUrl} cannot be reached. ` +
    'Check your network and the extension\'s "Diagramly server URL" (Settings → Extensions), ' +
    'then turn the Diagramly extension off and on again in Claude.'
  )
}

function serveOffline() {
  const message = offlineMessage()
  process.stderr.write(`[Diagramly] ${message}\n`)
  const send = (payload) => process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', ...payload })}\n`)
  const tool = {
    name: 'diagramly_status',
    description: 'Explains why Diagramly is not connected and how to connect it.',
    inputSchema: { type: 'object', properties: {} },
  }
  const handlers = {
    initialize: (params) => ({
      protocolVersion: params?.protocolVersion ?? '2025-06-18',
      capabilities: { tools: {} },
      serverInfo: { name: 'diagramly', version: 'offline' },
      instructions: `${message} Tell the user this before trying any Diagramly work.`,
    }),
    ping: () => ({}),
    'tools/list': () => ({ tools: [tool] }),
    'tools/call': async (params) => {
      if (params?.name !== tool.name) throw new Error(`Unknown tool: ${params?.name}`)
      const text = (await reachable(serverUrl))
        ? 'Diagramly Desktop is running now. Turn the Diagramly extension off and on again in Claude (Settings → Extensions) to connect.'
        : message
      return { content: [{ type: 'text', text }] }
    },
  }
  const lines = createInterface({ input: process.stdin })
  lines.on('line', async (line) => {
    let request
    try {
      request = JSON.parse(line)
    } catch {
      return
    }
    // Notifications need no answer.
    if (request?.id === undefined) return
    const handler = handlers[request.method]
    if (!handler) {
      send({ id: request.id, error: { code: -32601, message: 'Method not found' } })
      return
    }
    try {
      send({ id: request.id, result: await handler(request.params) })
    } catch (error) {
      send({ id: request.id, error: { code: -32602, message: String(error?.message ?? error) } })
    }
  })
  lines.on('close', () => process.exit(0))
}

if (await reachable(serverUrl)) {
  await import('./node_modules/mcp-remote/dist/proxy.js')
} else {
  serveOffline()
}
