import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'

interface CloudUser {
  id: string
  name: string | null
  email: string
}
interface Connection {
  accessToken: string
  expiresAt: number
  user: CloudUser
  selectedTeamId?: string
}
interface Pending {
  deviceCode: string
  expiresAt: number
  nextPollAt: number
  interval: number
}
interface Ticket {
  userId: string
  transactionId: string
  teamId?: string
  expiresAt: number
}

export class DiagramlyError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message)
  }
}

/** Tokens never leave the local server. Domain-separated authenticated encryption
 * protects backups at rest; the installation session secret must be backed up separately. */
export class DiagramlyConnection {
  private key: Buffer
  private pending = new Map<string, Pending>()
  private tickets = new Map<string, Ticket>()

  constructor(
    private directory: string,
    secret: string,
    private origin: string,
    private request: typeof fetch = fetch,
  ) {
    this.key = createHash('sha256').update('diagramly-desktop-connection-v1\0').update(secret).digest()
    const url = new URL(origin)
    if (url.protocol !== 'https:' && !['127.0.0.1', 'localhost'].includes(url.hostname)) {
      throw new Error('Diagramly requires HTTPS, except for an explicit loopback test server')
    }
    this.origin = url.origin
  }

  private file(userId: string) {
    return path.join(this.directory, createHash('sha256').update(userId).digest('hex') + '.enc')
  }

  private read(userId: string): Connection | null {
    let body: Buffer
    try {
      body = readFileSync(this.file(userId))
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
      throw error
    }
    if (body.length < 28) throw new DiagramlyError(503, 'Cloud credentials could not be opened. Reconnect Diagramly.')
    try {
      const cipher = createDecipheriv('aes-256-gcm', this.key, body.subarray(0, 12))
      cipher.setAAD(Buffer.from(userId))
      cipher.setAuthTag(body.subarray(12, 28))
      return JSON.parse(Buffer.concat([cipher.update(body.subarray(28)), cipher.final()]).toString()) as Connection
    } catch {
      throw new DiagramlyError(503, 'Cloud credentials could not be opened. Reconnect Diagramly.')
    }
  }

  private write(userId: string, connection: Connection) {
    mkdirSync(this.directory, { recursive: true, mode: 0o700 })
    const iv = randomBytes(12)
    const cipher = createCipheriv('aes-256-gcm', this.key, iv)
    cipher.setAAD(Buffer.from(userId))
    const encrypted = Buffer.concat([cipher.update(JSON.stringify(connection)), cipher.final()])
    const temporary = this.file(userId) + '.' + randomBytes(8).toString('hex')
    writeFileSync(temporary, Buffer.concat([iv, cipher.getAuthTag(), encrypted]), { mode: 0o600 })
    renameSync(temporary, this.file(userId))
  }

  status(userId: string) {
    const connection = this.read(userId)
    return connection
      ? {
          status: connection.expiresAt > Date.now() ? 'connected' : 'expired',
          user: connection.user,
          expiresAt: connection.expiresAt,
        }
      : { status: 'disconnected' }
  }

  disconnect(userId: string) {
    rmSync(this.file(userId), { force: true })
    this.pending.delete(userId)
    for (const [key, ticket] of this.tickets) if (ticket.userId === userId) this.tickets.delete(key)
  }

  private async json(endpoint: string, init: RequestInit = {}) {
    let response: Response
    try {
      response = await this.request(`${this.origin}/api/device-auth/${endpoint}`, {
        ...init,
        redirect: 'error',
        signal: AbortSignal.timeout(20_000),
      })
    } catch {
      throw new DiagramlyError(503, 'Diagramly could not be reached. Local documents remain available.')
    }
    if (!response.ok)
      throw new DiagramlyError(
        response.status === 401 ? 401 : response.status === 403 ? 403 : 503,
        response.status === 401
          ? 'Diagramly sign-in has expired. Reconnect your cloud account.'
          : response.status === 403
            ? 'This Diagramly account does not have access. Reconnect with the required permissions.'
            : 'This Diagramly service is unavailable. No local data was changed.',
      )
    return response.json() as Promise<Record<string, unknown>>
  }

