import { beforeEach, describe, expect, it } from 'vitest'
import type { Page } from 'puppeteer-core'
import { findBrowserPath } from '../server/screenshot'
import { pagePerTest } from './browser'
import { canvasFrame, openCanvasPage } from './canvasPageFixture'

/* Diagramly hides Share, Present, Import and Export, so the bar's right side
   must not keep an empty white capsule beside Connect AI */
describe.skipIf(!findBrowserPath())('the canvas top bar in Diagramly', () => {
  const pages = pagePerTest()
  let page: Page
  beforeEach(async () => {
    page = await pages.open()
    page.setDefaultTimeout(10_000)
    await page.setViewport({ width: 1400, height: 900 })
    await openCanvasPage(page, [canvasFrame({ id: 'board', name: 'Board', x: 0, y: 0, width: 800, height: 600 })])
  })

  it('draws no pill without content', async () => {
    const empty = await page.$$eval(
      '[data-slot="bar-pill"]',
      (pills) => pills.filter((pill) => !pill.textContent?.trim() && !pill.querySelector('button, svg, img')).length,
    )
    expect(empty).toBe(0)
  })
})
