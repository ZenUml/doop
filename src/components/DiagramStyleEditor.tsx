import { useEffect, useRef, useState } from 'react'
import type { Frame } from '../../shared/types'
import type { DiagramFrame } from '../../shared/diagramFrame'
import { useStore } from '../lib/store'
import { recordUpdate } from '../lib/history'
import { beginFrameSave, useFrameSaves } from '../lib/frameSaves'
import { Button } from './ui/button'
import { Callout } from './ui/callout'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select'
import { Textarea } from './ui/textarea'

type StyleMode = 'css' | 'less' | 'scss' | 'sass'
type EditableDiagram = DiagramFrame & { styleSource?: string; styleMode?: string }

const STYLE_MODES: { value: StyleMode; label: string }[] = [
  { value: 'css', label: 'CSS' },
  { value: 'less', label: 'LESS' },
  { value: 'scss', label: 'SCSS' },
  { value: 'sass', label: 'SASS' },
]

function styleSource(diagram: EditableDiagram) {
  return diagram.styleSource ?? diagram.css ?? ''
}

function errorText(message: string, status: number) {
  try {
    const parsed: unknown = JSON.parse(message)
    if (parsed && typeof parsed === 'object' && 'error' in parsed && typeof parsed.error === 'string') {
      return parsed.error
    }
    if (parsed && typeof parsed === 'object' && 'message' in parsed && typeof parsed.message === 'string') {
      return parsed.message
    }
  } catch {
    if (message.trim()) return message
  }
  return `Could not save diagram styles (HTTP ${status}). Your draft is still here.`
}

export function DiagramStyleEditor({
  frame,
  diagram,
  onBusyChange,
}: {
  frame: Frame
  diagram: EditableDiagram
  onBusyChange?: (busy: boolean) => void
}) {
  const pendingSave = useFrameSaves((state) => (state.pending[frame.id] ?? 0) > 0)
  const [draft, setDraft] = useState(() => styleSource(diagram))
  const [mode, setMode] = useState(() => diagram.styleMode ?? 'css')
  const [dirty, setDirty] = useState(false)
  const [focused, setFocused] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const observedIncoming = useRef({ source: styleSource(diagram), mode: diagram.styleMode ?? 'css' })
  const draftRevision = useRef(frame.updatedAt)

  const incomingSource = styleSource(diagram)
  const incomingMode = diagram.styleMode ?? 'css'
  const supportedMode = STYLE_MODES.some((item) => item.value === mode)

  useEffect(() => {
    const changed = observedIncoming.current.source !== incomingSource || observedIncoming.current.mode !== incomingMode
    if (!changed || focused || dirty || busy) return
    observedIncoming.current = { source: incomingSource, mode: incomingMode }
    draftRevision.current = frame.updatedAt
    setDraft(incomingSource)
    setMode(incomingMode)
  }, [busy, dirty, focused, incomingMode, incomingSource, frame.updatedAt])

  useEffect(() => {
    return () => onBusyChange?.(false)
  }, [onBusyChange])

  async function applyStyles() {
    if (busy || pendingSave || !supportedMode) return
    setBusy(true)
    onBusyChange?.(true)
    const finish = beginFrameSave(frame.id)
    setError(null)
    try {
      const response = await fetch(`/api/frames/${encodeURIComponent(frame.id)}/diagram-style`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: draft, mode, expectedUpdatedAt: draftRevision.current }),
      })
      if (!response.ok) {
        const text = await response.text().catch(() => '')
        throw new Error(errorText(text, response.status))
      }

      const saved = (await response.json()) as Frame
      useStore.getState().upsertFrame(saved)
      recordUpdate(frame.id, { html: frame.html }, { html: saved.html })
      setDraft(draft)
      setMode(mode)
      setDirty(false)
      draftRevision.current = saved.updatedAt
      setFocused(false)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not save diagram styles. Your draft is still here.')
    } finally {
      finish()
      setBusy(false)
      onBusyChange?.(false)
    }
  }

  return (
    <section className="space-y-2" aria-label="Diagram style editor">
      <label className="block text-label text-ink-soft" htmlFor={`diagram-style-${frame.id}`}>
        Diagram styles
      </label>
      <Select
        value={mode}
        onValueChange={(value) => {
          if (!dirty) draftRevision.current = frame.updatedAt
          setMode(value)
          setDirty(true)
          setError(null)
        }}
        disabled={busy}
      >
        <SelectTrigger aria-label="Style language">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {!supportedMode && (
            <SelectItem value={mode} disabled>
              {mode.toUpperCase()} (requires conversion)
            </SelectItem>
          )}
          {STYLE_MODES.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {!supportedMode && (
        <Callout>
          These {mode.toUpperCase()} styles are preserved as-is. Choose a supported language to convert and apply them.
        </Callout>
      )}
      <Textarea
        id={`diagram-style-${frame.id}`}
        variant="code"
        className="min-h-[180px] resize-y"
        aria-label="Diagram styles"
        spellCheck={false}
        value={draft}
        disabled={busy}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onChange={(event) => {
          if (!dirty) draftRevision.current = frame.updatedAt
          setDraft(event.target.value)
          setDirty(true)
          setError(null)
        }}
      />
      {error && (
        <Callout role="alert" tone="error">
          {error}
        </Callout>
      )}
      {dirty && !busy && (
        <Button
          variant="ghost"
          className="w-full"
          onClick={() => {
            setDraft(incomingSource)
            setMode(incomingMode)
            draftRevision.current = frame.updatedAt
            setDirty(false)
            setError(null)
          }}
        >
          Load saved styles
        </Button>
      )}
      <Button
        variant="primary"
        className="w-full"
        disabled={busy || pendingSave || !supportedMode || !dirty}
        onClick={() => void applyStyles()}
      >
        {busy ? 'Applying…' : 'Apply styles'}
      </Button>
    </section>
  )
}
