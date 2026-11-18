import { describe, expect, it } from 'vitest'
import { placeCardThumbnail, CARD_THUMB_INSET, CARD_THUMB_SCALE } from '../src/lib/cardThumbnailLayout'

describe('placeCardThumbnail', () => {
  it('draws at 70% of native size without fitting to the box width', () => {
    const p = placeCardThumbnail(400, { width: 200, height: 100 })
    expect(CARD_THUMB_SCALE).toBe(0.7)
    expect(p).toMatchObject({ width: 140, height: 70, cropped: false })
  })

  it('centres a narrow diagram horizontally and top-aligns it with a 12px inset', () => {
    const p = placeCardThumbnail(400, { width: 200, height: 100 })
    expect(p.x).toBe((400 - 140) / 2)
    expect(p.y).toBe(CARD_THUMB_INSET)
    expect(CARD_THUMB_INSET).toBe(12)
  })

  it('starts a wide diagram at the 12px left inset and crops it on the right', () => {
    const p = placeCardThumbnail(300, { width: 1000, height: 400 })
    expect(p).toMatchObject({ x: 12, y: 12, width: 700, cropped: true })
  })

  it('keeps the aspect ratio', () => {
    const p = placeCardThumbnail(300, { width: 1000, height: 400 })
    expect(p.width / p.height).toBeCloseTo(1000 / 400)
  })

  it('treats a diagram exactly filling the inset area as narrow', () => {
    const p = placeCardThumbnail(164, { width: 200, height: 10 })
    expect(p).toMatchObject({ x: 12, cropped: false })
  })
})

describe('placeCardThumbnail with a server-composed preview', () => {
  // Diagramly's /i/?preview is a finished 640x384 card: grey letterbox, diagram centred.
  it('fills the box edge to edge, with no scale and no inset', () => {
    const p = placeCardThumbnail(300, { width: 640, height: 384 })
    expect(p).toEqual({ x: 0, y: 0, width: 300, height: 180, cropped: false })
  })
})
