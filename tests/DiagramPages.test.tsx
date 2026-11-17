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
function Harness({
  disabled = false,
  compact = false,
  tabs = false,
}: {
  disabled?: boolean
  compact?: boolean
  tabs?: boolean
}) {
  const current = useStore((state) => state.canvas!.frames[0]!)
  return (
    <DiagramPages
      frame={current}
      diagram={readDiagramFrame(current.html)!}
      disabled={disabled}
      compact={compact}
      tabs={tabs}
    />
  )
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
it('keeps the compact page selector and page actions functional', async () => {
  act(() => root.render(<Harness compact />))
  const selector = container.querySelector<HTMLButtonElement>('[aria-label="Diagram page"]')!
  act(() => selector.click())
  const order = [...document.body.querySelectorAll<HTMLElement>('[role="option"]')].find(
    (option) => option.textContent === 'Order',
  )!
  await act(async () => order.click())
  expect(readDiagramFrame(useStore.getState().canvas!.frames[0]!.html)?.activePageId).toBe('order')
  expect(api.updateFrame).toHaveBeenLastCalledWith('frame', expect.any(Object), 5)
})
it('uses a bottom tab rail, targets the active page menu, and keeps the board page unchanged', async () => {
  act(() => root.render(<Harness tabs />))
  const nav = container.querySelector<HTMLElement>('[data-page-tabs]')!
  expect(nav.querySelectorAll('[role="tab"]')).toHaveLength(2)
  expect(nav.querySelector('[role="tab"][aria-selected="true"]')?.textContent).toContain('Payment')
  expect(nav.querySelectorAll('[aria-label^="Actions for "]')).toHaveLength(1)

  await act(async () => nav.querySelector<HTMLButtonElement>('[role="tab"][aria-selected="false"]')!.click())
  expect(readDiagramFrame(useStore.getState().canvas!.frames[0]!.html)?.activePageId).toBe('order')
  expect(useStore.getState().canvas!.frames[0]!.pageId).toBe('board')
  expect(container.querySelector('[role="tab"][aria-selected="true"]')?.textContent).toContain('Order')

  act(() => {
    container
      .querySelector<HTMLButtonElement>('[aria-label="Actions for Order"]')!
      .dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, pointerType: 'mouse' }))
  })
  const rename = [...document.body.querySelectorAll<HTMLElement>('[role="menuitem"]')].find(
    (item) => item.textContent === 'Rename',
  )!
  await act(async () => rename.click())
  const input = container.querySelector<HTMLInputElement>('[aria-label="Page name"]')!
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, 'Cart')
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
  await act(async () => button('Save').click())
  const saved = readDiagramFrame(useStore.getState().canvas!.frames[0]!.html)!
  expect(saved.pages?.find((page) => page.id === 'order')?.title).toBe('Cart')
  expect(saved.activePageId).toBe('order')
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
it('blocks tab selection, adding, and active-page actions until saves settle', () => {
  act(() => root.render(<Harness tabs disabled />))
  expect([...container.querySelectorAll<HTMLButtonElement>('[role="tab"]')].every((tab) => tab.disabled)).toBe(true)
  expect(container.querySelector<HTMLButtonElement>('[aria-label="Add page"]')?.disabled).toBe(true)
  expect(container.querySelector<HTMLButtonElement>('[aria-label="Actions for Payment"]')?.disabled).toBe(true)
  act(() => {
    useFrameSaves.setState({ pending: { frame: 1 } })
    root.render(<Harness tabs />)
  })
  expect([...container.querySelectorAll<HTMLButtonElement>('[role="tab"]')].every((tab) => tab.disabled)).toBe(true)
  expect(container.querySelector<HTMLButtonElement>('[aria-label="Add page"]')?.disabled).toBe(true)
})
it('keeps the last diagram page from being deleted in the tab menu', () => {
  const onlyPage = { ...pages[0]!, id: 'only', title: 'Only page' }
  const singlePageFrame = { ...frame, html: buildDiagramHtml({ ...onlyPage, pages: [onlyPage], activePageId: 'only' }) }
  act(() =>
    useStore
      .getState()
      .setCanvas({ id: 'canvas', name: 'Document', frames: [singlePageFrame], createdAt: 1, updatedAt: 5 }),
  )
  act(() => root.render(<Harness tabs />))
  act(() => {
    container
      .querySelector<HTMLButtonElement>('[aria-label="Actions for Only page"]')!
      .dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, pointerType: 'mouse' }))
  })
  const deleteItem = [...document.body.querySelectorAll<HTMLElement>('[role="menuitem"]')].find(
    (item) => item.textContent === 'Delete',
  )!
  expect(deleteItem.getAttribute('aria-disabled')).toBe('true')
})
