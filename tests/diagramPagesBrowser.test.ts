import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { findBrowserPath } from '../server/screenshot'
import { buildDiagramHtml } from '../shared/diagramFrame'
import { pagePerTest, serveBuilt, type BuiltServer } from './browser'
import { freePort, startServer, type Server } from './harness'

/** Real app/backend/renderers: switching kinds must replace rendered content and page CSS. */
describe.skipIf(!findBrowserPath())('Diagram inner page renderer switching', () => {
  const pages = pagePerTest()
  let web: BuiltServer
  let server: Server
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

  it('renders each page source and CSS when switching ZenUML → Mermaid → ZenUML in the same frame', async () => {
    const page = await pages.open()
    await page.setRequestInterception(true)
    // Make the old renderer race deterministic while the other library loads.
    page.on('request', (request) => {
      const delay = new URL(request.url()).pathname === '/vendor/diagram/mermaid/mermaid.esm.min.mjs' ? 1000 : 0
      void new Promise((resolve) => setTimeout(resolve, delay)).then(() => request.continue()).catch(() => {})
    })
    await page.setViewport({ width: 1440, height: 1000 })
    await page.goto(web.origin)
    const innerPages = [
      {
        id: 'sequence',
        title: 'Sequence',
        kind: 'zenuml' as const,
        source: 'Buyer->Order: ConfirmOrder',
        css: '[data-doop-diagram-mount] { background-color: rgb(245, 220, 220); }',
      },
      {
        id: 'flow',
        title: 'Flowchart',
        kind: 'mermaid' as const,
        source: 'flowchart LR\n A[StartPayment] --> B[PaymentReceived]',
        css: '[data-doop-diagram-mount] { background-color: rgb(220, 235, 245); }',
      },
    ]
    const id = await page.evaluate(
      async (html) => {
        const signup = await fetch('/api/auth/sign-up/email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: 'Page renderer QA',
            email: 'page-renderer@test.dev',
            password: 'password12345',
          }),
        })
        if (!signup.ok) throw new Error(await signup.text())
        const created = await fetch('/api/canvases', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: 'Mixed renderers' }),
        })
        const document = (await created.json()) as { id: string }
        const frame = await fetch(`/api/canvases/${document.id}/frames`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: 'Two pages', html, width: 800, height: 600 }),
        })
        if (!frame.ok) throw new Error(await frame.text())
        return document.id
      },
      buildDiagramHtml({ ...innerPages[0]!, pages: innerPages, activePageId: 'sequence' }),
    )
    await page.goto(`${web.origin}/c/${id}`)
    await page.waitForSelector('iframe[data-doop-frame]')
    await page.click('[data-frame-title]')
    await page.waitForSelector('[aria-label="Diagram page"]')
    const iframe = (await page.$('iframe[data-doop-frame]'))!
    const diagram = (await iframe.contentFrame())!

    async function assertRendered(label: string, absent: string, background: string, kind: 'zenuml' | 'mermaid') {
      await diagram.waitForFunction(
        (label) => {
          const mount = document.querySelector('[data-doop-diagram-mount]')
          return (
            document.documentElement.getAttribute('data-doop-diagram-state') === 'rendered' &&
            mount?.textContent?.includes(label)
          )
        },
        {},
        label,
      )
      const rendered = await diagram.evaluate(() => {
        const mount = document.querySelector<HTMLElement>('[data-doop-diagram-mount]')!
        const bounds = mount.getBoundingClientRect()
        return {
          text: mount.innerText,
          background: getComputedStyle(mount).backgroundColor,
          width: bounds.width,
          height: bounds.height,
          mounts: document.querySelectorAll('[data-doop-diagram-mount]').length,
          zenumlStyle: [...document.head.querySelectorAll('style')].some((style) =>
            /\.zenuml\b/.test(style.textContent ?? ''),
          ),
          sequencePosition: mount.querySelector('.sequence-diagram')
            ? getComputedStyle(mount.querySelector('.sequence-diagram')!).position
            : null,
          sequence: !!mount.querySelector('.sequence-diagram'),
          mermaid: !!mount.querySelector('svg[id^="doop-diagram-"]'),
        }
      })
      expect(rendered.text).toContain(label)
      expect(rendered.text).not.toContain(absent)
      expect(rendered.background).toBe(background)
      expect(rendered.width).toBeGreaterThan(100)
      expect(rendered.height).toBeGreaterThan(30)
      expect(rendered.mounts).toBe(1)
      expect(rendered.sequence).toBe(kind === 'zenuml')
      expect(rendered.mermaid).toBe(kind === 'mermaid')
      if (kind === 'zenuml') {
        expect(rendered.zenumlStyle).toBe(true)
        expect(rendered.sequencePosition).toBe('relative')
      }
    }
    async function select(title: string) {
      await page.waitForFunction(
        () => !document.querySelector<HTMLButtonElement>('[aria-label="Diagram page"]')?.disabled,
      )
      await page.click('[aria-label="Diagram page"]')
      await page.locator(`[role="option"]::-p-text(${title})`).click()
      await page.waitForFunction(
        (title) => document.querySelector('[aria-label="Diagram page"]')?.textContent?.includes(title),
        {},
        title,
      )
    }
    await assertRendered('ConfirmOrder', 'PaymentReceived', 'rgb(245, 220, 220)', 'zenuml')
    // The second cycle reuses static imports: renderer CSS must return with the page.
    for (let cycle = 0; cycle < 2; cycle++) {
      await select('Flowchart')
      await assertRendered('PaymentReceived', 'ConfirmOrder', 'rgb(220, 235, 245)', 'mermaid')
      await select('Sequence')
      await assertRendered('ConfirmOrder', 'PaymentReceived', 'rgb(245, 220, 220)', 'zenuml')
    }
  }, 45_000)
})
