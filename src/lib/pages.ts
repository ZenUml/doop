import { useMemo } from 'react'
import { useStore } from './store'
import { canvasPages, pageFrames } from '../../shared/pages'
import { isDiagramly } from './product'

/** Create a mode-specific label for a newly added outer collection. */
export function newPageName(number: number): string {
  return `${isDiagramly() ? 'Board' : 'Page'} ${number}`
}

export function usePageCanvas() {
  const canvas = useStore((s) => s.canvas)
  const activePageId = useStore((s) => s.activePageId)
  return useMemo(
    () => (canvas ? { ...canvas, frames: pageFrames(canvas, activePageId ?? canvasPages(canvas)[0]!.id) } : null),
    [canvas, activePageId],
  )
}

export function currentPageCanvas() {
  const { canvas, activePageId } = useStore.getState()
  return canvas ? { ...canvas, frames: pageFrames(canvas, activePageId ?? canvasPages(canvas)[0]!.id) } : null
}
