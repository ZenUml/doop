import { describe, expect, it } from 'vitest'
import { findBrowserPath } from '../server/screenshot'
import { fixtureUrl, pagePerTest } from './browser'

describe.skipIf(!findBrowserPath())('focused diagram editor desktop layout', () => {
  const pages = pagePerTest()

  it('keeps the header visible and puts scrollable page tabs under the preview', async () => {
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
      const pages = modal.querySelector<HTMLElement>('[data-page-tabs]')!
      const sourceHeading = modal.querySelector<HTMLElement>('.diagram-source-editor > div')!
      const previewCanvas = modal.querySelector<HTMLElement>('[data-preview-canvas]')!
      const tabStrip = pages.firstElementChild as HTMLElement
      const tabs = [...pages.querySelectorAll<HTMLElement>('[role="tab"]')]
      const back = [...header.querySelectorAll('button')].find((button) =>
        button.textContent?.includes('Back to board'),
      )!
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
          bottom: pages.getBoundingClientRect().bottom,
          previewBottom: previewCanvas.getBoundingClientRect().bottom,
          tabStripWidth: tabStrip.clientWidth,
          tabStripScrollWidth: tabStrip.scrollWidth,
          tabs: tabs.length,
          active: tabs.find((tab) => tab.getAttribute('aria-selected') === 'true')?.textContent,
          menuCount: pages.querySelectorAll('[aria-label^="Actions for "]').length,
        },
        sourceHeading: sourceHeading.textContent,
      }
    })

    expect(Math.abs(layout.modal.x)).toBeLessThan(1)
    expect(Math.abs(layout.modal.y - layout.rootTop)).toBeLessThan(1)
    expect(Math.abs(layout.modal.width - layout.viewport.width)).toBeLessThan(1)
    expect(Math.abs(layout.header.y - layout.rootTop)).toBeLessThan(1)
    expect(layout.back.text).toContain('Back to board')
    expect(layout.back.y).toBeGreaterThanOrEqual(layout.header.y)
    expect(layout.pages.height).toBeGreaterThan(43)
    expect(layout.pages.height).toBeLessThan(46)
    expect(layout.pages.bottom).toBeGreaterThan(layout.pages.previewBottom - 1)
    expect(layout.pages.tabs).toBe(12)
    expect(layout.pages.active).toContain('Scenario 1')
    expect(layout.pages.menuCount).toBe(1)
    expect(layout.pages.tabStripScrollWidth).toBeGreaterThan(layout.pages.tabStripWidth)
    expect(layout.sourceHeading).toContain('Scenario 1')
  }, 15_000)
})
