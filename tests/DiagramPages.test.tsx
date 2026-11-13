// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { DiagramPages } from '../src/components/DiagramPages'
import { buildDiagramHtml, readDiagramFrame } from '../shared/diagramFrame'
import type { Frame } from '../shared/types'
import { api } from '../src/lib/api'
import { useStore } from '../src/lib/store'
import { useFrameSaves } from '../src/lib/frameSaves'

vi.mock('../src/lib/posthog', () => ({ posthog: { capture: vi.fn() } }))
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
const pages = [
  { id: 'order', title: 'Order', kind: 'mermaid' as const, source: 'flowchart LR\n A-->B', css: '.order{color:red}' },
  { id: 'payment', title: 'Payment', kind: 'zenuml' as const, source: 'A->B: pay', css: '.payment{color:blue}' },
]
const frame: Frame = {
  id: 'frame',
  canvasId: 'canvas',
  pageId: 'board',
  name: 'Shop',
  x: 0,
  y: 0,
  width: 800,
  height: 600,
  createdAt: 1,
  updatedAt: 5,
  updatedBy: 'User',
  html: buildDiagramHtml({ ...pages[1]!, pages, activePageId: 'payment' }),
}
let root: Root
let container: HTMLDivElement
function Harness({ disabled = false }: { disabled?: boolean }) {
  const current = useStore((state) => state.canvas!.frames[0]!)
  return <DiagramPages frame={current} diagram={readDiagramFrame(current.html)!} disabled={disabled} />
}
function button(label: string) {
  return [...container.querySelectorAll<HTMLButtonElement>('button')].find((item) => item.textContent === label)!
}
beforeEach(() => {
  useFrameSaves.setState({ pending: {} })
  useStore.getState().setCanvas({ id: 'canvas', name: 'Document', frames: [frame], createdAt: 1, updatedAt: 5 })
  vi.spyOn(api, 'updateFrame').mockImplementation(async (_id, patch) => ({ ...frame, ...patch, updatedAt: 6 }))
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  act(() => root.render(<Harness />))
})
afterEach(() => {
  act(() => root.unmount())
  container.remove()
  vi.restoreAllMocks()
})
it('renames only the active inner page and retains the board and all diagram content', async () => {
  act(() => button('Rename').click())
  const input = container.querySelector<HTMLInputElement>('[aria-label="Page name"]')!
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, 'Billing')
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
  await act(async () => button('Save').click())
  const saved = useStore.getState().canvas!.frames[0]!
  expect(saved.pageId).toBe('board')
  expect(readDiagramFrame(saved.html)?.pages).toEqual([pages[0], { ...pages[1], title: 'Billing' }])
  expect(api.updateFrame).toHaveBeenCalledWith('frame', expect.any(Object), 5)
})
it('adds and deletes inner pages while retaining at least one page and the other source/style', async () => {
  await act(async () => button('Add page').click())
  expect(readDiagramFrame(useStore.getState().canvas!.frames[0]!.html)?.pages).toHaveLength(3)
  await act(async () => button('Delete').click())
  expect(readDiagramFrame(useStore.getState().canvas!.frames[0]!.html)?.pages).toEqual(pages)
  await act(async () => button('Delete').click())
  expect(readDiagramFrame(useStore.getState().canvas!.frames[0]!.html)?.pages).toEqual([pages[1]])
  expect(button('Delete').disabled).toBe(true)
})
it('blocks switching and page actions during a queued or in-flight save and a dirty style draft', () => {
  act(() => useFrameSaves.setState({ pending: { frame: 1 } }))
  expect(container.querySelector<HTMLButtonElement>('[aria-label="Diagram page"]')?.disabled).toBe(true)
  expect(button('Add page').disabled).toBe(true)
  act(() => {
    useFrameSaves.setState({ pending: {} })
    root.render(<Harness disabled />)
  })
  expect(button('Rename').disabled).toBe(true)
  expect(container.textContent).toContain('Apply or load saved styles before switching pages.')
})
