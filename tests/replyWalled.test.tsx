// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

vi.mock('../src/lib/posthog', () => ({ posthog: { capture: vi.fn() } }))
vi.mock('../src/lib/api', () => ({
  api: { agentAllowance: () => Promise.resolve({ limit: 0, used: 0 }) },
  ApiError: class extends Error {},
}))

const { CommentThread } = await import('../src/components/CommentPopovers')
const { markWalled } = await import('../src/lib/comments')

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

const thread = [
  { id: 'c1', from: 'Alex', text: 'hello', createdAt: 1, status: 'open' },
] as never

async function sendReply(onReply: (text: string) => Promise<unknown>) {
  act(() => root.render(<CommentThread thread={thread} onReply={onReply} onResolve={() => {}} onRetry={() => {}} />))
  const input = document.body.querySelector('textarea, input') as HTMLTextAreaElement
  const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input), 'value')!.set!
  await act(async () => {
    setter.call(input, 'hi')
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
  const send = [...document.body.querySelectorAll('button')].find((b) => b.textContent === 'Reply')!
  await act(async () => {
    send.click()
  })
}

it('shows the retry message when a reply fails', async () => {
  await sendReply(() => Promise.reject(new Error('boom')))
  expect(document.body.textContent).toContain('did not go through')
})

it('stays quiet when a wall (the connect dialog) already explained the rejection', async () => {
  await sendReply(() => Promise.reject(markWalled(new Error('limit'))))
  expect(document.body.textContent).not.toContain('did not go through')
})
