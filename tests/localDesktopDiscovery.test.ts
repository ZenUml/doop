import { expect, it } from 'vitest'
import { startServer } from './harness'

const PATHS = [
  '/.well-known/oauth-protected-resource',
  '/.well-known/oauth-protected-resource/mcp',
  '/.well-known/oauth-authorization-server',
  '/.well-known/openid-configuration',
]

/* A client that finds OAuth metadata starts a sign-in, even though this server
   answers it without one (Codex did). On this machine there is nothing to find. */
it('the desktop server advertises no OAuth to a client on this machine, but still does behind a tunnel', async () => {
  const server = await startServer({ DIAGRAMLY_DESKTOP_STARTUP_TOKEN: 'launch-one' })
  try {
    for (const path of PATHS) {
      expect((await fetch(`${server.base}${path}`)).status, path).toBe(404)
      /* a tunnel adds forwarding headers: that caller is not on this machine, so it signs in */
      const proxied = await fetch(`${server.base}${path}`, { headers: { 'x-forwarded-for': '203.0.113.9' } })
      expect(proxied.status, `${path} via a tunnel`).toBe(200)
    }
  } finally {
    server.stop()
    await server.stopped
  }
}, 30_000)

it('an ordinary hosted server keeps advertising OAuth', async () => {
  const server = await startServer({ DIAGRAMLY_DESKTOP_STARTUP_TOKEN: '' })
  try {
    for (const path of PATHS) expect((await fetch(`${server.base}${path}`)).status, path).toBe(200)
  } finally {
    server.stop()
    await server.stopped
  }
}, 30_000)
