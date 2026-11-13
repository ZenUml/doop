import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import sharp from 'sharp'
import type { Frame } from '../shared/types'
import { buildDiagramHtml } from '../shared/diagramFrame'
import { stubEnv, unstubAllEnvs } from './envStub'

/* Deferred renders so tests control when Chromium "finishes" */
const mocks = vi.hoisted(() => ({
  renderFrame: vi.fn(),
  putObject: vi.fn(),
  getObject: vi.fn(),
  deleteObject: vi.fn(),
}))

vi.mock('../server/screenshot.ts', () => ({ renderFrame: mocks.renderFrame }))
vi.mock('../server/storage.ts', () => ({
  putObject: mocks.putObject,
  getObject: mocks.getObject,
  deleteObject: mocks.deleteObject,
}))

import * as thumbs from '../server/thumbs.ts'

const frame = (id: string): Frame =>
  ({
    id,
    canvasId: 'c',
    name: id,
    x: 0,
    y: 0,
    width: 1280,
    height: 900,
    html: '',
    updatedAt: 1,
    updatedBy: 't',
  }) as Frame

function deferredRenders() {
  const resolvers: Array<(b: Buffer) => void> = []
  mocks.renderFrame.mockImplementation(() => new Promise<Buffer>((r) => resolvers.push(r)))
  return resolvers
}

const tick = () => new Promise((r) => setTimeout(r, 25))

beforeEach(() => {
  mocks.renderFrame.mockReset()
  mocks.putObject.mockReset().mockResolvedValue(undefined)
  mocks.getObject.mockReset().mockResolvedValue(null)
  mocks.deleteObject.mockReset().mockResolvedValue(undefined)
})
afterEach(unstubAllEnvs)

describe('thumbs', () => {
  it('makes a small diagram readable and centred in a home tile instead of shrinking the whole empty artboard', async () => {
    stubEnv('DOOP_PRODUCT', 'diagramly')
    const png = await sharp(
      Buffer.from(
        '<svg width="1000" height="600"><rect width="1000" height="600" fill="white"/><rect x="12" y="12" width="180" height="80" fill="black"/></svg>',
      ),
    )
      .png()
      .toBuffer()
    mocks.renderFrame.mockResolvedValue(png)
    const f = { ...frame('small-diagram'), html: buildDiagramHtml({ kind: 'zenuml', source: 'A->B: request' }) }
    const thumbnail = await thumbs.create(f)
    const { data, info } = await sharp(thumbnail).removeAlpha().raw().toBuffer({ resolveWithObject: true })
    let left = info.width,
      right = 0
    for (let y = 0; y < info.height; y++)
      for (let x = 0; x < info.width; x++) {
        if (data[(y * info.width + x) * 3]! < 80) {
          left = Math.min(left, x)
          right = Math.max(right, x)
        }
      }
    expect((right - left) / info.width).toBeGreaterThan(0.8)
    expect(Math.abs((left + right) / 2 - info.width / 2)).toBeLessThan(2)
    expect(info).toMatchObject({ width: 640, height: 384 })
    expect(mocks.putObject.mock.calls[0]?.[0]).toBe('thumb/diagramly-home-v1-small-diagram.jpg')
  })
  it('keeps coloured diagram paper and produces a valid preview for blank diagrams', async () => {
    stubEnv('DOOP_PRODUCT', 'diagramly')
    for (const background of ['#204060', '#ffffff']) {
      mocks.renderFrame.mockResolvedValue(
        await sharp({ create: { width: 400, height: 300, channels: 3, background } })
          .png()
          .toBuffer(),
      )
      const f = { ...frame(`paper-${background}`), html: buildDiagramHtml({ kind: 'zenuml', source: '' }) }
      const thumbnail = await thumbs.create(f)
      const { data, info } = await sharp(thumbnail).removeAlpha().raw().toBuffer({ resolveWithObject: true })
      expect(info).toMatchObject({ width: 640, height: 384 })
      const centre = (192 * info.width + 320) * 3
      const expected = background === '#ffffff' ? [255, 255, 255] : [32, 64, 96]
      // JPEG may shift a channel by one level while retaining the paper colour.
      expected.forEach((channel, index) => expect(Math.abs(data[centre + index]! - channel)).toBeLessThanOrEqual(2))
    }
  })
  it('bounds concurrent renders globally — breadth across frames cannot fan out unbounded', async () => {
    const resolvers = deferredRenders()
    const all = Array.from({ length: 10 }, (_, i) => thumbs.create(frame(`cap-${i}`)))
    await tick()
    expect(mocks.renderFrame).toHaveBeenCalledTimes(3)

    /* finishing one admits exactly one waiter — never a burst */
    resolvers[0]!(Buffer.from('x'))
    await tick()
    expect(mocks.renderFrame).toHaveBeenCalledTimes(4)

    for (let i = 1; i < 10; i++) {
      resolvers[i]?.(Buffer.from('x'))
      await tick()
    }
    await Promise.all(all)
    expect(mocks.renderFrame).toHaveBeenCalledTimes(10)
  })

  it('does not persist a thumb for a frame purged mid-render', async () => {
    const resolvers = deferredRenders()
    const p = thumbs.create(frame('purged-mid-render'))
    await tick()
    thumbs.purge('purged-mid-render')
    resolvers[0]!(Buffer.from('late'))
    await p
    await tick()
    expect(mocks.putObject).not.toHaveBeenCalled()
  })

  it('deletes its own write when purge lands during the put', async () => {
    const resolvers = deferredRenders()
    let finishPut!: () => void
    mocks.putObject.mockImplementation(() => new Promise<void>((r) => (finishPut = r)))
    const p = thumbs.create(frame('purged-during-put'))
    await tick()
    resolvers[0]!(Buffer.from('x'))
    await tick() /* now inside putObject */
    thumbs.purge('purged-during-put')
    finishPut()
    await p
    await tick()
    expect(mocks.deleteObject).toHaveBeenCalledWith('thumb/purged-during-put.jpg')
  })

  it('getStored serves stored bytes and refreshes stale ones in the background, deduped', async () => {
    deferredRenders()
    mocks.getObject.mockResolvedValue(Buffer.from('stale'))
    const f = frame('stale-frame')
    const [a, b] = await Promise.all([thumbs.getStored(f), thumbs.getStored(f)])
    expect(a?.toString()).toBe('stale')
    expect(b?.toString()).toBe('stale')
    await tick()
    /* one background refresh, not one per request (dedupe + throttle) */
    expect(mocks.renderFrame).toHaveBeenCalledTimes(1)
  })
})
