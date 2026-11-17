// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, expect, it, vi } from 'vitest'
import { useResumeMcpOAuth } from '../src/lib/mcpOAuthResume'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

afterEach(() => vi.unstubAllGlobals())

it('resumes the authorization request when a session is restored or becomes signed in', async () => {
  const assign = vi.fn()
  const search = '?response_type=code&client_id=abc&redirect_uri=http%3A%2F%2Flocalhost%3A1234%2Fcallback&state=xyz'
  vi.stubGlobal('location', { pathname: '/', search, assign })
  const host = document.createElement('div')
  const root = createRoot(host)
  function Page({ signedIn }: { signedIn: boolean }) {
    useResumeMcpOAuth(signedIn)
    return null
  }
  await act(async () => root.render(<Page signedIn={false} />))
  expect(assign).not.toHaveBeenCalled()
  await act(async () => root.render(<Page signedIn />))
  expect(assign).toHaveBeenCalledExactlyOnceWith(`/api/auth/mcp/authorize${search}`)
  await act(async () => root.unmount())
})

it('does not redirect consent pages or ordinary homepage visits', async () => {
  const assign = vi.fn()
  vi.stubGlobal('location', { pathname: '/oauth/consent', search: '?response_type=code&client_id=abc', assign })
  const host = document.createElement('div')
  const root = createRoot(host)
  function Page() {
    useResumeMcpOAuth(true)
    return null
  }
  await act(async () => root.render(<Page />))
  expect(assign).not.toHaveBeenCalled()
  await act(async () => root.unmount())
})

it('resumes immediately for an existing session and ignores unrelated query parameters', async () => {
  const assign = vi.fn()
  const location = { pathname: '/', search: '?client_id=abc', assign }
  vi.stubGlobal('location', location)
  const host = document.createElement('div')
  const root = createRoot(host)
  function Page() {
    useResumeMcpOAuth(true)
    return null
  }
  await act(async () => root.render(<Page />))
  expect(assign).not.toHaveBeenCalled()
  await act(async () => root.unmount())
  location.search = '?client_id=abc&response_type=code'
  const restoredRoot = createRoot(host)
  await act(async () => restoredRoot.render(<Page />))
  expect(assign).toHaveBeenCalledExactlyOnceWith('/api/auth/mcp/authorize?client_id=abc&response_type=code')
  await act(async () => restoredRoot.unmount())
})
