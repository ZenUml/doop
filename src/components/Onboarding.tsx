import { useEffect, useMemo, useState } from 'react'
import { useStore } from '../lib/store'
import { roleByAgentName } from '../../shared/agents'
import { useIsMobile } from '../hooks/use-mobile'
import { usePanelLayout } from '../lib/panelLayout'
import { Sheet, SheetContent, SheetDescription, SheetTitle, SheetTrigger } from './ui/sheet'
import { cn } from '@/lib/utils'
import { Button } from './ui/button'
import { IconButton } from './ui/icon-button'
import { CheckIcon, CircleIcon, SparkIcon, XIcon } from './ui/icons'
import { ConnectModal } from './ConnectModal'
import { useT } from '../lib/i18n'
import { api } from '../lib/api'
import type { Me } from '../lib/me'

const obHint = 'text-body text-ink-soft'
/* the copy-this-command affordance inside a step */
const obCopy =
  'self-start rounded-md border-line bg-paper-deep px-[9px] py-1 font-mono text-[11.5px] font-normal text-ink shadow-none hover:translate-x-0 hover:translate-y-0 hover:border-ink-soft hover:bg-paper-deep hover:shadow-none'

/**
 * Getting-started checklist, whose whole point is getting an agent of their
 * own onto the canvas over MCP. No "next" buttons: each step checks itself
 * off from the account's authenticated connection, a real agent arriving
 * on this canvas, and a real frame change. Canvas progress belongs to the signed-in
 * account, so switching accounts cannot reuse someone else's checks.
 */

const LS_KEY = 'doop:onboarding'

interface Progress {
  dismissed?: boolean
  reached?: boolean
  completed?: boolean
}

function load(key: string): Progress {
  try {
    const value = JSON.parse(localStorage.getItem(key) ?? '{}') as Progress | null
    return {
      dismissed: value?.dismissed === true,
      reached: value?.reached === true,
      completed: value?.completed === true,
    }
  } catch {
    return {}
  }
}

