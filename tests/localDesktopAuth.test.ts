import { describe, expect, it } from 'vitest'
import { isLocalDesktopRequest, type LocalDesktopRequest } from '../server/localDesktopAuth.ts'

const ok: LocalDesktopRequest = {
  desktop: true,
  port: 58188,
  remoteAddress: '127.0.0.1',
  host: '127.0.0.1:58188',
  origin: undefined,
  secFetchSite: undefined,
}

describe('isLocalDesktopRequest', () => {
  it('accepts a loopback request with no origin (a CLI agent)', () => {
    expect(isLocalDesktopRequest(ok)).toBe(true)
  })
  it.each(['localhost:58188', '127.0.0.1:58188', '[::1]:58188'])('accepts Host %s', (host) => {
    expect(isLocalDesktopRequest({ ...ok, host })).toBe(true)
  })
  it.each(['::1', '::ffff:127.0.0.1'])('accepts loopback socket %s', (remoteAddress) => {
    expect(isLocalDesktopRequest({ ...ok, remoteAddress })).toBe(true)
  })
  it('never trusts a hosted server', () => {
    expect(isLocalDesktopRequest({ ...ok, desktop: false })).toBe(false)
  })
  it.each(['evil.example', 'evil.example:58188', '127.0.0.1', '127.0.0.1:1', 'localhost.evil.example:58188', undefined])(
    'rejects Host %s (DNS rebinding)',
    (host) => {
      expect(isLocalDesktopRequest({ ...ok, host })).toBe(false)
    },
  )
  it.each(['10.0.0.5', '192.168.1.9', '::ffff:10.0.0.5', undefined])('rejects socket address %s', (remoteAddress) => {
    expect(isLocalDesktopRequest({ ...ok, remoteAddress })).toBe(false)
  })
  it('rejects a foreign Origin but allows the app\'s own', () => {
    expect(isLocalDesktopRequest({ ...ok, origin: 'https://evil.example' })).toBe(false)
    expect(isLocalDesktopRequest({ ...ok, origin: 'http://127.0.0.1:58188' })).toBe(true)
  })
  it('rejects cross-site fetches', () => {
    expect(isLocalDesktopRequest({ ...ok, secFetchSite: 'cross-site' })).toBe(false)
    expect(isLocalDesktopRequest({ ...ok, secFetchSite: 'same-origin' })).toBe(true)
  })
})
