import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { findBrowserPath } from '../server/screenshot'
import { pagePerTest, serveBuilt, type BuiltServer } from './browser'
import { freePort, startServer, type Server } from './harness'

/* A diagram you add opens the Properties panel on the right. The new diagram
   must land in what is left visible, not behind the panel. */
describe.skipIf(!findBrowserPath())('adding a diagram in Diagramly', () => {
  let web: BuiltServer
  let server: Server
  const pages = pagePerTest()
  beforeAll(async () => {
    const port = await freePort()
    web = await serveBuilt({
      '/api': { target: `http://localhost:${port}` },
      '/i': { target: `http://localhost:${port}` },
      '/ws': { target: `ws://localhost:${port}`, ws: true },
      '/vendor/diagram': { target: `http://localhost:${port}` },
    })
    server = await startServer({ PORT: String(port), BETTER_AUTH_URL: web.origin, DIAGRAMLY_PRODUCT: 'diagramly' })
  }, 60_000)
  afterAll(async () => {
    server?.stop()
    await server?.stopped
    await web?.close()
  })

  it('shows the new diagram beside the Properties panel, not under it', async () => {
    const page = await pages.open()
    page.setDefaultTimeout(15_000)
    await page.setViewport({ width: 1600, height: 900 })
    await page.goto(web.origin)
    await page.evaluate(async () => {
      const response = await fetch('/api/auth/sign-up/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'View QA', email: 'view-qa@test.dev', password: 'password12345' }),
      })
      if (!response.ok) throw new Error('Could not create isolated QA profile')
    })
    await page.reload()
    await page.locator('button::-p-text(Mermaid flowchart)').click()
    await page.waitForSelector('iframe[data-diagramly-frame]')
    await page.locator('button[aria-label="New diagram"]').click()
    await page.locator('button::-p-text(Mermaid)').click()
    await page.waitForFunction(() => document.querySelectorAll('iframe[data-diagramly-frame]').length === 2)
    /* the camera glides for under a second */
    await new Promise((resolve) => setTimeout(resolve, 1500))
    const result = await page.evaluate(() => {
      const panel = document.querySelector('input[aria-label="Diagram name"]')?.getBoundingClientRect()
      const frames = Array.from(document.querySelectorAll('iframe[data-diagramly-frame]')).map((el) =>
        el.getBoundingClientRect(),
      )
      const newest = frames[frames.length - 1]!
      return { panelLeft: panel?.left ?? null, frameLeft: newest.left, frameRight: newest.right }
    })
    expect(result.panelLeft).not.toBeNull()
    expect(result.frameRight).toBeLessThanOrEqual(result.panelLeft!)
    expect(result.frameLeft).toBeGreaterThanOrEqual(0)
  }, 30_000)
})
