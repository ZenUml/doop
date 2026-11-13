import { useMemo, useState } from 'react'
import type { Frame } from '../../shared/types'
import { usePageCanvas } from '../lib/pages'
import { renameFrame, setFrameHidden, setFramesLocked, shiftFrame } from '../lib/layerEdits'
import { canEditOpenCanvas, useStore } from '../lib/store'
import { cn } from '@/lib/utils'
import { useT } from '../lib/i18n'
import { FrameContextMenu } from './FrameContextMenu'
import { PagesPanel } from './PagesPanel'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Panel, PanelBody, PanelClose, PanelHeader, type PanelResize, type PanelSurface } from './ui/panel'
import { ContextMenu, ContextMenuTrigger } from './ui/context-menu'
import { EyeClosedIcon, EyeIcon, FrameIcon, LockIcon, LockOpenIcon, PanelCollapseIcon, PlusIcon } from './ui/icons'
import { Tooltip } from './ui/tooltip'
import { SearchField } from './ui/search-field'

export function DiagramlyContents({
  onAddFrame,
  surface = 'floating',
  onClose,
  resize,
}: {
  onAddFrame: () => void
  surface?: PanelSurface
  onClose?: () => void
  resize?: PanelResize
}) {
  const t = useT()
  const pageCanvas = usePageCanvas()
  const frames = useMemo(() => [...(pageCanvas?.frames ?? [])].reverse(), [pageCanvas])
  const selectedId = useStore((s) => s.selectedId)
  const readOnly = useStore((s) => !canEditOpenCanvas(s))
  const [query, setQuery] = useState('')
  const [renaming, setRenaming] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const setLayersOpen = useStore((s) => s.setLayersOpen)
  const visible = frames.filter((frame) => frame.name.toLowerCase().includes(query.trim().toLowerCase()))
  const activeFrames = pageCanvas?.frames ?? []

  function activate(frame: Frame) {
    const store = useStore.getState()
    store.pickElement(null)
    store.setElementPanelOpen(false)
    store.select(frame.id)
    store.setInspectorOpen(true)
  }

  function startRename(frame: Frame) {
    setRenaming(frame.id)
    setDraft(frame.name)
  }

  function commitRename(frame: Frame) {
    if (draft.trim() && draft.trim() !== frame.name) renameFrame(frame.id, draft)
    setRenaming(null)
  }

  return (
    <Panel
      surface={surface}
      resize={resize}
      className={cn(surface === 'floating' && 'top-2.5 bottom-3.5 w-[264px]', surface === 'docked' && 'w-[264px]')}
    >
      <PanelHeader className="h-10 pl-3">
        <span className="min-w-0 flex-1 truncate text-label font-medium text-ink">{t('panels.contentsTitle')}</span>
        {onClose ? (
          <PanelClose label={t('common.close')} onClick={onClose} />
        ) : (
          <Tooltip label={t('panels.layersCollapsePanel')} side="bottom" align="end">
            <Button
              variant="bare"
              size="icon-sm"
              className="size-7 shrink-0 rounded-control text-ink-faint hover:bg-paper-deep hover:text-ink"
              aria-label={t('panels.layersCollapsePanel')}
              onClick={() => setLayersOpen(false)}
            >
              <PanelCollapseIcon className="size-3.5" />
            </Button>
          </Tooltip>
        )}
      </PanelHeader>
      <PagesPanel />
      <div className="mt-1.5 flex h-7 flex-none items-center justify-between pr-2.5 pl-3.5">
        <span className="text-label font-medium text-ink-soft">{t('panels.contentsTitle')}</span>
        {!readOnly && (
          <Button
            variant="bare"
            size="icon-sm"
            className="size-6 rounded-control text-ink-faint hover:bg-paper-deep hover:text-ink"
            aria-label={t('canvas.newDiagram')}
            onClick={onAddFrame}
          >
            <PlusIcon className="size-3.5" />
          </Button>
        )}
      </div>
      <PanelBody className="min-h-0 px-2 pb-2" role="list" aria-label={t('panels.contentsTitle')}>
        {frames.length === 0 && (
          <div className="px-3 py-6 text-center text-label text-ink-faint">{t('panels.contentsEmpty')}</div>
        )}
        {frames.length > 0 && visible.length === 0 && (
          <div className="px-3 py-6 text-center text-label text-ink-faint">
            {t('panels.layersNoMatch', { query: query.trim() })}
          </div>
        )}
        {visible.map((frame) => {
          const pasteAt = { current: { x: window.innerWidth / 2, y: window.innerHeight / 2 } }
          const selected = frame.id === selectedId
          return (
            <ContextMenu key={frame.id}>
              <ContextMenuTrigger asChild>
                <div
                  role="listitem"
                  aria-current={selected ? 'true' : undefined}
                  className={cn(
                    'group flex h-8 items-center gap-1 rounded-row px-1 text-body text-ink-soft hover:bg-sub',
                    selected && 'bg-paper-deep font-medium text-ink',
                    frame.hidden && 'opacity-60',
                  )}
                  onContextMenu={() => activate(frame)}
                >
                  {renaming === frame.id ? (
                    <Input
                      autoFocus
                      aria-label={t('panels.layersName')}
                      variant="bare"
                      inputSize="auto"
                      className="h-6 min-w-0 flex-1 bg-surface px-1 text-label text-ink shadow-elevation-1-focus"
                      value={draft}
                      onChange={(event) => setDraft(event.target.value)}
                      onBlur={() => commitRename(frame)}
                      onClick={(event) => event.stopPropagation()}
                      onKeyDown={(event) => {
                        event.stopPropagation()
                        if (event.key === 'Enter' || event.key === 'Escape') {
                          event.preventDefault()
                          if (event.key === 'Escape') setRenaming(null)
                          else commitRename(frame)
                        }
                      }}
                    />
                  ) : (
                    <Button
                      variant="bare"
                      className="h-8 min-w-0 flex-1 justify-start gap-1.5 px-1 text-body"
                      aria-label={frame.name}
                      onClick={() => activate(frame)}
                      onDoubleClick={() => !readOnly && startRename(frame)}
                    >
                      <FrameIcon className="size-3.5 flex-none text-ink-faint" />
                      <span className="truncate">{frame.name}</span>
                    </Button>
                  )}
                  {!readOnly && (
                    <div className="flex flex-none items-center gap-0.5 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100">
                      <RowAction
                        label={frame.hidden ? t('panels.layersShow') : t('panels.layersHide')}
                        onClick={() => setFrameHidden(frame, !frame.hidden)}
                      >
                        {frame.hidden ? <EyeClosedIcon className="size-3.5" /> : <EyeIcon className="size-3.5" />}
                      </RowAction>
                      <RowAction
                        label={frame.locked ? t('panels.layersUnlock') : t('panels.layersLock')}
                        onClick={() => setFramesLocked([frame], !frame.locked)}
                      >
                        {frame.locked ? <LockIcon className="size-3" /> : <LockOpenIcon className="size-3" />}
                      </RowAction>
                      <RowAction
                        label={t('panels.contentsMoveForward')}
                        disabled={readOnly || frame.locked}
                        onClick={() => shiftFrame(activeFrames, frame.id, -1)}
                      >
                        ↑
                      </RowAction>
                      <RowAction
                        label={t('panels.contentsMoveBackward')}
                        disabled={readOnly || frame.locked}
                        onClick={() => shiftFrame(activeFrames, frame.id, 1)}
                      >
                        ↓
                      </RowAction>
                    </div>
                  )}
                </div>
              </ContextMenuTrigger>
              <FrameContextMenu frame={frame} at={pasteAt} onRename={() => startRename(frame)} />
            </ContextMenu>
          )
        })}
      </PanelBody>
      <footer className="flex-none px-2.5 pt-1 pb-2.5">
        <SearchField
          variant="ring"
          className="h-8"
          inputClassName="text-label placeholder:text-ink-ghost"
          placeholder={t('panels.contentsSearch')}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </footer>
    </Panel>
  )
}

function RowAction({
  label,
  disabled = false,
  onClick,
  children,
}: {
  label: string
  disabled?: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <Button
      variant="bare"
      size="icon-sm"
      aria-label={label}
      title={label}
      disabled={disabled}
      className="size-5 rounded-row p-0 text-ink-faint hover:bg-ink/10 hover:text-ink disabled:opacity-40 max-md:size-7"
      onClick={(event) => {
        event.stopPropagation()
        onClick()
      }}
    >
      {children}
    </Button>
  )
}
