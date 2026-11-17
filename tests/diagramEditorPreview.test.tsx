// @vitest-environment happy-dom
import { act } from 'react'
import type { ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, expect, it, vi } from 'vitest'
import { buildDiagramHtml } from '../shared/diagramFrame'
import { DiagramEditorWorkspace, DiagramPreview } from '../src/components/DiagramEditorWorkspace'
import type { Frame } from '../shared/types'

vi.mock('../src/components/ui/modal', async () => {
  const React = await import('react')
  return {
    Modal: (props: { className?: string; children: ReactNode }) =>
      React.createElement('div', { 'data-testid': 'workspace-modal', className: props.className }, props.children),
    ModalTitle: (props: { className?: string; children: ReactNode }) =>
      React.createElement('span', { className: props.className }, props.children),
  }
})
vi.mock('../src/components/DiagramPages', () => ({
  DiagramPages: () => <div data-testid="page-controls" />,
}))
vi.mock('../src/components/DiagramCodeEditor', () => ({
  DiagramCodeEditor: () => <div data-testid="source-editor" />,
}))

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const diagram = { kind: 'zenuml' as const, source: 'A->B: hello' }
const frame: Frame = {
  id: 'preview-frame',
  canvasId: 'canvas',
  name: 'Preview',
  x: 0,
  y: 0,
  width: 800,
  height: 600,
  createdAt: 1,
  updatedAt: 1,
  updatedBy: 'Test',
  html: buildDiagramHtml(diagram),
}
let root: Root
let container: HTMLDivElement

it('keeps the diagram preview read-only while retaining parent-controlled zoom', () => {
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  act(() =>
    root.render(
      <DiagramPreview
        diagram={diagram}
        source={diagram.source}
        title="Live preview"
        zoom={1.2}
        onRenderState={() => undefined}
      />,
    ),
  )

  const iframe = container.querySelector('iframe')!
  expect(iframe.style.pointerEvents).toBe('none')
  expect(iframe.tabIndex).toBe(-1)
  expect(iframe.getAttribute('aria-label')).toContain('Read-only preview')
  expect(iframe.parentElement?.style.zoom).toBe('1.2')
})

it('fills the desktop viewport, keeps the board header visible, and retains preview zoom controls', () => {
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  act(() =>
    root.render(
      <DiagramEditorWorkspace
        frame={frame}
        diagram={diagram}
        canvasName="Canvas"
        source={diagram.source}
        saving={false}
        unsaved={false}
        saveFailed={false}
        onChange={() => undefined}
        onSave={() => undefined}
        onRetry={() => undefined}
        onClose={() => undefined}
      />,
    ),
  )

  const modal = container.querySelector<HTMLElement>('[data-testid="workspace-modal"]')!
  expect(modal.className).toContain('!w-full')
  expect(modal.className).toContain('!h-[calc(100dvh-var(--app-inset,0px))]')
  expect(container.textContent).toContain('Back to board')
  expect(container.querySelectorAll('[data-testid="page-controls"]')).toHaveLength(1)
  act(() => container.querySelector<HTMLButtonElement>('[aria-label="Zoom in"]')!.click())
  expect(container.querySelector('iframe')?.parentElement?.style.zoom).toBe('1.1')
})

afterEach(() => {
  act(() => root?.unmount())
  container?.remove()
})
