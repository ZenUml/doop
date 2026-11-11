import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { findBrowserPath } from '../server/screenshot'
import { pagePerTest, serveBuilt, type BuiltServer } from './browser'
import { freePort, startServer, type Server } from './harness'

describe.skipIf(!findBrowserPath())('Legacy upgrade in the actual Diagramly application', () => {
  const pages = pagePerTest()
  let server: Server
  let web: BuiltServer
  let root: string
  const items = [
    {
      id: 'pre-upgrade-document',
      title: 'Existing desktop purchase',
      currentPageId: 'payment',
      cssMode: 'less',
      pages: [
        { id: 'order', title: 'Order', js: 'Customer->Order: create', css: '@ink: #3155aa; .message {color: @ink;}' },
        { id: 'payment', title: 'Payment', js: 'Order->Payment: authorize', css: '' },
      ],
    },
  ]

  beforeAll(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'diagramly-upgrade-browser-'))
    const directory = path.join(root, 'legacy-library-backups', 'old-library')
    await mkdir(directory, { recursive: true })
    const exportFile = path.join(directory, 'library.json')
    await writeFile(exportFile, JSON.stringify(items))
    const manifestPath = path.join(root, 'legacy-library.json')
    await writeFile(
      manifestPath,
      JSON.stringify({
        schemaVersion: 1,
        status: 'ready',
        snapshots: [
          {
            id: 'old-library',
            createdAt: '2026-11-11T00:00:00Z',
            sourceKind: 'sandbox',
            directory,
            exportFile,
            fileCount: 6,
            logicalBytes: 1024,
          },
        ],
      }),
    )
    const port = await freePort()
    web = await serveBuilt({
      '/api': { target: `http://localhost:${port}` },
      '/ws': { target: `ws://localhost:${port}`, ws: true },
      '/vendor/diagram': { target: `http://localhost:${port}` },
    })
    server = await startServer({
      PORT: String(port),
      BETTER_AUTH_URL: web.origin,
      DOOP_PRODUCT: 'diagramly',
      DOOP_LEGACY_LIBRARY_MANIFEST: manifestPath,
    })
  }, 60_000)

  afterAll(async () => {
    server?.stop()
    await server?.stopped
    await web?.close()
    if (root) await rm(root, { recursive: true, force: true })
  })

  it('reviews and imports the preserved library, then opens its previously active page', async () => {
    const page = await pages.open()
    await page.setViewport({ width: 1440, height: 1000 })
    await page.goto(web.origin)
    await page.evaluate(async () => {
      const response = await fetch('/api/auth/sign-up/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Upgrade owner', email: 'upgrade-owner@test.dev', password: 'password12345' }),
      })
      if (!response.ok) throw new Error('QA profile failed')
    })
    await page.reload()
    await page.locator('button::-p-text(Review saved library)').click()
    await page.waitForFunction(() => document.body.innerText.includes('Existing desktop purchase'))
    expect(await page.$('input[aria-label="ZenUML export file"]')).not.toBeNull()
    await page.locator('button::-p-text(Import 1 document)').click()
    await page.locator('button::-p-text(Open first document)').click()
    await page.waitForSelector('iframe[data-doop-frame]')
    await page.waitForFunction(() => document.querySelector('[aria-current="page"]')?.textContent?.includes('Payment'))
    const element = await page.$('iframe[data-doop-frame]')
    const diagram = (await element!.contentFrame())!
    await diagram.waitForFunction(() => document.documentElement.getAttribute('data-doop-diagram-state') === 'rendered')
    expect(await diagram.$eval('[data-doop-diagram-mount]', (mount) => mount.textContent)).toContain('Payment')

    await page.click('[data-frame-title]')
    const source = 'Order->Payment: upgraded and still editable'
    await page.click('textarea[aria-label="Diagram source"]')
    const modifier = process.platform === 'darwin' ? 'Meta' : 'Control'
    await page.keyboard.down(modifier)
    await page.keyboard.press('a', { commands: process.platform === 'darwin' ? ['selectAll'] : undefined })
    await page.keyboard.up(modifier)
    await page.keyboard.type(source)
    expect(
      await page.$eval('textarea[aria-label="Diagram source"]', (element) => (element as HTMLTextAreaElement).value),
    ).toBe(source)
    await page.waitForResponse(
      (response) => response.request().method() === 'PATCH' && response.url().includes('/api/frames/') && response.ok(),
    )
    await page.locator('button::-p-text(Diagram styles)').click()
    await page.locator('textarea[aria-label="Diagram styles"]').fill('.sequence-diagram { background: #dceeff; }')
    await Promise.all([
      page.waitForResponse((response) => response.url().endsWith('/diagram-style') && response.ok()),
      page.locator('button::-p-text(Apply styles)').click(),
    ])
    await page.reload()
    await page.waitForSelector('iframe[data-doop-frame]')
    await page.click('[data-frame-title]')
    await page.waitForSelector('textarea[aria-label="Diagram source"]')
    expect(
      await page.$eval('textarea[aria-label="Diagram source"]', (element) => (element as HTMLTextAreaElement).value),
    ).toBe(source)
    const reloaded = (await (await page.$('iframe[data-doop-frame]'))!.contentFrame())!
    await reloaded.waitForFunction(
      () => document.documentElement.getAttribute('data-doop-diagram-state') === 'rendered',
    )
    await reloaded.waitForFunction(
      () => getComputedStyle(document.querySelector('.sequence-diagram')!).backgroundColor === 'rgb(220, 238, 255)',
    )

    // Retry must leave the edited document alone, including its styles.
    const retry = await page.evaluate(async (library) => {
      const response = await fetch('/api/import/zenuml', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: library }),
      })
      return response.json()
    }, items)
    expect(retry).toMatchObject({ imported: 0, skipped: 1 })
    const backup = await page.evaluate(async () => (await fetch('/api/desktop/document-backup')).json())
    expect(JSON.stringify(backup)).toContain(source)
    expect(JSON.stringify(backup)).toContain('.sequence-diagram { background: #dceeff; }')
    if (process.env.DIAGRAMLY_QA_SCREENSHOT)
      await page.screenshot({ path: process.env.DIAGRAMLY_QA_SCREENSHOT, fullPage: true })
  }, 30_000)
})
