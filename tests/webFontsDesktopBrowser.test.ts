import { beforeEach, describe, expect, it } from 'vitest'
import type { Page } from 'puppeteer-core'
import { findBrowserPath } from '../server/screenshot.ts'
import { fixtureUrl, pagePerTest } from './browser.ts'

type Fixture = { messages: { type: string; html?: string }[]; testReady: boolean }

const GOOGLE = /^https:\/\/fonts\.(googleapis|gstatic)\.com\//
const GOOGLE_LINK =
  'https://fonts.googleapis.com/css2?family=Inter:ital,opsz,wght@0,14..32,100..900;1,14..32,100..900&amp;display=swap'
const DOCUMENT = `<!doctype html><html><head><link rel="stylesheet" data-diagramly-webfonts href="${GOOGLE_LINK}"></head><body><p style="font-family:'Inter',sans-serif">Hello</p></body></html>`

/* What the desktop shell does before any page script runs (src/lib/shell.ts), and what
   it must never do: ask Google for a font. The same page without the marker is the web
   product, which still loads Google Fonts. Google is never reached from the test: its
   requests are recorded and refused. */
describe.skipIf(!findBrowserPath())('desktop web fonts', () => {
  const pages = pagePerTest()
  let page: Page
  let requested: string[]

  async function open(desktop: boolean, url: string) {
    requested = []
    page = await pages.open()
    if (desktop)
      await page.evaluateOnNewDocument(
        () => ((window as unknown as Record<string, string>).__DIAGRAMLY_DESKTOP__ = '1.1.0'),
      )
    await page.setRequestInterception(true)
    page.on('request', (request) => {
      requested.push(request.url())
      if (GOOGLE.test(request.url())) void request.abort()
      else void request.continue()
    })
    await page.goto(url, { waitUntil: 'load' }).catch(() => {})
  }
  const google = () => requested.filter((url) => GOOGLE.test(url))

  describe('startup stylesheet', () => {
    // the app's own index.html, built beside the fixtures
    const appUrl = () => new URL('index.html', fixtureUrl('x')).toString().replace('/tests/fixtures/', '/')

    it('web: asks Google Fonts, as before', async () => {
      await open(false, appUrl())
      expect(google().some((url) => url.startsWith('https://fonts.googleapis.com/css2?family=Inter'))).toBe(true)
      expect(requested.some((url) => url.includes('/webfonts/'))).toBe(false)
    }, 60_000)

    it('desktop: loads its own copy and asks Google for nothing', async () => {
      await open(true, appUrl())
      expect(requested.some((url) => url.endsWith('/webfonts/ui.css'))).toBe(true)
      // and the face itself comes from the same place: the stylesheet is not enough
      await page.waitForFunction(() => document.fonts.check('500 14px Inter'), { timeout: 15_000 })
      expect(requested.some((url) => /\/webfonts\/files\/inter-latin-wght-normal\.woff2$/.test(url))).toBe(true)
      expect(google()).toEqual([])
    }, 60_000)
  })

  describe('frame web-font link', () => {
    beforeEach(() => {
      requested = []
    })
    async function showFrame(desktop: boolean) {
      await open(desktop, fixtureUrl('frameReplay.html'))
      await page.waitForFunction(
        () =>
          (window as unknown as Fixture).testReady &&
          (window as unknown as Fixture).messages.some((m) => m.type === 'diagramly:frame-ready'),
        { timeout: 60_000 },
      )
      await page.evaluate(() => (window as unknown as { addFrame: () => void }).addFrame())
      await page.waitForFunction(
        () => (window as unknown as Fixture).messages.filter((m) => m.type === 'diagramly:frame-ready').length >= 1,
      )
      await page.evaluate((html) => {
        document.querySelector('iframe')!.contentWindow!.postMessage({ type: 'diagramly:html', html, reqId: 'a' }, '*')
      }, DOCUMENT)
      await page.waitForFunction(() =>
        (window as unknown as Fixture).messages.some((m) => m.type === 'diagramly:html-result'),
      )
    }

    it('web: the frame keeps loading the saved Google stylesheet', async () => {
      await showFrame(false)
      await page.waitForFunction(() => true)
      expect(google().some((url) => url.startsWith('https://fonts.googleapis.com/css2?family=Inter'))).toBe(true)
    }, 60_000)

    it('desktop: shows the local copy, and saves the document with its Google link intact', async () => {
      await showFrame(true)
      await page.waitForFunction(() => true)
      expect(requested.some((url) => url.endsWith('/webfonts/roster.css'))).toBe(true)
      expect(google()).toEqual([])
      // an edit makes the runtime save its document back to the canvas
      const child = page.frames().find((f) => f !== page.mainFrame())!
      await child.evaluate(() => document.dispatchEvent(new Event('diagramly:diagram-edited')))
      await page.waitForFunction(() =>
        (window as unknown as Fixture).messages.some((m) => m.type === 'diagramly:edited'),
      )
      const saved = await page.evaluate(
        () => (window as unknown as Fixture).messages.find((m) => m.type === 'diagramly:edited')!.html!,
      )
      expect(saved).toContain('fonts.googleapis.com/css2?family=Inter')
      expect(saved).not.toContain('/webfonts/')
      expect(saved).not.toContain('data-diagramly-webfonts-href')
    }, 60_000)
  })
})
