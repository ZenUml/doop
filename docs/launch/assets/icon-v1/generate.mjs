#!/usr/bin/env node
/** Rebuild the PNG sizes, macOS ICNS and Windows ICO from the website logo. Requires sharp and macOS iconutil. */
import { execFileSync } from 'node:child_process'
import { Buffer } from 'node:buffer'
import console from 'node:console'
import { copyFile, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const here = path.dirname(fileURLToPath(import.meta.url))
const source = path.join(here, 'diagramly-logo-source.png')
const appIcons = path.resolve(here, '../../../../desktop/src-tauri/icons')
const sizes = [16, 32, 64, 128, 256, 512, 1024]

for (const size of sizes) {
  await sharp(source)
    .resize(size, size)
    .png()
    .toFile(path.join(here, `icon-${size}.png`))
}

// macOS does not mask ICNS files. Follow Apple's icon grid: an 824 px rounded square (corner radius 185)
// centred on a transparent 1024 px canvas, so the Dock and Finder show soft corners and a margin.
const grid = { size: 824, margin: 100, radius: 185 }
const mask = Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" width="${grid.size}" height="${grid.size}"><rect width="${grid.size}" height="${grid.size}" rx="${grid.radius}" fill="#fff"/></svg>`,
)
const tile = await sharp(source)
  .resize(grid.size, grid.size)
  .composite([{ input: mask, blend: 'dest-in' }])
  .png()
  .toBuffer()
const macMaster = await sharp({
  create: { width: 1024, height: 1024, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
})
  .composite([{ input: tile, left: grid.margin, top: grid.margin }])
  .png()
  .toBuffer()
await sharp(macMaster).toFile(path.join(here, 'icon-macos-1024.png'))

const temp = await mkdtemp(path.join(os.tmpdir(), 'diagramly-icon-'))
try {
  const iconset = path.join(temp, 'Diagramly.iconset')
  await mkdir(iconset)
  for (const size of [16, 32, 128, 256, 512]) {
    for (const scale of [1, 2]) {
      const pixels = size * scale
      const name = `icon_${size}x${size}${scale === 2 ? '@2x' : ''}.png`
      await sharp(macMaster).resize(pixels, pixels).png().toFile(path.join(iconset, name))
    }
  }
  execFileSync('/usr/bin/iconutil', ['-c', 'icns', iconset, '-o', path.join(here, 'icon.icns')])
} finally {
  await rm(temp, { recursive: true, force: true })
}

const previewBase = Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="420"><rect width="100%" height="100%" fill="#f4f3f8"/><text x="48" y="56" font-family="Arial,sans-serif" font-size="28" fill="#252338">Diagramly Desktop · website logo icon</text><text x="48" y="88" font-family="Arial,sans-serif" font-size="16" fill="#686579">Original purple Dia logo · macOS ICNS adds a 100 px transparent margin</text><text x="350" y="320" font-family="Arial,sans-serif" font-size="13" fill="#686579">128 px</text><text x="535" y="320" font-family="Arial,sans-serif" font-size="13" fill="#686579">64 px</text><text x="690" y="320" font-family="Arial,sans-serif" font-size="13" fill="#686579">32 px</text></svg>`,
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

// ICO supports embedded PNG frames. Keep the Windows bundle icon and the web favicon aligned with the same source.
async function buildIco(icoSizes) {
  const icoFrames = await Promise.all(
    icoSizes.map(async (size) => ({
      size,
      png: await sharp(source).resize(size, size).png().toBuffer(),
    })),
  )
  const icoDirectory = Buffer.alloc(6 + icoFrames.length * 16)
  icoDirectory.writeUInt16LE(1, 2)
  icoDirectory.writeUInt16LE(icoFrames.length, 4)
  let icoOffset = icoDirectory.length
  for (const [index, frame] of icoFrames.entries()) {
    const entryOffset = 6 + index * 16
    const encodedSize = frame.size === 256 ? 0 : frame.size
    icoDirectory[entryOffset] = encodedSize
    icoDirectory[entryOffset + 1] = encodedSize
    icoDirectory.writeUInt16LE(1, entryOffset + 4)
    icoDirectory.writeUInt16LE(32, entryOffset + 6)
    icoDirectory.writeUInt32LE(frame.png.length, entryOffset + 8)
    icoDirectory.writeUInt32LE(icoOffset, entryOffset + 12)
    icoOffset += frame.png.length
  }
  return Buffer.concat([icoDirectory, ...icoFrames.map(({ png }) => png)])
}
await writeFile(path.join(appIcons, 'icon.ico'), await buildIco([16, 32, 64, 128, 256]))

// In-app and web brand surfaces (title bar, board header, favicons, extension and plugin logos).
// tests/diaBrandAssets.test.ts checks every one of these against the source.
const repoRoot = path.resolve(here, '../../../..')
const inApp = [
  ['public/diagramly-brand/icon-64.png', 64],
  ['public/logo.png', 512],
  ['public/favicon.png', 96],
  ['public/apple-touch-icon.png', 180],
  ['chrome-extension/logo.png', 512],
  ['chatgpt-plugin/assets/logo.png', 512],
]
for (const [rel, size] of inApp) {
  await sharp(source).resize(size, size).png().toFile(path.join(repoRoot, rel))
}
await writeFile(path.join(repoRoot, 'public/favicon.ico'), await buildIco([16, 32, 48, 64, 128, 256]))

// The scalable brand icon: the Dia artwork embedded as a PNG, so it cannot drift from the source.
const svgPng = await sharp(source).resize(512, 512).png().toBuffer()
await writeFile(
  path.join(repoRoot, 'public/diagramly-brand/icon.svg'),
  `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="1024" height="1024" viewBox="0 0 1024 1024" role="img" aria-labelledby="title">
  <title id="title">Diagramly Dia icon</title>
  <image width="1024" height="1024" href="data:image/png;base64,${svgPng.toString('base64')}"/>
</svg>
`,
)

console.log(
  `Generated ${sizes.length} PNG sizes, preview.png, icon.icns and icon.ico; updated ${path.relative(process.cwd(), appIcons)} and the in-app brand assets.`,
)
