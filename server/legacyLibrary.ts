import { constants } from 'node:fs'
import { lstat, open, readFile, realpath, rename, rm, stat } from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { parseLegacyZenUml } from '../shared/legacyZenUml.ts'
import type { LegacyLibrarySnapshot, LegacyLibraryState, LegacyLibraryStatus } from '../shared/legacyLibrary.ts'
import { decodeLegacyCopy } from './legacyChromiumProcess.ts'

const MAX_EXPORT_BYTES = 10 * 1024 * 1024
const STATES = new Set<LegacyLibraryState>([
  'ready',
  'not_found',
  'needs_folder_access',
  'preserved_needs_export',
  'busy',
  'error',
])

interface Snapshot extends LegacyLibrarySnapshot {
  directory: string
  exportFile?: string
  indexedDbDirectory?: string
}

export class LegacyLibraryError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
  }
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid migration manifest')
  return value as Record<string, unknown>
}

function count(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) throw new Error('Invalid count')
  return value
}

function createdAt(value: unknown): string {
  // Native manifests use milliseconds; older review fixtures used ISO strings.
  const date =
    typeof value === 'number' && Number.isSafeInteger(value)
      ? new Date(value)
      : typeof value === 'string'
        ? new Date(value)
        : null
  if (!date || !Number.isFinite(date.getTime())) throw new Error('Invalid snapshot date')
  return date.toISOString()
}

/** The native shell owns the manifest path. HTTP callers can select a snapshot
 * ID, never a filesystem path. Only copies inside the private backup directory
 * are read; an original Chromium database is never opened by this service. */
export class LegacyLibrary {
  private readonly preparing = new Map<string, Promise<Snapshot>>()
  constructor(private readonly manifestPath?: string) {}

  private async manifest(): Promise<{ status: LegacyLibraryState; snapshots: Snapshot[] }> {
    if (!this.manifestPath) return { status: 'not_found', snapshots: [] }
    const file = await stat(this.manifestPath)
    if (file.size > 128 * 1024) throw new Error('Manifest too large')
    const manifest = object(JSON.parse(await readFile(this.manifestPath, 'utf8')))
    if (
      manifest.schemaVersion !== 1 ||
      !STATES.has(manifest.status as LegacyLibraryState) ||
      !Array.isArray(manifest.snapshots) ||
      manifest.snapshots.length > 100
    )
      throw new Error('Unsupported migration manifest')
    const snapshots = manifest.snapshots.map((entry: unknown): Snapshot => {
      const item = object(entry)
      if (
        typeof item.id !== 'string' ||
        !/^[a-zA-Z0-9_-]{1,100}$/.test(item.id) ||
        typeof item.directory !== 'string' ||
        (item.exportFile !== undefined && typeof item.exportFile !== 'string') ||
        (item.indexedDbDirectory !== undefined && typeof item.indexedDbDirectory !== 'string')
      )
        throw new Error('Invalid snapshot')
      return {
        id: item.id,
        createdAt: createdAt(item.createdAt),
        directory: item.directory,
        fileCount: count(item.fileCount),
        logicalBytes: count(item.logicalBytes),
        canImport: typeof item.exportFile === 'string',
        ...(typeof item.exportFile === 'string' ? { exportFile: item.exportFile } : {}),
        ...(typeof item.indexedDbDirectory === 'string' ? { indexedDbDirectory: item.indexedDbDirectory } : {}),
      }
    })
    if (new Set(snapshots.map((item) => item.id)).size !== snapshots.length) throw new Error('Duplicate snapshot ID')
    return { status: manifest.status as LegacyLibraryState, snapshots }
  }

  async status(): Promise<LegacyLibraryStatus> {
    try {
      const manifest = await this.manifest()
      const snapshots: Snapshot[] = []
      for (const snapshot of manifest.snapshots) {
        try {
          snapshots.push(await this.prepare(snapshot))
        } catch {
          snapshots.push({ ...snapshot, canImport: false })
        }
      }
      return {
        configured: !!this.manifestPath,
        status: snapshots.length
          ? snapshots.every((item) => item.canImport)
            ? 'ready'
            : manifest.status === 'ready' || manifest.status === 'not_found'
              ? 'preserved_needs_export'
              : manifest.status
          : manifest.status,
        snapshots: snapshots.map(({ id, createdAt, fileCount, logicalBytes, canImport }) => ({
          id,
          createdAt,
          fileCount,
          logicalBytes,
          canImport,
        })),
      }
    } catch {
      return { configured: !!this.manifestPath, status: 'error', snapshots: [] }
    }
  }

