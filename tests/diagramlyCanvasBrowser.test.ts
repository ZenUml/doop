import { beforeEach, describe, expect, it } from 'vitest'
import type { Page } from 'puppeteer-core'
import { findBrowserPath } from '../server/screenshot'
import { fixtureUrl, pagePerTest } from './browser'

declare global {
  interface Window {
    seedDiagramly: () => void
    seedUnsupportedDiagram: () => void
    diagramlyState: () => { selectedId: string | null; selectedElement: { frameId: string; selector: string } | null }
    diagramlyMessages: string[]
  }
}

describe.skipIf(!findBrowserPath())('Diagramly canvas profile', { timeout: 30_000 }, () => {
  const pages = pagePerTest()
  let page: Page

  beforeEach(async () => {
    page = await pages.open()
    await page.setViewport({ width: 1200, height: 800 })
    await page.goto(fixtureUrl('diagramly.html'))
    await page.waitForFunction(() => typeof window.seedDiagramly === 'function')
    await page.evaluate(() => window.seedDiagramly())
    await page.waitForSelector('textarea[aria-label="Diagram source"]')
  })

  it('shows editable diagrams and pages without the HTML layer or development inspector', async () => {
    expect(await page.$$eval('[role="list"][aria-label="Diagrams"]', (items) => items.length)).toBe(1)
    expect(await page.$$eval('[role="listitem"]', (items) => items.length)).toBe(1)
    expect(await page.$('button[aria-label="Checkout"]')).not.toBeNull()
    expect(await page.$$eval('textarea', (items) => items.length)).toBe(1)
    expect(
      await page.$eval('textarea[aria-label="Diagram source"]', (el) => (el as HTMLTextAreaElement).value),
    ).toContain('Browser -> Checkout')
    expect(await page.$$eval('[role="tree"], [role="treeitem"]', (items) => items.length)).toBe(0)
    expect(await page.$('button[aria-label="Tokens"]')).toBeNull()
    expect(await page.$('button[aria-label="Pin as reference"]')).toBeNull()
    expect(await page.$('input[aria-label="Frame name"]')).toBeNull()
    expect(await page.$('button[aria-label="Frame"]')).toBeNull()
    expect(await page.$('button[aria-label="Rectangle"]')).toBeNull()
    expect(await page.$('button[aria-label="Prototype mode: wire up interactions"]')).toBeNull()
    expect(await page.$('button[aria-label="Zoom"]')).not.toBeNull()
    expect(await page.$('button[aria-label="Comment"]')).not.toBeNull()
    expect(await page.evaluate(() => window.diagramlyState())).toEqual({
      selectedId: 'diagram-a',
      selectedElement: null,
    })
  })

  it('does not execute legacy HTML stored in an unsupported diagram item', async () => {
    await page.evaluate(() => window.seedUnsupportedDiagram())
    await page.waitForSelector('[data-frame-surface]')
    expect(await page.$('iframe[data-doop-frame]')).toBeNull()
    expect(await page.$$eval('body', (items) => items[0]?.textContent)).toContain('This item is not a supported diagram')
    expect(await page.evaluate(() => window.diagramlyMessages)).not.toContain('diagramly:unsafe-html')
  })

  it('does not activate hidden drawing tools by shortcut', async () => {
    await page.keyboard.press('r')
    expect(await page.$$('[data-drawing-hint]')).toHaveLength(0)
    expect(await page.evaluate(() => window.diagramlyState().selectedId)).toBe('diagram-a')
  })

  it('selects the whole diagram from its rendered surface without probing inner HTML', async () => {
    const surface = await page.$eval('[data-frame-surface]', (el) => {
      const rect = el.getBoundingClientRect()
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
    })
    expect(surface).not.toBeNull()
    await page.mouse.click(surface!.x + 30, surface!.y + 30)
    await page.waitForFunction(() => window.diagramlyState().selectedId === 'diagram-a')
    expect(await page.evaluate(() => window.diagramlyState().selectedElement)).toBeNull()
    expect(await page.evaluate(() => window.diagramlyMessages)).not.toContain('doop:probe-result')
    expect(await page.$$eval('textarea', (items) => items.length)).toBe(1)
  })
})
