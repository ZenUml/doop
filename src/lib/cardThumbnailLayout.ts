/**
 * Placement of a rendered diagram inside a library card preview (same rules as
 * the Web Sequence home thumbnails): 70% of native CSS-px size with no
 * fit-to-width scaling, narrow diagrams centred, wide ones starting at the
 * left inset and cropped on the right, everything top-aligned with an inset.
 */
export const CARD_THUMB_SCALE = 0.7
export const CARD_THUMB_INSET = 12

export interface CardThumbnailPlacement {
  /** Left offset inside the preview box, in px. */
  x: number
  /** Top offset inside the preview box, in px. */
  y: number
  /** Drawn size, in px (native size x scale; aspect ratio kept). */
  width: number
  height: number
  /** True when the drawn diagram is wider than the box and is cropped on the right. */
  cropped: boolean
}

export function placeCardThumbnail(
  boxWidth: number,
  native: { width: number; height: number },
  scale = CARD_THUMB_SCALE,
): CardThumbnailPlacement {
  const width = native.width * scale
  const height = native.height * scale
  const cropped = width > boxWidth - CARD_THUMB_INSET * 2
  return {
    x: cropped ? CARD_THUMB_INSET : (boxWidth - width) / 2,
    y: CARD_THUMB_INSET,
    width,
    height,
    cropped,
  }
}
