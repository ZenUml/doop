#!/usr/bin/env node
/** Rebuild the PNG sizes and macOS ICNS from the SVG master. Requires sharp and macOS iconutil. */
import { execFileSync } from 'node:child_process'
import { copyFile, mkdir, mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const here = path.dirname(fileURLToPath(import.meta.url))
const source = path.join(here, 'diagramly-desktop.svg')
const appIcons = path.resolve(here, '../../../../desktop/src-tauri/icons')
const sizes = [16, 32, 64, 128, 256, 512, 1024]

for (const size of sizes) {
  await sharp(source)
    .resize(size, size)
    .png()
    .toFile(path.join(here, `icon-${size}.png`))
}

const temp = await mkdtemp(path.join(os.tmpdir(), 'diagramly-icon-'))
try {
  const iconset = path.join(temp, 'Diagramly.iconset')
  await mkdir(iconset)
  for (const size of [16, 32, 128, 256, 512]) {
    for (const scale of [1, 2]) {
      const pixels = size * scale
      const name = `icon_${size}x${size}${scale === 2 ? '@2x' : ''}.png`
      await sharp(source).resize(pixels, pixels).png().toFile(path.join(iconset, name))
    }
  }
  execFileSync('/usr/bin/iconutil', ['-c', 'icns', iconset, '-o', path.join(here, 'icon.icns')])
} finally {
  await rm(temp, { recursive: true, force: true })
}

const previewBase = Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="420"><rect width="100%" height="100%" fill="#f4f3f8"/><text x="48" y="56" font-family="Arial,sans-serif" font-size="28" fill="#252338">Diagramly Desktop · icon direction v1</text><text x="48" y="88" font-family="Arial,sans-serif" font-size="16" fill="#686579">Full-bleed square source · Diagramly palette · candidate, not installed</text><text x="350" y="320" font-family="Arial,sans-serif" font-size="13" fill="#686579">128 px</text><text x="535" y="320" font-family="Arial,sans-serif" font-size="13" fill="#686579">64 px</text><text x="690" y="320" font-family="Arial,sans-serif" font-size="13" fill="#686579">32 px</text></svg>`,
)
const previewLayers = []
for (const [size, left] of [
  [256, 48],
  [128, 350],
  [64, 535],
  [32, 690],
]) {
  const input = await sharp(source).resize(size, size).png().toBuffer()
  previewLayers.push({ input, left, top: 140 })
}
await sharp(previewBase).composite(previewLayers).png().toFile(path.join(here, 'preview.png'))

await mkdir(appIcons, { recursive: true })
for (const [sourceName, targetName] of [
  ['icon-32.png', '32x32.png'],
  ['icon-64.png', '64x64.png'],
  ['icon-128.png', '128x128.png'],
  ['icon-256.png', '128x128@2x.png'],
  ['icon-512.png', 'icon.png'],
  ['icon.icns', 'icon.icns'],
]) {
  await copyFile(path.join(here, sourceName), path.join(appIcons, targetName))
}

console.log(
  `Generated ${sizes.length} PNG sizes, preview.png and icon.icns; updated ${path.relative(process.cwd(), appIcons)}.`,
)
