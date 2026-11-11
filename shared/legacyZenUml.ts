/** The JSON array written by ZenUML desktop's "Export all" command. */
export interface LegacyZenUmlPage {
  legacyId: string
  title: string
  source: string
  css: string
  cssMode: string
}

export interface LegacyZenUmlDocument {
  legacyId: string
  title: string
  pages: LegacyZenUmlPage[]
  activePageId?: string
}

export interface LegacyZenUmlImportResult {
  canvases: { id: string; name: string; pageId?: string }[]
  imported: number
  skipped: number
  warnings: string[]
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label}: expected an object.`)
  return value as Record<string, unknown>
}

function text(value: unknown, label: string, limit: number): string {
  if (value === undefined || value === null) return ''
  if (typeof value !== 'string' || value.length > limit) throw new Error(`${label}: invalid or too long.`)
  return value
}

export function parseLegacyZenUml(value: unknown): LegacyZenUmlDocument[] {
  if (!Array.isArray(value) || !value.length || value.length > 1000) {
    throw new Error('Choose a ZenUML export containing 1–1000 documents (a JSON array).')
  }
  return value.map((entry: unknown, index) => {
    const label = `Document ${index + 1}`
    const item = record(entry, label)
    /* An unrelated JSON array must not become hundreds of empty canvases. */
    if (typeof item.id !== 'string' || !item.id.trim()) throw new Error(`${label}: missing legacy document ID.`)
    const title = text(item.title, `${label} title`, 1000).trim() || `Untitled legacy document ${index + 1}`
    const cssMode = text(item.cssMode, `${label} style format`, 20) || 'css'
    if (item.pages !== undefined && !Array.isArray(item.pages)) throw new Error(`${label}: invalid pages.`)
    const entries = Array.isArray(item.pages) && item.pages.length ? item.pages : [item]
    if (entries.length > 100) throw new Error(`${label}: a canvas supports at most 100 pages.`)
    const pages = entries.map((entry: unknown, pageIndex) => {
      const page = record(entry, `${label}, page ${pageIndex + 1}`)
      return {
        legacyId: text(page.id, `${label} page ID`, 1000) || `page-${pageIndex + 1}`,
        title:
          entries[0] === item
            ? 'Page 1'
            : text(page.title, `${label} page title`, 1000).trim() || `Page ${pageIndex + 1}`,
        source: text(page.js, `${label} source`, 200_000),
        css: text(page.css, `${label} styles`, 200_000),
        cssMode,
      }
    })
    const activePageId = typeof item.currentPageId === 'string' ? item.currentPageId : undefined
    return { legacyId: item.id, title, pages, ...(activePageId ? { activePageId } : {}) }
  })
}
