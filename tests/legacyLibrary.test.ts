import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, expect, it } from 'vitest'
import { LegacyLibrary } from '../server/legacyLibrary'

const roots: string[] = []
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true })
})

async function prepare(exportFile?: string) {
  const root = await mkdtemp(path.join(tmpdir(), 'diagramly-legacy-manifest-'))
  roots.push(root)
  const directory = path.join(root, 'legacy-library-backups', 'snapshot-1')
  await mkdir(directory, { recursive: true })
  const file = path.join(directory, 'library.json')
  await writeFile(file, JSON.stringify([{ id: 'old', js: 'User->Service: original' }]))
  const manifestPath = path.join(root, 'legacy-library.json')
  const snapshot = {
    id: 'snapshot-1',
    createdAt: '2026-11-11T00:00:00Z',
    directory,
    fileCount: 6,
    logicalBytes: 1024,
    ...(exportFile ? { exportFile: exportFile === 'valid' ? file : exportFile } : {}),
  }
  await writeFile(
    manifestPath,
    JSON.stringify({
      schemaVersion: 1,
      status: exportFile ? 'ready' : 'preserved_needs_export',
      snapshots: [snapshot],
    }),
  )
  return { library: new LegacyLibrary(manifestPath), root, directory, file, manifestPath }
}

it('distinguishes preserved bytes from an editable library and keeps private paths out of status', async () => {
  const { library, root } = await prepare()
  const status = await library.status()
  expect(status).toMatchObject({
    configured: true,
    status: 'preserved_needs_export',
    snapshots: [{ canImport: false }],
  })
  expect(JSON.stringify(status)).not.toContain(root)
  await expect(library.read('snapshot-1')).rejects.toMatchObject({ status: 409 })
})

it('reads a prepared copy, leaving it unchanged, and rejects a caller-supplied path', async () => {
  const { library, file } = await prepare('valid')
  const before = await readFile(file)
  expect(await library.read('snapshot-1')).toMatchObject([{ id: 'old', js: 'User->Service: original' }])
  expect(await readFile(file)).toEqual(before)
  await expect(library.read(file)).rejects.toMatchObject({ status: 404 })
})

it('refuses a symlink to an original file outside the saved copy', async () => {
  const { root, directory, file, manifestPath } = await prepare('valid')
  const original = path.join(root, 'original.json')
  await writeFile(original, JSON.stringify([{ id: 'outside', js: 'Must not read' }]))
  await rm(file)
  await symlink(original, file)
  expect(directory).not.toBe(root)
  await expect(new LegacyLibrary(manifestPath).read('snapshot-1')).rejects.toMatchObject({ status: 409 })
})

it('reports a damaged manifest without claiming the old library is absent or migrated', async () => {
  const { manifestPath } = await prepare('valid')
  await writeFile(manifestPath, '{')
  expect(await new LegacyLibrary(manifestPath).status()).toEqual({ configured: true, status: 'error', snapshots: [] })
  expect(await new LegacyLibrary().status()).toEqual({ configured: false, status: 'not_found', snapshots: [] })
})

it('accepts the native millisecond timestamp while returning a stable public date', async () => {
  const { manifestPath, library } = await prepare()
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
  manifest.snapshots[0].createdAt = Date.parse('2026-11-11T00:00:00Z')
  await writeFile(manifestPath, JSON.stringify(manifest))
  expect(await library.status()).toMatchObject({ snapshots: [{ createdAt: '2026-11-11T00:00:00.000Z' }] })
})

it('does not claim an invalid prepared export is ready', async () => {
  const { library, file } = await prepare('valid')
  await writeFile(file, '{')
  expect(await library.status()).toMatchObject({ status: 'preserved_needs_export', snapshots: [{ canImport: false }] })
  await expect(library.read('snapshot-1')).rejects.toMatchObject({ status: 409 })
})

it('does not advertise an export symlink even when its target is inside the snapshot', async () => {
  const { library, directory, file } = await prepare('valid')
  const target = path.join(directory, 'target.json')
  await writeFile(target, JSON.stringify([{ id: 'old', js: 'A->B' }]))
  await rm(file)
  await symlink(target, file)
  expect(await library.status()).toMatchObject({ status: 'preserved_needs_export', snapshots: [{ canImport: false }] })
  await expect(library.read('snapshot-1')).rejects.toMatchObject({ status: 409 })
})

it('does not report not_found when a preserved snapshot fails preparation', async () => {
  const { library, manifestPath } = await prepare('valid')
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
  manifest.status = 'not_found'
  manifest.snapshots[0].exportFile = path.join(manifest.snapshots[0].directory, 'missing.json')
  await writeFile(manifestPath, JSON.stringify(manifest))
  expect(await library.status()).toMatchObject({ status: 'preserved_needs_export', snapshots: [{ canImport: false }] })
})

it('rejects invalid UTF-8 rather than changing source text during import', async () => {
  const { library, file } = await prepare('valid')
  await writeFile(file, Buffer.concat([Buffer.from('[{"id":"old","js":"'), Buffer.from([0xff]), Buffer.from('"}]')]))
  expect(await library.status()).toMatchObject({ status: 'preserved_needs_export', snapshots: [{ canImport: false }] })
  await expect(library.read('snapshot-1')).rejects.toMatchObject({ status: 409 })
})
