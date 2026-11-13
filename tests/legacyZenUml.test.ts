import { expect, it } from 'vitest'
import { parseLegacyZenUml } from '../shared/legacyZenUml'

it('reads old single-page and multi-page exports without treating DSL as JavaScript', () => {
  const documents = parseLegacyZenUml([
    { id: 'old-a', title: '订单', js: 'User->Service: <br>label', css: '.message { color: red }' },
    {
      id: 'old-b',
      title: '多页',
      js: 'stale',
      currentPageId: 'second',
      cssMode: 'less',
      pages: [
        { id: 'first', title: 'First', js: 'A->B: first', css: '@ink: red; .message {color:@ink}' },
        { id: 'second', title: 'Second', js: 'A->B: second', css: '' },
      ],
    },
    { id: 'empty' },
  ])
  expect(documents).toHaveLength(3)
  expect(documents[0]?.pages[0]).toMatchObject({
    source: 'User->Service: <br>label',
    css: '.message { color: red }',
    cssMode: 'css',
  })
  expect(documents[1]).toMatchObject({ title: '多页', activePageId: 'second' })
  expect(documents[1]?.pages.map((p) => p.source)).toEqual(['A->B: first', 'A->B: second'])
  expect(documents[1]?.pages[0]?.cssMode).toBe('less')
  expect(documents[2]).toMatchObject({ title: 'Untitled legacy document 3', pages: [{ source: '', title: 'Page 1' }] })
})

it('keeps the exact 165a52b normalized single- and multi-page identities when dimensions are absent', async () => {
  const { createHash } = await import('node:crypto')
  const { legacyCanvases } = await import('../server/legacyZenUml')
  const raw = [
    { id: 'single', title: 'Old title', js: 'A->B', css: '.message{color:red}' },
    {
      id: 'multi',
      title: 'Old multipage',
      currentPageId: 'p2',
      pages: [
        { id: 'p1', title: 'First', js: 'A->B' },
        { id: 'p2', title: 'Second', js: 'B->C' },
      ],
    },
  ]
  const oldNormalized = [
    {
      legacyId: 'single',
      title: 'Old title',
      pages: [{ legacyId: 'single', title: 'Page 1', source: 'A->B', css: '.message{color:red}', cssMode: 'css' }],
    },
    {
      legacyId: 'multi',
      title: 'Old multipage',
      pages: [
        { legacyId: 'p1', title: 'First', source: 'A->B', css: '', cssMode: 'css' },
        { legacyId: 'p2', title: 'Second', source: 'B->C', css: '', cssMode: 'css' },
      ],
      activePageId: 'p2',
    },
  ]
  const expected = oldNormalized.map(
    (document) =>
      `zu_${createHash('sha256')
        .update(JSON.stringify(['owner', null, document]))
        .digest('hex')
        .slice(0, 32)}`,
  )
  const result = await legacyCanvases(parseLegacyZenUml(raw), 'owner', 'Test')
  expect(result.canvases.map((canvas) => canvas.id)).toEqual(expected)
})

it('uses the pre-165 identity when unkeyed records gain preserved dimensions', async () => {
  const { legacyCanvases } = await import('../server/legacyZenUml')
  const bare = { id: 'old-dimensions', title: 'Same', js: 'A->B' }
  const sized = { ...bare, width: 1400, height: 950 }
  const old = await legacyCanvases(parseLegacyZenUml([bare]), 'owner', 'Test')
  const now = await legacyCanvases(parseLegacyZenUml([sized]), 'owner', 'Test')
  expect(now.canvases[0]!.id).toBe(old.canvases[0]!.id)
  expect(now.canvases[0]!.frames[0]!.width).toBe(1400)
  const pair = await legacyCanvases(parseLegacyZenUml([sized, { ...sized, width: 1600 }]), 'owner', 'Test')
  expect(pair.canvases[0]!.id).not.toBe(pair.canvases[1]!.id)
  expect(pair.canvases[0]!.id).toBe(old.canvases[0]!.id)
})
