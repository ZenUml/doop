import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { findBrowserPath } from '../server/screenshot'
import { FRAME_BOOTSTRAP } from '../src/lib/frameRuntime'
import { buildDiagramHtml, readDiagramFrame } from '../shared/diagramFrame'
import { pagePerTest, serveBuilt, type BuiltServer } from './browser'
import { freePort, startServer, type Server } from './harness'

declare global {
  interface Window {
    edits: string[]
  }
}

describe.skipIf(!findBrowserPath())('Rendered diagram title persistence', () => {
  const pages = pagePerTest()
  let server: Server
  let web: BuiltServer
  beforeAll(async () => {
    const port = await freePort()
    web = await serveBuilt({
      '/api': { target: `http://localhost:${port}` },
      '/vendor/diagram': { target: `http://localhost:${port}` },
    })
    server = await startServer({ PORT: String(port), BETTER_AUTH_URL: web.origin, DIAGRAMLY_PRODUCT: 'diagramly' })
  }, 60_000)
  afterAll(async () => {
    server?.stop()
    await server?.stopped
    await web?.close()
  })
  it('saves native title edits into the source and active page for typing and paste', async () => {
    const page = await pages.open()
    await page.goto(web.origin)
    await page.evaluate((bootstrap) => {
      ;(window as Window & { edits: string[] }).edits = []
      window.addEventListener('message', (event) => {
        if (event.data?.type === 'test:edit')
          document
            .querySelector<HTMLIFrameElement>('#title-diagram')!
            .contentWindow!.postMessage({ ...event.data, type: 'diagramly:edit', on: true }, '*')
        if (event.data?.type === 'diagramly:edited')
          (window as Window & { edits: string[] }).edits.push(event.data.html)
      })
      const iframe = document.createElement('iframe')
      iframe.id = 'title-diagram'
      iframe.style.cssText = 'width:800px;height:600px'
      iframe.srcdoc = bootstrap
      document.body.appendChild(iframe)
    }, FRAME_BOOTSTRAP)
    const diagram = (await (await page.waitForSelector('#title-diagram'))!.contentFrame())!
    await diagram.waitForFunction(() => document.querySelector('script[data-v-boot]'))
    const initial = { kind: 'zenuml' as const, source: 'title Order Service\nClient->Order: create' }
    await page.evaluate(
      (html) =>
        document
          .querySelector<HTMLIFrameElement>('#title-diagram')!
          .contentWindow!.postMessage({ type: 'diagramly:html', html }, '*'),
      buildDiagramHtml({ ...initial, pages: [{ ...initial, id: 'one', title: 'First' }], activePageId: 'one' }),
    )
    await diagram.waitForSelector('.title')
    for (const [method, title] of [
      ['typing', 'Checkout flow'],
      ['paste', 'Payment flow'],
    ] as const) {
      await diagram.evaluate(() => {
        const target = document.querySelector('.title')!
        const bounds = target.getBoundingClientRect()
        parent.postMessage({ type: 'test:edit', x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 }, '*')
      })
      await diagram.click('.title [contenteditable]')
      await diagram.waitForSelector('[contenteditable="true"]')
      await diagram.evaluate(() => {
        const el = document.querySelector('[contenteditable="true"]')!
        const range = document.createRange()
        range.selectNodeContents(el)
        const selection = getSelection()!
        selection.removeAllRanges()
        selection.addRange(range)
      })
      if (method === 'typing') await page.keyboard.type(title)
      else await page.keyboard.sendCharacter(title)
      await page.keyboard.press('Enter')
      await diagram.waitForFunction(
        (title) => document.querySelector('[data-diagramly-diagram-source]')?.textContent?.includes('title ' + title),
        { timeout: 2000 },
        title,
      )
      await page.waitForFunction(
        (title) => (window as Window & { edits: string[] }).edits.some((html) => html.includes('title ' + title)),
        {},
        title,
      )
      const html = await page.evaluate(() => (window as Window & { edits: string[] }).edits.at(-1)!)
      expect(readDiagramFrame(html)?.source).toContain('title ' + title)
      expect(readDiagramFrame(html)?.pages?.[0]?.source).toContain('title ' + title)
    }
    const saved = await page.evaluate(() => window.edits.at(-1)!)
    // Reopen from the canonical persisted source, as FrameView does, rather
    // than retaining the edited renderer's DOM or internal React state.
    await page.evaluate(
      (html) => {
        document.querySelector<HTMLIFrameElement>('#title-diagram')!.srcdoc = html
      },
      buildDiagramHtml(readDiagramFrame(saved)!),
    )
    const reopened = (await (await page.$('#title-diagram'))!.contentFrame())!
    await reopened.waitForFunction(() => document.querySelector('.title')?.textContent === 'Payment flow')
  }, 30_000)
})
