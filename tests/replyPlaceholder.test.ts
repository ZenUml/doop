import { afterEach, expect, it } from 'vitest'
import { replyPlaceholderKey } from '../src/lib/comments'

const shell = globalThis as { __DIAGRAMLY_DESKTOP__?: unknown }
afterEach(() => {
  delete shell.__DIAGRAMLY_DESKTOP__
})

it('web: editors are told they can @diagramly in a popover thread and in the panel', () => {
  expect(replyPlaceholderKey('thread', true)).toBe('stage.replyAskAgent')
  expect(replyPlaceholderKey('panel', true)).toBe('stage.replyPanelPlaceholder')
})

it('web: viewers who cannot edit get the plain placeholder in a popover thread', () => {
  expect(replyPlaceholderKey('thread', false)).toBe('stage.replyEllipsis')
})

it('desktop: no hosted agent, so no @diagramly hint in either place', () => {
  shell.__DIAGRAMLY_DESKTOP__ = 'true'
  expect(replyPlaceholderKey('thread', true)).toBe('stage.replyEllipsis')
  expect(replyPlaceholderKey('panel', true)).toBe('stage.replyEllipsis')
})
