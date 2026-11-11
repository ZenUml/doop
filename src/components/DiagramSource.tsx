import { useRef, useState } from 'react'
import type { Frame } from '../../shared/types'
import { buildDiagramHtml, type DiagramFrame } from '../../shared/diagramFrame'
import { useStore } from '../lib/store'
import { api, errorMessage } from '../lib/api'
import { beginFrameSave } from '../lib/frameSaves'
import { recordUpdate } from '../lib/history'
import { Textarea } from './ui/textarea'
import { t as translate, useT } from '../lib/i18n'

/* long enough that a burst of typing is one save and one undo step */
const SAVE_DELAY_MS = 500

/**
 * The source editor of a diagram frame (spike). Every keystroke rebuilds the
 * frame's HTML and puts it in the store, so the frame re-renders at once; the
 * save to the server, and with it the broadcast to everyone else on the
 * canvas, follows when the typing pauses.
 *
 * Mount it with `key={frame.id}`: a draft belongs to one frame.
 */
export function DiagramSource({ frame, diagram }: { frame: Frame; diagram: DiagramFrame }) {
  const t = useT()
  const [draft, setDraft] = useState(diagram.source)
  const [typing, setTyping] = useState(false)
  const queued = useRef<{ timer: number; finish: () => void; before: string } | null>(null)

  async function save(html: string, before: string, finish: () => void) {
    recordUpdate(frame.id, { html: before }, { html })
    try {
      await api.updateFrame(frame.id, { html })
    } catch (error) {
      useStore.getState().pushNotice(errorMessage(error, translate('inspector.saveFailed')))
    } finally {
      finish()
    }
  }

  function onSourceChange(source: string) {
    setDraft(source)
    const html = buildDiagramHtml({ kind: diagram.kind, source })
    /* the HTML as it was before this burst of typing: what undo goes back to */
    const before = queued.current?.before ?? frame.html
    if (queued.current) {
      window.clearTimeout(queued.current.timer)
      queued.current.finish()
    }
    useStore.getState().patchFrameLocal(frame.id, { html })
    const finish = beginFrameSave(frame.id)
    const timer = window.setTimeout(() => {
      if (queued.current?.timer === timer) queued.current = null
      void save(html, before, finish)
    }, SAVE_DELAY_MS)
    queued.current = { timer, finish, before }
  }

  return (
    <Textarea
      variant="code"
      className="h-[320px] flex-none max-md:h-auto max-md:min-h-[160px]"
      /* while the field has the keyboard the draft wins; otherwise the frame
         does, so a teammate's or an agent's edit shows up here */
      value={typing ? draft : diagram.source}
      spellCheck={false}
      aria-label={t('inspector.diagramSource')}
      onFocus={() => {
        setDraft(diagram.source)
        setTyping(true)
      }}
      onBlur={() => setTyping(false)}
      onChange={(event) => onSourceChange(event.target.value)}
    />
  )
}
