import { useCallback, useEffect, useState } from 'react'
import { authClient } from '../lib/auth'
import {
  appleRequest,
  deliverAppleTransaction,
  diagramlyRequest,
  hasApplePurchases,
  type DiagramlyAccount,
  type DiagramlyCloudStatus,
} from '../lib/diagramly'
import { openExternal } from '../lib/desktop'
import { DiagramlyShell } from '../components/DiagramlyShell'
import { AgentKeys } from '../components/AgentKeys'
import { AppearanceSettings } from '../components/AppearanceSettings'
import { Button } from '../components/ui/button'
import { Callout } from '../components/ui/callout'

interface LoginFlow {
  verificationUriComplete: string
  userCode: string
  interval: number
  expiresAt: number
}
type Products = Awaited<ReturnType<typeof loadProducts>>
const loadProducts = () => appleRequest('products').then((result) => result.products)

export function DiagramlySettings() {
  const { data: session } = authClient.useSession()
  const [status, setStatus] = useState<DiagramlyCloudStatus | null>(null)
  const [flow, setFlow] = useState<LoginFlow | null>(null)
  const [account, setAccount] = useState<DiagramlyAccount | null>(null)
  const [teamId, setTeamId] = useState('')
  const [products, setProducts] = useState<Products>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [pane, setPane] = useState<'cloud' | 'appearance' | 'agents'>('cloud')

  const refresh = useCallback(async () => {
    setAccount(null)
    const next = await diagramlyRequest<DiagramlyCloudStatus>('connection')
    setStatus(next)
    if (next.status === 'connected') {
      const details = await diagramlyRequest<DiagramlyAccount>('account')
      setAccount(details)
      setTeamId(details.selectedTeamId)
    } else setAccount(null)
  }, [])

  useEffect(() => {
    let cancelled = false
    void diagramlyRequest<DiagramlyCloudStatus>('connection')
      .then(async (next) => {
        if (cancelled) return
        setStatus(next)
        if (next.status === 'connected') {
          const details = await diagramlyRequest<DiagramlyAccount>('account')
          if (!cancelled) {
            setAccount(details)
            setTeamId(details.selectedTeamId)
          }
        }
      })
      .catch((cause: unknown) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : 'Could not read your cloud connection.')
      })
    return () => {
      cancelled = true
    }
  }, [])
  useEffect(() => {
    if (!hasApplePurchases()) return
    void loadProducts()
      .then(setProducts)
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : 'Apple products are unavailable.'))
  }, [])
  useEffect(() => {
    if (!flow) return
    let cancelled = false
    let timer: ReturnType<typeof setTimeout>
    async function poll() {
      try {
        const result = await diagramlyRequest<DiagramlyCloudStatus>('connection/poll', {})
        if (cancelled) return
        if (result.status === 'pending') timer = setTimeout(() => void poll(), flow!.interval * 1000)
        else {
          setStatus(result)
          if (result.status === 'connected') await refresh()
          else setError(`Sign-in ${result.status}. You can try again.`)
          if (!cancelled) setFlow(null)
        }
      } catch (cause) {
        if (!cancelled) {
          setFlow(null)
          setError(cause instanceof Error ? cause.message : 'Cloud sign-in failed.')
        }
      }
    }
    timer = setTimeout(() => void poll(), flow.interval * 1000)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [flow, refresh])

  async function run(action: () => Promise<void>) {
    if (busy) return
    setBusy(true)
    setError('')
    setNotice('')
    try {
      await action()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The action failed. You can retry.')
    } finally {
      setBusy(false)
    }
  }

  async function signIn() {
    const next = await diagramlyRequest<LoginFlow>('connection/start', {})
    setAccount(null)
    setFlow(next)
    // Always leave an explicit browser link if the shell cannot open it.
    openExternal(next.verificationUriComplete)
  }

  async function disconnect() {
    await diagramlyRequest('connection', {}, 'DELETE')
    setFlow(null)
    setAccount(null)
    setStatus({ status: 'disconnected' })
    setNotice('Cloud account disconnected. Local documents are unchanged.')
  }

  async function purchase(productId: string) {
    const context = await diagramlyRequest<{ eligible: boolean; reason?: string; appAccountToken: string }>(
      'apple/purchase-context',
      { teamId },
    )
    if (!context.eligible)
      throw new Error(
        context.reason === 'existing_subscription'
          ? 'This team already has a subscription. Restore or manage the existing subscription to avoid a second charge.'
          : 'Apple purchases are not enabled on the Diagramly service yet. You have not been charged.',
      )
    const result = await appleRequest('purchase', { productId, appAccountToken: context.appAccountToken })
    if (result.status === 'purchased' && result.transaction) {
      await deliverAppleTransaction(result.transaction.transactionId, teamId)
      await refresh()
      setNotice('Apple purchase verified and delivered.')
    } else setNotice(result.status === 'pending' ? 'Your purchase is awaiting Apple approval.' : 'Purchase cancelled.')
  }

  async function restore() {
    const result = await appleRequest('restore')
    for (const transaction of result.transactions) await deliverAppleTransaction(transaction.transactionId, teamId)
    await refresh()
    setNotice(
      result.transactions.length
        ? 'Purchases restored and verified.'
        : 'No restorable purchases were found for this Apple account.',
    )
  }

  return (
    <DiagramlyShell title="Settings">
      <nav aria-label="Settings sections" className="mb-6 flex flex-wrap gap-2">
        <Button variant={pane === 'cloud' ? 'solid' : 'ghost'} onClick={() => setPane('cloud')}>
          Account & subscription
        </Button>
        <Button variant={pane === 'agents' ? 'solid' : 'ghost'} onClick={() => setPane('agents')}>
          AI agent access
        </Button>
        <Button variant={pane === 'appearance' ? 'solid' : 'ghost'} onClick={() => setPane('appearance')}>
          Appearance
        </Button>
      </nav>
      {error && (
        <Callout role="alert" className="mb-4">
          {error}
        </Callout>
      )}
      {notice && (
        <Callout role="status" className="mb-4">
          {notice}
        </Callout>
      )}
      {pane === 'appearance' ? (
        <AppearanceSettings />
      ) : pane === 'agents' ? (
        <>
          <p className="mb-4 text-copy text-ink-soft">
            Your external AI agent uses its own account and billing. Connecting it does not purchase a Diagramly
            subscription.
          </p>
          <AgentKeys />
        </>
      ) : (
        <div className="flex max-w-3xl flex-col gap-6">
          <section className="rounded-panel border border-line-soft bg-surface p-5">
            <h2 className="text-lead font-semibold">Local library</h2>
            <p className="mt-2 text-copy text-ink-soft">
              Local profile: {session?.user.name ?? 'Loading…'}
              {session?.user.email ? ` (${session.user.email})` : ''}. Cloud sign-in does not move documents between
              local profiles.
            </p>
            <Button
              variant="ghost"
              className="mt-3"
              onClick={() =>
                void run(async () => {
                  await authClient.signOut()
                  location.assign('/')
                })
              }
              disabled={busy}
            >
              Sign out of local profile
            </Button>
          </section>
          <section className="rounded-panel border border-line-soft bg-surface p-5">
            <h2 className="text-lead font-semibold">Diagramly cloud account</h2>
            <p className="mt-2 text-copy text-ink-soft">
              {status?.user
                ? `${status.user.name ?? status.user.email} · ${status.user.email}`
                : status
                  ? 'Not connected'
                  : 'Checking connection…'}
            </p>
            <p className="mt-2 text-caption text-ink-faint">
              Status:{' '}
              {status?.status === 'connected'
                ? account
                  ? 'cloud access verified'
                  : 'signed in; cloud access not verified'
                : (status?.status ?? 'checking')}
              . Local diagrams remain available offline. Signing in does not upload your library.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button disabled={busy || !!flow} onClick={() => void run(signIn)}>
                {status?.status === 'connected' ? 'Use another cloud account' : 'Sign in to Diagramly'}
              </Button>
              {(status?.status !== 'disconnected' || flow) && (
                <Button variant="ghost" disabled={busy} onClick={() => void run(disconnect)}>
                  {flow ? 'Cancel sign-in' : 'Disconnect cloud account'}
                </Button>
              )}
              <Button variant="ghost" disabled={busy} onClick={() => void run(refresh)}>
                Refresh status
              </Button>
            </div>
            {flow && (
              <Callout className="mt-4">
                Approve code <strong>{flow.userCode}</strong> in your browser.{' '}
                <a className="underline" href={flow.verificationUriComplete} target="_blank" rel="noopener noreferrer">
                  Open sign-in
                </a>
              </Callout>
            )}
            {account && (
              <div className="mt-4">
                <p className="text-copy">Cloud team</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {account.teams.map((team) => (
                    <Button
                      key={team.id}
                      variant={teamId === team.id ? 'solid' : 'ghost'}
                      disabled={busy}
                      onClick={() =>
                        void run(async () => {
                          const next = await diagramlyRequest<DiagramlyAccount>(
                            `account?teamId=${encodeURIComponent(team.id)}`,
                          )
                          setAccount(next)
                          setTeamId(team.id)
                        })
                      }
                    >
                      {team.name}
                    </Button>
                  ))}
                </div>
                <p className="mt-3 text-caption text-ink-faint">
                  Cloud access is verified for this team. Each generation is checked against its current allowance.
                </p>
              </div>
            )}
          </section>
          <section className="rounded-panel border border-line-soft bg-surface p-5">
            <h2 className="text-lead font-semibold">Apple subscription</h2>
            <p className="mt-2 text-copy text-ink-soft">
              Apple handles desktop payments. A Diagramly account links the cloud benefits. Your external AI agent
              remains separate.
            </p>
            {!hasApplePurchases() ? (
              <Callout className="mt-4">
                Purchases require the Mac App Store build. Local work does not require a purchase.
              </Callout>
            ) : (
              <>
                {!products.length && (
                  <p className="mt-4 text-copy text-ink-soft">
                    No Apple products are available for this build. No purchase can be started.
                  </p>
                )}
                <div className="mt-4 flex flex-wrap gap-2">
                  {products.map((product) => (
                    <Button
                      key={product.id}
                      disabled={busy || !account}
                      onClick={() => void run(() => purchase(product.id))}
                    >
                      {product.displayName} · {product.displayPrice}
                      {product.subscriptionPeriod
                        ? ` / ${product.subscriptionPeriod.value} ${product.subscriptionPeriod.unit}`
                        : ''}
                    </Button>
                  ))}
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button variant="ghost" disabled={busy || !account} onClick={() => void run(restore)}>
                    Restore Purchases
                  </Button>
                  <Button
                    variant="ghost"
                    disabled={busy}
                    onClick={() =>
                      void run(async () => {
                        await appleRequest('manage')
                      })
                    }
                  >
                    Manage Subscription
                  </Button>
                </div>
              </>
            )}
            <p className="mt-4 text-caption text-ink-faint">
              Subscriptions renew automatically unless cancelled. Review the full price and renewal period in Apple's
              purchase sheet.{' '}
              <a
                href="https://diagramly.ai/legal/privacy-policy"
                target="_blank"
                rel="noopener noreferrer"
                className="underline"
              >
                Privacy
              </a>{' '}
              ·{' '}
              <a
                href="https://diagramly.ai/legal/terms"
                target="_blank"
                rel="noopener noreferrer"
                className="underline"
              >
                Terms
              </a>
            </p>
          </section>
        </div>
      )}
    </DiagramlyShell>
  )
}
