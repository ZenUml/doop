import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildMcpServer } from '../server/mcp.ts'
import { store } from '../server/store.ts'
import * as actions from '../server/actions.ts'
import { buildDiagramHtml, readDiagramFrame } from '../shared/diagramFrame.ts'
import type { Canvas } from '../shared/types.ts'

const state = vi.hoisted(() => ({ product: 'diagramly' as 'doop' | 'diagramly', version: vi.fn() }))
vi.mock('../server/env.ts', async (original) => {
  const module = await original<typeof import('../server/env.ts')>()
  return {
    ...module,
    env: {
      ...module.env,
      get DOOP_PRODUCT() {
        return state.product
      },
    },
  }
})
vi.mock('../server/db/persist.ts', () => ({
  saveCanvas: vi.fn(),
  saveFrame: vi.fn(),
  saveActivity: vi.fn(),
  saveTask: vi.fn(),
  saveFrameVersion: state.version,
  deleteCanvas: vi.fn(),
  deleteFrame: vi.fn(),
}))

const cleanups: (() => Promise<void>)[] = []
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup()
  state.version.mockClear()
  state.product = 'diagramly'
})

async function connect(ownerId = 'owner', linkAccess?: Canvas['linkAccess']) {
  const id = `diagrams-${crypto.randomUUID()}`
  const canvas: Canvas = {
    id,
    ownerId: 'owner',
    name: 'Diagrams',
    createdAt: 0,
    updatedAt: 0,
    frames: [],
    pages: [{ id: 'main', name: 'Main' }],
    ...(linkAccess ? { linkAccess } : {}),
  }
  store.canvases.set(id, canvas)
  const server = buildMcpServer('Diagram Agent', ownerId)
  const client = new Client({ name: 'diagram-test', version: '1.0.0' })
  const [a, b] = InMemoryTransport.createLinkedPair()
  await server.connect(b)
  await client.connect(a)
  cleanups.push(async () => {
    actions.deleteCanvas(id)
    await client.close()
    await server.close()
  })
  const call = (name: string, args: Record<string, unknown>) =>
    client.callTool({ name, arguments: { agent_name: 'Diagram Agent', ...args } })
  return { id, canvas, client, call }
}

function body(result: Awaited<ReturnType<Client['callTool']>>) {
  const content = result.content as { type: string; text?: string }[]
  return JSON.parse(content[0]!.text!) as {
    diagram: {
      id: string
      kind: string
      source: string
      css?: string
      updatedAt: number
      x: number
      y: number
      width: number
      height: number
      pageId: string
    }
  }
}

