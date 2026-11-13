// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { clearDiagramDraft, readDiagramDraft, writeDiagramDraft } from '../src/lib/diagramDrafts'

beforeEach(() => {
  localStorage.clear()
  vi.restoreAllMocks()
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

it('keeps drafts isolated by local user and frame, and reads a saved draft after a reload boundary', () => {
  expect(writeDiagramDraft('user-a', 'frame-a', { source: 'draft source', baseSource: 'saved source' })).toBe(true)

  const recovered = readDiagramDraft('user-a', 'frame-a')
  expect(recovered).toMatchObject({ source: 'draft source', baseSource: 'saved source' })
  expect(recovered?.updatedAt).toBeGreaterThan(0)
  expect(readDiagramDraft('user-b', 'frame-a')).toBeNull()
  expect(readDiagramDraft('user-a', 'frame-b')).toBeNull()
})

it('does not clear a newer draft when an older save confirmation arrives', () => {
  writeDiagramDraft('user-a', 'frame-a', { source: 'first draft', baseSource: 'base' })
  writeDiagramDraft('user-a', 'frame-a', { source: 'newer draft', baseSource: 'base' })

  clearDiagramDraft('user-a', 'frame-a', 'first draft')

  expect(readDiagramDraft('user-a', 'frame-a')?.source).toBe('newer draft')
  clearDiagramDraft('user-a', 'frame-a', 'newer draft')
  expect(readDiagramDraft('user-a', 'frame-a')).toBeNull()
})

it('isolates inner page drafts in the same diagram and preserves the legacy singleton draft', () => {
  writeDiagramDraft('user-a', 'frame-a', { source: 'legacy', baseSource: '' })
  writeDiagramDraft('user-a', 'frame-a', { source: 'first', baseSource: '' }, 'page-1')
  writeDiagramDraft('user-a', 'frame-a', { source: 'second', baseSource: '' }, 'page-2')
  expect(readDiagramDraft('user-a', 'frame-a', 'page-1')?.source).toBe('first')
  expect(readDiagramDraft('user-a', 'frame-a', 'page-2')?.source).toBe('second')
  expect(readDiagramDraft('user-a', 'frame-a')?.source).toBe('legacy')
  clearDiagramDraft('user-a', 'frame-a', 'first', 'page-1')
  expect(readDiagramDraft('user-a', 'frame-a', 'page-1')).toBeNull()
  expect(readDiagramDraft('user-a', 'frame-a', 'page-2')?.source).toBe('second')
})

it('returns null for malformed or unsupported stored data without deleting it', () => {
  expect(writeDiagramDraft('user-a', 'frame-a', { source: 'draft', baseSource: '' })).toBe(true)
  const key = localStorage.key(0)!
  localStorage.setItem(key, '{broken json')

  expect(readDiagramDraft('user-a', 'frame-a')).toBeNull()
  expect(localStorage.getItem(key)).toBe('{broken json')

  localStorage.setItem(key, JSON.stringify({ version: 2, source: 'draft', baseSource: '', updatedAt: Date.now() }))
  expect(readDiagramDraft('user-a', 'frame-a')).toBeNull()
})

it('rejects sources over the byte limit and reports storage quota failures without throwing', () => {
  expect(writeDiagramDraft('user-a', 'frame-a', { source: 'é'.repeat(500_001), baseSource: '' })).toBe(false)
  vi.stubGlobal('localStorage', {
    getItem: () => null,
    setItem: () => {
      throw new DOMException('quota exceeded', 'QuotaExceededError')
    },
  })

  expect(writeDiagramDraft('user-a', 'frame-a', { source: 'draft', baseSource: '' })).toBe(false)
  expect(readDiagramDraft('user-a', 'frame-a')).toBeNull()
})

it('returns null when local storage reads fail', () => {
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
    throw new DOMException('storage disabled', 'SecurityError')
  })

  expect(readDiagramDraft('user-a', 'frame-a')).toBeNull()
})
