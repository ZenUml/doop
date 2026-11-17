import { expect, it, vi } from 'vitest'

const settings = vi.hoisted(() => ({
  DIAGRAMLY_APNS_TEAM_ID: 'team',
  DIAGRAMLY_APNS_KEY_ID: 'key',
  DIAGRAMLY_APNS_PRIVATE_KEY: 'private-key',
  DIAGRAMLY_APNS_BUNDLE_ID: '',
}))
vi.mock('../server/env.ts', () => ({ env: settings }))

it('requires our app bundle ID before enabling live activity delivery', async () => {
  const { apnsConfigured } = await import('../server/apns.ts')
  expect(apnsConfigured()).toBe(false)
  settings.DIAGRAMLY_APNS_BUNDLE_ID = 'ai.example.app'
  expect(apnsConfigured()).toBe(true)
})
