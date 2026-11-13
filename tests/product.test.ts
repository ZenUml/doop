import { expect, it } from 'vitest'
import { diagramlyApiAvailable, diagramlyMcpAvailable } from '../shared/product'

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

it('keeps upstream HTML components out of the Diagramly API and agent surface after integration', () => {
  for (const path of [
    '/canvases/c/components',
    '/CANVASES/c/COMPONENTS',
    '/canvases/c/components/import',
    '/canvases/c/component-libraries',
    '/canvases/c/component-candidates',
    '/frames/f/instances',
  ])
    expect(diagramlyApiAvailable(path), path).toBe(false)
  for (const name of [
    'list_components',
    'get_component',
    'create_component',
    'update_component',
    'insert_instance',
    'update_instances',
    'find_component_candidates',
    'delete_component',
    'restore_component_version',
    'import_component',
    'sync_component',
    'get_component_preview',
  ])
    expect(diagramlyMcpAvailable(name), name).toBe(false)
  expect(diagramlyApiAvailable('/canvases/components')).toBe(true)
  expect(diagramlyMcpAvailable('create_diagram')).toBe(true)
})
