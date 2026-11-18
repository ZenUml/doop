// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, expect, it, vi } from 'vitest'

const cloud = vi.hoisted(() => ({
  request: vi.fn().mockResolvedValue({ status: 'disconnected' }),
  apple: vi.fn().mockResolvedValue({ products: [] }),
}))
vi.mock('../src/lib/auth', () => ({
  authClient: {
    useSession: () => ({ data: { user: { name: 'Local Owner', email: 'local@test.dev' } } }),
    signOut: vi.fn(),
  },
}))
vi.mock('../src/lib/diagramly', () => ({
  diagramlyRequest: cloud.request,
  appleRequest: cloud.apple,
  hasApplePurchases: () => true,
  deliverAppleTransaction: vi.fn(),
}))
vi.mock('../src/lib/navigate', () => ({ navigate: vi.fn() }))
vi.mock('../src/components/ConnectModal', () => ({ ConnectModal: () => <div>External AI connection</div> }))
vi.mock('../src/components/AgentKeys', () => ({ AgentKeys: () => <div>External agent keys</div> }))
vi.mock('../src/components/AppearanceSettings', () => ({ AppearanceSettings: () => <div>Appearance controls</div> }))
const { DiagramlySettings } = await import('../src/pages/DiagramlySettings')
const { DiagramlyHomeHero } = await import('../src/components/DiagramlyHomeHero')
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
let root: Root | undefined
let container: HTMLDivElement
function render(element: React.ReactNode) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  act(() => root!.render(element))
}
afterEach(() => {
  act(() => root?.unmount())
  container?.remove()
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})
it('desktop settings retain local profile, appearance and agent access without cloud or Apple requests', async () => {
  vi.stubGlobal('__DIAGRAMLY_DESKTOP__', '1.1.0')
  await act(async () => render(<DiagramlySettings />))
  expect(container.textContent).toContain('Local Owner')
  expect(container.textContent).not.toMatch(
    /Account & subscription|Sign in to Diagramly|Apple|Pro subscription|Cloud actions/,
  )
  expect(cloud.request).not.toHaveBeenCalled()
  expect(cloud.apple).not.toHaveBeenCalled()
  const button = (name: string) => [...container.querySelectorAll('button')].find((el) => el.textContent === name)!
  act(() => button('AI agent access').click())
  expect(container.textContent).toContain('External agent keys')
  act(() => button('Appearance').click())
  expect(container.textContent).toContain('Appearance controls')
})
it('desktop home keeps new diagram actions and external agent connection without cloud prompt', () => {
  vi.stubGlobal('__DIAGRAMLY_DESKTOP__', '1.1.0')
  const create = vi.fn()
  const connect = vi.fn()
  render(
    <DiagramlyHomeHero
      prompt=""
      onPromptChange={vi.fn()}
      onContinue={vi.fn()}
      onCreate={create}
      onImport={vi.fn()}
      onConnect={connect}
    />,
  )
  expect(container.querySelector('textarea')).toBeNull()
  expect(container.textContent).not.toContain('cloud AI')
  const buttons = [...container.querySelectorAll('button')]
  act(() => buttons.find((el) => el.textContent === 'Sequence diagram')!.click())
  act(() => buttons.find((el) => el.textContent === 'Mermaid flowchart')!.click())
  act(() => buttons.find((el) => el.textContent === 'Connect your agent')!.click())
  expect(create.mock.calls).toEqual([['zenuml'], ['mermaid']])
  expect(connect).toHaveBeenCalledOnce()
})
it('keeps the existing web cloud settings and generation entry', async () => {
  await act(async () => render(<DiagramlySettings />))
  expect(container.textContent).toContain('Account & subscription')
  expect(cloud.request).toHaveBeenCalled()
  expect(cloud.apple).toHaveBeenCalled()
  act(() => root!.unmount())
  root = undefined
  container.remove()
  render(
    <DiagramlyHomeHero
      prompt=""
      onPromptChange={vi.fn()}
      onContinue={vi.fn()}
      onCreate={vi.fn()}
      onImport={vi.fn()}
      onConnect={vi.fn()}
    />,
  )
  expect(container.querySelector('textarea')).not.toBeNull()
  expect(container.textContent).toContain('Diagramly cloud AI')
})
