// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import type { Frame } from '../shared/types'
import { buildDiagramHtml, readDiagramFrame, type DiagramFrame } from '../shared/diagramFrame'
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
  vi.unstubAllGlobals()
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
  vi.stubGlobal('localStorage', {
    getItem: () => null,
    setItem: () => {
      throw new DOMException('quota exceeded', 'QuotaExceededError')
    },
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

it('edits only the current inner page and stores recovery under that page', async () => {
  const pages = [
    { id: 'order', title: 'Order', ...diagram },
    { id: 'payment', title: 'Payment', ...diagram, source: 'flowchart LR\n C-->D', css: '.payment{color:red}' },
  ]
  const current: DiagramFrame = { ...pages[1]!, pages, activePageId: 'payment' }
  act(() =>
    root.render(
      <DiagramSource key="payment" frame={{ ...frame, html: buildDiagramHtml(current) }} diagram={current} />,
    ),
  )
  vi.spyOn(api, 'updateFrame').mockRejectedValue(new Error('offline'))
  typeSource('flowchart LR\n C-->E')
  const edited = readDiagramFrame(useStore.getState().canvas!.frames[0]!.html)!
  expect(edited.pages?.[0]).toEqual(pages[0])
  expect(edited.pages?.[1]).toMatchObject({ source: 'flowchart LR\n C-->E', css: '.payment{color:red}' })
  expect(readDiagramDraft('local-user', frame.id, 'payment')?.source).toBe('flowchart LR\n C-->E')
  expect(readDiagramDraft('local-user', frame.id, 'order')).toBeNull()
  await act(async () => vi.advanceTimersByTimeAsync(500))
})

it('does not let an older source response overwrite a newer active page received while saving', async () => {
  let complete!: (saved: Frame) => void
  vi.spyOn(api, 'updateFrame').mockImplementation(
    () =>
      new Promise((resolve) => {
        complete = resolve
      }),
  )
  typeSource('flowchart LR\n A-->E')
  await act(async () => vi.advanceTimersByTimeAsync(500))
  const newer = {
    ...frame,
    html: buildDiagramHtml({ ...diagram, source: 'flowchart LR\n Other-->Page' }),
    updatedAt: 9,
  }
  act(() => useStore.getState().upsertFrame(newer))
  await act(async () =>
    complete({ ...frame, html: buildDiagramHtml({ ...diagram, source: 'flowchart LR\n A-->E' }), updatedAt: 6 }),
  )
  expect(useStore.getState().canvas!.frames[0]).toEqual(newer)
})

it('keeps the old singleton draft recoverable on the original page after adding inner pages', () => {
  writeDiagramDraft('local-user', frame.id, { source: 'Old->Draft: recover', baseSource: diagram.source })
  const pages = [
    { id: 'page-1', title: 'Original', ...diagram },
    { id: 'new-page', title: 'New', ...diagram, source: 'New->Page: source' },
  ]
  act(() =>
    root.render(<DiagramSource key="new" frame={frame} diagram={{ ...pages[1]!, pages, activePageId: 'new-page' }} />),
  )
  expect(container.textContent).not.toContain('Unsent diagram source')
  act(() =>
    root.render(<DiagramSource key="original" frame={frame} diagram={{ ...diagram, pages, activePageId: 'page-1' }} />),
  )
  expect(container.textContent).toContain('Unsent diagram source')
  act(() =>
    [...container.querySelectorAll<HTMLButtonElement>('button')]
      .find((button) => button.textContent === 'Discard draft')!
      .click(),
  )
  expect(readDiagramDraft('local-user', frame.id)).toBeNull()
})

it('does not offer a singleton draft on a different page after the original page was deleted', () => {
  writeDiagramDraft('local-user', frame.id, { source: 'Old->Draft: recover', baseSource: diagram.source })
  const remaining = { id: 'new-page', title: 'New', ...diagram }
  act(() =>
    root.render(
      <DiagramSource
        key="remaining"
        frame={frame}
        diagram={{ ...diagram, pages: [remaining], activePageId: remaining.id }}
      />,
    ),
  )
  expect(container.textContent).not.toContain('Unsent diagram source')
  expect(readDiagramDraft('local-user', frame.id)?.source).toBe('Old->Draft: recover')
})

it('moves a recovered singleton draft to its inner page only after local persistence succeeds', () => {
  const source = 'Old->Draft: recover'
  writeDiagramDraft('local-user', frame.id, { source, baseSource: diagram.source })
  const page = { id: 'page-1', title: 'Original', ...diagram }
  act(() =>
    root.render(
      <DiagramSource key="promoted" frame={frame} diagram={{ ...diagram, pages: [page], activePageId: page.id }} />,
    ),
  )
  act(() =>
    [...container.querySelectorAll<HTMLButtonElement>('button')]
      .find((button) => button.textContent === 'Recover source')!
      .click(),
  )
  expect(sourceInput().value).toBe(source)
  expect(readDiagramDraft('local-user', frame.id, page.id)?.source).toBe(source)
  expect(readDiagramDraft('local-user', frame.id)).toBeNull()
})

it('keeps the singleton recovery copy when the new page draft cannot be stored', () => {
  const source = 'Old->Draft: recover'
  writeDiagramDraft('local-user', frame.id, { source, baseSource: diagram.source })
  const storage = localStorage
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => storage.getItem(key),
    setItem: () => {
      throw new Error('quota')
    },
    removeItem: (key: string) => storage.removeItem(key),
  })
  const page = { id: 'page-1', title: 'Original', ...diagram }
  act(() =>
    root.render(
      <DiagramSource key="promoted" frame={frame} diagram={{ ...diagram, pages: [page], activePageId: page.id }} />,
    ),
  )
  act(() =>
    [...container.querySelectorAll<HTMLButtonElement>('button')]
      .find((button) => button.textContent === 'Recover source')!
      .click(),
  )
  expect(readDiagramDraft('local-user', frame.id)?.source).toBe(source)
  expect(readDiagramDraft('local-user', frame.id, page.id)).toBeNull()
})
