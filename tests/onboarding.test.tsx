// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { AgentTask, Presence } from '../shared/types'

vi.mock('../src/lib/posthog', () => ({ posthog: { capture: vi.fn() } }))
import { Onboarding } from '../src/components/Onboarding'
import { api } from '../src/lib/api'
import { useStore } from '../src/lib/store'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const user = { id: 'peng', name: 'Peng Xiao', email: 'peng@example.test' }
const allowance = { used: 0, limit: 0, connected: true, byoModel: false, onOwnAccount: false }
let container: HTMLDivElement
let root: Root

beforeEach(() => {
  localStorage.clear()
  useStore.setState({ tasks: [], presences: {} })
  vi.spyOn(api, 'agentAllowance').mockResolvedValue(allowance)
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  vi.restoreAllMocks()
  vi.useRealTimers()
})

async function render(account = user, canvasId = 'canvas') {
  await act(async () =>
    root.render(<Onboarding key={`${account.id}:${canvasId}`} canvasId={canvasId} user={account} />),
  )
}

function complete(label: string): boolean {
  const step = container.querySelector(`[role="group"][aria-label="${label}"]`)
  expect(step, `Missing step ${label}`).not.toBeNull()
  return Boolean(step?.querySelector('[aria-label="Complete"]'))
}

it('detects an account connection before the agent opens any canvas', async () => {
  await render()
  expect(api.agentAllowance).toHaveBeenCalled()
  expect(complete('Connect AI')).toBe(true)
  expect(complete('Open this canvas in your agent')).toBe(false)
  expect(complete('Create or edit a frame')).toBe(false)
  expect(container.textContent).toContain(user.email)
  expect(container.textContent).toContain('copy a starter prompt')
})

it('rechecks when returning from OAuth and keeps a connection check error distinct from disconnected', async () => {
  vi.mocked(api.agentAllowance).mockRejectedValueOnce(new Error('offline'))
  await render()
  expect(container.textContent).toContain('Could not check the connection')
  expect(complete('Connect AI')).toBe(false)
  await act(async () => window.dispatchEvent(new Event('focus')))
  expect(complete('Connect AI')).toBe(true)
})

it('detects a connection made while the checklist remains open', async () => {
  vi.useFakeTimers()
  vi.mocked(api.agentAllowance).mockResolvedValueOnce({ ...allowance, connected: false })
  await render()
  expect(complete('Connect AI')).toBe(false)
  await act(async () => {
    await vi.advanceTimersByTimeAsync(3000)
  })
  expect(complete('Connect AI')).toBe(true)
})

it('ignores a connection response belonging to the account that signed out', async () => {
  let finish!: (result: typeof allowance) => void
  vi.mocked(api.agentAllowance).mockReturnValueOnce(
    new Promise((resolve) => {
      finish = resolve
    }),
  )
  await render({ id: 'qa', name: 'QA', email: 'qa@example.test' })
  await render()
  expect(complete('Connect AI')).toBe(true)
  await act(async () => finish({ ...allowance, connected: false }))
  expect(complete('Connect AI')).toBe(true)
})

it('distinguishes arrival, task announcements, failed work, and an actual frame change', async () => {
  await render()
  const presence: Presence = { clientId: 'agent', kind: 'agent', name: 'Claude Code', color: '#000' }
  await act(async () => useStore.setState({ presences: { agent: presence } }))
  expect(complete('Open this canvas in your agent')).toBe(true)
  const task: AgentTask = { id: 'task', agentName: 'Claude Code', color: '#000', status: 'Drawing', startedAt: 1 }
  await act(async () => useStore.setState({ tasks: [task] }))
  expect(complete('Create or edit a frame')).toBe(false)
  await act(async () => useStore.setState({ tasks: [{ ...task, endedAt: 2, failedAt: 2 }] }))
  expect(complete('Create or edit a frame')).toBe(false)
  await act(async () => useStore.setState({ tasks: [{ ...task, endedAt: 3 }] }))
  expect(complete('Create or edit a frame')).toBe(false)
  await act(async () => useStore.setState({ tasks: [{ ...task, frameIds: ['result'] }] }))
  expect(complete('Create or edit a frame')).toBe(true)
})

it('isolates progress between accounts and canvases, including legacy browser-wide progress', async () => {
  localStorage.setItem('doop:onboarding', JSON.stringify({ connected: true, tasked: true }))
  vi.mocked(api.agentAllowance).mockResolvedValue({ ...allowance, connected: false })
  await render({ id: 'qa', name: 'QA', email: 'qa@example.test' })
  expect(complete('Connect AI')).toBe(false)
  await render()
  expect(complete('Connect AI')).toBe(false)
  vi.mocked(api.agentAllowance).mockResolvedValue(allowance)
  await act(async () => window.dispatchEvent(new Event('focus')))
  await act(async () =>
    useStore.setState({
      tasks: [
        {
          id: 'task',
          agentName: 'Claude Code',
          color: '#000',
          status: 'Done',
          startedAt: 1,
          endedAt: 2,
          frameIds: ['result'],
        },
      ],
    }),
  )
  expect(complete('Create or edit a frame')).toBe(true)
  await act(async () => useStore.setState({ tasks: [], presences: {} }))
  await render(user, 'another-canvas')
  expect(complete('Connect AI')).toBe(true)
  expect(complete('Open this canvas in your agent')).toBe(false)
  expect(complete('Create or edit a frame')).toBe(false)
  await render()
  expect(complete('Create or edit a frame')).toBe(true)
})