  private async directory(snapshot: Snapshot): Promise<string> {
    const root = await realpath(path.join(path.dirname(this.manifestPath!), 'legacy-library-backups'))
    const directory = await realpath(snapshot.directory)
    if (!directory.startsWith(root + path.sep)) throw new Error('Snapshot escapes backup directory')
    return directory
  }

  private async prepare(snapshot: Snapshot): Promise<Snapshot> {
    if (snapshot.exportFile) {
      await this.readExport(snapshot)
      return { ...snapshot, canImport: true }
    }
    if (!snapshot.indexedDbDirectory) return snapshot
    const directory = await this.directory(snapshot)
    const existing = this.preparing.get(directory)
    if (existing) return existing
    const task = this.decode(snapshot, directory)
    this.preparing.set(directory, task)
    try {
      return await task
    } finally {
      this.preparing.delete(directory)
    }
  }

  private async decode(snapshot: Snapshot, directory: string): Promise<Snapshot> {
    const exportFile = path.join(directory, 'diagramly-library-export.json')
    const prepared = { ...snapshot, exportFile, canImport: true }
    try {
      await stat(exportFile)
      await this.readExport(prepared)
      return prepared
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
    const database = await realpath(snapshot.indexedDbDirectory!)
    if (!database.startsWith(directory + path.sep)) throw new Error('Database escapes snapshot')
    const items = await decodeLegacyCopy(database)
    parseLegacyZenUml(items)
    const temporary = path.join(directory, `.diagramly-export-${randomUUID()}.tmp`)
    try {
      const file = await open(temporary, 'wx', 0o600)
      try {
        await file.writeFile(JSON.stringify(items))
        await file.sync()
      } finally {
        await file.close()
      }
      await rename(temporary, exportFile)
      return prepared
    } finally {
      await rm(temporary, { force: true })
    }
  }

  private async readExport(snapshot: Snapshot): Promise<unknown[]> {
    const directory = await this.directory(snapshot)
    const source = snapshot.exportFile!
    const info = await lstat(source)
    if (!info.isFile() || info.isSymbolicLink() || info.size > MAX_EXPORT_BYTES) throw new Error('Invalid export file')
    const file = await realpath(source)
    if (!file.startsWith(directory + path.sep)) throw new Error('Export escapes snapshot')
    const handle = await open(source, constants.O_RDONLY | constants.O_NOFOLLOW)
    let content: string
    try {
      const opened = await handle.stat()
      if (!opened.isFile() || opened.dev !== info.dev || opened.ino !== info.ino || opened.size !== info.size)
        throw new Error('Export changed during read')
      const bytes = Buffer.alloc(opened.size + 1)
      let offset = 0
      while (offset < bytes.length) {
        const part = await handle.read(bytes, offset, bytes.length - offset, offset)
        if (!part.bytesRead) break
        offset += part.bytesRead
      }
      const after = await handle.stat()
      if (
        offset !== opened.size ||
        after.size !== opened.size ||
        after.mtimeMs !== opened.mtimeMs ||
        after.ctimeMs !== opened.ctimeMs
      )
        throw new Error('Export changed during read')
      content = new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(0, offset))
    } finally {
      await handle.close()
    }
    const items: unknown = JSON.parse(content.replace(/^\uFEFF/, ''))
    parseLegacyZenUml(items)
    return items as unknown[]
  }

  async read(snapshotId: unknown): Promise<unknown[]> {
    if (typeof snapshotId !== 'string') throw new LegacyLibraryError(400, 'Choose a saved ZenUML library.')
    let snapshot: Snapshot | undefined
    try {
      snapshot = (await this.manifest()).snapshots.find((item) => item.id === snapshotId)
    } catch {
      throw new LegacyLibraryError(503, 'The saved library is unavailable. Your original data is unchanged.')
    }
    if (!snapshot) throw new LegacyLibraryError(404, 'This saved library was not found.')
    try {
      const prepared = await this.prepare(snapshot)
      if (!prepared.exportFile) throw new Error('No validated export')
      return await this.readExport(prepared)
    } catch {
      throw new LegacyLibraryError(409, 'This saved library could not be read safely. Your original data is unchanged.')
    }
  }
}
