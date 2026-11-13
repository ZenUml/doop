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

/** Inner pages belong to a diagram frame; frame.pageId remains its containing board. */
export function DiagramPages({
  frame,
  diagram,
  disabled = false,
}: {
  frame: Frame
  diagram: DiagramFrame
  disabled?: boolean
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
