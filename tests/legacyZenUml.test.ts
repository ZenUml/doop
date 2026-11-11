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
