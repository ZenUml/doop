import { z } from 'zod'
import type { Canvas } from './types'
import { buildDiagramHtml, readDiagramFrame } from './diagramFrame'

const coordinate = z.number().finite().min(-1_000_000).max(1_000_000)
const size = z.number().finite().positive().max(100_000)
const short = z.string().min(1).max(300)
const diagramSchema = z.object({
  kind: z.enum(['zenuml', 'mermaid']),
  source: z.string().max(5_000_000),
  css: z.string().max(1_000_000).optional(),
})
const frameSchema = z
  .object({
    id: short,
    pageId: short.optional(),
    name: z.string().max(300),
    x: coordinate,
    y: coordinate,
    width: size,
    height: size,
    hidden: z.boolean().optional(),
    locked: z.boolean().optional(),
    rotation: coordinate.optional(),
    z: coordinate.optional(),
    diagram: diagramSchema.optional(),
    legacyHtml: z.string().max(5_000_000).optional(),
  })
  .refine(
    (frame) => Boolean(frame.diagram) !== (frame.legacyHtml !== undefined),
    'Each item needs diagram source or a legacy HTML snapshot.',
  )

export const diagramBackupSchema = z.object({
  format: z.literal('diagramly-document-library'),
  version: z.literal(1),
  documents: z
    .array(
      z.object({
        id: short,
        name: short,
        pages: z
          .array(
            z.object({
              id: short,
              name: short,
              background: z
                .string()
                .regex(/^#[0-9a-f]{6}$/i)
                .optional(),
            }),
          )
          .min(1)
          .max(1000),
        frames: z.array(frameSchema).max(5000),
      }),
    )
    .max(2000),
})

export type DiagramBackup = z.infer<typeof diagramBackupSchema>

/** Explicit document portability format, not a database/auth/history archive. */
export function makeDiagramBackup(canvases: Canvas[]): DiagramBackup {
  return diagramBackupSchema.parse({
    format: 'diagramly-document-library',
    version: 1,
    documents: canvases.map((canvas) => ({
      id: canvas.id,
      name: canvas.name,
      pages: canvas.pages?.length
        ? canvas.pages.map(({ id, name, background }) => ({ id, name, background }))
        : [{ id: 'first', name: 'Page 1' }],
      frames: canvas.frames.map((frame) => {
        const { id, pageId, name, x, y, width, height, hidden, locked, rotation, z: order } = frame
        const diagram = readDiagramFrame(frame.html)
        return {
          id,
          pageId,
          name,
          x,
          y,
          width,
          height,
          hidden,
          locked,
          rotation,
          z: order,
          ...(diagram ? { diagram } : { legacyHtml: frame.html }),
        }
      }),
    })),
  })
}

export function restoreDiagramBackup(
  value: unknown,
  userId: string,
  actor: string,
  identity: (value: string) => string,
): Canvas[] {
  const backup = diagramBackupSchema.parse(value)
  const now = Date.now()
  const seenDocuments = new Set<string>()
  return backup.documents.map((document) => {
    if (seenDocuments.has(document.id)) throw new Error('Backup contains a duplicate document ID.')
    seenDocuments.add(document.id)
    const id = identity(`document:${document.id}`)
    const pageIds = new Map(
      document.pages.map((page) => [page.id, identity(`document:${document.id}:page:${page.id}`)]),
    )
    if (pageIds.size !== document.pages.length) throw new Error('Backup contains duplicate page IDs.')
    const seenFrames = new Set<string>()
    const pages = document.pages.map((page) => ({ ...page, id: pageIds.get(page.id)! }))
    const frames = document.frames.map((frame) => {
      if (seenFrames.has(frame.id)) throw new Error('Backup contains duplicate diagram IDs.')
      seenFrames.add(frame.id)
      const pageId = frame.pageId ? pageIds.get(frame.pageId) : pages[0]!.id
      if (!pageId) throw new Error('A diagram references a missing page.')
      const { name, x, y, width, height, hidden, locked, rotation, z } = frame
      return {
        id: identity(`document:${document.id}:frame:${frame.id}`),
        canvasId: id,
        pageId,
        name,
        x,
        y,
        width,
        height,
        hidden,
        locked,
        rotation,
        z,
        html: frame.diagram ? buildDiagramHtml(frame.diagram) : frame.legacyHtml!,
        createdAt: now,
        updatedAt: now,
        updatedBy: actor,
      }
    })
    return {
      id,
      name: document.name,
      ownerId: userId,
      linkAccess: 'none',
      createdAt: now,
      updatedAt: now,
      pages,
      frames,
    }
  })
}
