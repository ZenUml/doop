// @vitest-environment happy-dom
import { act } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, expect, it, vi } from 'vitest'
import { buildDiagramHtml } from '../shared/diagramFrame'
import { DiagramEditorWorkspace, DiagramPreview } from '../src/components/DiagramEditorWorkspace'
import type { Frame } from '../shared/types'

vi.mock('../src/components/ui/modal', async () => {
  const React = await import('react')
  return {
    Modal: (props: { className?: string; style?: CSSProperties; overlayStyle?: CSSProperties; children: ReactNode }) =>
      React.createElement(
        'div',
        {
          'data-testid': 'workspace-modal',
          'data-overlay-top': props.overlayStyle?.top,
          className: props.className,
          style: props.style,
        },
        props.children,
      ),
    ModalTitle: (props: { className?: string; children: ReactNode }) =>
      React.createElement('span', { className: props.className }, props.children),
  }
})
vi.mock('../src/components/DiagramPages', () => ({
  DiagramPages: (props: { compact?: boolean }) => (
    <div data-testid="page-controls" data-compact={props.compact ? 'true' : 'false'} />
  ),
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
let pageRoot: HTMLDivElement | null = null

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
  pageRoot = document.createElement('div')
  pageRoot.style.position = 'fixed'
  pageRoot.style.top = '40px'
  pageRoot.setAttribute('data-canvas-page-root', '')
  pageRoot.getBoundingClientRect = () => ({ top: 40 }) as DOMRect
  document.body.append(pageRoot)
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
  expect(modal.style.top).toBe('40px')
  expect(modal.style.width).toBe('100vw')
  expect(modal.style.height).toBe('calc(100dvh - 40px)')
  expect(modal.dataset.overlayTop).toBe('40')
  expect(container.textContent).toContain('Back to board')
  expect(container.querySelectorAll('[data-testid="page-controls"]')).toHaveLength(1)
  expect(container.querySelector('[data-testid="page-controls"]')?.getAttribute('data-compact')).toBe('true')
  act(() => container.querySelector<HTMLButtonElement>('[aria-label="Zoom in"]')!.click())
  expect(container.querySelector('iframe')?.parentElement?.style.zoom).toBe('1.1')
})

afterEach(() => {
  act(() => root?.unmount())
  container?.remove()
  pageRoot?.remove()
  pageRoot = null
})
