import type { Frame } from '../../shared/types'
import { useStore } from './store'

/** A delayed response must not replace a newer page selection or remote edit. */
export function receiveSavedDiagramFrame(saved: Frame) {
  const state = useStore.getState()
  const current = state.canvas?.frames.find((frame) => frame.id === saved.id)
  if (current && current.updatedAt > saved.updatedAt) return
  state.upsertFrame(saved)
}
