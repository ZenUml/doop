// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

vi.mock('../src/lib/posthog', () => ({ posthog: { capture: vi.fn() } }))
vi.mock('../src/lib/api', () => ({
  api: { agentAllowance: () => Promise.resolve({ limit: 0, used: 0 }) },
  ApiError: class extends Error {},
}))

const { CommentComposer } = await import('../src/components/CommentPopovers')
const { LimitWall } = await import('../src/components/TeamAllowance')

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
const shell = globalThis as { __DIAGRAMLY_DESKTOP__?: unknown }

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  delete shell.__DIAGRAMLY_DESKTOP__
})

const text = () => document.body.textContent ?? ''

it('offers the @agent chips in the web comment composer', () => {
  act(() => root.render(<CommentComposer onSubmit={() => {}} onCancel={() => {}} />))
  expect(text()).toContain('@diagramly')
})

it('hides the @agent chips in the desktop comment composer, where no hosted agent exists', () => {
  shell.__DIAGRAMLY_DESKTOP__ = '1.1.0'
  act(() => root.render(<CommentComposer onSubmit={() => {}} onCancel={() => {}} />))
  expect(text()).not.toContain('@diagramly')
  expect(text()).not.toContain('@brand')
})

it('shows the plan wall on the web', () => {
  const onOpenConnect = vi.fn()
  act(() => root.render(<LimitWall canvasId="c1" onClose={() => {}} onOpenConnect={onOpenConnect} />))
  expect(text()).toContain('Connect your plan')
  expect(onOpenConnect).not.toHaveBeenCalled()
})

it('sends desktop straight to the Connect AI agent dialog instead of the dead-end plan wall', () => {
  shell.__DIAGRAMLY_DESKTOP__ = '1.1.0'
  const onOpenConnect = vi.fn()
  act(() => root.render(<LimitWall canvasId="c1" onClose={() => {}} onOpenConnect={onOpenConnect} />))
  expect(text()).not.toContain('Connect your plan')
  expect(onOpenConnect).toHaveBeenCalledTimes(1)
})

it('does not promise that an agent will pick up a typed @mention on desktop', () => {
  shell.__DIAGRAMLY_DESKTOP__ = '1.1.0'
  act(() => root.render(<CommentComposer onSubmit={() => {}} onCancel={() => {}} initialText="@diagramly tidy this" />))
  expect(text()).not.toContain('will pick this up')
})

it('keeps the pick-up promise on the web', () => {
  act(() => root.render(<CommentComposer onSubmit={() => {}} onCancel={() => {}} initialText="@diagramly tidy this" />))
  expect(text()).toContain('will pick this up')
})
