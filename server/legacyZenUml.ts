import { createHash } from 'node:crypto'
import { nanoid } from 'nanoid'
import less from 'less'
import * as sass from 'sass'
import { buildDiagramHtml } from '../shared/diagramFrame.ts'
import type { LegacyZenUmlDocument, LegacyZenUmlPage } from '../shared/legacyZenUml.ts'
import type { Canvas } from '../shared/types.ts'

/* Exported styles may be untrusted. Compilers can read files: deny every
   file manager request and plugin rule instead of resolving imports on disk. */
class NoFiles extends less.FileManager {
  override supports() {
    return true
  }
  override supportsSync() {
    return true
  }
  override loadFile(): Promise<never> {
    return Promise.reject(new Error('Style imports are not supported.'))
  }
  override loadFileSync(): never {
    throw new Error('Style imports are not supported.')
  }
}

async function compileStyle(page: LegacyZenUmlPage): Promise<string> {
  if (!page.css.trim()) return ''
  if (page.cssMode === 'css') return page.css
  if (/@\s*(?:import|use|forward|plugin)\b/i.test(page.css)) throw new Error('Style imports are not supported.')
  if (page.cssMode === 'less') {
    return (
      await less.render(page.css, {
        javascriptEnabled: false,
        plugins: [{ install: (_less, manager) => manager.addFileManager(new NoFiles()) }],
        /* Less added this option after the published type definitions. */
        ...{ disablePluginRule: true },
      })
    ).css
  }
  if (page.cssMode === 'scss') return sass.compileString(page.css, { logger: sass.Logger.silent }).css
  throw new Error(`Unsupported style format: ${page.cssMode}`)
}

export async function legacyCanvases(
  documents: LegacyZenUmlDocument[],
  ownerId: string,
  by: string,
  workspaceId?: string,
) {
  const warnings: string[] = []
  const canvases: Canvas[] = []
  const destinations: { id: string; name: string; pageId?: string }[] = []
  for (const document of documents) {
    /* Content-derived IDs make retry/re-import a no-op, including after the
       imported diagram has been edited. Each account/workspace has its own copy. */
    const id = `zu_${createHash('sha256')
      .update(JSON.stringify([ownerId, workspaceId ?? null, document]))
      .digest('hex')
      .slice(0, 32)}`
    const now = Date.now()
    const pages = document.pages.map((page) => ({ id: nanoid(10), name: page.title.slice(0, 100) }))
    const frames = []
    for (let i = 0; i < document.pages.length; i++) {
      const page = document.pages[i]!
      let css = ''
      try {
        css = await compileStyle(page)
      } catch {
        warnings.push(
          `${document.title} / ${page.title}: custom styles could not be converted; the source was imported.`,
        )
      }
      frames.push({
        id: nanoid(10),
        canvasId: id,
        pageId: pages[i]!.id,
        name: document.title,
        x: 120,
        y: 120,
        width: 1200,
        height: 900,
        html: buildDiagramHtml({ kind: 'zenuml', source: page.source, ...(css ? { css } : {}) }),
        createdAt: now,
        updatedAt: now,
        updatedBy: by,
      })
    }
    canvases.push({
      id,
      name: document.title,
      ownerId,
      ...(workspaceId ? { workspaceId } : {}),
      pages,
      frames,
      createdAt: now,
      updatedAt: now,
    })
    const activeIndex = document.pages.findIndex((page) => page.legacyId === document.activePageId)
    destinations.push({ id, name: document.title, pageId: pages[Math.max(0, activeIndex)]!.id })
  }
  return { canvases, destinations, warnings }
}
