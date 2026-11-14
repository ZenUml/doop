import { useState } from 'react'
import { addToClaudeDesktop, canAddToClaudeDesktop } from '../lib/claudeConnection'
import { posthog } from '../lib/posthog'
import { Button } from './ui/button'
import { InstallBlock } from './ui/install-block'
import { useT } from '../lib/i18n'

export function ClaudeDesktopInstall({ mcpUrl }: { mcpUrl: string }) {
  const t = useT()
  const [state, setState] = useState<'idle' | 'opening' | 'opened'>('idle')
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const shell = globalThis as {
    __DIAGRAMLY_APP_STORE__?: boolean
    __TAURI__?: { core: { invoke: (command: string) => Promise<boolean> } }
  }

  async function saveExtension() {
    setError('')
    try {
      setSaved(await shell.__TAURI__!.core.invoke('claude_save_bundled_extension'))
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  async function connect() {
    setState('opening')
    setError('')
    try {
      await addToClaudeDesktop(mcpUrl)
      setState('opened')
      posthog.capture('claude_extension_opened')
    } catch (err) {
      setState('idle')
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  const manual = (
    <p>
      {shell.__DIAGRAMLY_APP_STORE__ && shell.__TAURI__?.core ? (
        <Button variant="link" size="inline" onClick={() => void saveExtension()}>
          {t('workspace.downloadExtension')}
        </Button>
      ) : (
        <a className="underline underline-offset-2" href="/claude-extension/doop.mcpb" download="doop.mcpb">
          {t('workspace.downloadExtension')}
        </a>
      )}
      {t('workspace.claudeManualOpen')} <strong>Doop server URL</strong> {t('workspace.claudeManualTo')}{' '}
      <code className="break-all">{mcpUrl}</code>
      {t('workspace.claudeManualFallback')}{' '}
      <strong>Settings → Extensions → Advanced settings → Install Extension</strong>.
    </p>
  )

  return (
    <InstallBlock
      action={
        canAddToClaudeDesktop() ? (
          <Button variant="solid" disabled={state === 'opening'} onClick={() => void connect()}>
            {state === 'opening'
              ? t('workspace.claudeOpening')
              : state === 'opened'
                ? t('workspace.claudeOpenAgain')
                : t('workspace.claudeAdd')}
          </Button>
        ) : (
          manual
        )
      }
      status={state === 'opened' ? t('workspace.claudeConfirm') : saved ? t('workspace.claudeSaved') : undefined}
      error={error}
      manualLabel={t('workspace.installManually')}
      manual={canAddToClaudeDesktop() ? manual : undefined}
    />
  )
}
