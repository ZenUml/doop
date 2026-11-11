import { useState, type CSSProperties } from 'react'
import type { Frame } from '../../shared/types'
import { readDiagramFrame } from '../../shared/diagramFrame'
import { copyFramePng, downloadFrameExport, downloadTransparentFramePng } from '../lib/frameExport'
import { renameFrame } from '../lib/layerEdits'
import { setFramesLocked } from '../lib/layerEdits'
import { useStore } from '../lib/store'
import { useT } from '../lib/i18n'
import { cn } from '@/lib/utils'
import { DiagramSource } from './DiagramSource'
import { DiagramStyleEditor } from './DiagramStyleEditor'
import { FrameHistoryModal } from './FrameHistoryModal'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Panel, PanelClose, PanelHeader, type PanelSurface } from './ui/panel'
import { DownloadIcon, FrameIcon, LockIcon } from './ui/icons'

export function DiagramlyInspector({
  frame,
  surface = 'floating',
  className,
  style,
}: {
  frame: Frame
  surface?: PanelSurface
  className?: string
  style?: CSSProperties
}) {
  const t = useT()
  const [historyOpen, setHistoryOpen] = useState(false)
  const [stylesOpen, setStylesOpen] = useState(false)
  const [stylesBusy, setStylesBusy] = useState(false)
  const diagram = readDiagramFrame(frame.html)
  const canEdit = !frame.locked

  return (
    <Panel
      surface={surface}
      className={cn(
        surface === 'floating' && 'top-2.5 bottom-3.5 w-[244px] transition-[right] duration-150',
        surface === 'docked' && 'w-[244px] border-l',
        'max-md:overflow-y-auto max-md:overscroll-contain',
        className,
      )}
      style={style}
    >
      <PanelHeader className="pl-2.5">
        <span className="flex min-w-0 flex-1 items-center gap-1.5">
          <FrameIcon className="size-3.5 flex-none text-ink-faint" />
          <DiagramName value={frame.name} onCommit={(name) => renameFrame(frame.id, name)} />
        </span>
        <PanelClose onClick={() => useStore.getState().select(null)} />
      </PanelHeader>
      {frame.locked && (
        <div className="flex items-center justify-between gap-2 border-b border-line-soft bg-sub py-1.5 pr-2 pl-3">
          <span className="flex min-w-0 items-center gap-1.5 text-label text-ink-soft">
            <LockIcon className="size-3 flex-none" />
            {t('inspector.locked')}
          </span>
          <Button
            variant="bare"
            className="h-6 rounded-control bg-surface px-2 text-label font-normal text-ink shadow-ring"
            onClick={() => setFramesLocked([frame], false)}
          >
            {t('inspector.unlock')}
          </Button>
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <section className="border-b border-line-soft px-3 py-2">
          <h3 className="mb-1.5 flex h-5 items-center text-label font-normal text-ink-soft">
            {t('inspector.groupDiagram')}
          </h3>
          {diagram ? (
            canEdit ? (
              <DiagramSource key={frame.id} frame={frame} diagram={diagram} disabled={stylesBusy} />
            ) : (
              <p className="text-label leading-5 text-ink-faint">{t('inspector.unlockToEditDiagram')}</p>
            )
          ) : (
            <p className="text-label leading-5 text-ink-faint">{t('inspector.diagramSourceUnavailable')}</p>
          )}
          {diagram && (
            <div className="mt-2 grid grid-cols-2 gap-1.5">
              <Button
                variant="bare"
                className="h-8 rounded-control bg-sub px-2 text-label font-normal text-ink hover:bg-paper-deep max-md:min-h-10"
                title={t('inspector.copyDiagramSourceTitle')}
                onClick={() => void navigator.clipboard.writeText(diagram.source).catch(() => undefined)}
              >
                {t('common.copy')}
              </Button>
              <Button
                variant="bare"
                className="h-8 gap-1.5 rounded-control bg-sub px-2 text-label font-normal text-ink hover:bg-paper-deep max-md:min-h-10"
                title={t('inspector.downloadDiagramSourceTitle')}
                onClick={() => downloadSource(frame.name, diagram.kind, diagram.source)}
              >
                <DownloadIcon className="size-3.5" />
                {t('inspector.downloadSource')}
              </Button>
            </div>
          )}
        </section>
        {diagram && canEdit && (
          <section className="border-b border-line-soft px-3 py-2">
            <Button
              variant="bare"
              className="h-8 w-full justify-start text-label"
              aria-expanded={stylesOpen}
              disabled={stylesBusy}
              onClick={() => setStylesOpen(!stylesOpen)}
            >
              Diagram styles
            </Button>
            {stylesOpen && (
              <DiagramStyleEditor key={frame.id} frame={frame} diagram={diagram} onBusyChange={setStylesBusy} />
            )}
          </section>
        )}
        {diagram && (
          <section className="border-b border-line-soft px-3 py-2">
            <h3 className="mb-1.5 flex h-5 items-center text-label font-normal text-ink-soft">
              {t('inspector.groupExport')}
            </h3>
            <div className="grid grid-cols-2 gap-1.5">
              <Button
                variant="bare"
                className="h-8 gap-1.5 rounded-control bg-sub px-2 text-label font-normal text-ink hover:bg-paper-deep max-md:min-h-10"
                title={t('inspector.downloadDiagramPngTitle')}
                onClick={() => void downloadFrameExport(frame, 'png')}
              >
                <DownloadIcon className="size-3.5" />
                {t('inspector.downloadPng')}
              </Button>
              <Button
                variant="bare"
                className="h-8 gap-1.5 rounded-control bg-sub px-2 text-label font-normal text-ink hover:bg-paper-deep max-md:min-h-10"
                title="Download JPG"
                onClick={() => void downloadFrameExport(frame, 'jpg')}
              >
                <DownloadIcon className="size-3.5" />
                JPG
              </Button>
              <Button
                variant="bare"
                className="col-span-2 h-8 gap-1.5 rounded-control bg-sub px-2 text-label font-normal text-ink hover:bg-paper-deep max-md:min-h-10"
                title="Download transparent PNG"
                onClick={() => void downloadTransparentFramePng(frame)}
              >
                <DownloadIcon className="size-3.5" />
                PNG (transparent)
              </Button>
              <Button
                variant="bare"
                className="h-8 rounded-control bg-sub px-2 text-label font-normal text-ink hover:bg-paper-deep max-md:min-h-10"
                title={t('inspector.copyPngTitle', { scale: '1×' })}
                onClick={() => void copyFramePng(frame)}
              >
                {t('inspector.copyPng')}
              </Button>
            </div>
          </section>
        )}
      </div>
      <footer className="flex flex-none items-center justify-end border-t border-line-soft py-2 pr-2 pl-3">
        <Button
          variant="bare"
          size="sm"
          className="h-8 rounded-control px-2 text-label font-normal"
          onClick={() => setHistoryOpen(true)}
        >
          {t('inspector.history')}
        </Button>
      </footer>
      {historyOpen && <FrameHistoryModal frame={frame} onClose={() => setHistoryOpen(false)} />}
    </Panel>
  )
}

function DiagramName({ value, onCommit }: { value: string; onCommit: (name: string) => void }) {
  const t = useT()
  const [draft, setDraft] = useState(value)
  const [seen, setSeen] = useState(value)
  if (seen !== value) {
    setSeen(value)
    setDraft(value)
  }
  return (
    <Input
      variant="bare"
      inputSize="auto"
      aria-label={t('inspector.diagramName')}
      className="h-7 min-w-0 flex-1 truncate rounded-control px-1 text-body font-medium hover:bg-sub focus:bg-surface focus:shadow-elevation-1-focus max-md:min-h-10"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => draft !== value && onCommit(draft)}
      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
    />
  )
}

function downloadSource(name: string, kind: 'zenuml' | 'mermaid', source: string) {
  const blob = new Blob([source], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `${name || 'diagram'}.${kind === 'mermaid' ? 'mmd' : 'zenuml'}`
  anchor.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 0)
}
