import { useState } from 'react'
import type { Frame } from '../../shared/types'
import {
  activateDiagramPage,
  buildDiagramHtml,
  DEFAULT_DIAGRAM_SOURCE,
  ensureDiagramPages,
  type DiagramFrame,
} from '../../shared/diagramFrame'
import { api, errorMessage } from '../lib/api'
import { beginFrameSave, useFrameSaves } from '../lib/frameSaves'
import { recordUpdate } from '../lib/history'
import { useStore } from '../lib/store'
import { receiveSavedDiagramFrame } from '../lib/diagramFrameSaves'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from './ui/dropdown-menu'
import { MoreHorizontalIcon, PlusIcon } from './ui/icons'

/** Inner pages belong to a diagram frame; frame.pageId remains its containing board. */
export function DiagramPages({
  frame,
  diagram,
  disabled = false,
  compact = false,
  tabs = false,
}: {
  frame: Frame
  diagram: DiagramFrame
  disabled?: boolean
  compact?: boolean
  tabs?: boolean
}) {
  const pending = useFrameSaves((state) => (state.pending[frame.id] ?? 0) > 0)
  const document = ensureDiagramPages(diagram)
  const pages = document.pages ?? []
  const active = pages.find((page) => page.id === document.activePageId)
  const [renaming, setRenaming] = useState(false)
  const [title, setTitle] = useState('')
  const blocked = disabled || pending || !!frame.locked

  async function persist(next: DiagramFrame) {
    if (blocked) return
    const finish = beginFrameSave(frame.id)
    try {
      const saved = await api.updateFrame(frame.id, { html: buildDiagramHtml(next) }, frame.updatedAt)
      receiveSavedDiagramFrame(saved)
      recordUpdate(frame.id, { html: frame.html }, { html: saved.html })
      setRenaming(false)
    } catch (error) {
      useStore.getState().pushNotice(errorMessage(error, 'Could not save diagram pages.'))
    } finally {
      finish()
    }
  }

  function addPage() {
    const page = {
      id: crypto.randomUUID(),
      title: `Page ${pages.length + 1}`,
      kind: diagram.kind,
      source: DEFAULT_DIAGRAM_SOURCE[diagram.kind],
    }
    void persist(activateDiagramPage({ ...document, pages: [...pages, page] }, page.id))
  }

  function deleteActivePage() {
    const remaining = pages.filter((page) => page.id !== active?.id)
    const next = remaining[0]
    if (next) void persist({ ...activateDiagramPage(document, next.id), pages: remaining })
  }

  function startRename() {
    setTitle(active?.title ?? '')
    setRenaming(true)
  }

  function saveRename() {
    if (!active) return
    void persist({
      ...document,
      pages: pages.map((page) => (page.id === active.id ? { ...page, title: title.trim() } : page)),
    })
  }

  if (tabs) {
    return (
      <nav
        aria-label="Diagram page navigation"
        className="min-w-0 flex-none border-t border-line-soft bg-surface px-3"
        data-page-tabs
      >
        <div className="flex h-[31px] min-w-0 items-stretch gap-1 overflow-x-auto overscroll-x-contain">
          <div role="tablist" aria-label="Diagram pages" className="flex w-max flex-none items-stretch">
            {pages.map((page) => {
              const selected = page.id === active?.id
              return (
                <div key={page.id} className="relative flex h-full flex-none items-stretch" data-page-tab={page.id}>
                  {renaming && selected ? (
                    <div className="flex h-full items-center gap-1 border-t-2 border-accent px-2">
                      <Input
                        aria-label="Page name"
                        className="h-6 w-32"
                        value={title}
                        disabled={blocked}
                        onChange={(event) => setTitle(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') saveRename()
                          if (event.key === 'Escape') setRenaming(false)
                        }}
                        autoFocus
                      />
                      <Button
                        variant="bare"
                        size="sm"
                        className="h-6 px-1.5"
                        disabled={blocked || !title.trim()}
                        onClick={saveRename}
                      >
                        Save
                      </Button>
                      <Button
                        variant="bare"
                        size="sm"
                        className="h-6 px-1.5"
                        disabled={pending}
                        onClick={() => setRenaming(false)}
                      >
                        Cancel
                      </Button>
                    </div>
                  ) : (
                    <>
                      <Button
                        variant="bare"
                        size="sm"
                        role="tab"
                        aria-selected={selected}
                        aria-current={selected ? 'page' : undefined}
                        disabled={blocked}
                        onClick={() => {
                          if (!selected) void persist(activateDiagramPage(document, page.id))
                        }}
                        className={`relative h-full max-w-[220px] min-w-[110px] items-center gap-2 border-t-2 px-3 py-0 text-caption transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                          selected
                            ? 'rounded-none border-x-0 border-b-0 border-t-2 border-brand bg-brand/10 pr-10 font-medium text-ink shadow-none hover:bg-brand/10 hover:text-ink'
                            : 'border-transparent text-ink-soft hover:bg-sub'
                        }`}
                        title={page.title}
                      >
                        <span className="truncate">{page.title}</span>
                      </Button>
                      {selected && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="bare"
                              size="icon-sm"
                              className="absolute right-1 top-1/2 z-10 size-5 -translate-y-1/2 rounded-none bg-transparent shadow-none hover:bg-paper-deep"
                              aria-label={`Actions for ${page.title}`}
                              disabled={blocked}
                            >
                              <MoreHorizontalIcon size="rail" aria-hidden />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent side="top" align="start" width="sm">
                            <DropdownMenuItem disabled={blocked} onSelect={startRename}>
                              Rename
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              disabled={blocked || pages.length <= 1}
                              tone="danger"
                              onSelect={deleteActivePage}
                            >
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </>
                  )}
                </div>
              )
            })}
          </div>
          <Button
            variant="bare"
            size="icon-sm"
            className="my-auto size-6 flex-none"
            aria-label="Add page"
            disabled={blocked}
            onClick={addPage}
          >
            <PlusIcon size="rail" aria-hidden />
          </Button>
        </div>
      </nav>
    )
  }

  if (compact) {
    return (
      <section className="flex min-w-0 items-center gap-1.5" aria-label="Diagram pages">
        <Select
          value={active?.id}
          disabled={blocked}
          onValueChange={(id) => void persist(activateDiagramPage(document, id))}
        >
          <SelectTrigger aria-label="Diagram page" className="h-8 w-[132px] shrink-0">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {pages.map((page) => (
              <SelectItem key={page.id} value={page.id}>
                {page.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {renaming && active ? (
          <div className="flex min-w-0 items-center gap-1">
            <Input
              aria-label="Page name"
              className="h-8 min-w-0 w-36"
              value={title}
              disabled={blocked}
              onChange={(event) => setTitle(event.target.value)}
            />
            <Button variant="ghost" size="sm" disabled={blocked || !title.trim()} onClick={saveRename}>
              Save
            </Button>
            <Button variant="ghost" size="sm" disabled={pending} onClick={() => setRenaming(false)}>
              Cancel
            </Button>
          </div>
        ) : (
          <div className="flex shrink-0 items-center gap-1">
            <Button variant="ghost" size="sm" className="h-8 px-2" disabled={blocked} onClick={addPage}>
              Add page
            </Button>
            <Button variant="ghost" size="sm" className="h-8 px-2" disabled={blocked} onClick={startRename}>
              Rename
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 px-2"
              disabled={blocked || pages.length <= 1}
              onClick={deleteActivePage}
            >
              Delete
            </Button>
          </div>
        )}
      </section>
    )
  }

  return (
    <section className="space-y-2 border-b border-line-soft px-3 py-2" aria-label="Diagram pages">
      <div className="text-label text-ink-soft">Pages</div>
      <Select
        value={active?.id}
        disabled={blocked}
        onValueChange={(id) => void persist(activateDiagramPage(document, id))}
      >
        <SelectTrigger aria-label="Diagram page">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {pages.map((page) => (
            <SelectItem key={page.id} value={page.id}>
              {page.title}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {renaming && active && (
        <div className="flex gap-1">
          <Input
            aria-label="Page name"
            value={title}
            disabled={blocked}
            onChange={(event) => setTitle(event.target.value)}
          />
          <Button
            variant="ghost"
            disabled={blocked || !title.trim()}
            onClick={() =>
              void persist({
                ...document,
                pages: pages.map((page) => (page.id === active.id ? { ...page, title: title.trim() } : page)),
              })
            }
          >
            Save
          </Button>
          <Button variant="ghost" disabled={pending} onClick={() => setRenaming(false)}>
            Cancel
          </Button>
        </div>
      )}
      <div className="flex gap-1">
        <Button
          variant="ghost"
          size="sm"
          disabled={blocked}
          onClick={() => {
            const page = {
              id: crypto.randomUUID(),
              title: `Page ${pages.length + 1}`,
              kind: diagram.kind,
              source: DEFAULT_DIAGRAM_SOURCE[diagram.kind],
            }
            void persist(activateDiagramPage({ ...document, pages: [...pages, page] }, page.id))
          }}
        >
          Add page
        </Button>
        <Button
          variant="ghost"
          size="sm"
          disabled={blocked}
          onClick={() => {
            setTitle(active?.title ?? '')
            setRenaming(true)
          }}
        >
          Rename
        </Button>
        <Button
          variant="ghost"
          size="sm"
          disabled={blocked || pages.length <= 1}
          onClick={() => {
            const remaining = pages.filter((page) => page.id !== active?.id)
            const next = remaining[0]
            if (next) void persist({ ...activateDiagramPage(document, next.id), pages: remaining })
          }}
        >
          Delete
        </Button>
      </div>
      {disabled && <p className="text-label text-ink-faint">Apply or load saved styles before switching pages.</p>}
    </section>
  )
}
