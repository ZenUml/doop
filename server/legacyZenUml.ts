import { createHash } from 'node:crypto'
import { nanoid } from 'nanoid'
import { compileDiagramStyle } from './diagramStyles.ts'
import { buildDiagramHtml, type DiagramPage } from '../shared/diagramFrame.ts'
import { legacyIdentityDocument, type LegacyZenUmlDocument, type LegacyZenUmlPage } from '../shared/legacyZenUml.ts'
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
    /* Stable source keys, or content plus identical-record occurrence for older
       JSON, make retries a no-op. Each account/workspace has its own copy. */
    const id = `zu_${createHash('sha256')
      .update(
        JSON.stringify([
          ownerId,
          workspaceId ?? null,
          document.sourceRecordId ? ['indexeddb-record-v1', document.sourceRecordId] : legacyIdentityDocument(document),
        ]),
      )
      .digest('hex')
      .slice(0, 32)}`
    const now = Date.now()
    const board = { id: nanoid(10), name: 'Board 1' }
    const diagramPages: DiagramPage[] = []
    for (const page of document.pages) {
      let css = ''
      try {
        css = await compileStyle(page)
      } catch {
        warnings.push(
          `${document.title} / ${page.title}: custom styles could not be converted; the source was imported.`,
        )
      }
      diagramPages.push({
        id: nanoid(10),
        title: page.title,
        kind: 'zenuml',
        source: page.source,
        ...(page.width !== undefined ? { width: page.width } : {}),
        ...(page.height !== undefined ? { height: page.height } : {}),
        ...(css ? { css } : {}),
        styleSource: page.css,
        styleMode: page.cssMode,
        ...(page.styleConfig ? { styleConfig: page.styleConfig } : {}),
        ...(page.styleHtml ? { styleHtml: page.styleHtml } : {}),
      })
    }
    const activeIndex = Math.max(
      0,
      document.pages.findIndex((page) => page.legacyId === document.activePageId),
    )
    const active = diagramPages[activeIndex]!
    const frame = {
      id: nanoid(10),
      canvasId: id,
      pageId: board.id,
      name: document.title,
      x: 120,
      y: 120,
      width: Math.max(1200, ...diagramPages.map((page) => page.width ?? 0)),
      height: Math.max(900, ...diagramPages.map((page) => page.height ?? 0)),
      html: buildDiagramHtml({ ...active, pages: diagramPages, activePageId: active.id }),
      createdAt: now,
      updatedAt: now,
      updatedBy: by,
    }
    canvases.push({
      id,
      name: document.title,
      ownerId,
      ...(workspaceId ? { workspaceId } : {}),
      pages: [board],
      frames: [frame],
      createdAt: now,
      updatedAt: now,
    })
    destinations.push({ id, name: document.title, pageId: board.id })
  }
  return { canvases, destinations, warnings }
}
