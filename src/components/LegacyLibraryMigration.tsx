import { useEffect, useState } from 'react'
import type { LegacyLibraryStatus } from '../../shared/legacyLibrary'
import { Button } from './ui/button'
import { Callout } from './ui/callout'
import { Modal } from './ui/modal'
import { LegacyZenUmlImport } from './LegacyZenUmlImport'
import { navigate } from '../lib/navigate'

const shell = window as Window & {
  __DOOP_LEGACY_LIBRARY__?: boolean
  __TAURI__?: { core?: { invoke: (command: string) => Promise<unknown> } }
}

async function json<T>(url: string): Promise<T> {
  const response = await fetch(url)
  const body = (await response.json()) as T & { error?: string }
  if (!response.ok) throw new Error(body.error ?? 'The saved ZenUML library is unavailable.')
  return body
}

export function LegacyLibraryMigration({ onImported }: { onImported: () => void }) {
  const [status, setStatus] = useState<LegacyLibraryStatus | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [importBusy, setImportBusy] = useState(false)
  const [prepared, setPrepared] = useState<{ id: string; items: unknown[] } | null>(null)
  useEffect(() => {
    let alive = true
    void json<LegacyLibraryStatus>('/api/desktop/legacy-library')
      .then((value) => {
        if (alive) setStatus(value)
      })
      .catch(() => {
        if (alive && shell.__DOOP_LEGACY_LIBRARY__) setError('The old-library check could not finish. Try again.')
      })
    return () => {
      alive = false
    }
  }, [])

  async function chooseFolder() {
    setBusy(true)
    setError('')
    try {
      await shell.__TAURI__?.core?.invoke('legacy_library_choose')
      setStatus(await json<LegacyLibraryStatus>('/api/desktop/legacy-library'))
    } catch {
      setError('The old library could not be opened. Its original files have not been changed.')
    } finally {
      setBusy(false)
    }
  }

  async function review(id: string) {
    setBusy(true)
    setError('')
    try {
      const result = await json<{ items: unknown[] }>(`/api/desktop/legacy-library/${encodeURIComponent(id)}`)
      setPrepared({ id, items: result.items })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The saved library could not be opened.')
    } finally {
      setBusy(false)
    }
  }

  if (!status?.configured && !error) return null
  const ready = status?.snapshots.filter((item) => item.canImport) ?? []
  const preserved = (status?.snapshots.length ?? 0) > 0
  return (
    <section className="mb-6 rounded-panel border border-line-soft bg-surface p-6" aria-label="Your old ZenUML library">
      <h2 className="text-lead font-semibold">Your old ZenUML library</h2>
      <p className="mt-2 text-copy text-ink-soft">
        {ready.length
          ? 'A recovery copy is ready. Review its documents and pages before importing into this local profile.'
          : preserved
            ? 'A recovery copy of the old files is saved. Import is not ready yet. Keep your original library and any JSON export.'
            : status?.status === 'error'
              ? 'The old-library check needs attention. Your original files have not been changed.'
              : 'Bring your old library into this local profile. The app keeps the original files and saves a recovery copy.'}
      </p>
      <p className="mt-2 text-caption text-ink-faint">
        Local editing, saving and export remain available without a Diagramly cloud subscription.
      </p>
      <p className="mt-2 text-caption text-ink-faint">
        The older folder is usually ~/Library/Application Support/ZenUML. A JSON library from My Library → Export all
        can also be imported above.
      </p>
      {ready.length > 0 && ready.length < (status?.snapshots.length ?? 0) && (
        <Callout className="mt-3">
          Some recovery copies still need attention. Their original files are preserved.
        </Callout>
      )}
      <div className="mt-4 flex flex-wrap gap-2">
        {ready.map((item, index) => (
          <Button key={item.id} disabled={busy} onClick={() => void review(item.id)}>
            Review saved library{ready.length > 1 ? ` ${index + 1}` : ''}
          </Button>
        ))}
        {shell.__DOOP_LEGACY_LIBRARY__ && shell.__TAURI__?.core && (
          <Button variant="ghost" disabled={busy} onClick={() => void chooseFolder()}>
            {busy ? 'Opening old library…' : 'Find old ZenUML library'}
          </Button>
        )}
      </div>
      {error && (
        <Callout role="alert" className="mt-3">
          {error}
        </Callout>
      )}
      {prepared && (
        <Modal
          size="xl"
          showClose
          onClose={() => {
            if (!importBusy) setPrepared(null)
          }}
        >
          <LegacyZenUmlImport
            key={prepared.id}
            initialItems={prepared.items}
            initialFileName="Saved ZenUML library"
            onBack={() => setPrepared(null)}
            onBusyChange={setImportBusy}
            onImported={onImported}
            onOpen={(id, _name, pageId) => navigate(`/c/${id}${pageId ? `?page=${encodeURIComponent(pageId)}` : ''}`)}
          />
        </Modal>
      )}
    </section>
  )
}
