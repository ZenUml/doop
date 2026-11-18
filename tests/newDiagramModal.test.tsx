// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, expect, it, vi } from 'vitest'
import { NewDiagramModal } from '../src/components/NewDiagramModal'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
let root: Root
let container: HTMLDivElement
const button = (name: string) => [...document.querySelectorAll('button')].find((b) => b.textContent === name)!
function mount(onCreate: (kind: 'zenuml' | 'mermaid') => Promise<void>, onClose = vi.fn()) {
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  act(() => root.render(<NewDiagramModal onCreate={onCreate} onClose={onClose} />))
  return onClose
}
afterEach(() => {
  act(() => root.unmount())
  container.remove()
})
it.each([
  ['Mermaid diagram', 'mermaid'],
  ['ZenUML sequence diagram', 'zenuml'],
] as const)('creates the chosen %s and closes after success', async (label, kind) => {
  const create = vi.fn(async () => {})
  const close = mount(create)
  await act(async () => button(label).click())
  expect(create).toHaveBeenCalledExactlyOnceWith(kind)
  expect(close).toHaveBeenCalledOnce()
})
it('keeps the choice open after failure so creation can be retried', async () => {
  const create = vi.fn().mockRejectedValueOnce(new Error('Disk full')).mockResolvedValueOnce(undefined)
  const close = mount(create)
  await act(async () => button('Mermaid diagram').click())
  expect(document.querySelector('[role="alert"]')?.textContent).toBe('Disk full')
  expect(close).not.toHaveBeenCalled()
  expect(button('Mermaid diagram').disabled).toBe(false)
  await act(async () => button('Mermaid diagram').click())
  expect(close).toHaveBeenCalledOnce()
})
