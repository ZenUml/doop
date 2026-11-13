import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { findBrowserPath } from '../server/screenshot'
import { pagePerTest, serveBuilt, type BuiltServer } from './browser'
import { freePort, startServer, type Server } from './harness'

describe.skipIf(!findBrowserPath())('imported diagram bounds', () => {
  let web: BuiltServer
  let server: Server
  const pages = pagePerTest()
  beforeAll(async () => {
    const port = await freePort()
    web = await serveBuilt({
      '/api': { target: `http://localhost:${port}` },
      '/ws': { target: `ws://localhost:${port}`, ws: true },
      '/vendor/diagram': { target: `http://localhost:${port}` },
    })
    server = await startServer({ PORT: String(port), BETTER_AUTH_URL: web.origin })
  }, 60_000)
  afterAll(async () => {
    await web?.close()
    server?.stop()
  })

  it('grows and saves a long imported diagram so its final message is inside the frame', async () => {
    const page = await pages.open()
    await page.setViewport({ width: 1400, height: 900 })
    await page.goto(web.origin)
    const source = Array.from({ length: 45 }, (_, i) => `A->B.step${i}()`).join('\n')
    const id = await page.evaluate(async (source) => {
      await fetch('/api/auth/sign-up/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Diagram Tester', email: 'diagram-fit@test.dev', password: 'password12345' }),
      })
      const response = await fetch('/api/import/zenuml', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: [{ id: 'long', title: 'Long diagram', js: source }] }),
      })
      if (!response.ok) throw new Error(await response.text())
      return (await response.json()).canvases[0].id as string
    }, source)
    await page.goto(`${web.origin}/c/${id}`)
    await page.waitForSelector('iframe[data-doop-frame]')
    const element = await page.$('iframe[data-doop-frame]')
    const diagram = (await element!.contentFrame())!
    await diagram.waitForFunction(() => document.documentElement.getAttribute('data-doop-diagram-state') === 'rendered')
    const height = await diagram.$eval('.sequence-diagram', (el) => Math.ceil(el.getBoundingClientRect().bottom + 16))
    expect(height).toBeGreaterThan(900)
    await expect
      .poll(
        async () =>
          page.evaluate(
            async (id) => (await (await fetch(`/api/canvases/${id}`)).json()).frames[0].height as number,
            id,
          ),
        { timeout: 3000 },
      )
      .toBeGreaterThanOrEqual(height)
    await page.reload()
    const persisted = await page.evaluate(
      async (id) => (await (await fetch(`/api/canvases/${id}`)).json()).frames[0].height as number,
      id,
    )
    expect(persisted).toBeGreaterThanOrEqual(height)
  }, 30_000)
})
