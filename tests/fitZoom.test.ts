import { expect, it } from 'vitest'
import { fitZoom, MAX_ZOOM, MIN_ZOOM } from '../src/lib/fitZoom'

const pane = { width: 800, height: 600 }

it('shrinks a diagram wider than the pane so all of it shows', () => {
  expect(fitZoom({ width: 1600, height: 300 }, pane)).toBeCloseTo(0.5)
})

it('shrinks by the tighter side when the diagram is both wide and tall', () => {
  expect(fitZoom({ width: 1000, height: 1800 }, pane)).toBeCloseTo(600 / 1800)
})

it('does not enlarge a diagram that already fits', () => {
  expect(fitZoom({ width: 400, height: 300 }, pane)).toBe(1)
})

it('never goes below the smallest zoom for a huge diagram', () => {
  expect(fitZoom({ width: 100000, height: 100000 }, pane)).toBe(MIN_ZOOM)
})

it('falls back to 100% when the size is not known yet or is empty', () => {
  expect(fitZoom(null, pane)).toBe(1)
  expect(fitZoom({ width: 0, height: 0 }, pane)).toBe(1)
  expect(fitZoom({ width: 500, height: 500 }, { width: 0, height: 0 })).toBe(1)
})

it('keeps the zoom range ordered', () => {
  expect(MIN_ZOOM).toBeLessThan(1)
  expect(MAX_ZOOM).toBeGreaterThanOrEqual(1)
})
