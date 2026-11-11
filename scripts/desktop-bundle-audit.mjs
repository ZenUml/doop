import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { lstat, readdir, readFile, realpath, writeFile } from 'node:fs/promises'
import path from 'node:path'
import assert from 'node:assert/strict'

// Run after assembling and before signing. No network access or package code
// execution is needed. The manifest is an inventory, not a legal licence audit.
export async function auditBundle(app) {
  const root = await realpath(app)
  const files = []
  const packages = []
  const native = []
  const forbidden = /(?:^|\/)(?:\.env(?:\..*)?|\.git|\.npmrc|\.yarnrc|\.claude|\.codex|\.DS_Store)$/
  async function visit(directory) {
    for (const name of (await readdir(directory)).sort()) {
      const file = path.join(directory, name)
      const relative = path.relative(root, file)
      if (forbidden.test(relative)) throw new Error(`Private/development file in app: ${relative}`)
      const stat = await lstat(file)
      if (stat.isSymbolicLink()) {
        const destination = await realpath(file)
        if (!destination.startsWith(root + path.sep)) throw new Error(`External symlink: ${relative}`)
        continue
      }
      if (stat.isDirectory()) {
        await visit(file)
        continue
      }
      if (!stat.isFile()) throw new Error(`Unsupported bundle entry: ${relative}`)
      const data = await readFile(file)
      files.push({ path: relative, bytes: data.length, sha256: createHash('sha256').update(data).digest('hex') })
      if (name === 'package.json' && relative.includes('/node_modules/')) {
        const metadata = JSON.parse(data)
        packages.push({
          path: relative,
          name: metadata.name,
          version: metadata.version,
          license: metadata.license ?? null,
        })
        if (['typescript', 'vite', 'vitest', 'husky', '@storybook/react-vite'].includes(metadata.name)) {
          throw new Error(`Development dependency shipped: ${metadata.name}`)
        }
      }
      const magic = data.length >= 4 ? data.readUInt32BE(0) : 0
      if ([0xfeedface, 0xcefaedfe, 0xfeedfacf, 0xcffaedfe, 0xcafebabe, 0xbebafeca].includes(magic)) {
        const dependencies = execFileSync('/usr/bin/otool', ['-L', file], { encoding: 'utf8' })
        // otool -L includes LC_ID_DYLIB itself. Its original build path is
        // metadata; only LC_LOAD_* entries are runtime dependencies.
        const identities = new Set(
          execFileSync('/usr/bin/otool', ['-D', file], { encoding: 'utf8' })
            .split('\n')
            .slice(1)
            .map((line) => line.trim()),
        )
        for (const dependency of dependencies.split('\n').filter((line) => /^\s+/.test(line))) {
          const library = dependency.trim().split(' (')[0]
          if (identities.has(library)) continue
          if (library.startsWith('/') && !library.startsWith('/System/Library/') && !library.startsWith('/usr/lib/')) {
            throw new Error(`Non-system absolute library in ${relative}: ${library}`)
          }
        }
        native.push(relative)
      }
    }
  }
  await visit(root)
  return { format: 1, bundleIdentifier: 'ai.diagramly.desktop', files, packages, native }
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  assert(process.argv[2], 'Usage: node scripts/desktop-bundle-audit.mjs <app> [manifest]')
  const result = await auditBundle(process.argv[2])
  if (process.argv[3]) await writeFile(process.argv[3], JSON.stringify(result, null, 2) + '\n')
  console.log(
    `Bundle audit: ${result.files.length} files, ${result.packages.length} packages, ${result.native.length} native binaries`,
  )
}