export function Onboarding({ canvasId, user }: { canvasId: string; user: Pick<Me, 'id' | 'name' | 'email'> }) {
  const t = useT()
  const isMobile = useIsMobile()
  const docked = usePanelLayout() === 'docked'
  const tasks = useStore((s) => s.tasks)
  const presences = useStore((s) => s.presences)
  const accountKey = `${LS_KEY}:${user.id}`
  const canvasKey = `${accountKey}:${canvasId}`
  const [progress, setProgress] = useState<Progress>(() => ({
    ...load(canvasKey),
    // An old dismissal is a browser preference. Old connection/work checks
    // have no account identity and cannot prove this account completed them.
    dismissed: load(accountKey).dismissed || load(LS_KEY).dismissed,
  }))
  const [connection, setConnection] = useState<'checking' | 'connected' | 'disconnected' | 'error'>('checking')
  const allowanceVersion = useStore((s) => s.allowanceVersion)
  const [copied, setCopied] = useState(false)
  const [showConnect, setShowConnect] = useState(false)

  /* live detection — flips only ever go false -> true */
  const live = useMemo(() => {
    /* "connected" means an OUTSIDE agent over MCP — the resident team
       (Doop and the specialists) doesn't count towards the setup steps */
    const outside = (name: string) => name !== '' && !roleByAgentName(name)
    const agentHere = Object.values(presences).some((p) => p.kind === 'agent' && outside(p.name))
    const agentWorked = tasks.some((task) => outside(task.agentName))
    const completed = tasks.some((task) => outside(task.agentName) && !!task.frameIds?.length && !task.failedAt)
    return { reached: agentHere || agentWorked, completed }
  }, [tasks, presences])

  /* a step, once seen live, stays done: fold the live signals into the
     stored progress as they light up */
  const next: Progress = {
    ...progress,
    reached: progress.reached || live.reached,
    completed: progress.completed || live.completed,
  }
  if (next.reached !== progress.reached || next.completed !== progress.completed) {
    setProgress(next)
  }

  useEffect(() => {
    try {
      localStorage.setItem(accountKey, JSON.stringify({ dismissed: progress.dismissed }))
      localStorage.setItem(canvasKey, JSON.stringify({ reached: progress.reached, completed: progress.completed }))
    } catch {
      // Private browsing or a full store still keeps progress in this tab.
    }
  }, [accountKey, canvasKey, progress])

  useEffect(() => {
    if (progress.dismissed) return
    let disposed = false
    let pending = false
    let timer: ReturnType<typeof setTimeout>
    const check = () => {
      if (pending) return
      clearTimeout(timer)
      pending = true
      api
        .agentAllowance()
        .then(
          (state) => {
            if (disposed) return
            setConnection(state.connected ? 'connected' : 'disconnected')
            if (!state.connected) timer = setTimeout(check, 3000)
          },
          () => {
            if (disposed) return
            setConnection('error')
            timer = setTimeout(check, 3000)
          },
        )
        .finally(() => {
          pending = false
        })
    }
    const visible = () => {
      if (document.visibilityState === 'visible') check()
    }
    check()
    window.addEventListener('focus', check)
    document.addEventListener('visibilitychange', visible)
    return () => {
      disposed = true
      clearTimeout(timer)
      window.removeEventListener('focus', check)
      document.removeEventListener('visibilitychange', visible)
    }
  }, [allowanceVersion, showConnect, progress.dismissed])

  if (progress.dismissed) return null
  const connected = connection === 'connected'
  const allDone = connected && progress.reached && progress.completed

  function dismiss() {
    setProgress({ ...progress, dismissed: true })
  }

  function copy(text: string) {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    }, console.error)
  }

  /* the same one-line prompt the Connect AI modal hands out: the MCP server
     ships its own instructions on connect, so the prompt only needs to name
     the canvas */
  const prompt = `Work on Doop canvas ${canvasId}. Start with get_guide({ topic: "doop-instructions" }) and follow it.`

  const checklist = (
    <>
      <p className={obHint}>{t('canvas.connectionAccount', { email: user.email })}</p>
      <Step done={connected} label={t('canvas.stepConnect')}>
        {connection === 'checking' && <p className={obHint}>{t('canvas.checkingConnection')}</p>}
        {connection === 'error' && (
          <>
            <p className={obHint}>{t('canvas.connectionCheckFailed')}</p>
            <Button size="sm" onClick={() => useStore.getState().allowanceChanged()}>
              {t('common.retry')}
            </Button>
          </>
        )}
        {connection === 'disconnected' && (
          <>
            <p className={obHint}>{t('canvas.stepConnectHint')}</p>
            <Button variant="primary" size="sm" className="mt-0.75 self-start" onClick={() => setShowConnect(true)}>
              {t('canvas.connectAi')}
            </Button>
          </>
        )}
      </Step>

      <Step done={!!progress.reached} label={t('canvas.stepCanvas')}>
        {connected && !progress.reached && (
          <>
            <Button size="sm" className={obCopy} onClick={() => copy(prompt)}>
              {copied ? (
                <>
                  <CheckIcon size={12} />
                  {t('canvas.copiedLower')}
                </>
              ) : (
                t('canvas.copyStarterPrompt')
              )}
            </Button>
            <p className={obHint}>{t('canvas.stepCanvasHint')}</p>
          </>
        )}
      </Step>

      <Step done={!!progress.completed} label={t('canvas.stepTask')}>
        {progress.reached && !progress.completed && <p className={obHint}>{t('canvas.stepTaskHint')}</p>}
      </Step>

      {allDone && (
        <div className="flex flex-col gap-2.5 border-t border-line-soft pt-2.5">
          <p className="text-body text-ink-soft">{t('canvas.loopDone')}</p>
          <Button className="self-start" onClick={dismiss}>
            {t('canvas.gotIt')}
          </Button>
        </div>
      )}
    </>
  )

  const connect = showConnect && <ConnectModal canvasId={canvasId} onClose={() => setShowConnect(false)} />

  if (isMobile) {
    const done = [connected, progress.reached, progress.completed].filter(Boolean).length
    return (
      <>
        {connect}
        <Sheet>
          <SheetTrigger asChild>
            <Button
              variant="ghost"
              className="pointer-events-auto absolute left-3 top-3 z-30 h-10 gap-2 rounded-full bg-surface px-3 text-xs font-semibold shadow-card"
            >
              <SparkIcon size={14} className="text-brand" /> {t('canvas.gettingStarted')}
              <span className="font-mono text-[10px] text-ink-faint">{done}/3</span>
            </Button>
          </SheetTrigger>
          <SheetContent
            side="bottom"
            className="max-h-[min(78svh,620px)] gap-0 overflow-y-auto rounded-t-2xl border-line bg-surface p-0 shadow-pop"
          >
            <div className="border-b border-line-soft px-5 py-4 pr-14">
              <SheetTitle className="font-display text-lg font-extrabold">{t('canvas.gettingStarted')}</SheetTitle>
              <SheetDescription className="mt-1 text-xs text-ink-soft">
                {t('canvas.gettingStartedDescription')}
              </SheetDescription>
            </div>
            <div className="flex flex-col gap-4 px-5 py-5">{checklist}</div>
            <Button
              variant="link"
              size="sm"
              className="mx-5 mb-5 self-start px-0 text-xs text-ink-faint"
              onClick={dismiss}
            >
              {t('canvas.dismissChecklist')}
            </Button>
          </SheetContent>
        </Sheet>
      </>
    )
  }

  return (
    /* bottom left of the canvas, beside the Layers panel in the tool rail's
       column (--rail-left): the rail stops near the top, so the card can hug
       the panel. A window too short to stack them (the rail ends ~308px down,
       the card is up to ~250px tall) moves the card past the rail
       (--chrome-left) so it can't cover the tools. Clear of the zoom control
       on the right. Docked panels make the rail a full-height column, so the
       card always sits past it */
    <div
      className={cn(
        'pointer-events-auto absolute bottom-3.5 z-40 flex w-[340px] flex-col gap-3 rounded-panel bg-surface px-5 pt-4 pb-5 shadow-pop transition-[left] duration-150 max-md:right-4 max-md:bottom-4 max-md:left-auto',
        docked
          ? 'left-[var(--chrome-left,14px)]'
          : 'left-[var(--rail-left,14px)] md:[@media(max-height:599px)]:left-[var(--chrome-left,14px)]',
      )}
    >
      <header className="flex items-center justify-between">
        <span className="text-lead font-semibold">{t('canvas.gettingStarted')}</span>
        <IconButton size="sm" className="-mr-1" aria-label={t('canvas.dismiss')} onClick={dismiss}>
          <XIcon size="rail" />
        </IconButton>
      </header>

      {checklist}
      {connect}
    </div>
  )
}

function Step({ done, label, children }: { done: boolean; label: string; children?: React.ReactNode }) {
  const t = useT()
  return (
    <div role="group" aria-label={label} className="flex items-start gap-2.5">
      {/* one copy line tall, so the mark centres on the label's first line */}
      <span
        role="img"
        aria-label={done ? t('canvas.stepComplete') : t('canvas.stepIncomplete')}
        className={cn(
          'flex h-[1lh] w-3.5 flex-none items-center text-copy',
          done ? 'text-success-ink' : 'text-ink-faint',
        )}
      >
        {done ? <CheckIcon size={14} /> : <CircleIcon size={12} />}
      </span>
      {/* the label's line box already leaves room under its text, so it sits
          tighter to its details than they sit to each other */}
      <div className="flex flex-col gap-0.5">
        <span className={cn('text-copy font-medium', done ? 'text-ink-faint line-through decoration-1' : 'text-ink')}>
          {label}
        </span>
        {children && <div className="flex flex-col gap-[5px]">{children}</div>}
      </div>
    </div>
  )
}
