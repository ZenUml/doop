import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { DiagramFrame } from '../../shared/diagramFrame'
import { buildDiagramHtml } from '../../shared/diagramFrame'
import type { Frame } from '../../shared/types'
import { FRAME_BOOTSTRAP } from '../lib/frameRuntime'
import { downloadFrameExport } from '../lib/frameExport'
import { useT } from '../lib/i18n'
import { Button } from './ui/button'
import { Modal, ModalTitle } from './ui/modal'
import { Tabs, TabsList, TabsTrigger } from './ui/tabs'
import { DiagramCodeEditor } from './DiagramCodeEditor'
import { DiagramPages } from './DiagramPages'

function useNarrowLayout() {
  const [narrow, setNarrow] = useState(() => window.matchMedia('(max-width: 760px)').matches)
  useEffect(() => {
    const query = window.matchMedia('(max-width: 760px)')
    const update = () => setNarrow(query.matches)
    update()
    query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, [])
  return narrow
}

export function DiagramPreview({
  diagram,
  source,
  title,
  onRenderState,
  zoom,
}: {
  diagram: DiagramFrame
  source: string
  title: string
  zoom: number
  onRenderState: (state: 'loading' | 'rendered' | 'error') => void
}) {
  const t = useT()
  const iframe = useRef<HTMLIFrameElement | null>(null)
  const [ready, setReady] = useState(false)
  const currentSource = useRef(source)
  const onRenderStateRef = useRef(onRenderState)
  useLayoutEffect(() => {
    currentSource.current = source
    onRenderStateRef.current = onRenderState
  }, [source, onRenderState])
  const html = buildDiagramHtml({
    kind: diagram.kind,
    source,
    ...(diagram.css !== undefined ? { css: diagram.css } : {}),
    ...(diagram.styleSource !== undefined ? { styleSource: diagram.styleSource } : {}),
    ...(diagram.styleMode !== undefined ? { styleMode: diagram.styleMode } : {}),
    ...(diagram.styleConfig !== undefined ? { styleConfig: diagram.styleConfig } : {}),
    ...(diagram.styleHtml !== undefined ? { styleHtml: diagram.styleHtml } : {}),
  })

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (event.source !== iframe.current?.contentWindow) return
      if (event.data?.type === 'diagramly:frame-ready') setReady(true)
      if (event.data?.type === 'diagramly:diagram-render-state' && event.data.source === currentSource.current) {
        onRenderStateRef.current(event.data.state === 'error' ? 'error' : 'rendered')
      }
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [])

  useEffect(() => {
    if (!ready) return
    onRenderStateRef.current('loading')
    iframe.current?.contentWindow?.postMessage({ type: 'diagramly:html', html }, '*')
  }, [html, ready])

  return (
    <div className="flex h-full w-full items-start justify-center overflow-auto bg-sub p-6">
      <div
        className="h-full min-h-[480px] w-full min-w-[520px] origin-top-left bg-white shadow-[0_1px_4px_rgba(20,24,35,0.08)]"
        style={{ zoom }}
      >
        <iframe
          ref={iframe}
          className="h-full w-full border-0 bg-white"
          title={title}
          aria-label={`${title}, ${t('inspector.readOnlyPreview')}`}
          tabIndex={-1}
          style={{ pointerEvents: 'none' }}
          sandbox="allow-scripts"
          srcDoc={FRAME_BOOTSTRAP}
        />
      </div>
    </div>
  )
}

