import { createHash } from 'node:crypto'
import { expect, it } from 'vitest'
import { makeDiagramBackup, restoreDiagramBackup } from '../shared/diagramBackup'
import { buildDiagramHtml, readDiagramFrame } from '../shared/diagramFrame'
import type { Canvas } from '../shared/types'

const original: Canvas = {
  id: 'old',
  name: 'Architecture',
  ownerId: 'private-owner',
  memberIds: ['private-member'],
  linkAccess: 'edit',
  createdAt: 1,
  updatedAt: 2,
  pages: [
    { id: 'p1', name: 'Sequence', background: '#ffffff' },
    { id: 'p2', name: 'Flow' },
  ],
  frames: [
    {
      id: 'f1',
      canvasId: 'old',
      pageId: 'p1',
      name: 'Sequence',
      x: 10,
      y: 25,
      width: 1200,
      height: 2800,
      html: buildDiagramHtml({ kind: 'zenuml', source: 'A->B.test()', css: '.zenuml { color: red }' }),
      createdAt: 1,
      updatedAt: 2,
      updatedBy: 'Person',
    },
    {
      id: 'f2',
      canvasId: 'old',
      pageId: 'p2',
      name: 'Legacy design',
      x: 5,
      y: 5,
      width: 300,
      height: 200,
      html: '<body>Preserved legacy HTML</body>',
      createdAt: 1,
      updatedAt: 2,
      updatedBy: 'Person',
    },
  ],
}
const identity = (value: string) =>
  createHash('sha256')
    .update('new-owner:' + value)
    .digest('hex')
    .slice(0, 30)

it('round-trips pages, source, legacy styles, layout and legacy HTML without restoring grants', () => {
  const backup = makeDiagramBackup([original])
  expect(JSON.stringify(backup)).not.toContain('private-owner')
  expect(JSON.stringify(backup)).not.toContain('private-member')
  const [restored] = restoreDiagramBackup(backup, 'new-owner', 'New user', identity)
  expect(restored).toMatchObject({ ownerId: 'new-owner', linkAccess: 'none' })
  expect(restored?.pages?.map((page) => page.name)).toEqual(['Sequence', 'Flow'])
  expect(restored?.frames[0]).toMatchObject({ height: 2800, x: 10, y: 25, pageId: restored?.pages?.[0]?.id })
  expect(readDiagramFrame(restored!.frames[0]!.html)).toEqual(readDiagramFrame(original.frames[0]!.html))
  expect(restored?.frames[1]?.html).toBe(original.frames[1]?.html)
  expect(restoreDiagramBackup(backup, 'new-owner', 'New user', identity)[0]?.id).toBe(restored?.id)
})

it('rejects invalid page membership, duplicate IDs and oversized geometry before any write', () => {
  const backup = makeDiagramBackup([original])
  backup.documents[0]!.frames[0]!.pageId = 'missing'
  expect(() => restoreDiagramBackup(backup, 'new', 'Actor', identity)).toThrow(/missing page/)
  backup.documents[0]!.frames[0]!.pageId = 'p1'
  backup.documents.push(backup.documents[0]!)
  expect(() => restoreDiagramBackup(backup, 'new', 'Actor', identity)).toThrow(/duplicate document/)
  const invalid = makeDiagramBackup([original])
  invalid.documents[0]!.frames[0]!.width = Number.POSITIVE_INFINITY
  expect(() => restoreDiagramBackup(invalid, 'new', 'Actor', identity)).toThrow()
})
