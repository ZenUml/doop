// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { appendFileSync, writeFileSync } from 'node:fs'

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  capture: vi.fn(),
  native: false,
  codex: false,
  desktop: false,
  addToDesktop: vi.fn(),
  createAgentKey: vi.fn(),
  presences: {} as Record<string, { clientId: string; kind: string; name: string; color: string }>,
}))
vi.mock('../src/lib/shell', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/lib/shell')>()),
  isDesktopShell: () => mocks.desktop,
}))
vi.mock('../src/lib/claudeConnection', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/lib/claudeConnection')>()),
  canAddToClaudeDesktop: () => mocks.native,
  addToClaudeDesktop: mocks.addToDesktop,
}))
vi.mock('../src/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/lib/api')>()),
  api: { createAgentKey: mocks.createAgentKey },
}))
vi.mock('../src/lib/codexConnection', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/lib/codexConnection')>()),
  canAddToCodex: () => mocks.codex,
}))
vi.mock('../src/App', () => ({ navigate: mocks.navigate }))
vi.mock('../src/lib/posthog', () => ({ posthog: { capture: mocks.capture } }))
vi.mock('../src/lib/store', () => ({
  useStore: (select: (s: { presences: typeof mocks.presences }) => unknown) => select({ presences: mocks.presences }),
}))
import { AgentArrival, ConnectModal } from '../src/components/ConnectModal'
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let root: Root
let container: HTMLDivElement
const onClose = vi.fn()
const buttons = () => Array.from(document.body.querySelectorAll('button'))
const button = (label: string) => buttons().find((b) => b.textContent?.trim() === label)
const click = (label: string) =>
  act(async () => {
    const b = button(label)
    if (!b) throw new Error(`no button "${label}"`)
    b.click()
  })
/* a row on the picker opens that agent's steps */
const pickAgent = (name: string) =>
  act(async () => {
    buttons()
      .find((b) => b.dataset.slot === 'choice-row' && b.textContent?.includes(name))!
      .click()
  })
const text = () => document.body.textContent ?? ''

const mount = async (canvasId?: string) => {
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  await act(async () => root.render(<ConnectModal canvasId={canvasId} onClose={onClose} />))
}
afterEach(async () => {
  await act(async () => root?.unmount())
  container?.remove()
  document.body.innerHTML = ''
})

const AGENTS = [
  'Claude Code',
  'Add Diagramly to Claude',
  'ChatGPT',
  'Codex',
  'Cursor',
  'Other MCP client',
  'Headless agent or server',
]
/* what the person reads on this server: the local desktop server answers agents on this machine without a
   sign-in, so any of these words tells them to do something that cannot work there (or does not exist) */
const SIGN_IN =
  /\bsign[- ]?in\b|\blog ?in\b|\bOAuth\b|Authenticate|browser that opens|approve (the )?connection|public(ly)? (reachable )?HTTPS/i
const DUMP = process.env.CONNECT_DUMP

const cells: [string, boolean, string | undefined, boolean, boolean][] = []
for (const server of ['local', 'hosted-desktop'])
  for (const canvas of [undefined, 'c1'])
    for (const native of [false, true])
      for (const codex of [false, true]) cells.push([server, native, canvas, codex, true])

describe.each(cells)(
  'Connect AI on %s (claude native %s, canvas %s, codex native %s)',
  (server, native, canvas, codex) => {
    beforeEach(() => {
      vi.clearAllMocks()
      mocks.desktop = true
      mocks.native = native
      mocks.codex = codex
      vi.stubGlobal('location', new URL(server === 'local' ? 'http://127.0.0.1:58188' : 'https://design.acme.com'))
    })
    it.each(AGENTS)('%s', async (agent) => {
      await mount(canvas)
      if (agent === 'Add Diagramly to Claude' && server === 'local') {
        /* Claude Code already covers this machine; the Claude Desktop extension is not offered here */
        expect(button('Claude Add Diagramly to Claude'), 'no Claude card on the local server').toBeUndefined()
        expect(text()).not.toContain('Add Diagramly to Claude')
        return
      }
      await pickAgent(agent)
      const variants =
        agent === 'Add Diagramly to Claude' && server === 'hosted-desktop'
          ? ['web', 'desktop']
          : agent === 'Other MCP client' && server === 'hosted-desktop'
            ? ['browser', 'key']
            : ['']
      for (const v of variants) {
        if (v === 'desktop') await click('Desktop app')
        if (v === 'key') await click('Agent key (headless)')
        if (v === 'web') await click('Connect online')
        const shown = text()
        /* saying that no sign-in is needed is the point; asking for one is the bug */
        const asks = shown.replace(/\bno sign-in\b( is needed)?/gi, '')
        if (DUMP)
          appendFileSync(
            DUMP,
            `\n=== ${server} | native=${native} codex=${codex} | canvas=${canvas ?? 'none'} | ${agent} ${v}\n${shown}\n`,
          )
        if (server === 'local') {
          const hit = SIGN_IN.exec(asks)
          expect(hit ? asks.slice(Math.max(0, hit.index - 70), hit.index + 50) : null, `${agent} ${v}`).toBeNull()
          /* a tab whose only content is "choose the other tab" is a dead end */
          expect(button('Connect online'), `${agent}: dead tab`).toBeUndefined()
          if (agent === 'Other MCP client')
            expect(button('Agent key (headless)'), 'no key tab on the local server').toBeUndefined()
        }
      }
    })
  },
)
