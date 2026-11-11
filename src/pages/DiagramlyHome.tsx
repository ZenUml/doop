import { DiagramlyGenerate } from '../components/DiagramlyGenerate'
import { useCallback, useEffect, useState } from 'react'
import type { CanvasMeta } from '../../shared/types'
import { buildDiagramHtml, DEFAULT_DIAGRAM_SOURCE, type DiagramKind } from '../../shared/diagramFrame'
import { api } from '../lib/api'
import { navigate } from '../lib/navigate'
import { DiagramlyShell } from '../components/DiagramlyShell'
import { LegacyZenUmlImport } from '../components/LegacyZenUmlImport'
import { ConnectModal } from '../components/ConnectModal'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Callout } from '../components/ui/callout'
import { Modal, ModalTitle, ModalLede } from '../components/ui/modal'

export function DiagramlyHome() {
  const [documents, setDocuments] = useState<CanvasMeta[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [search, setSearch] = useState('')
  const [legacyImport, setLegacyImport] = useState(false)
  const [sourceImport, setSourceImport] = useState(false)
  const [restoreImport, setRestoreImport] = useState(false)
  const [restoreNotice, setRestoreNotice] = useState('')
  const [connect, setConnect] = useState(false)
  const [generate, setGenerate] = useState(false)
  const [kind, setKind] = useState<DiagramKind>('zenuml')
  const refresh = useCallback(async () => {
    const next = await api.listCanvases()
    setDocuments(next)
    setLoading(false)
  }, [])

  useEffect(() => {
    let alive = true
    void api
      .listCanvases()
      .then((next) => {
        if (alive) {
          setDocuments(next)
          setLoading(false)
        }
      })
      .catch((cause: unknown) => {
        if (alive) {
          setError(cause instanceof Error ? cause.message : 'Could not open the library.')
          setLoading(false)
        }
      })
    const update = () => {
      void refresh().catch(() => {})
    }
    window.addEventListener('focus', update)
    return () => {
      alive = false
      window.removeEventListener('focus', update)
    }
  }, [refresh])

  async function create(kind: DiagramKind, source = DEFAULT_DIAGRAM_SOURCE[kind], name = 'Untitled document') {
    if (busy) return false
    setBusy(true)
    setError('')
    try {
      const document = await api.createCanvas(name)
      await api.createFrame(document.id, {
        name: 'Diagram 1',
        html: buildDiagramHtml({ kind, source }),
        width: 1200,
        height: 900,
        x: 120,
        y: 120,
      })
      navigate(`/c/${document.id}`)
      return true
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not create a diagram.')
      await refresh().catch(() => {})
      return false
    } finally {
      setBusy(false)
    }
  }

  async function importSource(file: File) {
    if (file.size > 2 * 1024 * 1024) {
      setError('Choose a source file smaller than 2 MB.')
      return
    }
    try {
      const source = (await file.text()).replace(/^\uFEFF/, '')
      if (!source.trim()) throw new Error('This source file is empty.')
      await create(kind, source, file.name.replace(/\.(?:mmd|mermaid|zenuml|zen|zuml|txt)$/i, ''))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not read the file.')
    }
  }

  async function restore(file: File) {
    if (busy) return
    setBusy(true)
    setError('')
    setRestoreNotice('')
    try {
      if (file.size > 10 * 1024 * 1024) throw new Error('Choose a document backup smaller than 10 MB.')
      const body: unknown = JSON.parse(await file.text())
      const response = await fetch('/api/desktop/document-backup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const result = (await response.json()) as { imported?: number; skipped?: number; error?: string }
      if (!response.ok) throw new Error(result.error ?? 'Restore failed.')
      setRestoreNotice(
        `${result.imported ?? 0} documents restored; ${result.skipped ?? 0} already present. Existing edits were kept.`,
      )
      await refresh()
      setRestoreImport(false)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'This backup could not be restored.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <DiagramlyShell
      title="Documents"
      actions={
        <>
          <Button variant="ghost" disabled={busy} onClick={() => setLegacyImport(true)}>
            Import ZenUML library
          </Button>
          <Button disabled={busy} onClick={() => void create('zenuml')}>
            New diagram
          </Button>
        </>
      }
    >
      {error && (
        <Callout role="alert" className="mb-5">
          {error}
        </Callout>
      )}
      {restoreNotice && (
        <Callout role="status" className="mb-5">
          {restoreNotice}
        </Callout>
      )}
      <section className="mb-8 rounded-panel border border-line-soft bg-surface p-6">
        <h2 className="font-display text-title font-semibold">Diagrams you can keep editing.</h2>
        <p className="mt-3 max-w-2xl text-copy text-ink-soft">
          Write Mermaid or ZenUML, bring your old library, or connect your own AI agent. Your local work stays on this
          Mac.
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          <Button disabled={busy} onClick={() => void create('zenuml')}>
            Create ZenUML diagram
          </Button>
          <Button variant="ghost" disabled={busy} onClick={() => void create('mermaid')}>
            Create Mermaid diagram
          </Button>
          <Button variant="ghost" onClick={() => setSourceImport(true)}>
            Open source file
          </Button>
          <Button variant="ghost" onClick={() => setConnect(true)}>
            Connect AI agent
          </Button>
          <Button variant="ghost" onClick={() => setGenerate(true)}>
            Use Diagramly cloud AI
          </Button>
        </div>
      </section>
      <div className="mb-6 flex flex-wrap items-center gap-2">
        <Button variant="ghost" asChild>
          <a href="/api/desktop/document-backup" download="diagramly-documents.json">
            Export document backup
          </a>
        </Button>
        <Button variant="ghost" disabled={busy} onClick={() => setRestoreImport(true)}>
          Restore document backup
        </Button>
        <p className="text-caption text-ink-faint">
          Portable documents and pages. Accounts, history, comments and external image files are not included.
        </p>
      </div>
      <div className="mb-4 flex items-center gap-4">
        <h2 className="mr-auto text-lead font-semibold">Your documents</h2>
        <Input
          className="max-w-xs"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          aria-label="Search documents"
          placeholder="Search documents"
        />
      </div>
      {loading ? (
        <p role="status" className="text-copy text-ink-soft">
          Opening your library…
        </p>
      ) : documents.length === 0 ? (
        <Callout>No documents yet. Create a diagram or import your ZenUML library to begin.</Callout>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {documents
            .filter((document) => document.name.toLocaleLowerCase().includes(search.toLocaleLowerCase()))
            .map((document) => (
              <Button
                key={document.id}
                variant="ghost"
                className="h-auto min-h-24 flex-col items-start justify-center rounded-panel border border-line-soft bg-surface px-5 py-4 text-left"
                onClick={() => navigate(`/c/${document.id}`)}
              >
                <span className="line-clamp-2 text-lead font-semibold">{document.name}</span>
                <span className="mt-2 text-caption text-ink-faint">
                  Local document · {new Date(document.updatedAt).toLocaleDateString()}
                </span>
              </Button>
            ))}
        </div>
      )}
      {legacyImport && (
        <Modal
          size="xl"
          showClose
          onClose={() => {
            if (!busy) setLegacyImport(false)
          }}
        >
          <LegacyZenUmlImport
            onBack={() => setLegacyImport(false)}
            onBusyChange={setBusy}
            onImported={() => void refresh().catch(() => {})}
            onOpen={(id) => navigate(`/c/${id}`)}
          />
        </Modal>
      )}
      {sourceImport && (
        <Modal
          showClose
          onClose={() => {
            if (!busy) setSourceImport(false)
          }}
        >
          <ModalTitle>Open diagram source</ModalTitle>
          <ModalLede>
            Choose the diagram language, then select a text source file. The app creates a new local document and keeps
            the original file unchanged.
          </ModalLede>
          <div className="my-4 flex gap-2">
            <Button variant={kind === 'zenuml' ? 'solid' : 'ghost'} onClick={() => setKind('zenuml')}>
              ZenUML
            </Button>
            <Button variant={kind === 'mermaid' ? 'solid' : 'ghost'} onClick={() => setKind('mermaid')}>
              Mermaid
            </Button>
          </div>
          <Input
            type="file"
            accept=".zenuml,.zen,.zuml,.mmd,.mermaid,.txt,text/plain"
            disabled={busy}
            aria-label="Diagram source file"
            onChange={(event) => {
              const file = event.target.files?.[0]
              if (file) void importSource(file)
            }}
          />
        </Modal>
      )}
      {connect && <ConnectModal onClose={() => setConnect(false)} />}
      {generate && (
        <DiagramlyGenerate
          onClose={() => setGenerate(false)}
          onGenerated={async (kind, source) => {
            const saved = await create(kind, source, 'Cloud diagram')
            if (!saved) throw new Error('Could not save a local copy. Your cloud diagram is still available.')
            setGenerate(false)
          }}
        />
      )}
      {restoreImport && (
        <Modal
          showClose
          onClose={() => {
            if (!busy) setRestoreImport(false)
          }}
        >
          <ModalTitle>Restore document backup</ModalTitle>
          <ModalLede>
            Choose a Diagramly document backup. Documents are restored privately in this local profile. Restoring the
            same file again keeps existing edits. Accounts, history, comments and external image files are not part of
            this format.
          </ModalLede>
          <Input
            className="mt-4"
            type="file"
            accept=".json,application/json"
            disabled={busy}
            aria-label="Document backup file"
            onChange={(event) => {
              const file = event.target.files?.[0]
              if (file) void restore(file)
            }}
          />
        </Modal>
      )}
    </DiagramlyShell>
  )
}