describe('source-first MCP diagrams', () => {
  it('hides unsupported web-design tools and rejects direct calls while retaining compatible diagram tools', async () => {
    const { client, call } = await connect()
    const names = (await client.listTools()).tools.map((tool) => tool.name)
    expect(names).toContain('create_diagram')
    expect(names).toContain('create_frame')
    expect(names).not.toContain('import_webpage')
    expect(names).not.toContain('generate_image')
    expect(names).not.toContain('set_prototype_start')
    for (const name of [
      'import_webpage',
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
    ]) {
      expect(names, name).not.toContain(name)
      expect((await call(name, {})).isError, name).toBe(true)
    }
  })
  it.each(['zenuml', 'mermaid'])('creates and reads %s source without exposing generated HTML', async (kind) => {
    const { id, canvas, call } = await connect()
    const source = kind === 'mermaid' ? 'flowchart LR\nA[<b>Client</b>] --> B[Server]' : 'Client->Server: Read < & >'
    const created = await call('create_diagram', {
      canvas_id: id,
      name: 'Request',
      kind,
      source,
      pageId: 'main',
      x: 20,
      y: 30,
      width: 800,
      height: 600,
    })
    expect(created.isError).toBeFalsy()
    const diagram = body(created).diagram
    expect(diagram).toMatchObject({ kind, source, x: 20, y: 30, width: 800, height: 600, pageId: 'main' })
    expect(diagram).not.toHaveProperty('html')
    expect(readDiagramFrame(canvas.frames[0]!.html)).toMatchObject({ kind, source })
    const read = await call('get_diagram', { frame_id: diagram.id })
    expect(body(read).diagram).toEqual(diagram)
  })

  it('retains legacy CSS/layout and records the prior source in normal history', async () => {
    const { id, call } = await connect()
    const html = buildDiagramHtml({ kind: 'zenuml', source: 'A->B: Before', css: '.participant { color: red }' })
    const frame = store.createFrame(id, { name: 'Legacy', html, x: 12, y: 34, width: 900, height: 700 }, 'Human')!
    const updated = await call('update_diagram', {
      frame_id: frame.id,
      kind: 'mermaid',
      source: 'flowchart TD\nA --> B',
      expectedUpdatedAt: frame.updatedAt,
    })
    expect(updated.isError).toBeFalsy()
    expect(body(updated).diagram).toMatchObject({
      kind: 'mermaid',
      source: 'flowchart TD\nA --> B',
      css: '.participant { color: red }',
      x: 12,
      y: 34,
      width: 900,
      height: 700,
      pageId: 'main',
    })
    expect(state.version).toHaveBeenCalledWith(
      expect.objectContaining({ frameId: frame.id, html, width: 900, height: 700 }),
    )
  })

  it('rejects a stale source edit without changing the current diagram', async () => {
    const { id, call } = await connect()
    const frame = store.createFrame(
      id,
      { name: 'Concurrent', html: buildDiagramHtml({ kind: 'mermaid', source: 'flowchart TD\nA --> B' }) },
      'Human',
    )!
    const stale = frame.updatedAt
    store.updateFrame(
      frame.id,
      { html: buildDiagramHtml({ kind: 'mermaid', source: 'flowchart TD\nA --> C' }) },
      'Other agent',
    )
    const current = frame.html
    const result = await call('update_diagram', {
      frame_id: frame.id,
      source: 'flowchart TD\nA --> D',
      expectedUpdatedAt: stale,
    })
    expect(result.isError).toBe(true)
    expect(JSON.stringify(result)).toContain('Diagram changed')
    expect(frame.html).toBe(current)
    expect(state.version).not.toHaveBeenCalled()
  })

  it('permits reading a shared view but denies creation and source changes', async () => {
    const { id, call } = await connect('viewer', 'view')
    const frame = store.createFrame(
      id,
      { name: 'Shared', html: buildDiagramHtml({ kind: 'zenuml', source: 'A->B' }) },
      'Human',
    )!
    expect((await call('get_diagram', { frame_id: frame.id })).isError).toBeFalsy()
    expect(
      (await call('create_diagram', { canvas_id: id, name: 'Denied', kind: 'zenuml', source: 'B->C' })).isError,
    ).toBe(true)
    expect((await call('update_diagram', { frame_id: frame.id, source: 'B->C' })).isError).toBe(true)
    expect(readDiagramFrame(frame.html)?.source).toBe('A->B')
  })

  it('does not disclose private diagrams or convert unrelated HTML frames', async () => {
    const { id, call } = await connect('stranger')
    const frame = store.createFrame(
      id,
      { name: 'Private', html: buildDiagramHtml({ kind: 'zenuml', source: 'Secret->Database' }) },
      'Human',
    )!
    const denied = await call('get_diagram', { frame_id: frame.id })
    expect(denied.isError).toBe(true)
    expect(JSON.stringify(denied)).not.toContain('Secret->Database')
    const own = await connect()
    const html = '<html><body>Legacy website</body></html>'
    const generic = store.createFrame(own.id, { name: 'Website', html }, 'Human')!
    expect((await own.call('update_diagram', { frame_id: generic.id, source: 'A->B' })).isError).toBe(true)
    expect(generic.html).toBe(html)
  })

  it('uses a diagram guide for Diagramly and retains the upstream guide and HTML tools', async () => {
    const diagramly = await connect()
    expect(diagramly.client.getInstructions()).toContain('create_diagram')
    expect(diagramly.client.getInstructions()).not.toContain('call import_webpage FIRST')
    const guide = await diagramly.call('get_guide', { topic: 'doop-instructions' })
    expect(JSON.stringify(guide)).toContain('Diagram source is the editable document')
    state.product = 'doop'
    const doop = await connect()
    expect(doop.client.getInstructions()).toContain('call import_webpage FIRST')
    const tools = (await doop.client.listTools()).tools.map((tool) => tool.name)
    expect(tools).toEqual(
      expect.arrayContaining([
        'create_frame',
        'get_frame',
        'set_frame_html',
        'create_diagram',
        'get_diagram',
        'update_diagram',
        'list_components',
        'create_component',
        'get_component_preview',
      ]),
    )
  })
})
