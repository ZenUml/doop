import { createHash } from 'node:crypto'
import { nanoid } from 'nanoid'
import { compileDiagramStyle } from './diagramStyles.ts'
import { buildDiagramHtml } from '../shared/diagramFrame.ts'
import type { LegacyZenUmlDocument, LegacyZenUmlPage } from '../shared/legacyZenUml.ts'
import type { Canvas } from '../shared/types.ts'

async function compileStyle(page: LegacyZenUmlPage): Promise<string> {
  return compileDiagramStyle(page.css, page.cssMode)
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
        html: buildDiagramHtml({
          kind: 'zenuml',
          source: page.source,
          ...(css ? { css } : {}),
          ...(page.css || page.styleConfig || page.styleHtml ? { styleSource: page.css, styleMode: page.cssMode } : {}),
          ...(page.styleConfig ? { styleConfig: page.styleConfig } : {}),
          ...(page.styleHtml ? { styleHtml: page.styleHtml } : {}),
        }),
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
