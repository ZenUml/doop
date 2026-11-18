import { readFileSync } from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'
import { describe, expect, it } from 'vitest'

/* One source (the website Dia logo) feeds every in-app brand icon. Each shipped file must equal that
   source resized to the file's own size: regenerate with docs/launch/assets/icon-v1/generate.mjs,
   never edit the binaries by hand. */
const root = path.resolve(__dirname, '..')
const sourcePath = path.join(root, 'docs/launch/assets/icon-v1/diagramly-logo-source.png')
const read = (rel: string) => readFileSync(path.join(root, rel))

async function rgba(input: Buffer, size?: number) {
  const image = sharp(input).ensureAlpha()
  const { data, info } = await (size ? image.resize(size, size) : image).raw().toBuffer({ resolveWithObject: true })
  return { data, width: info.width, height: info.height }
}

/** mean absolute RGBA difference between a file and the Dia source resized to the file's size */
async function distanceFromDia(file: Buffer) {
  const { width } = await rgba(file)
  const actual = await rgba(file)
  const expected = await rgba(readFileSync(sourcePath), width)
  expect([actual.width, actual.height]).toEqual([expected.width, expected.height])
  let total = 0
  for (let i = 0; i < actual.data.length; i++) total += Math.abs(actual.data[i]! - expected.data[i]!)
  return total / actual.data.length
}

const MAX_DISTANCE = 1

describe('in-app brand icons are the website Dia logo', () => {
  const pngs = [
    ['public/diagramly-brand/icon-64.png', 64],
    ['public/logo.png', 512],
    ['public/favicon.png', 96],
    ['public/apple-touch-icon.png', 180],
    ['chrome-extension/logo.png', 512],
    ['chatgpt-plugin/assets/logo.png', 512],
  ] as const

  it.each(pngs)('%s matches the Dia source at %ipx', async (rel, size) => {
    const file = read(rel)
    expect((await sharp(file).metadata()).width).toBe(size)
    expect(await distanceFromDia(file)).toBeLessThan(MAX_DISTANCE)
  })

  it('public/diagramly-brand/icon.svg embeds the Dia artwork', async () => {
    const svg = read('public/diagramly-brand/icon.svg').toString('utf8')
    expect(svg).not.toMatch(/white D/i)
    const match = /href="data:image\/png;base64,([^"]+)"/.exec(svg)
    expect(match, 'icon.svg must embed the Dia PNG').not.toBeNull()
    expect(await distanceFromDia(Buffer.from(match![1]!, 'base64'))).toBeLessThan(MAX_DISTANCE)
  })

  it('public/favicon.ico frames all match the Dia source', async () => {
    const ico = read('public/favicon.ico')
    const count = ico.readUInt16LE(4)
    expect(count).toBeGreaterThan(0)
    for (let i = 0; i < count; i++) {
      const length = ico.readUInt32LE(6 + i * 16 + 8)
      const offset = ico.readUInt32LE(6 + i * 16 + 12)
      expect(await distanceFromDia(ico.subarray(offset, offset + length))).toBeLessThan(MAX_DISTANCE)
    }
  })
})
