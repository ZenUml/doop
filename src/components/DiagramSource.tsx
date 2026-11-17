import { useEffect, useRef, useState } from 'react'
import type { Frame } from '../../shared/types'
import { buildDiagramHtml, readDiagramFrame, type DiagramFrame } from '../../shared/diagramFrame'
import { useStore } from '../lib/store'
import { receiveSavedDiagramFrame } from '../lib/diagramFrameSaves'
import { api, errorMessage } from '../lib/api'
import { beginFrameSave } from '../lib/frameSaves'
import { recordUpdate } from '../lib/history'
import { authClient } from '../lib/auth'
import { clearDiagramDraft, readDiagramDraft, writeDiagramDraft } from '../lib/diagramDrafts'
import { Button } from './ui/button'
import { Callout } from './ui/callout'
import { Textarea } from './ui/textarea'
import { t as translate, useT } from '../lib/i18n'
import { DiagramEditorWorkspace } from './DiagramEditorWorkspace'

/* long enough that a burst of typing is one save and one undo step */
const SAVE_DELAY_MS = 500

/**
 * The source editor of a diagram frame (spike). Every keystroke rebuilds the
 * frame's HTML and puts it in the store, so the frame re-renders at once; the
 * save to the server, and with it the broadcast to everyone else on the
 * canvas, follows when the typing pauses.
 *
 * Mount it with a frame + active page key: a draft belongs to one inner page.
 */
