import { useState } from 'react'
import { authClient } from '../lib/auth'
import { DiagramlyShell } from '../components/DiagramlyShell'
import { AgentKeys } from '../components/AgentKeys'
import { AppearanceSettings } from '../components/AppearanceSettings'
import { Button } from '../components/ui/button'
import { Callout } from '../components/ui/callout'

/** Desktop release settings mount no cloud account or purchase effects. */
export function DiagramlyLocalSettings() {
  const { data: session } = authClient.useSession()
  const [pane, setPane] = useState<'local' | 'appearance' | 'agents'>('local')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function signOut() {
    if (busy) return
    setBusy(true)
    setError('')
    try {
      await authClient.signOut()
      location.assign('/')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not sign out. Please try again.')
      setBusy(false)
    }
  }

  return (
    <DiagramlyShell title="Settings">
      <nav aria-label="Settings sections" className="mb-6 flex flex-wrap gap-2">
        <Button variant={pane === 'local' ? 'solid' : 'ghost'} onClick={() => setPane('local')}>
          Local library
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
      {pane === 'appearance' ? (
        <AppearanceSettings />
      ) : pane === 'agents' ? (
        <>
          <p className="mb-4 text-copy text-ink-soft">
            Connect your own AI agent to work with your local documents. Your agent uses its own account and billing.
          </p>
          <AgentKeys />
        </>
      ) : (
        <section className="max-w-3xl rounded-panel border border-line-soft bg-surface p-5">
          <h2 className="text-lead font-semibold">Local library</h2>
          <p className="mt-2 text-copy text-ink-soft">
            Local profile: {session?.user.name ?? 'Loading…'}
            {session?.user.email ? ` (${session.user.email})` : ''}. Documents stay in this local profile.
          </p>
          <Button variant="ghost" className="mt-3" onClick={() => void signOut()} disabled={busy}>
            Sign out of local profile
          </Button>
        </section>
      )}
    </DiagramlyShell>
  )
}