export function DiagramEditorWorkspace({
  frame,
  diagram,
  canvasName,
  source,
  saving,
  unsaved,
  saveFailed,
  onChange,
  onSave,
  onRetry,
  onClose,
}: {
  frame: Frame
  diagram: DiagramFrame
  canvasName: string
  source: string
  saving: boolean
  unsaved: boolean
  saveFailed: boolean
  onChange: (source: string) => void
  onSave: () => void
  onRetry: () => void
  onClose: () => void
}) {
  const t = useT()
  const narrow = useNarrowLayout()
  const [mobileTab, setMobileTab] = useState<'source' | 'preview'>('source')
  const [editorPercent, setEditorPercent] = useState(40)
  const [zoom, setZoom] = useState(1)
  const [wrap, setWrap] = useState(false)
  const [renderState, setRenderState] = useState<'loading' | 'rendered' | 'error'>('loading')
  const [topInset, setTopInset] = useState(0)
  const split = useRef<HTMLDivElement | null>(null)
  const dragging = useRef(false)
  const sourceId = diagram.activePageId ?? 'default'
  const activePageTitle = diagram.pages?.find((page) => page.id === diagram.activePageId)?.title ?? 'Page 1'
  useLayoutEffect(() => {
    const measure = () => {
      const pageRoot = document.querySelector<HTMLElement>('[data-canvas-page-root]')
      setTopInset(Math.max(0, Math.round(pageRoot?.getBoundingClientRect().top ?? 0)))
    }
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [])
  const workspaceHeight = `calc(100dvh - ${topInset}px)`

  return (
    <Modal
      open
      onClose={onClose}
      size="xl"
      showClose={false}
      aria-label={t('inspector.diagramWorkspace')}
      overlayClassName="!bg-white"
      overlayStyle={{ top: topInset }}
      style={{ left: 0, top: topInset, width: '100vw', height: workspaceHeight, maxWidth: 'none' }}
      className="!m-0 !max-h-none !max-w-none !translate-x-0 !translate-y-0 !overflow-hidden !rounded-none !p-0"
    >
      <div className="flex min-h-0 flex-col bg-surface" style={{ height: workspaceHeight }}>
        <header className="flex h-[58px] flex-none items-center gap-4 border-b border-line-soft px-5">
          <Button variant="ghost" size="sm" onClick={onClose}>
            ‹ {t('inspector.backToBoard')}
          </Button>
          <div className="min-w-0 flex-1 text-caption text-ink-faint">
            {canvasName} <span className="px-1">/</span> {t('inspector.boardContext')}
          </div>
          <ModalTitle className="min-w-0 flex-1 truncate text-center">{frame.name}</ModalTitle>
          <div
            className="ml-auto flex flex-1 items-center justify-end gap-2 text-caption text-ink-faint"
            role="status"
            aria-live="polite"
          >
            <span
              className={`size-1.5 rounded-full ${saveFailed ? 'bg-accent-ink' : saving || unsaved ? 'bg-amber-500' : 'bg-emerald-600'}`}
            />
            {saving
              ? t('inspector.saving')
              : saveFailed
                ? t('inspector.saveFailed')
                : unsaved
                  ? t('inspector.unsavedDiagramChanges')
                  : t('inspector.savedToDiagram')}
            {(unsaved || saveFailed) && !saving && (
              <Button variant="bare" size="sm" className="h-7 px-2" onClick={onRetry}>
                {t('inspector.retrySave')}
              </Button>
            )}
          </div>
        </header>

        {narrow && (
          <Tabs value={mobileTab} onValueChange={(value) => setMobileTab(value as 'source' | 'preview')}>
            <TabsList variant="line" className="mx-3 mt-2 h-9 w-auto">
              <TabsTrigger value="source">{t('inspector.diagramSource')}</TabsTrigger>
              <TabsTrigger value="preview">{t('inspector.diagramPreview')}</TabsTrigger>
            </TabsList>
          </Tabs>
        )}

        <div ref={split} className="flex min-h-0 flex-1 overflow-hidden">
          <section
            aria-label={t('inspector.diagramSource')}
            className={`diagram-source-editor min-h-0 min-w-0 flex-col overflow-hidden bg-code ${narrow ? (mobileTab === 'source' ? 'flex flex-1' : 'hidden') : 'flex'}`}
            style={narrow ? undefined : { width: `${editorPercent}%` }}
          >
            <div className="flex h-10 flex-none items-center justify-between gap-3 border-b border-code-ink/10 bg-code px-4 text-label text-code-ink">
              <span className="min-w-0 truncate font-medium">{activePageTitle}</span>
              <span className="text-code-ink/65">{diagram.kind === 'zenuml' ? 'ZenUML' : 'Mermaid'}</span>
              <Button
                variant="inverse"
                size="sm"
                aria-pressed={wrap}
                className="ml-auto h-7 px-2 text-caption text-code-ink/70"
                onClick={() => setWrap((current) => !current)}
              >
                {t('inspector.wrapLines')}
              </Button>
            </div>
            <div className="min-h-0 flex-1">
              <DiagramCodeEditor
                key={sourceId}
                kind={diagram.kind}
                value={source}
                wrap={wrap}
                onChange={onChange}
                onSave={onSave}
              />
            </div>
            <footer className="flex h-8 flex-none items-center justify-between gap-2 border-t border-code-ink/10 bg-code px-4 text-micro text-code-ink/55">
              <span>
                {diagram.kind === 'zenuml' ? 'ZenUML' : 'Mermaid'} · {t('inspector.spacesTwo')}
              </span>
              <span>
                ⌘Z {t('inspector.undo')}　⌘/ {t('inspector.commentCode')}　⌘F {t('inspector.find')}
              </span>
            </footer>
          </section>
          {!narrow && (
            <div
              role="separator"
              tabIndex={0}
              aria-label={t('inspector.resizeDiagramPanes')}
              aria-orientation="vertical"
              aria-valuemin={25}
              aria-valuemax={65}
              aria-valuenow={Math.round(editorPercent)}
              className="z-10 w-1.5 flex-none touch-none cursor-col-resize bg-line-soft transition-colors hover:bg-ink/20 focus-visible:bg-ink/25 focus-visible:outline-none"
              onKeyDown={(event) => {
                if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
                event.preventDefault()
                setEditorPercent((current) =>
                  Math.max(25, Math.min(65, current + (event.key === 'ArrowRight' ? 2 : -2))),
                )
              }}
              onPointerDown={(event) => {
                if (event.button !== 0) return
                event.preventDefault()
                dragging.current = true
                event.currentTarget.setPointerCapture(event.pointerId)
              }}
              onPointerMove={(event) => {
                if (!dragging.current || !split.current) return
                const rect = split.current.getBoundingClientRect()
                setEditorPercent(Math.max(25, Math.min(65, ((event.clientX - rect.left) / rect.width) * 100)))
              }}
              onPointerUp={() => {
                dragging.current = false
              }}
              onPointerCancel={() => {
                dragging.current = false
              }}
            />
          )}
          <section
            aria-label={t('inspector.diagramPreview')}
            className={`flex min-h-0 min-w-0 flex-1 flex-col bg-white ${narrow ? (mobileTab === 'preview' ? 'flex' : 'hidden') : ''}`}
          >
            <div className="flex h-10 flex-none items-center border-b border-line-soft px-5 text-label text-ink-soft">
              <ModalTitle className="text-body">{t('inspector.diagramPreview')}</ModalTitle>
              <span className="ml-2 rounded-pill bg-sub px-2 py-0.5 text-micro text-ink-faint">
                {t('inspector.readOnlyPreview')}
              </span>
              <span
                className="ml-4 flex items-center gap-1.5 text-caption text-ink-faint"
                role="status"
                aria-live="polite"
              >
                <span
                  className={`size-1.5 rounded-full ${renderState === 'error' ? 'bg-accent-ink' : renderState === 'rendered' ? 'bg-emerald-600' : 'bg-ink-faint'}`}
                />
                {renderState === 'error'
                  ? t('inspector.showingLastValidPreview')
                  : renderState === 'rendered'
                    ? t('inspector.previewUpToDate')
                    : t('inspector.previewUpdating')}
              </span>
              <div className="ml-auto flex items-center gap-1.5">
                <Button
                  variant="bare"
                  size="icon-sm"
                  aria-label={t('inspector.zoomOut')}
                  onClick={() => setZoom((value) => Math.max(0.5, value - 0.1))}
                >
                  −
                </Button>
                <span className="min-w-10 text-center text-caption text-ink-soft">{Math.round(zoom * 100)}%</span>
                <Button
                  variant="bare"
                  size="icon-sm"
                  aria-label={t('inspector.zoomIn')}
                  onClick={() => setZoom((value) => Math.min(2, value + 0.1))}
                >
                  +
                </Button>
                <Button variant="bare" size="sm" onClick={() => setZoom(1)}>
                  {t('inspector.fitPreview')}
                </Button>
                <Button
                  variant="solid"
                  size="sm"
                  className="ml-3 min-w-24"
                  onClick={() => void downloadFrameExport(frame, 'png')}
                >
                  {t('inspector.exportPng')}
                </Button>
              </div>
            </div>
            <div className="min-h-0 flex-1" data-preview-canvas>
              <DiagramPreview
                diagram={diagram}
                source={source}
                title={t('inspector.diagramPreview')}
                zoom={zoom}
                onRenderState={setRenderState}
              />
            </div>
            <DiagramPages frame={frame} diagram={diagram} tabs disabled={saving || unsaved || saveFailed} />
          </section>
        </div>
        <div className="flex h-7 flex-none items-center border-t border-line-soft bg-surface px-5 text-micro text-ink-faint">
          {saving
            ? t('inspector.savingDiagramChanges')
            : saveFailed
              ? t('inspector.saveFailed')
              : unsaved
                ? t('inspector.unsavedDiagramChanges')
                : t('inspector.diagramChangesSaved')}
        </div>
      </div>
    </Modal>
  )
}