export function DiagramSource({
  frame,
  diagram,
  canvasName = '',
  disabled = false,
  workspace = false,
  onCloseWorkspace,
}: {
  frame: Frame
  diagram: DiagramFrame
  canvasName?: string
  disabled?: boolean
  workspace?: boolean
  onCloseWorkspace?: () => void
}) {
  const t = useT()
  const { data: session } = authClient.useSession()
  const userId = session?.user.id
  const [draft, setDraft] = useState(diagram.source)
  const [draftActive, setDraftActive] = useState(false)
  const [draftOwner, setDraftOwner] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [dismissedDraftKey, setDismissedDraftKey] = useState<string | null>(null)
  const queued = useRef<{ timer: number; finish: () => void; source: string; html: string } | null>(null)
  const saveRef = useRef<(source: string, html: string, finish: () => void) => void>(() => undefined)
  const saveQueue = useRef<Promise<void>>(Promise.resolve())
  const latestLocalHtml = useRef<string | null>(null)
  const committedSource = useRef(diagram.source)
  const committedHtml = useRef(frame.html)
  const latestUpdatedAt = useRef(frame.updatedAt)
  const currentDraftSource = useRef(diagram.source)
  const storageFailureNotified = useRef(false)

  useEffect(() => {
    if (!draftActive && !saving && !queued.current) {
      committedSource.current = diagram.source
      committedHtml.current = frame.html
      latestUpdatedAt.current = Math.max(latestUpdatedAt.current, frame.updatedAt)
    }
  }, [diagram.source, draftActive, frame.html, frame.updatedAt, saving])

  useEffect(() => {
    saveRef.current = save
  })

  useEffect(
    () => () => {
      const queuedSave = queued.current
      if (!queuedSave) return
      window.clearTimeout(queuedSave.timer)
      queued.current = null
      void saveRef.current(queuedSave.source, queuedSave.html, queuedSave.finish)
    },
    [],
  )

  // The first inner page is the original singleton. Keep its old draft reachable
  // after promotion, including when the promotion is undone through history.
  const originalPage = diagram.activePageId === 'page-1' && diagram.pages?.[0]?.id === diagram.activePageId
  const legacyDraft = userId && originalPage ? readDiagramDraft(userId, frame.id) : null
  const pageDraft = userId ? readDiagramDraft(userId, frame.id, diagram.activePageId) : null
  const localDraft = pageDraft ?? legacyDraft
  const recoveryPageId = pageDraft ? diagram.activePageId : undefined
  const activeForThisUser = draftActive && draftOwner === (userId ?? null)
  const candidateKey =
    localDraft && userId ? JSON.stringify([userId, frame.id, diagram.activePageId, localDraft.source]) : null
  const recoverableDraft =
    localDraft && candidateKey !== dismissedDraftKey && !activeForThisUser && localDraft.source !== diagram.source
      ? { ...localDraft, baseChanged: localDraft.baseSource !== diagram.source }
      : null

  async function save(source: string, html: string, finish: () => void) {
    const task = saveQueue.current.then(async () => {
      setSaving(true)
      try {
        /* Each debounced write waits for the previous response and takes its
           version from that response. A slow first save cannot make the next
           keystroke race with the same stale updatedAt. */
        const before = committedHtml.current
        const saved = await api.updateFrame(frame.id, { html }, latestUpdatedAt.current)
        const savedDiagram = readDiagramFrame(saved.html)
        const hasNewerLocalDraft = latestLocalHtml.current !== null && latestLocalHtml.current !== html
        if (hasNewerLocalDraft) {
          useStore.getState().patchFrameLocal(frame.id, {
            html: latestLocalHtml.current!,
            updatedAt: saved.updatedAt,
            updatedBy: saved.updatedBy,
          })
        } else {
          receiveSavedDiagramFrame(saved)
          latestLocalHtml.current = null
        }
        recordUpdate(frame.id, { html: before }, { html: saved.html })
        committedHtml.current = saved.html
        latestUpdatedAt.current = Math.max(latestUpdatedAt.current, saved.updatedAt)
        if (savedDiagram) committedSource.current = savedDiagram.source
        if (savedDiagram?.source === source) {
          if (userId) {
            clearDiagramDraft(userId, frame.id, source, diagram.activePageId)
            if (originalPage) clearDiagramDraft(userId, frame.id, source)
          }
          if (currentDraftSource.current === source) {
            setDraft(source)
            setDraftActive(false)
            setDraftOwner(userId ?? null)
          }
        }
      } catch (error) {
        useStore.getState().pushNotice(errorMessage(error, translate('inspector.saveFailed')))
      } finally {
        finish()
        setSaving(false)
      }
    })
    saveQueue.current = task.then(
      () => undefined,
      () => undefined,
    )
    await task
  }

  function flushQueuedSave() {
    const next = queued.current
    if (!next) return
    window.clearTimeout(next.timer)
    queued.current = null
    void save(next.source, next.html, next.finish)
  }

  function onSourceChange(source: string) {
    setDraft(source)
    currentDraftSource.current = source
    setDraftActive(true)
    setDraftOwner(userId ?? null)
    const html = buildDiagramHtml({ ...diagram, source })
    latestLocalHtml.current = html
    if (userId) {
      const stored = writeDiagramDraft(
        userId,
        frame.id,
        { source, baseSource: committedSource.current },
        diagram.activePageId,
      )
      if (stored && legacyDraft) clearDiagramDraft(userId, frame.id, legacyDraft.source)
      if (!stored && !storageFailureNotified.current) {
        storageFailureNotified.current = true
        useStore
          .getState()
          .pushNotice(
            'This source draft could not be saved locally. Keep the app open until the diagram save completes.',
          )
      }
    }
    /* the HTML as it was before this burst of typing: what undo goes back to */
    if (queued.current) {
      window.clearTimeout(queued.current.timer)
      queued.current.finish()
    }
    useStore.getState().patchFrameLocal(frame.id, { html })
    const finish = beginFrameSave(frame.id)
    const timer = window.setTimeout(() => {
      if (queued.current?.timer === timer) queued.current = null
      void save(source, html, finish)
    }, SAVE_DELAY_MS)
    queued.current = { timer, finish, source, html }
  }

  if (workspace) {
    return (
      <>
        {recoverableDraft && (
          <Callout
            role="status"
            className="absolute left-4 right-4 top-20 z-[70] mx-auto max-w-3xl space-y-2 shadow-modal"
          >
            <div>
              <strong className="block">{t('inspector.unsentDiagramSource')}</strong>
              <p>{t('inspector.unsentDiagramSourceBody')}</p>
              {recoverableDraft.baseChanged && <p className="mt-1">{t('inspector.diagramSourceBaseChanged')}</p>}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="primary" size="sm" onClick={() => onSourceChange(recoverableDraft.source)}>
                {t('inspector.recoverSource')}
              </Button>
              <Button
                variant="bare"
                size="sm"
                onClick={() => {
                  if (userId) clearDiagramDraft(userId, frame.id, recoverableDraft.source, recoveryPageId)
                  setDismissedDraftKey(candidateKey)
                }}
              >
                {t('inspector.discardDraft')}
              </Button>
            </div>
          </Callout>
        )}
        <DiagramEditorWorkspace
          frame={frame}
          diagram={diagram}
          canvasName={canvasName}
          source={activeForThisUser ? draft : diagram.source}
          saving={saving}
          onChange={onSourceChange}
          onSave={flushQueuedSave}
          onClose={() => {
            flushQueuedSave()
            onCloseWorkspace?.()
          }}
        />
      </>
    )
  }

  return (
    <div className="space-y-2">
      {recoverableDraft && (
        <Callout role="status" className="space-y-2">
          <div>
            <strong className="block">Unsent diagram source</strong>
            <p>Your unsent source draft is available to recover.</p>
            {recoverableDraft.baseChanged && (
              <p className="mt-1">
                The saved source changed after this draft was made. Recovering it replaces the current source.
              </p>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="primary"
              size="sm"
              onClick={() => {
                const source = recoverableDraft.source
                onSourceChange(source)
              }}
            >
              Recover source
            </Button>
            <Button
              variant="bare"
              size="sm"
              onClick={() => {
                if (userId) clearDiagramDraft(userId, frame.id, recoverableDraft.source, recoveryPageId)
                setDismissedDraftKey(candidateKey)
              }}
            >
              Discard draft
            </Button>
          </div>
        </Callout>
      )}
      <Textarea
        variant="code"
        className="h-[320px] flex-none max-md:h-auto max-md:min-h-[160px]"
        /* Keep an unsent draft visible after blur; otherwise the current frame
         source follows a teammate's or an agent's edit. */
        value={activeForThisUser ? draft : diagram.source}
        spellCheck={false}
        disabled={disabled}
        aria-label={t('inspector.diagramSource')}
        onFocus={() => {
          if (!activeForThisUser) {
            setDraft(diagram.source)
            currentDraftSource.current = diagram.source
          }
        }}
        onChange={(event) => onSourceChange(event.target.value)}
      />
    </div>
  )
}
