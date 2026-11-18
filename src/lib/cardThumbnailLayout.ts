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

/** Diagramly's /i/?preview is already a finished card (server/thumbs.ts: 600x344
 *  contained in grey, plus a 20px border): the diagram is centred inside it. Scaling
 *  or insetting it again leaves a blank band on the left, so it fills the box. */
export const COMPOSED_PREVIEW = { width: 640, height: 384 }

export function placeCardThumbnail(
  boxWidth: number,
  native: { width: number; height: number },
  scale = CARD_THUMB_SCALE,
): CardThumbnailPlacement {
  if (native.width === COMPOSED_PREVIEW.width && native.height === COMPOSED_PREVIEW.height)
    return { x: 0, y: 0, width: boxWidth, height: (boxWidth * native.height) / native.width, cropped: false }
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
