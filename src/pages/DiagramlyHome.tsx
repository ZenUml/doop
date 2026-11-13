import { DiagramlyGenerate } from '../components/DiagramlyGenerate'
import { LegacyLibraryMigration } from '../components/LegacyLibraryMigration'
import { useCallback, useEffect, useState } from 'react'
import type { CanvasMeta } from '../../shared/types'
import { buildDiagramHtml, DEFAULT_DIAGRAM_SOURCE, type DiagramKind } from '../../shared/diagramFrame'
import { api } from '../lib/api'
import { navigate } from '../lib/navigate'
import { DiagramlyHomeHero } from '../components/DiagramlyHomeHero'
import { DiagramlySidebar } from '../components/DiagramlySidebar'
import { FramePreview, FrameThumb } from '../components/FramePreview'
import { DashContent, DashHeader, DashLayout, DashMain } from '../components/ui/dash'
import { Tile, TileBody, TileCover } from '../components/ui/tile'
import { Pressable } from '../components/ui/pressable'
import { IconButton } from '../components/ui/icon-button'
import { MenuButton } from '../components/ui/menu-button'
import { SegmentedIconItem, SegmentedIcons } from '../components/ui/segmented'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../components/ui/dropdown-menu'
import { GridIcon, ListIcon, PlusIcon, SearchIcon, UploadIcon, GearIcon, CirclePlusIcon } from '../components/ui/icons'
import { timeAgo } from '../lib/time'
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
  const [searchOpen, setSearchOpen] = useState(false)
  const [sort, setSort] = useState('updated')
  const [view, setView] = useState('grid')
  const [prompt, setPrompt] = useState('')
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

  const visible = documents
    .filter((document) => document.name.toLocaleLowerCase().includes(search.toLocaleLowerCase()))
    .sort((a, b) => (sort === 'name' ? a.name.localeCompare(b.name) : b.updatedAt - a.updatedAt))

  return (
    <DashLayout>
      <DiagramlySidebar onConnectAgent={() => setConnect(true)} onImportLibrary={() => setLegacyImport(true)} />
      <DashMain className="[background:var(--paper)]">
        <DashHeader variant="bare">
          <span className="mr-auto text-body font-medium md:hidden">Diagramly</span>
          <span className="hidden flex-1 md:block" />
          <IconButton className="md:hidden" aria-label="Connect an agent" onClick={() => setConnect(true)}>
            <CirclePlusIcon width={16} height={16} />
          </IconButton>
          <IconButton className="md:hidden" aria-label="Settings" onClick={() => navigate('/settings')}>
            <GearIcon width={16} height={16} />
          </IconButton>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <MenuButton disabled={busy} aria-label="Import and backups" icon={<UploadIcon width={15} height={15} />}>
                Import
              </MenuButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent width="lg">
              <DropdownMenuItem onSelect={() => setSourceImport(true)}>Open source file</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setLegacyImport(true)}>Import ZenUML library</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <a href="/api/desktop/document-backup" download="diagramly-documents.json">
                  Export document backup
                </a>
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setRestoreImport(true)}>Restore document backup</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button
            variant="primary"
            size="bar"
            aria-label="New diagram"
            disabled={busy}
            onClick={() => void create('zenuml')}
          >
            <PlusIcon width={15} height={15} strokeWidth={1.75} />
            <span className="hidden sm:inline">New diagram</span>
            <span className="sm:hidden">New</span>
          </Button>
        </DashHeader>
        <DashContent className="px-0 pt-0 md:px-0 md:pt-0">
          <DiagramlyHomeHero
            prompt={prompt}
            onPromptChange={setPrompt}
            onContinue={() => setGenerate(true)}
            onCreate={(kind) => void create(kind)}
            onImport={() => setSourceImport(true)}
            onConnect={() => setConnect(true)}
            busy={busy}
          />
          <section className="px-4 pt-8 md:px-8 md:pt-10" aria-label="Document library">
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
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="mr-auto text-body font-medium">Recent documents</h2>
              <LegacyLibraryMigration compact onImported={() => void refresh().catch(() => {})} />
              {searchOpen ? (
                <Input
                  className="w-40"
                  autoFocus
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  aria-label="Search documents"
                  placeholder="Search documents"
                  onKeyDown={(event) => {
                    if (event.key === 'Escape') {
                      setSearch('')
                      setSearchOpen(false)
                    }
                  }}
                />
              ) : (
                <IconButton aria-label="Search documents" onClick={() => setSearchOpen(true)}>
                  <SearchIcon width={15} height={15} />
                </IconButton>
              )}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <MenuButton aria-label="Sort documents">{sort === 'name' ? 'Name' : 'Last edited'}</MenuButton>
                </DropdownMenuTrigger>
                <DropdownMenuContent width="sm">
                  <DropdownMenuRadioGroup value={sort} onValueChange={setSort}>
                    <DropdownMenuRadioItem value="updated">Last edited</DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="name">Name</DropdownMenuRadioItem>
                  </DropdownMenuRadioGroup>
                </DropdownMenuContent>
              </DropdownMenu>
              <SegmentedIcons aria-label="Document view" value={view} onValueChange={setView}>
                <SegmentedIconItem value="grid" aria-label="Grid view">
                  <GridIcon width={14} height={14} />
                </SegmentedIconItem>
                <SegmentedIconItem value="list" aria-label="List view">
                  <ListIcon width={14} height={14} />
                </SegmentedIconItem>
              </SegmentedIcons>
            </div>
            {loading ? (
              <p role="status" className="mt-5 text-copy text-ink-soft">
                Opening your library…
              </p>
            ) : (
              <>
                {!documents.length && (
                  <p className="mt-5 text-copy text-ink-soft">
                    No documents yet. Create a diagram or import your library.
                  </p>
                )}
                {documents.length > 0 && !visible.length && (
                  <p role="status" className="mt-5 text-copy text-ink-soft">
                    No matching documents.
                  </p>
                )}
                {view === 'grid' ? (
                  <div className="mt-4 grid grid-cols-[minmax(0,1fr)] gap-3.5 xs:grid-cols-[repeat(auto-fill,minmax(230px,1fr))] md:gap-[18px]">
                    {visible.map((document) => (
                      <Tile key={document.id} tone="solid">
                        <Pressable aria-label={`Open ${document.name}`} onClick={() => navigate(`/c/${document.id}`)}>
                          <TileCover aspect="5/3">
                            <FramePreview frameId={document.previewFrameId} empty="No diagram preview" />
                          </TileCover>
                          <TileBody>
                            <div className="truncate text-body font-medium">{document.name}</div>
                            <div className="mt-1 text-caption text-ink-faint">Edited {timeAgo(document.updatedAt)}</div>
                          </TileBody>
                        </Pressable>
                      </Tile>
                    ))}
                    <Pressable
                      aria-label="Create a new diagram"
                      className="grid min-h-[132px] place-items-center content-center gap-2.5 rounded-panel border border-dashed border-line p-6 text-body text-ink-faint hover:text-ink xs:min-h-full"
                      disabled={busy}
                      onClick={() => void create('zenuml')}
                    >
                      <span className="grid size-7 place-items-center rounded-full bg-surface text-ink-soft shadow-ring">
                        <PlusIcon width={14} height={14} />
                      </span>
                      New diagram
                    </Pressable>
                  </div>
                ) : (
                  <div className="mt-4 overflow-hidden rounded-panel border border-line-soft bg-surface">
                    {visible.map((document) => (
                      <Pressable
                        key={document.id}
                        aria-label={`Open ${document.name}`}
                        className="flex w-full items-center gap-3 border-b border-line-soft px-3 py-2.5 text-left last:border-b-0 hover:bg-sub"
                        onClick={() => navigate(`/c/${document.id}`)}
                      >
                        <FrameThumb frameId={document.previewFrameId} empty="No preview" />
                        <span className="min-w-0 flex-1 truncate text-body font-medium">{document.name}</span>
                        <span className="text-caption text-ink-faint">{timeAgo(document.updatedAt)}</span>
                      </Pressable>
                    ))}
                  </div>
                )}
              </>
            )}
          </section>
        </DashContent>
      </DashMain>
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
            onOpen={(id, _name, pageId) => navigate(`/c/${id}${pageId ? `?page=${encodeURIComponent(pageId)}` : ''}`)}
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
          initialCommand={prompt}
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
    </DashLayout>
  )
}
