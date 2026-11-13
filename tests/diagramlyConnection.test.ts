import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import { DiagramlyConnection } from '../server/diagramlyConnection'

const directories: string[] = []
afterEach(() => {
  vi.restoreAllMocks()
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true })
})

function setup() {
  const directory = mkdtempSync(path.join(tmpdir(), 'diagramly-connection-'))
  directories.push(directory)
  const request = vi.fn<typeof fetch>()
  const connection = new DiagramlyConnection(directory, 'test-installation-secret', 'https://diagramly.test', request)
  return { directory, request, connection }
}

const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })
const started = {
  deviceCode: 'private-device-code',
  userCode: 'TEST-2345',
  verificationUriComplete: 'https://diagramly.test/auth/device?code=TEST-2345',
  expiresIn: 600,
  interval: 5,
}
const approved = {
  status: 'approved',
  accessToken: 'private-cloud-bearer',
  expiresIn: 3600,
  user: { id: 'cloud-user', email: 'qa@example.test', name: 'QA' },
}

async function connect(set: ReturnType<typeof setup>) {
  set.request.mockResolvedValueOnce(response(started)).mockResolvedValueOnce(response(approved))
  const start = await set.connection.start('local-user')
  expect(start).not.toHaveProperty('deviceCode')
  const status = await set.connection.poll('local-user')
  expect(status.status).toBe('connected')
  expect(status).not.toHaveProperty('accessToken')
}

it('encrypts credentials, binds them to the local identity and restores safely after restart', async () => {
  const set = setup()
  await connect(set)
  const files = readdirSync(set.directory)
  expect(files).toHaveLength(1)
  const file = path.join(set.directory, files[0]!)
  expect(readFileSync(file).includes(Buffer.from(approved.accessToken))).toBe(false)
  expect(statSync(file).mode & 0o777).toBe(0o600)
  const reopened = new DiagramlyConnection(
    set.directory,
    'test-installation-secret',
    'https://diagramly.test',
    set.request,
  )
  expect(reopened.status('local-user')).toMatchObject({ status: 'connected', user: approved.user })
  expect(reopened.status('another-local-user')).toEqual({ status: 'disconnected' })
  expect(() =>
    new DiagramlyConnection(set.directory, 'wrong-secret', 'https://diagramly.test', set.request).status('local-user'),
  ).toThrow(/Reconnect/)
})

it('does not install an approved token after the user cancels a pending request', async () => {
  const set = setup()
  set.request.mockResolvedValueOnce(response(started))
  await set.connection.start('local-user')
  let approve: (response: Response) => void = () => {}
  set.request.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        approve = resolve
      }),
  )
  const poll = set.connection.poll('local-user')
  set.connection.disconnect('local-user')
  approve(response(approved))
  expect(await poll).toEqual({ status: 'cancelled' })
  expect(set.connection.status('local-user')).toEqual({ status: 'disconnected' })
})

it('rejects unexpected login destinations and follows no redirects with credentials', async () => {
  const set = setup()
  set.request.mockResolvedValueOnce(response({ ...started, verificationUriComplete: 'https://unexpected.test/login' }))
  await expect(set.connection.start('local-user')).rejects.toThrow(/unexpected/)
  expect(set.request.mock.calls[0]?.[1]?.redirect).toBe('error')
})

it('enforces the polling interval and reports expired credentials without changing local identities', async () => {
  const set = setup()
  set.request.mockResolvedValueOnce(response(started)).mockResolvedValueOnce(response({ status: 'pending' }))
  await set.connection.start('local-user')
  expect(await set.connection.poll('local-user')).toMatchObject({ status: 'pending' })
  expect(await set.connection.poll('local-user')).toMatchObject({ status: 'pending' })
  expect(set.request).toHaveBeenCalledTimes(2)
  set.connection.disconnect('local-user')
  await connect(set)
  vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 4_000_000)
  expect(set.connection.status('local-user').status).toBe('expired')
  await expect(set.connection.call('local-user', 'account')).rejects.toThrow(/Connect/)
})

it('delivers exactly one transaction via a bounded ticket and rejects mismatched backend acknowledgement', async () => {
  const set = setup()
  await connect(set)
  const ticket = set.connection.ticket('local-user', '100001', 'team-1')
  set.request.mockResolvedValueOnce(response({ delivered: true, transactionId: 'different' }))
  await expect(set.connection.deliver(ticket.deliveryTicket, '100001', 'signed-jws')).rejects.toThrow(
    /not been confirmed/,
  )
  await expect(set.connection.deliver(ticket.deliveryTicket, '100001', 'signed-jws')).rejects.toThrow(/expired/)
  const retry = set.connection.ticket('local-user', '100001', 'team-1')
  set.request.mockResolvedValueOnce(response({ delivered: true, transactionId: '100001' }))
  expect(await set.connection.deliver(retry.deliveryTicket, '100001', 'signed-jws')).toMatchObject({ delivered: true })
  const sent = set.request.mock.calls.at(-1)
  expect(sent?.[0]).toBe('https://diagramly.test/api/device-auth/apple/transactions')
  expect(JSON.parse(String(sent?.[1]?.body))).toEqual({ signedTransaction: 'signed-jws', teamId: 'team-1' })
})

it('revokes pending delivery tickets at sign-out and never treats a cloud 401 as a free plan', async () => {
  const set = setup()
  await connect(set)
  set.request.mockResolvedValueOnce(response({ error: 'invalid_token' }, 401))
  await expect(set.connection.call('local-user', 'account')).rejects.toMatchObject({ status: 401 })
  const ticket = set.connection.ticket('local-user', '100002')
  set.connection.disconnect('local-user')
  await expect(set.connection.deliver(ticket.deliveryTicket, '100002', 'signed-jws')).rejects.toMatchObject({
    status: 403,
  })
})

it('keeps the explicitly verified cloud team for later generation and after restart', async () => {
  const set = setup()
  await connect(set)
  set.request.mockResolvedValueOnce(response({ selectedTeamId: 'team-two', teams: [{ id: 'team-two' }] }))
  expect(await set.connection.account('local-user', 'team-two')).toMatchObject({ selectedTeamId: 'team-two' })
  const reopened = new DiagramlyConnection(
    set.directory,
    'test-installation-secret',
    'https://diagramly.test',
    set.request,
  )
  set.request.mockResolvedValueOnce(response({ selectedTeamId: 'team-two' }))
  await reopened.account('local-user')
  expect(set.request.mock.calls.at(-1)?.[0]).toBe('https://diagramly.test/api/device-auth/account?teamId=team-two')
  set.request.mockResolvedValueOnce(response({ error: 'forbidden' }, 403))
  await expect(reopened.account('local-user')).rejects.toMatchObject({ status: 403 })
  expect(set.request.mock.calls.at(-1)?.[0]).toContain('teamId=team-two')
})
