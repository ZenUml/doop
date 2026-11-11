import { expect, it } from 'vitest'
import { diagramlyApiAvailable } from '../shared/product'

it('keeps local diagrams, source import, account/MCP and cloud connection APIs', () => {
  for (const path of [
    '/canvases',
    '/canvases/old/pages',
    '/frames/f1',
    '/import/zenuml',
    '/agent-keys',
    '/diagramly/account',
  ]) {
    expect(diagramlyApiAvailable(path), path).toBe(true)
  }
})

it('blocks alternate unsupported routes without matching unrelated document ids', () => {
  for (const path of [
    '/billing/checkout',
    '/automations/1',
    '/model-account/chatgpt',
    '/canvases/old/github',
    '/canvases/c/publish',
    '/frames/f/approval',
  ]) {
    expect(diagramlyApiAvailable(path), path).toBe(false)
  }
  expect(diagramlyApiAvailable('/canvases/billing')).toBe(true)
})
