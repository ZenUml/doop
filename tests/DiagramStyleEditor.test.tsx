// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import type { Frame } from '../shared/types'
import type { DiagramFrame } from '../shared/diagramFrame'
import { DiagramStyleEditor } from '../src/components/DiagramStyleEditor'
import { clearHistory } from '../src/lib/history'
import { useFrameSaves } from '../src/lib/frameSaves'
import { useStore } from '../src/lib/store'

vi.mock('../src/lib/posthog', () => ({ posthog: { capture: vi.fn() } }))
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

type EditableDiagram = DiagramFrame & { styleSource?: string; styleMode?: string }

const frame: Frame = {
  id: 'diagram-1',
  canvasId: 'canvas-1',
  name: 'Checkout',
  x: 0,
  y: 0,
  width: 800,
  height: 600,
  html: '<html><body>old diagram</body></html>',
  createdAt: 1,
  updatedAt: 17,
  updatedBy: 'Designer',
}

let root: Root
let container: HTMLDivElement

function render(diagram: EditableDiagram = { kind: 'mermaid', source: 'flowchart LR' }) {
  act(() => root.render(<DiagramStyleEditor frame={frame} diagram={diagram} />))
}

function textarea() {
  return container.querySelector<HTMLTextAreaElement>('textarea[aria-label="Diagram styles"]')!
}

function applyButton() {
  return [...container.querySelectorAll<HTMLButtonElement>('button')].find(
    (button) => button.textContent === 'Apply styles',
  )!
}

function typeStyles(value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!
  act(() => {
    setter.call(textarea(), value)
    textarea().dispatchEvent(new Event('input', { bubbles: true }))
  })
}

beforeEach(() => {
  clearHistory()
  useFrameSaves.setState({ pending: {} })
  useStore.getState().setCanvas({
    id: frame.canvasId,
    name: 'Canvas',
    frames: [frame],
    createdAt: 1,
    updatedAt: frame.updatedAt,
  })
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  vi.stubGlobal('fetch', vi.fn())
  render()
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  useFrameSaves.setState({ pending: {} })
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

it('uses styleSource before compiled css and saves the draft with the current revision', async () => {
  render({
    kind: 'mermaid',
    source: 'flowchart LR',
    css: '.old { color: red; }',
    styleSource: '.legacy { color: blue; }',
  })
  expect(textarea().value).toBe('.legacy { color: blue; }')

  const source = '.legacy { color: green; }'
  typeStyles(source)
  const saved: Frame = {
    ...frame,
    html: '<html><body>new diagram</body></html>',
    updatedAt: 18,
  }
  vi.mocked(fetch).mockResolvedValue(
    new Response(JSON.stringify(saved), { status: 200, headers: { 'Content-Type': 'application/json' } }),
  )

  await act(async () => applyButton().click())

  expect(fetch).toHaveBeenCalledWith('/api/frames/diagram-1/diagram-style', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ source, mode: 'css', expectedUpdatedAt: frame.updatedAt }),
  })
  expect(useStore.getState().canvas?.frames[0]).toMatchObject(saved)
  expect(textarea().value).toBe(source)
  expect(applyButton().disabled).toBe(true)
})

it('keeps the style draft visible and reports an error when the server rejects it', async () => {
  const source = '.draft { color: purple; }'
  typeStyles(source)
  vi.mocked(fetch).mockResolvedValue(new Response('Compiler rejected this stylesheet.', { status: 422 }))

  await act(async () => applyButton().click())

  expect(textarea().value).toBe(source)
  expect(container.querySelector('[role="alert"]')?.textContent).toContain('Compiler rejected this stylesheet.')
  expect(useStore.getState().canvas?.frames[0]?.html).toBe(frame.html)
})

it('disables Apply while another save for the diagram is pending', () => {
  useFrameSaves.setState({ pending: { [frame.id]: 1 } })
  render()
  expect(applyButton().disabled).toBe(true)
})

it('keeps the original edit revision when a newer frame arrives while the draft is dirty', async () => {
  typeStyles('.draft {color:red}')
  act(() =>
    root.render(
      <DiagramStyleEditor frame={{ ...frame, updatedAt: 99 }} diagram={{ kind: 'mermaid', source: 'flowchart LR' }} />,
    ),
  )
  vi.mocked(fetch).mockResolvedValue(new Response('Conflict', { status: 409 }))
  await act(async () => applyButton().click())
  expect(JSON.parse(vi.mocked(fetch).mock.calls[0]![1]!.body as string).expectedUpdatedAt).toBe(17)
  expect(textarea().value).toBe('.draft {color:red}')
})

it('protects the pending style draft from edits until its save settles', async () => {
  typeStyles('.draft {color:red}')
  let finish!: (response: Response) => void
  vi.mocked(fetch).mockImplementation(
    () =>
      new Promise<Response>((resolve) => {
        finish = resolve
      }),
  )
  act(() => applyButton().click())
  expect(textarea().disabled).toBe(true)
  await act(async () => finish(new Response('Rejected', { status: 400 })))
  expect(textarea().disabled).toBe(false)
  expect(textarea().value).toBe('.draft {color:red}')
})

it('keeps unsupported legacy style syntax readable until the user selects a supported conversion target', () => {
  render({ kind: 'mermaid', source: 'flowchart LR', styleSource: '.legacy { color: red; }', styleMode: 'stylus' })
  expect(textarea().value).toBe('.legacy { color: red; }')
  expect(container.textContent).toContain('These STYLUS styles are preserved as-is.')
  expect(applyButton().disabled).toBe(true)
})
