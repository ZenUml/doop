import { useEffect, useLayoutEffect, useRef } from 'react'
import type { DiagramKind } from '../../shared/diagramFrame'
import { CodeMirror, type EditorConfiguration } from '../lib/diagramCodeMirror'
import { Textarea } from './ui/textarea'

export function DiagramCodeEditor({
  kind,
  value,
  wrap,
  onChange,
  onSave,
}: {
  kind: DiagramKind
  value: string
  wrap: boolean
  onChange: (value: string) => void
  onSave: () => void
}) {
  const textarea = useRef<HTMLTextAreaElement | null>(null)
  const editor = useRef<CodeMirror.EditorFromTextArea | null>(null)
  const callbacks = useRef({ onChange, onSave })
  useLayoutEffect(() => {
    callbacks.current = { onChange, onSave }
  })

  useLayoutEffect(() => {
    if (!textarea.current) return
    const config: EditorConfiguration = {
      mode: `diagramly-${kind}`,
      lineNumbers: true,
      tabSize: 2,
      indentUnit: 2,
      indentWithTabs: false,
      autofocus: true,
      autoCloseBrackets: true,
      matchBrackets: true,
      gutters: ['CodeMirror-linenumbers'],
      extraKeys: {
        Tab(cm) {
          if (cm.somethingSelected()) cm.indentSelection('add')
          else cm.execCommand('insertSoftTab')
        },
        'Shift-Tab': (cm) => cm.indentSelection('subtract'),
        'Ctrl-S': () => callbacks.current.onSave(),
        'Cmd-S': () => callbacks.current.onSave(),
        'Ctrl-/': 'toggleComment',
        'Cmd-/': 'toggleComment',
        'Ctrl-F': 'find',
        'Cmd-F': 'find',
      },
    }
    const cm = CodeMirror.fromTextArea(textarea.current, config)
    editor.current = cm
    cm.on('change', (instance) => callbacks.current.onChange(instance.getValue()))
    const refresh = () => cm.refresh()
    window.addEventListener('resize', refresh)
    const frame = window.requestAnimationFrame(refresh)
    return () => {
      window.cancelAnimationFrame(frame)
      window.removeEventListener('resize', refresh)
      cm.toTextArea()
      editor.current = null
    }
  }, [kind])

  useEffect(() => {
    editor.current?.setOption('lineWrapping', wrap)
  }, [wrap])

  useEffect(() => {
    const cm = editor.current
    if (cm && cm.getValue() !== value) cm.setValue(value)
  }, [value])

  return (
    <Textarea ref={textarea} variant="code" defaultValue={value} aria-label={`${kind} source`} spellCheck={false} />
  )
}
