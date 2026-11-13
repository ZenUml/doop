import { isDiagramly } from './product'

// Public command/storage IDs remain compatible. Product visibility and dispatch
// use the same allowlist so an old native menu cannot reactivate hidden tools.
const DIAGRAMLY_ACTIONS = new Set([
  'go-to-files',
  'palette',
  'new-canvas',
  'duplicate-canvas',
  'new-frame',
  'new-diagram',
  'new-mermaid-diagram',
  'version-history',
  'undo',
  'redo',
  'duplicate',
  'delete',
  'select-all',
  'select-none',
  'select-inverse',
  'rulers',
  'comments',
  'ui',
  'cursors',
  'layers-panel',
  'agents-panel',
  'zoom-in',
  'zoom-out',
  'zoom-reset',
  'zoom-fit',
  'zoom-selection',
  'previous-page',
  'next-page',
  'zoom-previous-frame',
  'zoom-next-frame',
  'find-previous-frame',
  'find-next-frame',
  'bring-to-front',
  'bring-forward',
  'send-backward',
  'send-to-back',
  'rotate-180',
  'rotate-left',
  'rotate-right',
  'toggle-hidden',
  'toggle-locked',
  'hide-others',
  'round-to-pixel',
  'align-left',
  'align-hcenter',
  'align-right',
  'align-top',
  'align-vcenter',
  'align-bottom',
  'tidy-up',
  'pack-horizontal',
  'pack-vertical',
  'distribute-horizontal-spacing',
  'distribute-vertical-spacing',
  'distribute-left',
  'distribute-hcenter',
  'distribute-right',
  'distribute-top',
  'distribute-vcenter',
  'distribute-bottom',
  'shortcuts',
  'docs',
  'customer-support',
])
const DIAGRAMLY_TOOLS = new Set(['select', 'hand', 'frame', 'comment', 'zoom'])

export function productActionAvailable(id: string): boolean {
  return !isDiagramly() || DIAGRAMLY_ACTIONS.has(id)
}

export function productToolAvailable(id: string): boolean {
  return !isDiagramly() || DIAGRAMLY_TOOLS.has(id)
}

export function productViewCommandAvailable(command: string): boolean {
  const action = command === 'layers' ? 'layers-panel' : command === 'agents' ? 'agents-panel' : command
  return productActionAvailable(action)
}
