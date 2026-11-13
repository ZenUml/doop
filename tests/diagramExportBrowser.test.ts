import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { findBrowserPath } from '../server/screenshot'
import { pagePerTest, serveBuilt, type BuiltServer } from './browser'
import { freePort, startServer, type Server } from './harness'

describe.skipIf(!findBrowserPath())('real ZenUML transparent export', () => {
  const pages = pagePerTest()
  let server: Server
  let web: BuiltServer
  beforeAll(async () => {
    const port = await freePort()
    web = await serveBuilt({ '/vendor/diagram': { target: `http://localhost:${port}` } })
    server = await startServer({ PORT: String(port) })
  }, 60_000)
  afterAll(async () => {
    server?.stop()
    await server?.stopped
    await web?.close()
  })
  it('renders empty paper transparent while keeping participant fill and diagram ink', async () => {
    const page = await pages.open()
    await page.goto(`${web.origin}/tests/fixtures/frameRaster.html`)
    await page.waitForFunction(() => typeof (window as { render?: unknown }).render === 'function')
    const out = await page.evaluate(() =>
      (
        window as unknown as {
          render: (o: unknown) => Promise<{
            diagramPaper: number[]
            diagramHeaderPaper: number[]
            diagramParticipant: number[]
            diagramBorder: number[]
            inkPixels: number
            messageInk: number
          }>
        }
      ).render({ diagram: true, transparent: true }),
    )
    expect(out.diagramPaper[3]).toBe(0)
    expect(out.diagramHeaderPaper[3]).toBe(0)
    expect(out.diagramParticipant).toEqual([255, 255, 255, 255])
    expect(out.diagramBorder[3]).toBeGreaterThan(0)
    expect(out.inkPixels).toBeGreaterThan(200)
    expect(out.messageInk).toBeGreaterThan(40)
  }, 30_000)
  it('retains opaque paper for a regular PNG', async () => {
    const page = await pages.open()
    await page.goto(`${web.origin}/tests/fixtures/frameRaster.html`)
    await page.waitForFunction(() => typeof (window as { render?: unknown }).render === 'function')
    const out = await page.evaluate(() =>
      (
        window as unknown as {
          render: (o: unknown) => Promise<{ diagramPaper: number[]; diagramParticipant: number[] }>
        }
      ).render({ diagram: true }),
    )
    expect(out.diagramPaper).toEqual([255, 255, 255, 255])
    expect(out.diagramParticipant).toEqual([255, 255, 255, 255])
  }, 30_000)
})
