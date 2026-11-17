import { describe, expect, it } from 'vitest'
import { findBrowserPath } from '../server/screenshot'
import { fixtureUrl, pagePerTest } from './browser'

describe.skipIf(!findBrowserPath())('focused diagram editor desktop layout', () => {
  const pages = pagePerTest()

  it('keeps the header below the desktop tabs and page controls on one row', async () => {
    const page = await pages.open()
    await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 })
    await page.goto(fixtureUrl('focusedEditorLayout.html'))
    await page.waitForSelector('[data-slot="modal"]')
    await page.waitForFunction(() => {
      const modal = document.querySelector<HTMLElement>('[data-slot="modal"]')
      const root = document.querySelector<HTMLElement>('[data-canvas-page-root]')
      const rect = modal?.getBoundingClientRect()
      return (
        !!rect &&
        !!root &&
        Math.abs(rect.top - root.getBoundingClientRect().top) < 1 &&
        Math.abs(rect.width - innerWidth) < 1
      )
    })

    const layout = await page.evaluate(() => {
      const modal = document.querySelector<HTMLElement>('[data-slot="modal"]')!
      const header = modal.querySelector('header')!
      const root = document.querySelector<HTMLElement>('[data-canvas-page-root]')!
      const pages = modal.querySelector<HTMLElement>('[aria-label="Diagram pages"]')!
      const back = [...header.querySelectorAll('button')].find((button) =>
        button.textContent?.includes('Back to board'),
      )!
      const pageControls = [...pages.querySelectorAll('button')]
      return {
        viewport: { width: innerWidth, height: innerHeight },
        rootTop: root.getBoundingClientRect().top,
        modal: {
          x: modal.getBoundingClientRect().x,
          y: modal.getBoundingClientRect().y,
          width: modal.getBoundingClientRect().width,
          height: modal.getBoundingClientRect().height,
        },
        header: { y: header.getBoundingClientRect().y, height: header.getBoundingClientRect().height },
        back: {
          y: back.getBoundingClientRect().y,
          bottom: back.getBoundingClientRect().bottom,
          text: back.textContent,
        },
        pages: {
          y: pages.getBoundingClientRect().y,
          height: pages.getBoundingClientRect().height,
          labels: (modal.innerText.match(/\bPages\b/g) ?? []).length,
          buttonTops: pageControls.map((button) => button.getBoundingClientRect().top),
        },
      }
    })

    expect(Math.abs(layout.modal.x)).toBeLessThan(1)
    expect(Math.abs(layout.modal.y - layout.rootTop)).toBeLessThan(1)
    expect(Math.abs(layout.modal.width - layout.viewport.width)).toBeLessThan(1)
    expect(Math.abs(layout.header.y - layout.rootTop)).toBeLessThan(1)
    expect(layout.back.text).toContain('Back to board')
    expect(layout.back.y).toBeGreaterThanOrEqual(layout.header.y)
    expect(layout.pages.height).toBeLessThan(50)
    expect(layout.pages.labels).toBe(1)
    expect(Math.max(...layout.pages.buttonTops) - Math.min(...layout.pages.buttonTops)).toBeLessThan(2)
  }, 15_000)
})
