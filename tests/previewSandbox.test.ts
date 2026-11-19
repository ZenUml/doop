import { expect, it } from 'vitest'
import { buildDiagramHtml } from '../shared/diagramFrame'
import { previewSandbox } from '../src/lib/previewSandbox'

it('lets a diagram frame run its renderer in a history preview', () => {
  const html = buildDiagramHtml({ kind: 'mermaid', source: 'flowchart TD\n  A --> B' })
  expect(previewSandbox(html)).toBe('allow-scripts')
})

it('keeps scripts off for any other saved HTML', () => {
  expect(previewSandbox('<!doctype html><body><script>alert(1)</script></body>')).toBe('')
})
