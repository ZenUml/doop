import type { DiagramKind } from '../../shared/diagramFrame'
import { DoopMark } from './Logo'
import { Button } from './ui/button'
import { Chip } from './ui/chip'
import { AttachmentIcon, BracesIcon, SparkIcon, WorkflowIcon } from './ui/icons'
import { Pressable } from './ui/pressable'
import { Textarea } from './ui/textarea'

const WAVE = [
  24, 31, 27, 38, 34, 46, 41, 55, 50, 63, 70, 78, 86, 95, 100, 97, 89, 81, 72, 64, 56, 49, 42, 36, 44, 30, 35, 26,
]

export function DiagramlyHomeHero({
  prompt,
  onPromptChange,
  onContinue,
  onCreate,
  onImport,
  onConnect,
  busy = false,
}: {
  prompt: string
  onPromptChange: (prompt: string) => void
  /** Opens the existing cloud-generation modal with this prompt. */
  onContinue: () => void
  onCreate: (kind: DiagramKind) => void
  onImport: () => void
  onConnect: () => void
  busy?: boolean
}) {
  return (
    <section className="relative isolate overflow-hidden" data-slot="diagramly-home-hero">
      <div className="pointer-events-none absolute inset-0 overflow-hidden dark:opacity-60" aria-hidden>
        <div className="hero-wave absolute left-0 top-[20%] flex h-[56%] w-[200%] items-end opacity-90 blur-[22px] saturate-[1.15] [mask-image:linear-gradient(to_bottom,transparent_0%,#000_42%,#000_82%,transparent)] md:top-[38%]">
          {[...WAVE, ...WAVE].map((height, index) => (
            <i key={index} style={{ height: `${height}%` }} />
          ))}
        </div>
      </div>

      <div className="relative px-4 pt-14 text-center">
        <span className="mx-auto mb-5 block h-[62px] w-[48px] text-ink">
          <DoopMark animated size="fill" className="block" />
        </span>
        <h1 className="font-hero text-title font-light leading-none md:text-display">
          What would you like to diagram?
        </h1>
      </div>

      <div className="relative mx-auto mt-10 flex w-full flex-wrap justify-center gap-3 px-4">
        <Chip disabled={busy} icon={<BracesIcon width={13} height={13} />} onClick={() => onCreate('zenuml')}>
          Sequence diagram
        </Chip>
        <Chip disabled={busy} icon={<WorkflowIcon width={13} height={13} />} onClick={() => onCreate('mermaid')}>
          Flowchart
        </Chip>
        <Chip disabled={busy} icon={<SparkIcon width={13} height={13} />} onClick={onConnect}>
          Connect your agent
        </Chip>
      </div>

      <div className="relative mx-auto mt-[34px] w-full max-w-[740px] px-4 md:px-0">
        <div className="rounded-panel bg-surface px-[18px] pb-3 pt-5 shadow-float">
          <Textarea
            variant="bare"
            rows={3}
            value={prompt}
            disabled={busy}
            placeholder="Describe the diagram you want to create…"
            aria-label="Diagram prompt"
            onChange={(event) => onPromptChange(event.target.value)}
            className="min-h-[72px] text-lead placeholder:text-ink-ghost md:text-lead"
          />
          <div className="mt-1 flex items-center gap-3 text-body text-ink-soft md:gap-5">
            <Pressable
              layout="inline"
              focus="ring"
              disabled={busy}
              className="gap-[7px] rounded-row text-ink-soft transition-colors hover:text-ink"
              onClick={onImport}
              title="Add a source file"
            >
              <AttachmentIcon width={14} height={14} /> Files
            </Pressable>
            <span className="flex-1" />
            <span className="hidden items-center gap-1.5 whitespace-nowrap text-caption text-ink-faint sm:inline-flex">
              <SparkIcon width={14} height={14} /> Diagramly cloud AI
            </span>
            <Button
              variant="primary"
              disabled={busy || !prompt.trim()}
              aria-label="Continue with Diagramly cloud AI"
              onClick={onContinue}
            >
              Continue
            </Button>
          </div>
        </div>
      </div>
    </section>
  )
}
