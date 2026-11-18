#!/usr/bin/env node
/**
 * Builds public/webfonts/: the font files the desktop app serves itself, so a
 * desktop window never asks fonts.googleapis.com / fonts.gstatic.com for a font.
 *
 *   ui.css      the app's own faces (Inter, Hanken Grotesk, Geist Mono), what
 *               index.html used to load from Google Fonts
 *   roster.css  every family of shared/webFonts.ts (the Design panel's font
 *               menu), what a frame's <link data-diagramly-webfonts> loads
 *
 * Usage: node scripts/sync-webfonts.mjs <dir>
 * where <dir> has the Fontsource packages in <dir>/node_modules. Install them
 * with the `npm i --prefix <dir> ...` command this script prints when one is
 * missing. Only the latin and latin-ext subsets are kept (what the app's
 * Google Fonts requests were mostly served from); other scripts fall back to
 * the next family in the stack, as an unsupported glyph always did.
 *
 * The output is committed; tests/webFontsLocal.test.ts checks it against the
 * roster. Run this after the roster changes.
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
const out = path.join(root, 'public/webfonts')
const from = process.argv[2]
if (!from) {
  console.error('usage: node scripts/sync-webfonts.mjs <dir with node_modules/@fontsource*>')
  process.exit(2)
}

/* roster family -> Fontsource variable package slug and css axis file, or the
   static package and its weights. Axes the package has no file for are dropped
   (Merriweather's width axis stays at its default 100). */
const VARIABLE = {
  Inter: ['inter', 'opsz', true],
  Geist: ['geist', 'wght', false],
  Roboto: ['roboto', 'wght', true],
  'Open Sans': ['open-sans', 'wght', true],
  Manrope: ['manrope', 'wght', false],
  'DM Sans': ['dm-sans', 'opsz', true],
  'Space Grotesk': ['space-grotesk', 'wght', false],
  'Plus Jakarta Sans': ['plus-jakarta-sans', 'wght', true],
  'Work Sans': ['work-sans', 'wght', true],
  Nunito: ['nunito', 'wght', true],
  'Playfair Display': ['playfair-display', 'wght', true],
  Lora: ['lora', 'wght', true],
  Merriweather: ['merriweather', 'opsz', true],
  'Source Serif 4': ['source-serif-4', 'opsz', true],
  Fraunces: ['fraunces', 'opsz', true],
  'EB Garamond': ['eb-garamond', 'wght', true],
  'JetBrains Mono': ['jetbrains-mono', 'wght', true],
  'Geist Mono': ['geist-mono', 'wght', false],
  'Fira Code': ['fira-code', 'wght', false],
}
const STATIC = {
  Lato: ['lato', [100, 300, 400, 700, 900], true],
  Poppins: ['poppins', [100, 200, 300, 400, 500, 600, 700, 800, 900], true],
  'IBM Plex Mono': ['ibm-plex-mono', [100, 200, 300, 400, 500, 600, 700], true],
}
/* the app's own faces: what index.html asked Google for, weights as variable files */
const UI = [
  ['Inter', 'inter', 'wght', false],
  ['Hanken Grotesk', 'hanken-grotesk', 'wght', false],
  ['Geist Mono', 'geist-mono', 'wght', false],
]

const files = new Map() // output name -> source path
function need(pkgDir, hint) {
  const dir = path.join(from, 'node_modules', pkgDir)
  if (!existsSync(dir)) {
    console.error(`missing ${pkgDir}: npm i --prefix ${from} ${hint}`)
    process.exit(1)
  }
  return dir
}

/** The latin / latin-ext @font-face rules of one Fontsource css file, rewritten to this directory. */
function faces(pkgDir, cssFile, family) {
  const css = readFileSync(path.join(pkgDir, cssFile), 'utf8')
  const rules = []
  for (const m of css.matchAll(/\/\*\s*([^*]+?)\s*\*\/\s*@font-face\s*\{([^}]*)\}/g)) {
    if (!/-latin(?:-ext)?-/.test(m[1])) continue
    const body = m[2]
    const prop = (name) => new RegExp(`${name}\\s*:\\s*([^;]+);`).exec(body)?.[1]?.trim()
    const src = /url\(\.\/files\/([^)]+\.woff2)\)/.exec(body)?.[1]
    if (!src) throw new Error(`${cssFile}: ${m[1]} has no woff2`)
    files.set(src, path.join(pkgDir, 'files', src))
    rules.push(
      `@font-face{font-family:'${family}';font-style:${prop('font-style')};font-weight:${prop('font-weight')};` +
        `font-display:swap;src:url(./files/${src}) format('woff2');unicode-range:${prop('unicode-range')}}`,
    )
  }
  if (!rules.length) throw new Error(`${pkgDir}/${cssFile}: no latin rules`)
  return rules
}

const roster = []
for (const [family, [slug, axis, italic]] of Object.entries(VARIABLE)) {
  const dir = need(`@fontsource-variable/${slug}`, `@fontsource-variable/${slug}`)
  roster.push(...faces(dir, `${axis}.css`, family))
  if (italic) roster.push(...faces(dir, `${axis}-italic.css`, family))
}
for (const [family, [slug, weights, italic]] of Object.entries(STATIC)) {
  const dir = need(`@fontsource/${slug}`, `@fontsource/${slug}`)
  for (const w of weights) {
    roster.push(...faces(dir, `${w}.css`, family))
    if (italic) roster.push(...faces(dir, `${w}-italic.css`, family))
  }
}
const ui = UI.flatMap(([family, slug, axis]) =>
  faces(need(`@fontsource-variable/${slug}`, `@fontsource-variable/${slug}`), `${axis}.css`, family).filter((rule) =>
    rule.includes('font-style:normal'),
  ),
)

rmSync(out, { recursive: true, force: true })
mkdirSync(path.join(out, 'files'), { recursive: true })
for (const [name, src] of files) copyFileSync(src, path.join(out, 'files', name))
const header = '/* Generated by scripts/sync-webfonts.mjs from Fontsource (OFL). Do not edit. */\n'
writeFileSync(path.join(out, 'roster.css'), `${header}${roster.join('\n')}\n`)
writeFileSync(path.join(out, 'ui.css'), `${header}${ui.join('\n')}\n`)
const bytes = readdirSync(path.join(out, 'files')).reduce(
  (sum, f) => sum + readFileSync(path.join(out, 'files', f)).length,
  0,
)
console.log(
  `${files.size} files, ${(bytes / 1048576).toFixed(1)} MB, ${roster.length} roster faces, ${ui.length} ui faces`,
)
