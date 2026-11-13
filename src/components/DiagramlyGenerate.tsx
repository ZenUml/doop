import { useEffect, useRef, useState } from 'react'
import type { DiagramKind } from '../../shared/diagramFrame'
import { diagramlyRequest, type DiagramlyAccount } from '../lib/diagramly'
import { Button } from './ui/button'
import { Textarea } from './ui/textarea'
import { Callout } from './ui/callout'
import { Modal, ModalTitle, ModalLede } from './ui/modal'

interface Job {
  status: string
  message?: string
  error?: string
  result?: { diagramCode?: string }
}

/** Starting this request is an explicit cloud/credit action. It never invokes
 * the upstream resident agent or another provider as a fallback. */
export function DiagramlyGenerate({
  onClose,
  onGenerated,
  initialCommand = '',
}: {
  onClose: () => void
  initialCommand?: string
  onGenerated: (kind: DiagramKind, source: string) => Promise<void>
}) {
  const [account, setAccount] = useState<DiagramlyAccount | null>(null)
  const [command, setCommand] = useState(initialCommand)
  const [kind, setKind] = useState<DiagramKind>('zenuml')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [completed, setCompleted] = useState<{ kind: DiagramKind; source: string } | null>(null)
  const alive = useRef(true)
  useEffect(() => {
    alive.current = true
    void diagramlyRequest<DiagramlyAccount>('account')
      .then((value) => {
        if (alive.current) setAccount(value)
      })
      .catch((cause: unknown) => {
        if (alive.current)
          setError(cause instanceof Error ? cause.message : 'Connect your Diagramly account in Settings first.')
      })
    return () => {
      alive.current = false
    }
  }, [])

  async function generate() {
    if (busy || !account || !command.trim()) return
    setBusy(true)
    setError('')
    setCompleted(null)
    setMessage('Sending your request to Diagramly…')
    try {
      const result = await diagramlyRequest<{ success: boolean; jobId?: string }>('generation', {
        teamId: account.selectedTeamId,
        command: command.trim(),
        diagramType: kind,
        languageKey: kind === 'mermaid' ? 'LANG_MERMAID' : 'LANG_ZENUML',
        subTypeKey: kind === 'mermaid' ? 'FLOWCHART' : 'GENERAL',
        modelTier: 'pro',
      })
      if (!result.success || !result.jobId) throw new Error('Diagramly did not confirm a generation job.')
      const deadline = Date.now() + 6 * 60_000
      while (alive.current && Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 2000))
        if (!alive.current) return
        const job = await diagramlyRequest<Job>(`generation/status?jobId=${encodeURIComponent(result.jobId)}`)
        if (job.status === 'completed' || job.status === 'succeeded') {
          if (!job.result?.diagramCode?.trim()) throw new Error('The job completed without editable diagram source.')
          setCompleted({ kind, source: job.result.diagramCode })
          setMessage('Your cloud diagram is ready. Save an editable local copy below.')
          return
        }
        if (job.status === 'failed' || job.status === 'cancelled')
          throw new Error(job.error ?? `Generation ${job.status}.`)
        setMessage(job.message ?? 'Diagramly is generating your diagram…')
      }
      if (alive.current)
        throw new Error(
          'This job is taking longer than expected. Check your Diagramly cloud library before starting another job; it may still complete.',
        )
    } catch (cause) {
      if (alive.current)
        setError(
          cause instanceof Error ? cause.message : 'Cloud generation failed. Your local documents are unchanged.',
        )
    } finally {
      if (alive.current) setBusy(false)
    }
  }

  const credits = account?.allowance.pro
  const remaining =
    credits &&
    typeof credits === 'object' &&
    'creditsRemaining' in credits &&
    typeof credits.creditsRemaining === 'number'
      ? credits.creditsRemaining
      : null
  return (
    <Modal
      size="lg"
      showClose={!busy}
      onClose={() => {
        if (!busy) onClose()
      }}
    >
      <ModalTitle>Create with Diagramly cloud AI</ModalTitle>
      <ModalLede>
        This sends your prompt to Diagramly, creates a cloud diagram, and uses your team's Pro allowance through its
        configured cloud model service. Your external AI agent and its subscription are separate.
      </ModalLede>
      {error && (
        <Callout role="alert" className="mt-4">
          {error}
        </Callout>
      )}
      {account && (
        <p className="mt-4 text-copy text-ink-soft">
          Team: {account.teams.find((team) => team.id === account.selectedTeamId)?.name ?? account.selectedTeamId}
          {remaining === null ? '' : ` · ${remaining} credits remaining`}
        </p>
      )}
      <div className="my-4 flex gap-2">
        <Button disabled={busy} variant={kind === 'zenuml' ? 'solid' : 'ghost'} onClick={() => setKind('zenuml')}>
          ZenUML
        </Button>
        <Button disabled={busy} variant={kind === 'mermaid' ? 'solid' : 'ghost'} onClick={() => setKind('mermaid')}>
          Mermaid
        </Button>
      </div>
      <Textarea
        value={command}
        onChange={(event) => setCommand(event.target.value)}
        maxLength={5000}
        disabled={busy}
        className="min-h-40"
        aria-label="Diagramly cloud prompt"
        placeholder="Describe the system or sequence to diagram…"
      />
      {message && (
        <p role="status" className="mt-4 text-copy text-ink-soft">
          {message}
        </p>
      )}
      <div className="mt-5 flex flex-wrap gap-2">
        {completed ? (
          <Button
            disabled={busy}
            onClick={() => {
              setBusy(true)
              void onGenerated(completed.kind, completed.source).catch((cause: unknown) => {
                setBusy(false)
                setError(
                  cause instanceof Error
                    ? cause.message
                    : 'Could not save a local copy. The cloud diagram is still available.',
                )
              })
            }}
          >
            Save local copy
          </Button>
        ) : (
          <Button disabled={busy || !account || !command.trim()} onClick={() => void generate()}>
            {busy ? 'Generating…' : 'Generate using Diagramly credits'}
          </Button>
        )}
        <Button variant="ghost" disabled={busy} onClick={onClose}>
          Close
        </Button>
      </div>
    </Modal>
  )
}
