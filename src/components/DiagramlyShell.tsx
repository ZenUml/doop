import { useState, type ReactNode } from 'react'
import { navigate } from '../lib/navigate'
import { ConnectModal } from './ConnectModal'
import { Button } from './ui/button'

export function DiagramlyShell({
  title,
  children,
  actions,
}: {
  title: string
  children: ReactNode
  actions?: ReactNode
}) {
  const [connect, setConnect] = useState(false)
  return (
    <div className="flex h-full min-h-0 bg-paper text-ink">
      <aside className="hidden w-56 flex-none flex-col gap-3 border-r border-line-soft bg-surface p-5 md:flex">
        <Button variant="ghost" className="justify-start font-semibold" onClick={() => navigate('/')}>
          Diagramly Desktop
        </Button>
        <nav aria-label="Main navigation" className="flex flex-col gap-2">
          <Button variant="ghost" className="justify-start" onClick={() => navigate('/')}>
            Documents
          </Button>
          <Button variant="ghost" className="justify-start" onClick={() => setConnect(true)}>
            Connect AI agent
          </Button>
          <Button variant="ghost" className="justify-start" onClick={() => navigate('/settings')}>
            Settings
          </Button>
        </nav>
        <p className="mt-auto text-caption text-ink-faint">
          Local documents stay on this Mac. Cloud actions are separate.
        </p>
      </aside>
      <main className="min-w-0 flex-1 overflow-y-auto">
        <header className="flex flex-wrap items-center gap-3 border-b border-line-soft px-5 py-4 md:px-8">
          <Button variant="ghost" className="md:hidden" onClick={() => navigate('/')}>
            Diagramly
          </Button>
          <h1 className="mr-auto font-display text-title font-semibold">{title}</h1>
          <Button variant="ghost" className="md:hidden" onClick={() => navigate('/settings')}>
            Settings
          </Button>
          {actions}
        </header>
        <div className="mx-auto max-w-6xl p-5 md:p-8">{children}</div>
      </main>
      {connect && <ConnectModal onClose={() => setConnect(false)} />}
    </div>
  )
}
