import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { findBrowserPath } from '../server/screenshot'
import { pagePerTest, serveBuilt, type BuiltServer } from './browser'
import { freePort, startServer, type Server } from './harness'
import { buildDiagramHtml } from '../shared/diagramFrame'

describe.skipIf(!findBrowserPath())('Diagramly product application', () => {
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
    server = await startServer({ PORT: String(port), BETTER_AUTH_URL: web.origin, DOOP_PRODUCT: 'diagramly' })
  }, 60_000)
  afterAll(async () => {
    server?.stop()
    await server?.stopped
    await web?.close()
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
    expect(await page.$eval('h1', (element) => element.textContent)).toBe('What would you like to diagram?')
    const home = await page.$eval('body', (element) => element.innerText)
    expect(home).not.toContain('Ask Doop')
    expect(home).not.toContain('Automations')
    await page.locator('button::-p-text(Flowchart)').click()
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

  it('keeps a compact home with previews, search, alternate views, imports and a deliberate cloud step', async () => {
    const page = await pages.open()
    await page.setViewport({ width: 1440, height: 1000 })
    await page.goto(web.origin)
    await page.evaluate(
      async (html) => {
        for (const name of ['Payment service', 'Account sign in', 'Order checkout']) {
          const document = await (
            await fetch('/api/canvases', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ name }),
            })
          ).json()
          await fetch(`/api/canvases/${document.id}/frames`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: 'Sequence', html, width: 640, height: 400 }),
          })
        }
      },
      buildDiagramHtml({ kind: 'zenuml', source: 'Client->Service: request\nService->Database: save' }),
    )
    await page.reload()
    await page.waitForSelector('button[aria-label="Open Payment service"]')
    expect(await page.$$('[data-slot="tile-cover"] img')).toHaveLength(4)
    expect(await page.$('a[download="diagramly-documents.json"]')).toBeNull()
    await page.click('button[aria-label="Search documents"]')
    await page.locator('input[aria-label="Search documents"]').fill('Payment')
    expect(await page.$('button[aria-label="Open Account sign in"]')).toBeNull()
    await page.keyboard.press('Escape')
    await page.click('button[aria-label="List view"]')
    await page.waitForSelector('button[aria-label="Open Account sign in"]')
    expect(await page.$$('[data-slot="tile-cover"]')).toHaveLength(0)
    await page.click('button[aria-label="Grid view"]')

    await page.click('button[aria-label="Import and backups"]')
    await page.waitForSelector('[role="menu"]')
    expect(await page.$('[role="menuitem"][download="diagramly-documents.json"]')).not.toBeNull()
    await page.locator('[role="menuitem"]::-p-text(Restore document backup)').click()
    await page.waitForSelector('input[aria-label="Document backup file"]')
    await page.locator('button[aria-label="Close"]').click()
    await page.click('button[aria-label="Import and backups"]')
    await page.locator('[role="menuitem"]::-p-text(Open source file)').click()
    await page.waitForSelector('input[aria-label="Diagram source file"]')
    await page.locator('button[aria-label="Close"]').click()
    await page.locator('button::-p-text(Import library)').click()
    await page.waitForSelector('input[aria-label="ZenUML export file"]')
    await page.locator('button[aria-label="Close"]').click()

    let generationRequests = 0
    page.on('request', (request) => {
      if (request.method() === 'POST' && new URL(request.url()).pathname === '/api/diagramly/generation')
        generationRequests++
    })
    await page.locator('textarea[aria-label="Diagram prompt"]').fill('A checkout sequence with a declined payment')
    await page.click('button[aria-label="Continue with Diagramly cloud AI"]')
    await page.waitForSelector('textarea[aria-label="Diagramly cloud prompt"]')
    expect(
      await page.$eval(
        'textarea[aria-label="Diagramly cloud prompt"]',
        (field) => (field as HTMLTextAreaElement).value,
      ),
    ).toBe('A checkout sequence with a declined payment')
    expect(generationRequests).toBe(0)
    await page.locator('button[aria-label="Close"]').click()
    expect(
      await page.$eval('textarea[aria-label="Diagram prompt"]', (field) => (field as HTMLTextAreaElement).value),
    ).toContain('declined payment')
    await page.waitForFunction(() => !document.querySelector('[data-slot="modal"]'))
    await page.waitForFunction(() =>
      [...document.querySelectorAll<HTMLImageElement>('[data-slot="tile-cover"] img')].every(
        (image) => image.complete && image.naturalWidth > 0,
      ),
    )
    if (process.env.DIAGRAMLY_HOME_SCREENSHOT)
      await page.screenshot({ path: process.env.DIAGRAMLY_HOME_SCREENSHOT, fullPage: true })
    await page.setViewport({ width: 390, height: 844 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    await page.click('button[aria-label="Import and backups"]')
    await page.locator('[role="menuitem"]::-p-text(Import ZenUML library)').click()
    await page.waitForSelector('input[aria-label="ZenUML export file"]')
    await page.locator('button[aria-label="Close"]').click()
    await page.waitForFunction(() => !document.querySelector('[data-slot="modal"]'))
    if (process.env.DIAGRAMLY_HOME_MOBILE_SCREENSHOT)
      await page.screenshot({ path: process.env.DIAGRAMLY_HOME_MOBILE_SCREENSHOT, fullPage: true })
    await page.click('button[aria-label="Open Payment service"]')
    await page.waitForSelector('iframe[data-doop-frame]')
  }, 30_000)
})