  async start(userId: string) {
    this.pending.delete(userId)
    const result = await this.json('create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clientName: 'Diagramly Desktop',
        scopes: ['account:read', 'diagram:write', 'diagram:preview', 'apple:write', 'generation:write'],
      }),
    })
    const { deviceCode, userCode, verificationUriComplete, expiresIn, interval } = result
    if (
      typeof deviceCode !== 'string' ||
      typeof userCode !== 'string' ||
      typeof verificationUriComplete !== 'string' ||
      typeof expiresIn !== 'number'
    )
      throw new DiagramlyError(503, 'Invalid Diagramly sign-in response.')
    const verification = new URL(verificationUriComplete)
    if (verification.origin !== this.origin)
      throw new DiagramlyError(503, 'Diagramly returned an unexpected sign-in destination.')
    const seconds = Math.max(5, typeof interval === 'number' ? interval : 5)
    const expiresAt = Date.now() + Math.min(expiresIn, 600) * 1000
    this.pending.set(userId, { deviceCode, expiresAt, nextPollAt: 0, interval: seconds })
    return { userCode, verificationUriComplete: verification.href, expiresAt, interval: seconds }
  }

  async poll(userId: string) {
    const flow = this.pending.get(userId)
    if (!flow) return this.status(userId)
    if (flow.expiresAt <= Date.now()) {
      this.pending.delete(userId)
      return { status: 'expired' }
    }
    if (flow.nextPollAt > Date.now()) return { status: 'pending', interval: flow.interval }
    flow.nextPollAt = Date.now() + flow.interval * 1000
    const result = await this.json('poll', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deviceCode: flow.deviceCode }),
    })
    // A cancelled/replaced request must never install a late token.
    if (this.pending.get(userId) !== flow) return { status: 'cancelled' }
    if (result.status === 'pending') return { status: 'pending', interval: flow.interval }
    if (result.status !== 'approved') {
      this.pending.delete(userId)
      return { status: typeof result.status === 'string' ? result.status : 'failed' }
    }
    const user = result.user as Partial<CloudUser> | null
    if (
      typeof result.accessToken !== 'string' ||
      typeof result.expiresIn !== 'number' ||
      !user ||
      typeof user.id !== 'string' ||
      typeof user.email !== 'string'
    )
      throw new DiagramlyError(503, 'Invalid Diagramly account response.')
    this.write(userId, {
      accessToken: result.accessToken,
      expiresAt: Date.now() + result.expiresIn * 1000,
      user: { id: user.id, email: user.email, name: typeof user.name === 'string' ? user.name : null },
    })
    this.pending.delete(userId)
    return this.status(userId)
  }

  async account(userId: string, requestedTeamId?: string) {
    const connection = this.read(userId)
    const teamId = requestedTeamId ?? connection?.selectedTeamId
    const result = await this.call(userId, 'account' + (teamId ? `?teamId=${encodeURIComponent(teamId)}` : ''))
    const current = this.read(userId)
    if (!connection || !current || current.accessToken !== connection.accessToken) {
      throw new DiagramlyError(409, 'Your cloud account changed. Refresh before continuing.')
    }
    if (typeof result.selectedTeamId !== 'string' || (teamId && result.selectedTeamId !== teamId)) {
      throw new DiagramlyError(503, 'Diagramly did not verify the selected team.')
    }
    this.write(userId, { ...current, selectedTeamId: result.selectedTeamId })
    return result
  }

  async call(userId: string, endpoint: string, body?: unknown) {
    const connection = this.read(userId)
    if (!connection || connection.expiresAt <= Date.now())
      throw new DiagramlyError(401, 'Connect your Diagramly cloud account first.')
    return this.json(endpoint, {
      method: body === undefined ? 'GET' : 'POST',
      headers: {
        Authorization: `Bearer ${connection.accessToken}`,
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    })
  }

  ticket(userId: string, transactionId: string, teamId?: string) {
    if (!/^[A-Za-z0-9._-]{1,128}$/.test(transactionId)) throw new DiagramlyError(400, 'Invalid transaction ID.')
    const connection = this.status(userId)
    if (connection.status !== 'connected')
      throw new DiagramlyError(401, 'Connect Diagramly before restoring or delivering a purchase.')
    for (const [key, ticket] of this.tickets)
      if (ticket.expiresAt < Date.now() || ticket.userId === userId) this.tickets.delete(key)
    if (this.tickets.size > 128) throw new DiagramlyError(429, 'Too many pending deliveries.')
    const deliveryTicket = randomBytes(32).toString('base64url')
    this.tickets.set(deliveryTicket, { userId, transactionId, teamId, expiresAt: Date.now() + 60_000 })
    return { deliveryTicket }
  }

  async deliver(deliveryTicket: string, transactionId: string, signedTransaction: string) {
    const ticket = this.tickets.get(deliveryTicket)
    this.tickets.delete(deliveryTicket)
    if (!ticket || ticket.expiresAt <= Date.now() || ticket.transactionId !== transactionId)
      throw new DiagramlyError(403, 'Purchase delivery authorization has expired. Retry safely.')
    const result = await this.call(ticket.userId, 'apple/transactions', {
      signedTransaction,
      ...(ticket.teamId ? { teamId: ticket.teamId } : {}),
    })
    if (result.delivered !== true || result.transactionId !== transactionId)
      throw new DiagramlyError(503, 'Purchase delivery has not been confirmed. Use Restore Purchases to retry.')
    return result
  }
}
