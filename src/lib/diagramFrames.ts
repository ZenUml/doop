import { buildDiagramHtml, DEFAULT_DIAGRAM_SOURCE, type DiagramKind } from '../../shared/diagramFrame'
import { createCenteredFrame } from './framePlacement'
import { useStore } from './store'

/** Adds a diagram frame in the middle of the view and opens its source editor (spike). */
export async function newDiagramFrame(canvasId: string, kind: DiagramKind): Promise<void> {
  const html = buildDiagramHtml({ kind, source: DEFAULT_DIAGRAM_SOURCE[kind] })
  const frame = await createCenteredFrame(canvasId, 'Diagram', html)
  const store = useStore.getState()
  store.select(frame.id)
  store.setInspectorOpen(true)
}
