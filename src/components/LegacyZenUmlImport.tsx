import { useState } from 'react'
import { parseLegacyZenUml, type LegacyZenUmlDocument, type LegacyZenUmlImportResult } from '../../shared/legacyZenUml'
import { api, errorMessage } from '../lib/api'
import { ImportStepHeader, ImportStepFooter } from './ImportSources'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Checkbox } from './ui/checkbox'
import { Callout } from './ui/callout'
import { UploadIcon } from './ui/icons'

const MAX_BYTES = 10 * 1024 * 1024

export function LegacyZenUmlImport({
  workspaceId,
  onBack,
  onBusyChange,
  onImported,
  onOpen,
}: {
  workspaceId?: string
  onBack: () => void
  onBusyChange: (busy: boolean) => void
  onImported?: () => void
  onOpen: (id: string, name: string) => void
}) {
  const [fileName, setFileName] = useState('')
  const [items, setItems] = useState<unknown[]>([])
  const [documents, setDocuments] = useState<LegacyZenUmlDocument[]>([])
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<LegacyZenUmlImportResult | null>(null)

  async function readFile(file: File) {
    setError(null)
    setResult(null)
    setDocuments([])
    setItems([])
    setSelected(new Set())
    setBusy(true)
    onBusyChange(true)
    try {
      if (file.size > MAX_BYTES) throw new Error('Choose a JSON export smaller than 10 MB.')
      const parsed: unknown = JSON.parse((await file.text()).replace(/^\uFEFF/, ''))
      const documents = parseLegacyZenUml(parsed)
      setItems(parsed as unknown[])
      setDocuments(documents)
      setSelected(new Set(documents.map((_, index) => index)))
      setFileName(file.name)
    } catch (error) {
      setError(
        error instanceof SyntaxError
          ? 'This file is not valid JSON. Choose the original ZenUML export.'
          : errorMessage(error, 'Could not read this export.'),
      )
    } finally {
      setBusy(false)
      onBusyChange(false)
    }
  }

  async function importLibrary() {
    if (busy || !selected.size) return
    setBusy(true)
    onBusyChange(true)
    setError(null)
    try {
      const imported = await api.importLegacyZenUml(items, [...selected], workspaceId)
      setResult(imported)
      onImported?.()
    } catch (error) {
      setError(errorMessage(error, 'Import failed. You can safely retry the same file.'))
    } finally {
      setBusy(false)
      onBusyChange(false)
    }
  }

  const chosen = documents.filter((_, index) => selected.has(index))
  const pageCount = chosen.reduce((sum, document) => sum + document.pages.length, 0)
  const emptyPages = chosen.flatMap((document) => document.pages).filter((page) => !page.source.trim()).length
  const first = result?.canvases[0]
  return (
    <>
      <ImportStepHeader
        icon={<UploadIcon size={32} />}
        title="Import from ZenUML desktop"
        lede="Choose the JSON file from the old app’s Export all command. Each document becomes a new canvas, with its pages and editable diagram source."
      />
      {result ? (
        <div className="mt-5 space-y-3" aria-live="polite">
          <Callout tone="success">
            {result.imported} canvases imported. {result.skipped} already imported and skipped. Existing edits are kept.
          </Callout>
          {!!result.warnings.length && (
            <Callout>
              {result.warnings.length} pages need a style review.
              <ul className="mt-2 max-h-40 list-disc overflow-auto pl-5">
                {result.warnings.map((warning, index) => (
                  <li key={index}>{warning}</li>
                ))}
              </ul>
            </Callout>
          )}
          <p className="text-body text-ink-soft">
            The original export is unchanged. Open a canvas, select a diagram, and edit its source in the inspector.
          </p>
        </div>
      ) : (
        <div className="mt-5 space-y-3">
          <Input
            type="file"
            accept=".json,application/json"
            aria-label="ZenUML export file"
            disabled={busy}
            onChange={(event) => {
              const file = event.target.files?.[0]
              if (file) void readFile(file)
              event.target.value = ''
            }}
          />
          {!!documents.length && (
            <>
              <p className="text-body text-ink-soft">
                {fileName}: {selected.size} documents → {selected.size} new canvases, {pageCount} pages.
              </p>
              <label className="relative flex cursor-pointer items-center gap-2 text-body">
                <Checkbox
                  checked={selected.size === documents.length}
                  disabled={busy}
                  onChange={(event) =>
                    setSelected(event.target.checked ? new Set(documents.map((_, index) => index)) : new Set())
                  }
                />
                Select all documents
              </label>
              <div
                className="max-h-60 overflow-auto rounded-card border border-line p-2"
                aria-label="Documents to import"
              >
                {documents.map((document, index) => (
                  <label key={index} className="relative flex cursor-pointer items-center gap-2 p-2 text-body">
                    <Checkbox
                      checked={selected.has(index)}
                      disabled={busy}
                      onChange={(event) =>
                        setSelected((current) => {
                          const next = new Set(current)
                          if (event.target.checked) next.add(index)
                          else next.delete(index)
                          return next
                        })
                      }
                    />
                    <span className="min-w-0 flex-1 truncate">{document.title}</span>
                    <span className="text-caption text-ink-faint">{document.pages.length} pages</span>
                  </label>
                ))}
              </div>
              {!!emptyPages && (
                <Callout>{emptyPages} pages have no source. They will be kept as editable blank diagrams.</Callout>
              )}
            </>
          )}
          <p className="text-caption text-ink-faint">
            CSS, LESS and SCSS are converted locally. External libraries and scripts are not loaded. This imports into{' '}
            {workspaceId ? 'this workspace' : 'your personal library'} on this server.
          </p>
        </div>
      )}
      {error && (
        <Callout className="mt-3" tone="error" role="alert">
          {error}
        </Callout>
      )}
      <ImportStepFooter
        onBack={onBack}
        backDisabled={busy}
        note="Re-importing the same documents skips existing copies."
      >
        {result && first ? (
          <Button variant="primary" onClick={() => onOpen(first.id, first.name)}>
            Open first canvas
          </Button>
        ) : (
          <Button variant="primary" disabled={busy || !selected.size} onClick={() => void importLibrary()}>
            {busy ? 'Importing…' : `Import ${selected.size || ''} documents`}
          </Button>
        )}
      </ImportStepFooter>
    </>
  )
}
