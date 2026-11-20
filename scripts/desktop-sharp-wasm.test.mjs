import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { useSharpWasm } from './desktop-sharp-wasm.mjs'

async function tarball(directory, name, version) {
  const source = path.join(directory, `pack-${name.replace('/', '-')}`)
  await mkdir(path.join(source, 'package'), { recursive: true })
  await writeFile(path.join(source, 'package/package.json'), JSON.stringify({ name, version }))
  await writeFile(path.join(source, 'package/index.js'), 'module.exports = {}')
  const file = `${source}.tgz`
  execFileSync('/usr/bin/tar', ['czf', file, '-C', source, 'package'])
  const bytes = await readFile(file)
  return { bytes, integrity: 'sha512-' + createHash('sha512').update(bytes).digest('base64') }
}

async function fixture(run) {
  const temporary = await mkdtemp(path.join(os.tmpdir(), 'diagramly-sharp-wasm-'))
  try {
    const modules = path.join(temporary, 'node_modules')
    for (const native of [
      '@img/sharp-darwin-arm64',
      '@img/sharp-libvips-darwin-arm64',
      '@img/sharp-libvips-darwin-x64',
    ])
      await mkdir(path.join(modules, native), { recursive: true })
    await mkdir(path.join(modules, 'sharp'), { recursive: true })
    await mkdir(path.join(modules, 'tslib'), { recursive: true })
    const wasm = await tarball(temporary, '@img/sharp-wasm32', '0.34.3')
    const emnapi = await tarball(temporary, '@emnapi/runtime', '1.11.3')
    const lock = path.join(temporary, 'bun.lock')
    await writeFile(
      lock,
      `{
  "packages": {
    "@emnapi/runtime": ["@emnapi/runtime@1.11.3", "", { "dependencies": { "tslib": "^2.4.0" } }, "${emnapi.integrity}"],
    "@img/sharp-wasm32": ["@img/sharp-wasm32@0.34.3", "", { "dependencies": { "@emnapi/runtime": "^1.4.4" }, "cpu": "none" }, "${wasm.integrity}"],
  }
}
`,
    )
    const bodies = {
      '@img/sharp-wasm32@0.34.3': wasm.bytes,
      '@emnapi/runtime@1.11.3': emnapi.bytes,
    }
    await run({ modules, lock, fetchTarball: async (spec) => bodies[spec], bodies })
  } finally {
    await rm(temporary, { recursive: true, force: true })
  }
}

test('replaces native libvips with the locked WebAssembly build', () =>
  fixture(async ({ modules, lock, fetchTarball }) => {
    await useSharpWasm({ nodeModules: modules, lock, fetchTarball })
    assert.ok(existsSync(path.join(modules, '@img/sharp-wasm32/index.js')))
    assert.ok(existsSync(path.join(modules, '@emnapi/runtime/index.js')))
    assert.ok(!existsSync(path.join(modules, '@img/sharp-darwin-arm64')))
    assert.ok(!existsSync(path.join(modules, '@img/sharp-libvips-darwin-arm64')))
    assert.ok(!existsSync(path.join(modules, '@img/sharp-libvips-darwin-x64')))
  }))

test('rejects a tarball that does not match the lockfile', () =>
  fixture(async ({ modules, lock, bodies }) => {
    const tampered = async () => Buffer.concat([bodies['@img/sharp-wasm32@0.34.3'], Buffer.from('x')])
    await assert.rejects(useSharpWasm({ nodeModules: modules, lock, fetchTarball: tampered }), /Integrity mismatch/)
    assert.ok(
      existsSync(path.join(modules, '@img/sharp-libvips-darwin-arm64')),
      'native files stay when the swap fails',
    )
  }))

test('fails when the lockfile has no WebAssembly entry', () =>
  fixture(async ({ modules, lock, fetchTarball }) => {
    await writeFile(lock, '{ "packages": {} }')
    await assert.rejects(
      useSharpWasm({ nodeModules: modules, lock, fetchTarball }),
      /no locked entry for @img\/sharp-wasm32/,
    )
  }))
