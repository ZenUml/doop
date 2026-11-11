import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { findBrowserPath } from '../server/screenshot'
import { pagePerTest, serveBuilt, type BuiltServer } from './browser'
import { freePort, startServer, type Server } from './harness'

describe.skipIf(!findBrowserPath())('Diagramly product application', () => {
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
    server = await startServer({ PORT: String(port), BETTER_AUTH_URL: web.origin, DOOP_PRODUCT: 'diagramly' })
  }, 60_000)
  afterAll(async () => {
    await web?.close()
    server?.stop()
  })

  it('creates a source diagram from the real home and keeps cloud login and Apple purchase state separate', async () => {
    const page = await pages.open()
    await page.setViewport({ width: 1400, height: 900 })
    await page.goto(web.origin)
    await page.evaluate(async () => {
      const response = await fetch('/api/auth/sign-up/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Diagramly browser QA',
          email: 'diagramly-browser@test.dev',
          password: 'password12345',
        }),
      })
      if (!response.ok) throw new Error('Could not create isolated QA profile')
    })
    await page.reload()
    await page.waitForSelector('h1')
    expect(await page.$eval('h1', (element) => element.textContent)).toBe('Documents')
    const home = await page.$eval('body', (element) => element.innerText)
    expect(home).not.toContain('Ask Doop')
    expect(home).not.toContain('Automations')
    await page.locator('button::-p-text(Create Mermaid diagram)').click()
    await page.waitForSelector('iframe[data-doop-frame]')
    const created = await page.evaluate(async () => {
      const docs = (await (await fetch('/api/canvases')).json()) as { id: string; name: string }[]
      const document = docs.find((item) => item.name === 'Untitled document')
      return (await (await fetch(`/api/canvases/${document!.id}`)).json()) as { id: string; frames: { html: string }[] }
    })
    expect(created.frames[0]?.html).toContain('mermaid')
    expect(created.frames[0]?.html).toContain('flowchart TD')
    await page.goto(`${web.origin}/settings`)
    await page.waitForSelector('h1')
    await page.waitForFunction(() => document.body.innerText.includes('Not connected'))
    const settings = await page.$eval('body', (element) => element.innerText)
    expect(settings).toContain('Local profile: Diagramly browser QA')
    expect(settings).toContain('Not connected')
    expect(settings).toContain('Purchases require the Mac App Store build')
    expect(settings).not.toContain('Connect a plan')
    expect(settings).not.toContain('ChatGPT subscription')
    await page.reload()
    await page.waitForFunction(() => document.body.innerText.includes('Not connected'))
    const persisted = await page.evaluate(
      async (id) => (await (await fetch(`/api/canvases/${id}`)).json()).frames[0].html as string,
      created.id,
    )
    expect(persisted).toContain('flowchart TD')
    await page.goto(`${web.origin}/c/${created.id}`)
    await page.waitForSelector('iframe[data-doop-frame]')
  }, 30_000)
})
