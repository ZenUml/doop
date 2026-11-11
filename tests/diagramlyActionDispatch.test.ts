// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { ActionHost } from '../src/lib/actions/registry'

const profile = vi.hoisted(() => ({ diagramly: true }))
vi.mock('../src/lib/product', () => ({ isDiagramly: () => profile.diagramly }))
vi.mock('../src/lib/posthog', () => ({ posthog: { capture: vi.fn() } }))
const { ACTIONS, isEnabled, runAction, dispatchActionKey, setActionHost } = await import('../src/lib/actions/registry')
const { nativeMenus, nativeStates, runNativeItem } = await import('../src/lib/appMenu')
const { onViewCommand, runViewCommand } = await import('../src/lib/viewMenu')
const { useStore } = await import('../src/lib/store')

let host: ActionHost
beforeEach(() => {
  profile.diagramly = true
  host = {
    canvasId: 'diagram-document',
    guest: false,
    presenting: false,
    hideUiActive: true,
    agentsOpen: false,
    openPalette: vi.fn(),
    openAgent: vi.fn(),
    openShortcuts: vi.fn(),
    goToFiles: vi.fn(),
    openDocs: vi.fn(),
    contactSupport: vi.fn(),
    openFind: vi.fn(),
    findStep: vi.fn(),
    openExport: vi.fn(),
    openImport: vi.fn(),
    openVersionHistory: vi.fn(),
    openLink: vi.fn(),
    placeImage: vi.fn(),
    newCanvas: vi.fn(),
    duplicateCanvas: vi.fn(),
    present: vi.fn(),
    toggleHideUi: vi.fn(),
    toggleAgents: vi.fn(),
  }
  setActionHost(host)
  useStore.setState({
    canvas: { id: 'diagram-document', name: 'Diagram document', role: 'edit', frames: [], createdAt: 0, updatedAt: 0 },
    selectedElement: null,
    selectedId: null,
    selectedIds: [],
  })
})
afterEach(() => {
  setActionHost(null)
  vi.restoreAllMocks()
})

it('omits unsupported native items and their state, while keeping diagram creation and activity', () => {
  const ids = nativeMenus().flatMap((menu) => menu.items.flatMap((item) => (item ? [item.id] : [])))
  expect(ids).toEqual(
    expect.arrayContaining(['new-diagram', 'new-mermaid-diagram', 'agents-panel', 'layers-panel', 'zoom-in']),
  )
  for (const id of [
    'ask-agent',
    'place-image',
    'import',
    'export',
    'export-pdf',
    'present',
    'group',
    'bold',
    'find-replace',
  ]) {
    expect(ids).not.toContain(id)
    expect(nativeStates().some(([item]) => item === id)).toBe(false)
  }
  expect(nativeMenus().some((menu) => menu.id === 'text')).toBe(false)
})

it('rejects stale or forged native menu picks for blocked hosts instead of merely hiding them', () => {
  for (const id of ['present', 'place-image', 'import', 'export', 'ask-agent', 'find']) runNativeItem(id, false)
  for (const callback of [
    host.present,
    host.placeImage,
    host.openImport,
    host.openExport,
    host.openAgent,
    host.openFind,
  ])
    expect(callback).not.toHaveBeenCalled()
})

it('blocks palette dispatch and keyboard equivalents before running an unsupported host action', () => {
  const action = ACTIONS.find((item) => item.id === 'present')!
  expect(isEnabled(action)).toBe(false)
  runAction(action)
  const preventDefault = vi.fn()
  expect(
    dispatchActionKey(
      {
        key: 'Enter',
        code: 'Enter',
        metaKey: true,
        ctrlKey: false,
        altKey: true,
        shiftKey: false,
        repeat: false,
        preventDefault,
      },
      false,
      true,
    ),
  ).toBe(false)
  expect(host.present).not.toHaveBeenCalled()
  expect(preventDefault).not.toHaveBeenCalled()
})

it('keeps supported native menu and legacy view dispatch available', () => {
  runNativeItem('palette', false)
  runNativeItem('agents-panel', false)
  runNativeItem('new-canvas', false)
  expect(host.openPalette).toHaveBeenCalledOnce()
  expect(host.toggleAgents).toHaveBeenCalledOnce()
  expect(host.newCanvas).toHaveBeenCalledOnce()
  const view = vi.fn()
  const stop = onViewCommand(view)
  runViewCommand('zoom-in')
  runViewCommand('agents')
  stop()
  expect(view.mock.calls).toEqual([['zoom-in'], ['agents']])
})

it('does not apply a whole-diagram edit to a stale inner-HTML selection', () => {
  useStore.setState({
    canvas: {
      id: 'diagram-document',
      name: 'Retained document',
      createdAt: 0,
      updatedAt: 0,
      frames: [
        {
          id: 'retained',
          canvasId: 'diagram-document',
          name: 'Retained content',
          html: '<p>Retained</p>',
          x: 0,
          y: 0,
          width: 100,
          height: 100,
          createdAt: 0,
          updatedAt: 0,
          updatedBy: 'Owner',
        },
      ],
    },
    selectedElement: { frameId: 'retained', selector: 'p' },
  })
  const action = ACTIONS.find((item) => item.id === 'rotate-left')!
  const effect = vi.spyOn(action, 'run').mockReturnValue(true)
  runNativeItem('rotate-left', false)
  expect(effect).not.toHaveBeenCalled()
})

it('retains upstream menu visibility and actual command dispatch', () => {
  profile.diagramly = false
  expect(
    nativeMenus()
      .flatMap((menu) => menu.items)
      .some((item) => item?.id === 'present'),
  ).toBe(true)
  runNativeItem('present', false)
  runNativeItem('import', false)
  runNativeItem('export', false)
  runNativeItem('ask-agent', false)
  expect(host.present).toHaveBeenCalledOnce()
  expect(host.openImport).toHaveBeenCalledOnce()
  expect(host.openExport).toHaveBeenCalledOnce()
  expect(host.openAgent).toHaveBeenCalledOnce()
})
