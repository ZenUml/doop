import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { auditBundle } from './desktop-bundle-audit.mjs'

async function fixture(run) {
  const temporary = await mkdtemp(path.join(os.tmpdir(), 'diagramly-bundle-audit-'))
  try {
    const app = path.join(temporary, 'ZenUML.app')
    await mkdir(path.join(app, 'Contents', 'Resources'), { recursive: true })
    await writeFile(
      path.join(app, 'Contents/Info.plist'),
      '<plist version="1.0"><dict><key>CFBundleIdentifier</key><string>com.zenuml.app</string><key>CFBundleShortVersionString</key><string>1.1.0</string><key>CFBundleVersion</key><string>41</string><key>LSMinimumSystemVersion</key><string>13.5</string></dict></plist>',
    )
    await run(app, temporary)
  } finally {
    await rm(temporary, { recursive: true, force: true })
  }
}

test('inventory records shipped bytes and package provenance', () =>
  fixture(async (app) => {
    const dependency = path.join(app, 'Contents/Resources/local-server/app/node_modules/example')
    await mkdir(dependency, { recursive: true })
    await writeFile(path.join(dependency, 'package.json'), '{"name":"example","version":"1.2.3","license":"MIT"}')
    const result = await auditBundle(app)
    assert.equal(result.packages[0].version, '1.2.3')
    assert.equal(result.packages[0].license, 'MIT')
    assert.match(result.files[0].sha256, /^[a-f0-9]{64}$/)
  }))

test('rejects a symlink escaping the app', () =>
  fixture(async (app, temporary) => {
    const privateFile = path.join(temporary, 'private-account-token')
    await writeFile(privateFile, 'never ship this')
    await symlink(privateFile, path.join(app, 'Contents/Resources/credential'))
    await assert.rejects(auditBundle(app), /External symlink/)
  }))

test('rejects hidden environment files', () =>
  fixture(async (app) => {
    await writeFile(path.join(app, 'Contents/Resources/.env.production'), 'KEY=secret')
    await assert.rejects(auditBundle(app), /Private\/development file/)
  }))

test('rejects a development dependency copied into production', () =>
  fixture(async (app) => {
    const dependency = path.join(app, 'Contents/Resources/local-server/app/node_modules/vitest')
    await mkdir(dependency, { recursive: true })
    await writeFile(path.join(dependency, 'package.json'), '{"name":"vitest","version":"1.0.0"}')
    await assert.rejects(auditBundle(app), /Development dependency shipped/)
  }))

test('permits internal package symlinks without escaping the app', () =>
  fixture(async (app) => {
    const root = path.join(app, 'Contents/Resources')
    await writeFile(path.join(root, 'module.mjs'), 'export default 1')
    await symlink('module.mjs', path.join(root, 'entry.mjs'))
    const result = await auditBundle(app)
    assert.equal(result.files.length, 2)
  }))

test('universal library headers and build-machine install IDs are not runtime dependencies', () =>
  fixture(async (app) => {
    const file = path.join(app, 'Contents/Resources/module.node')
    execFileSync(
      '/usr/bin/xcrun',
      [
        'clang',
        '-mmacosx-version-min=13.5',
        '-arch',
        'arm64',
        '-arch',
        'x86_64',
        '-dynamiclib',
        '-x',
        'c',
        '-',
        '-Wl,-install_name,/private/build/path/libfixture.dylib',
        '-o',
        file,
      ],
      {
        input: 'int fixture(void) { return 1; }',
      },
    )
    const result = await auditBundle(app)
    assert.deepEqual(result.native, ['Contents/Resources/module.node'])
  }))

test('rejects a real dependency on a build-machine library', () =>
  fixture(async (app, temporary) => {
    const dependency = path.join(temporary, 'libexternal.dylib')
    execFileSync(
      '/usr/bin/xcrun',
      [
        'clang',
        '-mmacosx-version-min=13.5',
        '-dynamiclib',
        '-x',
        'c',
        '-',
        '-Wl,-install_name,/private/build/path/libexternal.dylib',
        '-o',
        dependency,
      ],
      {
        input: 'int dependency(void) { return 1; }',
      },
    )
    const file = path.join(app, 'Contents/Resources/module.node')
    execFileSync(
      '/usr/bin/xcrun',
      ['clang', '-mmacosx-version-min=13.5', '-dynamiclib', '-x', 'c', '-', '-L', temporary, '-lexternal', '-o', file],
      {
        input: 'extern int dependency(void); int fixture(void) { return dependency(); }',
      },
    )
    await assert.rejects(auditBundle(app), /Non-system absolute library.*libexternal/)
  }))

test('rejects native code requiring an OS newer than the app declares', () =>
  fixture(async (app) => {
    const file = path.join(app, 'Contents/Resources/newer.node')
    execFileSync('/usr/bin/xcrun', ['clang', '-mmacosx-version-min=15.0', '-dynamiclib', '-x', 'c', '-', '-o', file], {
      input: 'int fixture(void) { return 1; }',
    })
    await assert.rejects(auditBundle(app), /requires macOS 15.*declares 13.5/)
  }))

test('requires the existing paid app identity and records upgrade version', () =>
  fixture(async (app) => {
    const result = await auditBundle(app)
    assert.equal(result.bundleIdentifier, 'com.zenuml.app')
    assert.equal(result.version, '1.1.0')
    assert.equal(result.buildVersion, '41')
    await writeFile(
      path.join(app, 'Contents/Info.plist'),
      '<plist version="1.0"><dict><key>CFBundleIdentifier</key><string>ai.diagramly.desktop</string></dict></plist>',
    )
    await assert.rejects(auditBundle(app), /existing paid app identity/)
  }))

test('rejects the old app version instead of producing a non-upgrade package', () =>
  fixture(async (app) => {
    await writeFile(
      path.join(app, 'Contents/Info.plist'),
      '<plist version="1.0"><dict><key>CFBundleIdentifier</key><string>com.zenuml.app</string><key>CFBundleShortVersionString</key><string>1.0.7</string><key>CFBundleVersion</key><string>40</string></dict></plist>',
    )
    await assert.rejects(auditBundle(app), /must exceed version 1.0.7 build 40/)
  }))

test('audit CLI executes through a symlink and writes its manifest', () =>
  fixture(async (app, temporary) => {
    const linkedScript = path.join(temporary, 'linked audit.mjs')
    const manifest = path.join(temporary, 'audit-result.json')
    await symlink(path.resolve('scripts/desktop-bundle-audit.mjs'), linkedScript)
    const output = execFileSync(process.execPath, [linkedScript, app, manifest], { encoding: 'utf8' })
    assert.match(output, /Bundle audit:/)
    const result = JSON.parse(await readFile(manifest, 'utf8'))
    assert.equal(result.bundleIdentifier, 'com.zenuml.app')
    assert.ok(result.files.some((file) => file.path === 'Contents/Info.plist'))
  }))
