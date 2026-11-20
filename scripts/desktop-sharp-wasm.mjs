import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readdir, readFile, realpath, rename, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// The Mac App Store build must not ship sharp's native libvips: it imports the
// non-public CoreText function _CTFontCopyDefaultCascadeList, and App Review
// rejected build 51 for it. sharp falls back to its WebAssembly build when no
// native package is present. bun cannot select that build (its cpu is "wasm32"),
// so this step runs after `bun install` in the staging directory. It fetches the
// two packages pinned in bun.lock and checks their sha512 against the lockfile.
const WASM_PACKAGES = ['@img/sharp-wasm32', '@emnapi/runtime']

function locked(lockText, name) {
  const escaped = name.replace(/[/@]/g, '\\$&')
  const match = lockText.match(new RegExp(`"${escaped}": \\["(${escaped}@[^"]+)",[^\\n]*?"(sha512-[^"]+)"\\]`))
  if (!match) throw new Error(`Lockfile has no locked entry for ${name}`)
  return { spec: match[1], integrity: match[2] }
}

async function registryTarball(spec) {
  const at = spec.lastIndexOf('@')
  const name = spec.slice(0, at)
  const version = spec.slice(at + 1)
  const base = name.split('/').pop()
  const response = await fetch(`https://registry.npmjs.org/${name}/-/${base}-${version}.tgz`)
  if (!response.ok) throw new Error(`Download failed for ${spec}: ${response.status}`)
  return Buffer.from(await response.arrayBuffer())
}

export async function useSharpWasm({ nodeModules, lock, fetchTarball = registryTarball }) {
  const lockText = await readFile(lock, 'utf8')
  const work = await mkdtemp(path.join(os.tmpdir(), 'diagramly-sharp-wasm-'))
  try {
    const staged = []
    for (const name of WASM_PACKAGES) {
      const { spec, integrity } = locked(lockText, name)
      const bytes = await fetchTarball(spec)
      const actual = 'sha512-' + createHash('sha512').update(bytes).digest('base64')
      if (actual !== integrity) throw new Error(`Integrity mismatch for ${spec}`)
      const archive = path.join(work, `${staged.length}.tgz`)
      const unpacked = path.join(work, `unpacked-${staged.length}`)
      await mkdir(unpacked, { recursive: true })
      await writeFile(archive, bytes)
      execFileSync('/usr/bin/tar', ['xzf', archive, '-C', unpacked, '--no-same-owner'])
      staged.push({ name, from: path.join(unpacked, 'package') })
    }
    // Everything downloaded and verified: only now change the install.
    for (const entry of await readdir(path.join(nodeModules, '@img'))) {
      if (/^sharp-(?:libvips-)?(?:darwin|linux|win32|linuxmusl)/.test(entry))
        await rm(path.join(nodeModules, '@img', entry), { recursive: true, force: true })
    }
    for (const { name, from } of staged) {
      const target = path.join(nodeModules, name)
      await rm(target, { recursive: true, force: true })
      await mkdir(path.dirname(target), { recursive: true })
      await rename(from, target).catch(() => {
        execFileSync('/bin/cp', ['-R', from, target])
      })
    }
  } finally {
    await rm(work, { recursive: true, force: true })
  }
}

const entry = process.argv[1] ? await realpath(process.argv[1]).catch(() => null) : null
if (entry === (await realpath(fileURLToPath(import.meta.url)))) {
  assert(process.argv[2] && process.argv[3], 'Usage: node scripts/desktop-sharp-wasm.mjs <node_modules> <bun.lock>')
  await useSharpWasm({ nodeModules: process.argv[2], lock: process.argv[3] })
  console.log('sharp: native libvips removed, locked WebAssembly build installed')
}
