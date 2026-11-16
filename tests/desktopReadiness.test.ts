import { expect, it } from 'vitest'
import { startServer } from './harness'

it('reports only the current desktop launch marker and disables caching', async () => {
  const server = await startServer({ DIAGRAMLY_DESKTOP_STARTUP_TOKEN: 'launch-one' })
  try {
    const response = await fetch(`${server.base}/healthz/desktop`)
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(await response.text()).toBe('launch-one')
  } finally {
    server.stop()
    await server.stopped
  }
})

it('does not advertise a desktop marker on an ordinary server', async () => {
  const server = await startServer({ DIAGRAMLY_DESKTOP_STARTUP_TOKEN: '' })
  try {
    expect((await fetch(`${server.base}/healthz/desktop`)).status).toBe(404)
  } finally {
    server.stop()
    await server.stopped
  }
})
