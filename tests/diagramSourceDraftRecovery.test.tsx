// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import type { Frame } from '../shared/types'
import { buildDiagramHtml } from '../shared/diagramFrame'
import { DiagramSource } from '../src/components/DiagramSource'
import { api } from '../src/lib/api'
import { readDiagramDraft, writeDiagramDraft } from '../src/lib/diagramDrafts'
import { clearHistory } from '../src/lib/history'
import { useFrameSaves } from '../src/lib/frameSaves'
import { useStore } from '../src/lib/store'

vi.mock('../src/lib/posthog', () => ({ posthog: { capture: vi.fn() } }))
vi.mock('../src/lib/auth', () => ({ authClient: { useSession: () => ({ data: { user: { id: 'local-user' } } }) } }))
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const frame: Frame = {
  id: 'diagram-frame',
  canvasId: 'canvas',
  name: 'Order flow',
  x: 0,
  y: 0,
  width: 800,
  height: 600,
  html: '<html><body>server source</body></html>',
  createdAt: 1,
  updatedAt: 5,
  updatedBy: 'User',
}
const diagram = { kind: 'mermaid' as const, source: 'flowchart LR\n  A --> B', css: '.node { color: navy; }' }

let root: Root
let container: HTMLDivElement

function renderEditor(currentDiagram = diagram) {
  act(() => root.render(<DiagramSource frame={frame} diagram={currentDiagram} />))
}

function sourceInput() {
  return container.querySelector<HTMLTextAreaElement>('textarea')!
}

function typeSource(value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!
  act(() => {
    setter.call(sourceInput(), value)
    sourceInput().dispatchEvent(new Event('input', { bubbles: true }))
  })
}

function mount(currentDiagram = diagram) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  renderEditor(currentDiagram)
}

function unmount() {
  act(() => root.unmount())
  container.remove()
}

beforeEach(() => {
  localStorage.clear()
  clearHistory()
  useFrameSaves.setState({ pending: {} })
  useStore.getState().setCanvas({ id: frame.canvasId, name: 'Canvas', frames: [frame], createdAt: 1, updatedAt: 5 })
  vi.useFakeTimers()
  mount()
})

afterEach(() => {
  unmount()
  useFrameSaves.setState({ pending: {} })
  vi.restoreAllMocks()
  vi.useRealTimers()
})

it('recovers an unsent source after its debounced save fails and the editor remounts', async () => {
  const unsent = 'flowchart LR\n  A --> B\n  B --> C'
  vi.spyOn(api, 'updateFrame').mockRejectedValue(new Error('offline'))

  act(() => sourceInput().focus())
  typeSource(unsent)
  expect(readDiagramDraft('local-user', frame.id)?.source).toBe(unsent)

  await act(async () => {
    await vi.advanceTimersByTimeAsync(500)
  })
  expect(api.updateFrame).toHaveBeenCalledOnce()
  unmount()
  const changedSavedDiagram = { ...diagram, source: 'flowchart LR\n  A --> Z' }
  mount(changedSavedDiagram)

  expect(container.textContent).toContain('Unsent diagram source')
  expect(container.textContent).toContain('The saved source changed after this draft was made.')
  expect(sourceInput().value).toBe(changedSavedDiagram.source)
  expect([...container.querySelectorAll('button')].map((button) => button.textContent)).toContain('Recover source')
  expect([...container.querySelectorAll('button')].map((button) => button.textContent)).toContain('Discard draft')

  act(() => {
    ;[...container.querySelectorAll<HTMLButtonElement>('button')]
      .find((button) => button.textContent === 'Recover source')!
      .click()
  })
  expect(sourceInput().value).toBe(unsent)
})

it('does not clear a newer keystroke when an older save resolves', async () => {
  let completeSave!: (saved: Frame) => void
  vi.spyOn(api, 'updateFrame').mockImplementation(() => new Promise((resolve) => (completeSave = resolve)))
  const first = 'flowchart LR\n  A --> B\n  B --> C'
  const newer = `${first}\n  C --> D`

  act(() => sourceInput().focus())
  typeSource(first)
  await act(async () => vi.advanceTimersByTimeAsync(500))
  writeDiagramDraft('local-user', frame.id, { source: newer, baseSource: first })
  await act(async () => {
    completeSave({ ...frame, html: buildDiagramHtml({ ...diagram, source: first }), updatedAt: 6 })
    await Promise.resolve()
  })

  expect(readDiagramDraft('local-user', frame.id)?.source).toBe(newer)
})

it('keeps the local draft after a compare-and-swap conflict', async () => {
  const staleError = Object.assign(new Error('Frame changed since this source was loaded.'), { status: 409 })
  vi.spyOn(api, 'updateFrame').mockRejectedValue(staleError)
  const unsent = 'flowchart LR\n  A --> Z'

  act(() => sourceInput().focus())
  typeSource(unsent)
  await act(async () => vi.advanceTimersByTimeAsync(500))

  expect(api.updateFrame).toHaveBeenCalledWith(
    frame.id,
    expect.objectContaining({ html: expect.any(String) }),
    frame.updatedAt,
  )
  expect(readDiagramDraft('local-user', frame.id)?.source).toBe(unsent)
})

it('notifies once when the browser cannot write the local draft', () => {
  const notice = vi.spyOn(useStore.getState(), 'pushNotice')
  vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
    throw new DOMException('quota exceeded', 'QuotaExceededError')
  })

  act(() => sourceInput().focus())
  typeSource('flowchart LR\n  A --> C')
  typeSource('flowchart LR\n  A --> D')

  expect(notice).toHaveBeenCalledOnce()
  expect(notice).toHaveBeenCalledWith(expect.stringContaining('could not be saved locally'))
})

it('keeps the current style metadata when a source edit rebuilds the diagram frame', async () => {
  vi.spyOn(api, 'updateFrame').mockResolvedValue({ ...frame, html: frame.html, updatedAt: 6 })
  act(() => sourceInput().focus())
  typeSource('flowchart LR\n  A --> C')

  const localFrame = useStore.getState().canvas?.frames[0]
  expect(localFrame?.html).toContain('.node { color: navy; }')
})
