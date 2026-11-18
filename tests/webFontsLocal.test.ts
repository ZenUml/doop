import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { snapshotDocument } from '../server/desktopScreenshot.ts'
import { WEB_FONTS, withLocalWebFontLink, withWebFontLinks } from '../shared/webFonts.ts'

const dir = path.resolve(import.meta.dirname, '../public/webfonts')
const css = (name: string) => readFileSync(path.join(dir, name), 'utf8')
const families = (text: string) => new Set([...text.matchAll(/font-family:'([^']+)'/g)].map((m) => m[1]))

describe('the desktop app’s own web fonts', () => {
  it('roster.css carries every family of the Design panel’s font menu', () => {
    const have = families(css('roster.css'))
    expect(WEB_FONTS.filter((font) => !have.has(font.family)).map((font) => font.family)).toEqual([])
  })

  it('ui.css carries the app’s own faces', () => {
    expect([...families(css('ui.css'))].sort()).toEqual(['Geist Mono', 'Hanken Grotesk', 'Inter'])
  })

  it('every face file a stylesheet names is shipped, and neither stylesheet names Google', () => {
    for (const name of ['roster.css', 'ui.css']) {
      const text = css(name)
      expect(text).not.toMatch(/googleapis|gstatic/)
      const urls = [...text.matchAll(/url\(\.\/files\/([^)]+)\)/g)].map((m) => m[1]!)
      expect(urls.length).toBeGreaterThan(0)
      expect(urls.filter((file) => !existsSync(path.join(dir, 'files', file)))).toEqual([])
    }
  })

  it('index.html names Google Fonts only for the web build', () => {
    const html = readFileSync(path.resolve(import.meta.dirname, '../index.html'), 'utf8')
    const outside = html.replace(/<script>[\s\S]*?<\/script>/g, '')
    expect(outside).not.toMatch(/fonts\.g(oogleapis|static)/)
  })
})

describe('pointing a frame at the local copy', () => {
  const google = withWebFontLinks('<html><head></head><body><p style="font-family:Inter">x</p></body></html>')
  const local = withLocalWebFontLink(google, 'http://127.0.0.1:4400')

  it('swaps the managed link and keeps the saved href', () => {
    expect(google).toContain('fonts.googleapis.com/css2')
    expect(local).toContain('href="http://127.0.0.1:4400/webfonts/roster.css"')
    expect(local).toContain('data-diagramly-webfonts-href="https://fonts.googleapis.com/css2')
  })

  it('leaves a document with no managed link, or a link already swapped, alone', () => {
    const plain = '<html><head></head><body>x</body></html>'
    expect(withLocalWebFontLink(plain)).toBe(plain)
    expect(withLocalWebFontLink(local, 'http://127.0.0.1:4400')).toBe(local)
  })

  it('a swapped document that reaches a save is made canonical again', () => {
    expect(withWebFontLinks(local)).toBe(google)
  })

  it('the desktop screenshot renders with the local copy and its policy admits no Google', () => {
    const page = snapshotDocument(google, 'http://127.0.0.1:4400', false)
    expect(page).toContain('/webfonts/roster.css')
    expect(page).not.toMatch(/\shref="https:\/\/fonts\.g/)
    const policy = /http-equiv="Content-Security-Policy" content="([^"]*)"/.exec(page)![1]!
    expect(policy).not.toMatch(/googleapis|gstatic/)
    expect(policy).toContain('http://127.0.0.1:4400/webfonts/')
  })
})
