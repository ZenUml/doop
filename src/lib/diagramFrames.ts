import { buildDiagramHtml, DEFAULT_ZENUML_SOURCE } from '../../shared/diagramFrame'
import { createCenteredFrame } from './framePlacement'
import { useStore } from './store'

/** Adds a ZenUML diagram frame in the middle of the view and opens its source editor (spike). */
export async function newDiagramFrame(canvasId: string): Promise<void> {
  const html = buildDiagramHtml({ kind: 'zenuml', source: DEFAULT_ZENUML_SOURCE })
  const frame = await createCenteredFrame(canvasId, 'Diagram', html)
  const store = useStore.getState()
  store.select(frame.id)
  store.setInspectorOpen(true)
}
