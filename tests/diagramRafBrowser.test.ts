import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { findBrowserPath } from '../server/screenshot'
import { buildDiagramHtml } from '../shared/diagramFrame'
import { pagePerTest, serveBuilt, type BuiltServer } from './browser'
import { freePort, startServer, type Server } from './harness'

describe.skipIf(!findBrowserPath())('Diagram source updates while animation frames are suspended', () => {
  const pages = pagePerTest()
  let server: Server
  let web: BuiltServer
  beforeAll(async () => {
    const port = await freePort()
    web = await serveBuilt({
      '/api': { target: `http://localhost:${port}` },
      '/vendor/diagram': { target: `http://localhost:${port}` },
    })
    server = await startServer({ PORT: String(port), BETTER_AUTH_URL: web.origin, DOOP_PRODUCT: 'diagramly' })
  }, 60_000)
  afterAll(async () => {
    server?.stop()
    await server?.stopped
    await web?.close()
  })
  it('continues source and style updates after a completed render waits for an animation frame', async () => {
    const page = await pages.open()
    await page.goto(web.origin)
    await page.evaluate(
      (html) => {
        const iframe = document.createElement('iframe')
        iframe.id = 'raf-diagram'
        iframe.style.cssText = 'width:800px;height:600px'
        iframe.srcdoc = html
        document.body.appendChild(iframe)
      },
      buildDiagramHtml({
        kind: 'zenuml',
        source: 'Order->Payment: authorize',
        css: '.sequence-diagram {background: #fff}',
      }),
    )
    const diagram = (await (await page.waitForSelector('#raf-diagram'))!.contentFrame())!
    await diagram.waitForFunction(
      () =>
        document.documentElement.getAttribute('data-doop-diagram-state') === 'rendered' &&
        document.querySelector('.sequence-diagram')?.textContent?.includes('authorize'),
      { polling: 50 },
    )
    // Exercise the generated renderer observer directly. This does not cover
    // the app's runtime morph; legacyUpgradeBrowser covers that user path.
    await diagram.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))))
    await diagram.evaluate(() => {
      const nativeRequest = window.requestAnimationFrame.bind(window)
      const nativeCancel = window.cancelAnimationFrame.bind(window)
      const callbacks = new Map<number, FrameRequestCallback>()
      let nextId = 0
      const release = () => {
        window.requestAnimationFrame = nativeRequest
        window.cancelAnimationFrame = nativeCancel
        for (const callback of callbacks.values()) nativeRequest(callback)
      }
      ;(window as Window & { releaseDiagramRaf?: () => void }).releaseDiagramRaf = release
      window.requestAnimationFrame = (callback) => {
        callbacks.set(++nextId, callback)
        return nextId
      }
      window.cancelAnimationFrame = (id) => {
        callbacks.delete(id)
      }
    })
    try {
      await diagram.evaluate(() => {
        document.querySelector('[data-doop-diagram-source]')!.textContent = 'Order->Payment: editedPayment'
      })
      // The real library must finish the first render while rAF stays suspended.
      await diagram.waitForFunction(
        () =>
          document.documentElement.getAttribute('data-doop-diagram-state') === 'rendered' &&
          document.querySelector('.sequence-diagram')?.textContent?.includes('editedPayment'),
        { polling: 50 },
      )
      await diagram.evaluate(() => {
        document.querySelector('[data-doop-diagram-source]')!.textContent = 'Customer->Order: create'
        document.querySelector('[data-doop-diagram-css]')!.textContent =
          '.sequence-diagram {background: rgb(220, 238, 255)}'
      })
      await diagram.waitForFunction(
        () =>
          document.documentElement.getAttribute('data-doop-diagram-state') === 'rendered' &&
          document.querySelector('.sequence-diagram')?.textContent?.includes('create') &&
          !document.querySelector('.sequence-diagram')?.textContent?.includes('editedPayment') &&
          getComputedStyle(document.querySelector('.sequence-diagram')!).backgroundColor === 'rgb(220, 238, 255)',
        { timeout: 1500, polling: 50 },
      )
      expect(await diagram.$eval('.sequence-diagram', (sequence) => sequence.textContent)).toContain('create')
    } finally {
      await diagram.evaluate(() => (window as Window & { releaseDiagramRaf?: () => void }).releaseDiagramRaf?.())
    }
  }, 30_000)
})
