import { beforeEach, describe, expect, it } from 'vitest'
import type { Page } from 'puppeteer-core'
import { findBrowserPath } from '../server/screenshot'
import { fixtureUrl, pagePerTest } from './browser'

declare global {
  interface Window {
    seedDiagramly: () => void
    seedUnsupportedDiagram: () => void
    receiveAgentSource: (source: string) => void
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
    await page.setRequestInterception(true)
    page.on('request', (request) => {
      if (new URL(request.url()).pathname === '/api/product-config') {
        void request.respond({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ mode: 'diagramly' }),
        })
      } else void request.continue()
    })
    await page.goto(fixtureUrl('diagramly.html'))
    await page.waitForFunction(() => typeof window.seedDiagramly === 'function')
    await page.evaluate(() => window.seedDiagramly())
    await page.waitForSelector('button::-p-text(Edit diagram source)')
  })

  it('shows editable diagrams and pages without the HTML layer or development inspector', async () => {
    expect(await page.$$eval('[role="list"][aria-label="Diagrams"]', (items) => items.length)).toBe(1)
    expect(await page.$$eval('[role="listitem"]', (items) => items.length)).toBe(1)
    expect(await page.$('button[aria-label="Checkout"]')).not.toBeNull()
    expect(await page.$$eval('textarea', (items) => items.length)).toBe(0)
    await page.locator('button::-p-text(Edit diagram source)').click()
    await page.waitForSelector('.CodeMirror', { visible: true })
    expect(await page.$eval('.CodeMirror-code', (el) => el.textContent)).toContain('Browser -> Checkout')
    await page.locator('button::-p-text(Back to board)').click()
    await page.waitForSelector('.CodeMirror', { hidden: true })
    expect(await page.$$eval('[role="tree"], [role="treeitem"]', (items) => items.length)).toBe(0)
    expect(await page.$('button[aria-label="Tokens"]')).toBeNull()
    expect(await page.$('button[aria-label="Components"]')).toBeNull()
    expect(await page.$('[role="tab"][data-value="components"]')).toBeNull()
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
    expect(await page.$('iframe[data-diagramly-frame]')).toBeNull()
    expect(await page.$$eval('body', (items) => items[0]?.textContent)).toContain(
      'This item is not a supported diagram',
    )
    expect(await page.evaluate(() => window.diagramlyMessages)).not.toContain('diagramly:unsafe-html')
  })

  it('shows an agent source update as saved while still saving local edits', async () => {
    const writes: string[] = []
    page.on('request', (request) => {
      if (request.method() === 'PATCH' && new URL(request.url()).pathname.endsWith('/frames/diagram-a')) {
        writes.push(request.postData() ?? '')
      }
    })
    await page.locator('button::-p-text(Edit diagram source)').click()
    await page.waitForSelector('.CodeMirror', { visible: true })

    await page.evaluate(() => window.receiveAgentSource('Browser -> Checkout: Agent update'))
    await page.waitForFunction(() => document.querySelector('.CodeMirror-code')?.textContent?.includes('Agent update'))
    expect(await page.$eval('[data-slot="modal"] header', (el) => el.textContent)).toContain('Saved to diagram')
    expect(writes).toHaveLength(0)

    await page.click('.CodeMirror-line')
    await page.keyboard.press('End')
    await page.keyboard.type(' with local input')
    await expect.poll(() => writes.length).toBe(1)
    expect(writes[0]).toContain('with local input')
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
    expect(await page.evaluate(() => window.diagramlyMessages)).not.toContain('diagramly:probe-result')
    expect(await page.$('button::-p-text(Edit diagram source)')).not.toBeNull()
  })
})
