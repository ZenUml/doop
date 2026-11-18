import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import sharp from 'sharp'

const icons = path.resolve('desktop/src-tauri/icons')
const master = path.resolve('docs/launch/assets/icon-v1')

/** The PNG-encoded 256 px image inside an ICO file. */
async function icoImage(file) {
  const bytes = await readFile(file)
  for (let entry = 0; entry < bytes.readUInt16LE(4); entry++) {
    const at = 6 + entry * 16
    const start = bytes.readUInt32LE(at + 12)
    const image = bytes.subarray(start, start + bytes.readUInt32LE(at + 8))
    if (image.subarray(1, 4).toString() === 'PNG') return image
  }
  throw new Error(`${file} has no PNG image`)
}

/** Average colour of the top-left corner: the Diagramly master is full-bleed blue-violet. */
async function corner(input) {
  const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const size = Math.max(1, Math.floor(info.width / 16))
  const sum = [0, 0, 0, 0]
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++)
      for (let c = 0; c < 4; c++) sum[c] += data[(y * info.width + x) * 4 + c]
  return sum.map((value) => value / (size * size))
}

test('the macOS icon and the icon source are the Diagramly master', async () => {
  assert.deepEqual(await readFile(path.join(icons, 'icon.icns')), await readFile(path.join(master, 'icon.icns')))
  assert.deepEqual(
    await readFile(path.resolve('desktop/app-icon.png')),
    await readFile(path.join(master, 'icon-1024.png')),
  )
})

test('every bundled PNG and the Windows icon use the Diagramly gradient, not the old mark', async () => {
  const files = (await readdir(icons)).filter((name) => name.endsWith('.png') || name.endsWith('.ico'))
  assert.ok(files.length >= 16, 'icon set is complete')
  for (const name of files) {
    const [red, green, blue, alpha] = await corner(name.endsWith('.ico') ? await icoImage(path.join(icons, name)) : path.join(icons, name))
    assert.ok(alpha > 250, `${name} is opaque at the corner`)
    assert.ok(blue > 180 && blue > green + 60, `${name} corner is blue-violet, got rgb(${red}, ${green}, ${blue})`)
  }
})

test('the macOS icon is a rounded tile with a transparent margin, not an opaque square', { skip: process.platform !== 'darwin' }, async () => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), 'diagramly-icns-'))
  try {
    const iconset = path.join(temporary, 'icon.iconset')
    execFileSync('/usr/bin/iconutil', ['-c', 'iconset', path.join(icons, 'icon.icns'), '-o', iconset])
    const { data, info } = await sharp(path.join(iconset, 'icon_512x512@2x.png'))
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true })
    assert.equal(info.width, 1024)
    const pixel = (x, y) => Array.from(data.subarray((y * info.width + x) * 4, (y * info.width + x) * 4 + 4))
    for (const [x, y] of [[0, 0], [1023, 0], [0, 1023], [1023, 1023], [50, 512], [512, 50]])
      assert.equal(pixel(x, y)[3], 0, `margin pixel ${x},${y} is transparent`)
    // The tile's rounded corner is cut away: the grid corner (100,100) is transparent, the edge midpoints are opaque.
    assert.equal(pixel(105, 105)[3], 0, 'tile corner is rounded')
    for (const [x, y] of [[104, 512], [920, 512], [512, 104], [512, 920], [512, 512]])
      assert.equal(pixel(x, y)[3], 255, `tile pixel ${x},${y} is opaque`)
  } finally {
    await rm(temporary, { recursive: true, force: true })
  }
})
