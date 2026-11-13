import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { findBrowserPath } from '../server/screenshot'
import { readDiagramFrame, type DiagramFrame } from '../shared/diagramFrame'
import type { Canvas } from '../shared/types'
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
      '/i': { target: `http://localhost:${port}` },
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

  it('keeps both legacy pages inside one diagram through editing, restart, backup and reimport', async () => {
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
    await page.locator('button::-p-text(Review old ZenUML library)').click()
    await page.locator('button::-p-text(Review saved library)').click()
    await page.waitForFunction(() => document.body.innerText.includes('Existing desktop purchase'))
    await page.locator('button::-p-text(Import 1 document)').click()
    await page.locator('button::-p-text(Open first document)').click()
    await page.waitForSelector('iframe[data-doop-frame]')

    const documentState = async () =>
      (await page.evaluate(async () => {
        const id = location.pathname.split('/')[2]
        return (await fetch(`/api/canvases/${id}`)).json()
      })) as Canvas
    const imported = await documentState()
    expect(imported.pages).toHaveLength(1)
    expect(imported.pages![0]!.name).toBe('Board 1')
    expect(imported.frames).toHaveLength(1)
    expect(imported.frames[0]!.pageId).toBe(imported.pages![0]!.id)
    const initial = readDiagramFrame(imported.frames[0]!.html)!
    expect(initial.pages).toHaveLength(2)
    expect(initial.pages!.map((item) => item.title)).toEqual(['Order', 'Payment'])
    expect(initial.activePageId).toBe(initial.pages![1]!.id)
    expect(await page.$$('[aria-label="Diagrams"] [role="listitem"]')).toHaveLength(1)
    await page.click('[data-frame-title]')
    await page.waitForSelector('[aria-label="Diagram page"]')
    expect(await page.$eval('[aria-label="Diagram page"]', (el) => el.textContent)).toContain('Payment')

    async function selectInnerPage(title: string) {
      await page.waitForFunction(
        () => !document.querySelector<HTMLButtonElement>('[aria-label="Diagram page"]')?.disabled,
      )
      await page.click('[aria-label="Diagram page"]')
      await page.locator(`[role="option"]::-p-text(${title})`).click()
      await page.waitForFunction(
        (name) => document.querySelector('[aria-label="Diagram page"]')?.textContent?.includes(name),
        {},
        title,
      )
      await page.waitForFunction(
        () => !document.querySelector<HTMLButtonElement>('[aria-label="Diagram page"]')?.disabled,
      )
    }
    const source = 'Order->Payment: upgraded and still editable'
    await page.locator('textarea[aria-label="Diagram source"]').fill(source)
    await page.waitForFunction(
      () => !document.querySelector<HTMLButtonElement>('[aria-label="Diagram page"]')?.disabled,
    )
    await expect.poll(async () => readDiagramFrame((await documentState()).frames[0]!.html)?.source).toBe(source)
    await page.locator('button::-p-text(Diagram styles)').click()
    const style = '.sequence-diagram { background: #dceeff; }'
    await page.locator('textarea[aria-label="Diagram styles"]').fill(style)
    await page.waitForFunction(() => document.querySelector<HTMLButtonElement>('[aria-label="Diagram page"]')?.disabled)
    await Promise.all([
      page.waitForResponse((response) => response.url().endsWith('/diagram-style') && response.ok()),
      page.locator('button::-p-text(Apply styles)').click(),
    ])
    await selectInnerPage('Order')
    expect(await page.$eval('textarea[aria-label="Diagram source"]', (el) => (el as HTMLTextAreaElement).value)).toBe(
      'Customer->Order: create',
    )
    const beforeRestart = readDiagramFrame((await documentState()).frames[0]!.html)!
    expect(beforeRestart.source).toBe('Customer->Order: create')
    expect(beforeRestart.pages![0]!.styleSource).toContain('@ink: #3155aa')
    expect(beforeRestart.pages![1]!.source).toBe(source)
    expect(beforeRestart.pages![1]!.styleSource).toBe(style)

    const dataDir = server.dataDir
    const port = server.port
    server.stop({ keepData: true })
    await server.stopped
    server = await startServer(
      {
        PORT: String(port),
        BETTER_AUTH_URL: web.origin,
        DOOP_PRODUCT: 'diagramly',
        DOOP_LEGACY_LIBRARY_MANIFEST: path.join(root, 'legacy-library.json'),
      },
      dataDir,
    )
    await page.reload()
    await page.waitForSelector('iframe[data-doop-frame]')
    await page.click('[data-frame-title]')
    await page.waitForSelector('[aria-label="Diagram page"]')
    expect(await page.$eval('[aria-label="Diagram page"]', (el) => el.textContent)).toContain('Order')
    await selectInnerPage('Payment')
    expect(await page.$eval('textarea[aria-label="Diagram source"]', (el) => (el as HTMLTextAreaElement).value)).toBe(
      source,
    )
    const reloaded = (await (await page.$('iframe[data-doop-frame]'))!.contentFrame())!
    await reloaded.waitForFunction(
      () => document.documentElement.getAttribute('data-doop-diagram-state') === 'rendered',
    )
    await reloaded.waitForFunction(
      () => getComputedStyle(document.querySelector('.sequence-diagram')!).backgroundColor === 'rgb(220, 238, 255)',
    )

    const inner = 'section[aria-label="Diagram pages"]'
    await page.locator(`${inner} button::-p-text(Add page)`).click()
    await page.waitForFunction(
      () => !document.querySelector<HTMLButtonElement>('[aria-label="Diagram page"]')?.disabled,
    )
    await expect.poll(async () => readDiagramFrame((await documentState()).frames[0]!.html)?.pages?.length).toBe(3)
    await page.locator(`${inner} button::-p-text(Rename)`).click()
    await page.locator('[aria-label="Page name"]').fill('Review')
    await page.locator(`${inner} button::-p-text(Save)`).click()
    await page.waitForFunction(() =>
      document.querySelector('[aria-label="Diagram page"]')?.textContent?.includes('Review'),
    )
    await page.waitForFunction(
      () => !document.querySelector<HTMLButtonElement>('[aria-label="Diagram page"]')?.disabled,
    )
    await page.locator(`${inner} button::-p-text(Delete)`).click()
    await expect.poll(async () => readDiagramFrame((await documentState()).frames[0]!.html)?.pages?.length).toBe(2)

    const retry = await page.evaluate(async (library) => {
      const response = await fetch('/api/import/zenuml', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: library }),
      })
      return response.json()
    }, items)
    expect(retry).toMatchObject({ imported: 0, skipped: 1 })
    const backup = (await page.evaluate(async () => (await fetch('/api/desktop/document-backup')).json())) as {
      documents: { frames: { diagram: DiagramFrame }[] }[]
    }
    expect(backup.documents).toHaveLength(1)
    expect(backup.documents[0]!.frames).toHaveLength(1)
    expect(backup.documents[0]!.frames[0]!.diagram.pages).toHaveLength(2)
    expect(backup.documents[0]!.frames[0]!.diagram.pages!.map((item) => item.source)).toEqual([
      'Customer->Order: create',
      source,
    ])
    expect(backup.documents[0]!.frames[0]!.diagram.pages![1]!.styleSource).toBe(style)
    if (process.env.DIAGRAMLY_QA_SCREENSHOT)
      await page.screenshot({ path: process.env.DIAGRAMLY_QA_SCREENSHOT, fullPage: true })
  }, 60_000)
})
