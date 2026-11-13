// @vitest-environment happy-dom
import { beforeEach, expect, it, vi } from 'vitest'
import { activateDiagramPage, buildDiagramHtml, readDiagramFrame } from '../shared/diagramFrame'
import type { Frame } from '../shared/types'
import { useStore } from '../src/lib/store'
import { duplicateFrames } from '../src/lib/frameClipboard'
import { clearHistory, recordUpdate, redo, undo } from '../src/lib/history'
import { api } from '../src/lib/api'

vi.mock('../src/lib/api', () => ({ api: { createFrame: vi.fn(), updateFrame: vi.fn(), deleteFrame: vi.fn() } }))
vi.mock('../src/lib/posthog', () => ({ posthog: { capture: vi.fn() } }))
vi.mock('../src/lib/frameBridge', () => ({ settleFrames: async () => {}, requestFrame: vi.fn() }))
const pages = [
  { id: 'sequence', title: 'Order', kind: 'zenuml' as const, source: 'A->B: create', css: '.order{color:red}' },
  {
    id: 'flow',
    title: 'Payment',
    kind: 'mermaid' as const,
    source: 'flowchart LR\n A-->B',
    css: '.payment{color:blue}',
  },
]
const diagram = { ...pages[0]!, pages, activePageId: 'sequence' }
const frame: Frame = {
  id: 'diagram',
  canvasId: 'document',
  name: 'Checkout',
  x: 0,
  y: 0,
  width: 800,
  height: 600,
  html: buildDiagramHtml(diagram),
  createdAt: 1,
  updatedAt: 1,
  updatedBy: 'User',
}
beforeEach(() => {
  clearHistory()
  vi.resetAllMocks()
  useStore.getState().setCanvas({ id: frame.canvasId, name: 'Document', frames: [frame], createdAt: 1, updatedAt: 1 })
  vi.mocked(api.createFrame).mockImplementation(async (_id, input) => {
    const created = { ...frame, ...input, id: 'duplicate' }
    useStore.getState().upsertFrame(created)
    return created
  })
  vi.mocked(api.updateFrame).mockResolvedValue(frame)
})
it('retains all inner page sources, styles and selection through duplicate undo and redo', async () => {
  duplicateFrames([frame])
  await vi.waitFor(() => expect(useStore.getState().canvas!.frames).toHaveLength(2))
  const copy = useStore.getState().canvas!.frames.find((item) => item.id === 'duplicate')!
  expect(copy.html).toBe(frame.html)
  expect(readDiagramFrame(copy.html)).toEqual(readDiagramFrame(frame.html))
  await undo()
  expect(useStore.getState().canvas!.frames).toHaveLength(1)
  await redo()
  const recreated = useStore.getState().canvas!.frames.find((item) => item.id === 'duplicate')!
  expect(readDiagramFrame(recreated.html)).toEqual(readDiagramFrame(frame.html))
})
it('undoes and redoes a page selection plus source edit without dropping the other page styles', async () => {
  const switched = activateDiagramPage(diagram, 'flow')
  const html = buildDiagramHtml({ ...switched, source: 'flowchart LR\n Paid-->Done' })
  useStore.getState().patchFrameLocal(frame.id, { html })
  recordUpdate(frame.id, { html: frame.html }, { html }, true)
  await undo()
  expect(readDiagramFrame(useStore.getState().canvas!.frames[0]!.html)).toEqual(readDiagramFrame(frame.html))
  await redo()
  const restored = readDiagramFrame(useStore.getState().canvas!.frames[0]!.html)!
  expect(restored.activePageId).toBe('flow')
  expect(restored.pages?.[0]).toEqual(pages[0])
  expect(restored.pages?.[1]).toMatchObject({ source: 'flowchart LR\n Paid-->Done', css: pages[1]!.css })
})
