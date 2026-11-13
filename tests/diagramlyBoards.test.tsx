// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import type { Canvas, CanvasPageInfo } from '../shared/types'

const state = vi.hoisted(() => ({ diagramly: false, savePages: vi.fn() }))
vi.mock('../src/lib/product', () => ({ isDiagramly: () => state.diagramly }))
vi.mock('../src/lib/pageEdits', () => ({
  savePages: (canvas: Canvas, pages: CanvasPageInfo[]) => state.savePages(canvas, pages),
  duplicatePage: () => Promise.resolve(),
  moveFramesToPage: () => Promise.resolve(),
}))

const { useStore } = await import('../src/lib/store')
const { PagesPanel } = await import('../src/components/PagesPanel')
const { translateIn } = await import('../src/lib/i18n')

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let container: HTMLDivElement
let root: Root

function render(diagramly: boolean) {
  state.diagramly = diagramly
  useStore.getState().setCanvas({
    id: 'outer-pages-test',
    name: 'Document',
    frames: [],
    pages: [{ id: 'board-existing', name: 'Existing board name' }],
  } as unknown as Canvas)
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  act(() => root.render(<PagesPanel />))
}

async function addPage() {
  const button = [...container.querySelectorAll('button')].find((item) =>
    item.getAttribute('aria-label')?.startsWith('Add'),
  )
  if (!button) throw new Error('add button not rendered')
  await act(async () => {
    button.click()
    for (let index = 0; index < 10; index++) await Promise.resolve()
  })
}

describe('outer collection vocabulary', () => {
  beforeEach(() => {
    state.savePages.mockReset()
    state.savePages.mockImplementation((canvas: Canvas, pages: CanvasPageInfo[]) => {
      useStore.getState().setPages(pages, canvas.id)
      return Promise.resolve()
    })
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  it('uses Board terminology and a Board default name only in Diagramly', async () => {
    render(true)

    const pageKeys = [
      'panels.pagesTitle',
      'panels.pagesAdd',
      'panels.pagesName',
      'panels.pagesRename',
      'panels.pagesDuplicate',
      'panels.pagesDelete',
      'panels.pagesMoveSelection',
      'panels.pagesMoveSelectionPlaceholder',
      'panels.pagesMoveFailed',
      'panels.pagesSaveFailed',
      'panels.pagesDuplicateFailed',
    ] as const
    expect(pageKeys.map((key) => translateIn('en', key))).toEqual([
      'Boards',
      'Add board',
      'Board name',
      'Rename board',
      'Duplicate board',
      'Delete board',
      'Move selection to board',
      'Move selection to board…',
      'Could not move all selected diagrams to the board',
      'Could not save boards',
      'Could not duplicate the board',
    ])
    expect(translateIn('pt-BR', 'panels.pagesTitle')).toBe('Quadros')
    expect(translateIn('pt-BR', 'panels.pagesAdd')).toBe('Adicionar quadro')
    expect(container.querySelector('[data-slot="page-section-heading"]')?.textContent).toBe('Boards')
    expect(container.querySelector('button[aria-label="Add board"]')).not.toBeNull()
    expect(container.textContent).toContain('Existing board name')

    await addPage()

    expect(useStore.getState().canvas?.pages?.map((page) => page.name)).toEqual(['Existing board name', 'Board 2'])
  })

  it('keeps the original Page terminology and default name in Doop', async () => {
    render(false)

    expect(container.querySelector('[data-slot="page-section-heading"]')?.textContent).toBe('Pages')
    expect(container.querySelector('button[aria-label="Add page"]')).not.toBeNull()

    await addPage()

    expect(useStore.getState().canvas?.pages?.map((page) => page.name)).toEqual(['Existing board name', 'Page 2'])
  })
})
