// @vitest-environment happy-dom
import { act } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, expect, it, vi } from 'vitest'
import { buildDiagramHtml, type DiagramFrame } from '../shared/diagramFrame'
import {
  DiagramEditorWorkspace,
  DiagramPreview,
  transparentPreviewHtml,
} from '../src/components/DiagramEditorWorkspace'
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
  DiagramPages: (props: { compact?: boolean; tabs?: boolean; disabled?: boolean }) => (
    <div
      data-testid="page-controls"
      data-compact={props.compact ? 'true' : 'false'}
      data-tabs={props.tabs ? 'true' : 'false'}
      data-disabled={props.disabled ? 'true' : 'false'}
    />
  ),
}))
vi.mock('../src/components/DiagramCodeEditor', () => ({
  DiagramCodeEditor: () => <div data-testid="source-editor" />,
}))

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const diagram: DiagramFrame = {
  kind: 'zenuml',
  source: 'A->B: hello',
  pages: [{ id: 'sequence', title: 'Sequence', kind: 'zenuml', source: 'A->B: hello' }],
  activePageId: 'sequence',
}
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

it('does not restart preview loading for a page-title change, but still reacts to render content changes', () => {
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  const onRenderState = vi.fn()
  const renderPreview = (current: typeof diagram) =>
    root.render(
      <DiagramPreview
        diagram={current}
        source={current.source}
        title="Live preview"
        zoom={1}
        onRenderState={onRenderState}
      />,
    )

  act(() => renderPreview(diagram))
  const iframe = container.querySelector('iframe')!
  act(() =>
    window.dispatchEvent(
      new MessageEvent('message', { source: iframe.contentWindow, data: { type: 'diagramly:frame-ready' } }),
    ),
  )
  expect(onRenderState).toHaveBeenCalledWith('loading')
  act(() => {
    window.dispatchEvent(
      new MessageEvent('message', {
        source: iframe.contentWindow,
        data: { type: 'diagramly:diagram-render-state', state: 'rendered', source: diagram.source },
      }),
    )
  })
  expect(onRenderState).toHaveBeenLastCalledWith('rendered')
  onRenderState.mockClear()

  const renamed = {
    ...diagram,
    pages: [{ ...diagram.pages![0]!, title: 'Renamed sequence' }],
  }
  act(() => renderPreview(renamed))
  expect(onRenderState).not.toHaveBeenCalledWith('loading')

  act(() => renderPreview({ ...renamed, css: '.sequence-diagram { color: red }' }))
  expect(onRenderState).toHaveBeenCalledWith('loading')
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
  expect(container.querySelector('[data-testid="page-controls"]')?.getAttribute('data-tabs')).toBe('true')
  expect(container.querySelector('.diagram-source-editor > div')?.textContent).toContain('Sequence')
  act(() => container.querySelector<HTMLButtonElement>('[aria-label="Zoom in"]')!.click())
  expect(container.querySelector('iframe')?.parentElement?.style.zoom).toBe('1.1')
})

it('locks page controls while a source save is pending, failed, or dirty', () => {
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  for (const status of [
    { saving: true, unsaved: false, saveFailed: false },
    { saving: false, unsaved: true, saveFailed: false },
    { saving: false, unsaved: false, saveFailed: true },
  ]) {
    act(() =>
      root.render(
        <DiagramEditorWorkspace
          frame={frame}
          diagram={diagram}
          canvasName="Canvas"
          source={diagram.source}
          {...status}
          onChange={() => undefined}
          onSave={() => undefined}
          onRetry={() => undefined}
          onClose={() => undefined}
        />,
      ),
    )
    expect(container.querySelector('[data-testid="page-controls"]')?.getAttribute('data-disabled')).toBe('true')
  }
})

afterEach(() => {
  act(() => root?.unmount())
  container?.remove()
  pageRoot?.remove()
  pageRoot = null
})

it('draws the diagram straight on the preview canvas, with no paper card layer', () => {
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  act(() =>
    root.render(
      <DiagramPreview
        diagram={diagram}
        source={diagram.source}
        title="Live preview"
        zoom={1}
        onRenderState={() => undefined}
      />,
    ),
  )
  const iframe = container.querySelector('iframe')!
  const zoomWrapper = iframe.parentElement!
  const canvas = zoomWrapper.parentElement!
  expect(zoomWrapper.className).not.toMatch(/bg-white|shadow/)
  expect(iframe.className).not.toMatch(/bg-white/)
  expect(canvas.className).not.toMatch(/\bp-\d/)
})

it('makes only the preview document transparent, leaving the saved/exported HTML white', () => {
  const html = buildDiagramHtml(diagram)
  expect(html).toContain('background:#fff')
  const preview = transparentPreviewHtml(html)
  expect(preview).toMatch(/background:\s*transparent\s*!important/)
  expect(preview.indexOf('transparent')).toBeGreaterThan(preview.indexOf('data-diagramly-diagram-base'))
})
