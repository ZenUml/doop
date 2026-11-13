import { createServer, type Server as HttpServer } from 'node:http'
import type { Page } from 'puppeteer-core'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { findBrowserPath } from '../server/screenshot'
import { pagePerTest, serveBuilt, type BuiltServer } from './browser'
import { freePort, startServer, type Server } from './harness'

interface FixtureCall {
  action: string
  payload?: Record<string, unknown>
}
type FixtureWindow = Window & {
  diagramlyCloudFixtureCalls: FixtureCall[]
  __DIAGRAMLY_STOREKIT__: { request(action: string, payload?: Record<string, unknown>): Promise<unknown> }
}

// Only the cloud boundary and native adapter are fixtures. The production App,
// local cookie login, device-flow proxy, encrypted connection and delivery-ticket
// routes run against a real ephemeral server. This does not test live Apple IAP.
describe.skipIf(!findBrowserPath())('Diagramly cloud UI with a fixture cloud (no live IAP)', () => {
  const pages = pagePerTest()
  let cloud: HttpServer
  let cloudOrigin: string
  let web: BuiltServer
  let local: Server
  let accountStatus = 503
  let polls = 0
  let purchaseContexts = 0
  let deliveries: { authorization?: string; body: Record<string, unknown> }[] = []

  beforeAll(async () => {
    cloud = createServer(async (request, response) => {
      const url = new URL(request.url ?? '/', cloudOrigin)
      const json = (body: unknown, status = 200) => {
        response.writeHead(status, { 'Content-Type': 'application/json' })
        response.end(JSON.stringify(body))
      }
      if (url.pathname === '/api/device-auth/create')
        return json({
          deviceCode: 'fixture-private-device-code',
          userCode: 'FIXTURE-1234',
          verificationUriComplete: `${cloudOrigin}/desktop-authorize?code=FIXTURE-1234`,
          expiresIn: 600,
          interval: 5,
        })
      if (url.pathname === '/api/device-auth/poll') {
        polls++
        return json({
          status: 'approved',
          accessToken: 'fixture-cloud-bearer',
          expiresIn: 3600,
          user: { id: 'fixture-cloud-owner', name: 'Fixture cloud owner', email: 'cloud-owner@example.test' },
        })
      }
      if (url.pathname === '/api/device-auth/account') {
        if (accountStatus !== 200) return json({ error: 'Fixture cloud failure' }, accountStatus)
        return json({
          user: { id: 'fixture-cloud-owner', name: 'Fixture cloud owner', email: 'cloud-owner@example.test' },
          teams: [{ id: 'fixture-team', name: 'Fixture Research Team', role: 'owner' }],
          selectedTeamId: 'fixture-team',
          allowance: { allowed: false, reason: 'subscription_required' },
        })
      }
      if (url.pathname === '/api/device-auth/apple/purchase-context') {
        purchaseContexts++
        return json({
          eligible: false,
          reason: 'apple_unavailable',
          appAccountToken: '7d3b230d-9876-4fc3-83f6-d412a4707925',
        })
      }
      if (url.pathname === '/api/device-auth/apple/transactions') {
        let data = ''
        for await (const chunk of request) data += String(chunk)
        deliveries.push({
          authorization: request.headers.authorization,
          body: JSON.parse(data) as Record<string, unknown>,
        })
        return json({ delivered: true, transactionId: 'fixture-restored-transaction' })
      }
      json({ error: 'Unknown fixture route' }, 404)
    })
    await new Promise<void>((resolve) => cloud.listen(0, '127.0.0.1', resolve))
    const address = cloud.address()
    if (!address || typeof address === 'string') throw new Error('Fixture cloud did not bind')
    cloudOrigin = `http://127.0.0.1:${address.port}`
    const port = await freePort()
    web = await serveBuilt({
      '/api': { target: `http://localhost:${port}` },
      '/i': { target: `http://localhost:${port}` },
      '/ws': { target: `ws://localhost:${port}`, ws: true },
      '/vendor/diagram': { target: `http://localhost:${port}` },
    })
    local = await startServer({
      PORT: String(port),
      BETTER_AUTH_URL: web.origin,
      DOOP_PRODUCT: 'diagramly',
      DIAGRAMLY_ORIGIN: cloudOrigin,
    })
  }, 60_000)

  afterAll(async () => {
    await web?.close()
    local?.stop()
    await local?.stopped
    await new Promise<void>((resolve, reject) => cloud?.close((error) => (error ? reject(error) : resolve())))
  })
  beforeEach(() => {
    polls = 0
    purchaseContexts = 0
    deliveries = []
    accountStatus = 503
  })

  async function prepare() {
    const page = await pages.open()
    await page.browserContext().deleteCookie(...(await page.browserContext().cookies()))
    await page.setViewport({ width: 1400, height: 1100 })
    await page.evaluateOnNewDocument(() => {
      const fixture = window as unknown as FixtureWindow
      fixture.diagramlyCloudFixtureCalls = []
      fixture.__DIAGRAMLY_STOREKIT__ = {
        async request(action, payload) {
          fixture.diagramlyCloudFixtureCalls.push({ action, payload })
          if (action === 'products')
            return {
              products: [
                {
                  id: 'ai.diagramly.desktop.pro.monthly',
                  displayName: 'Fixture Pro Monthly',
                  displayPrice: '€12,49',
                  description: 'Fixture subscription',
                },
              ],
            }
          if (action === 'restore')
            return {
              transactions: [
                { transactionId: 'fixture-restored-transaction', productId: 'ai.diagramly.desktop.pro.monthly' },
              ],
            }
          if (action === 'deliver') {
            const response = await fetch('/api/diagramly/apple/deliver', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ ...payload, signedTransaction: 'fixture-only-signed-transaction' }),
            })
            const result: unknown = await response.json()
            if (!response.ok) throw new Error('Fixture delivery was not confirmed')
            return result
          }
          throw new Error(`Unexpected fixture native action: ${action}`)
        },
      }
    })
    await page.goto(web.origin)
    await page.evaluate(async () => {
      const response = await fetch('/api/auth/sign-up/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Local cloud-flow QA',
          email: `cloud-flow-${crypto.randomUUID()}@test.dev`,
          password: 'password12345',
        }),
      })
      if (!response.ok) throw new Error('Could not create isolated local profile')
    })
    await page.reload()
    await page.locator('button::-p-text(Flowchart)').click()
    await page.waitForSelector('iframe[data-doop-frame]')
    const savedDocument = await page.evaluate(async () => {
      const list = (await (await fetch('/api/canvases')).json()) as { id: string }[]
      const saved = (await (await fetch(`/api/canvases/${list[0]!.id}`)).json()) as {
        id: string
        frames: { html: string }[]
      }
      return { id: saved.id, html: saved.frames[0]!.html }
    })
    await page.goto(`${web.origin}/settings`)
    await page.waitForFunction(() => document.body.innerText.includes('Status: disconnected'))
    await page.waitForFunction(() =>
      [...document.querySelectorAll('button')].some((button) => button.textContent?.includes('Fixture Pro Monthly')),
    )
    return { page, document: savedDocument }
  }

  async function signIn(page: Page) {
    const accountResponse = page.waitForResponse(
      (response) => new URL(response.url()).pathname === '/api/diagramly/account',
    )
    await page.locator('button::-p-text(Sign in to Diagramly)').click()
    await page.waitForFunction(() => document.body.innerText.includes('FIXTURE-1234'))
    await page.waitForFunction(() => document.body.innerText.includes('cloud-owner@example.test'), { timeout: 15_000 })
    await accountResponse
    expect(polls).toBe(1)
  }
  async function purchaseDisabled(page: Page) {
    return page.$$eval('button', (buttons) =>
      buttons
        .filter(
          (button) =>
            button.textContent?.includes('Fixture Pro Monthly') || button.textContent?.includes('Restore Purchases'),
        )
        .map((button) => button.disabled),
    )
  }

  it.each([503, 401])(
    'does not treat a device approval as verified cloud access when account returns %s',
    async (failure) => {
      accountStatus = failure
      const { page, document: saved } = await prepare()
      expect(await purchaseDisabled(page)).toEqual([true, true])
      await signIn(page)
      await page.waitForSelector('[role="alert"]')
      expect(await page.$eval('body', (element) => element.innerText)).toContain('signed in; cloud access not verified')
      expect(await purchaseDisabled(page)).toEqual([true, true])
      expect(await page.$eval('body', (element) => element.innerText)).not.toContain('fixture-cloud-bearer')
      const connection = await page.evaluate(
        async () => (await (await fetch('/api/diagramly/connection')).json()) as unknown,
      )
      expect(connection).toMatchObject({ status: 'connected' })
      expect(connection).not.toHaveProperty('accessToken')
      expect(JSON.stringify(connection)).not.toContain('fixture-cloud-bearer')

      accountStatus = 200
      await page.locator('button::-p-text(Refresh status)').click()
      await page.waitForFunction(() => document.body.innerText.includes('Status: cloud access verified'))
      expect(await page.$eval('body', (element) => element.innerText)).toContain('Fixture Research Team')
      expect(await purchaseDisabled(page)).toEqual([false, false])
      await page.locator('button::-p-text(Fixture Pro Monthly)').click()
      await page.waitForFunction(() => document.body.innerText.includes('Apple purchases are not enabled'))
      expect(purchaseContexts).toBe(1)
      expect(
        await page.evaluate(() =>
          (window as unknown as FixtureWindow).diagramlyCloudFixtureCalls.some((call) => call.action === 'purchase'),
        ),
      ).toBe(false)

      await page.locator('button::-p-text(Disconnect cloud account)').click()
      await page.waitForFunction(() => document.body.innerText.includes('Status: disconnected'))
      expect(await page.$eval('body', (element) => element.innerText)).toContain('Local profile: Local cloud-flow QA')
      expect(await purchaseDisabled(page)).toEqual([true, true])
      const retained = await page.evaluate(
        async (id) => (await (await fetch(`/api/canvases/${id}`)).json()).frames[0].html as string,
        saved.id,
      )
      expect(retained).toBe(saved.html)
      await page.goto(`${web.origin}/c/${saved.id}`)
      await page.waitForSelector('iframe[data-doop-frame]')
    },
    40_000,
  )

  it.each([503, 401])(
    'withdraws earlier cloud verification when refresh returns %s',
    async (failure) => {
      accountStatus = 200
      const { page } = await prepare()
      await signIn(page)
      await page.waitForFunction(() => document.body.innerText.includes('Status: cloud access verified'))
      expect(await purchaseDisabled(page)).toEqual([false, false])
      accountStatus = failure
      const response = page.waitForResponse((result) => new URL(result.url()).pathname === '/api/diagramly/account')
      await page.locator('button::-p-text(Refresh status)').click()
      expect((await response).status()).toBe(failure)
      await page.waitForSelector('[role="alert"]')
      expect(await page.$eval('body', (element) => element.innerText)).toContain('signed in; cloud access not verified')
      expect(await purchaseDisabled(page)).toEqual([true, true])
    },
    25_000,
  )

  it('restores a fixture native transaction through real one-use local delivery tickets', async () => {
    accountStatus = 200
    const { page } = await prepare()
    await signIn(page)
    await page.waitForFunction(() => document.body.innerText.includes('Status: cloud access verified'))
    await page.locator('button::-p-text(Restore Purchases)').click()
    await page.waitForFunction(() => document.body.innerText.includes('Purchases restored and verified'))
    expect(deliveries).toEqual([
      {
        authorization: 'Bearer fixture-cloud-bearer',
        body: { signedTransaction: 'fixture-only-signed-transaction', teamId: 'fixture-team' },
      },
    ])
    const replay = await page.evaluate(async () => {
      const delivered = (window as unknown as FixtureWindow).diagramlyCloudFixtureCalls.find(
        (call) => call.action === 'deliver',
      )!
      const response = await fetch('/api/diagramly/apple/deliver', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...delivered.payload, signedTransaction: 'fixture-only-signed-transaction' }),
      })
      return response.status
    })
    expect(replay).toBe(403)
    expect(deliveries).toHaveLength(1)
    expect(
      await page.evaluate(() =>
        (window as unknown as FixtureWindow).diagramlyCloudFixtureCalls.some((call) => call.action === 'purchase'),
      ),
    ).toBe(false)
  }, 30_000)
})
