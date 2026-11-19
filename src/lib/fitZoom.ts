export const MIN_ZOOM = 0.1
export const MAX_ZOOM = 2

export type Size = { width: number; height: number }

/** The zoom at which the whole diagram shows in the pane. A diagram that
 *  already fits stays at 100%; one that does not is shrunk by its tighter side. */
export function fitZoom(content: Size | null, pane: Size): number {
  if (!content || content.width <= 0 || content.height <= 0 || pane.width <= 0 || pane.height <= 0) return 1
  const scale = Math.min(pane.width / content.width, pane.height / content.height, 1)
  return Math.max(MIN_ZOOM, scale)
}
