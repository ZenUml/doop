import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { copyFile, mkdtemp, mkdir, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

const script = path.resolve('scripts/desktop-app-store.sh')
const run = (...args) =>
  execFileSync('/bin/bash', ['-c', 'source "$1"; shift; "$@"', 'packaging-test', script, ...args], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
const git = (directory, ...args) => execFileSync('git', ['-C', directory, ...args], { encoding: 'utf8' }).trim()
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex')
const license =
  'Node.js is licensed for use as follows:\nCopyright Node.js contributors. All rights reserved.\nThe externally maintained libraries used by Node.js are:\nFixture third-party notices retained.\n'

async function fixture(use) {
  const temporary = await mkdtemp(path.join(os.tmpdir(), 'zenuml-packaging-'))
  try {
    const checkout = path.join(temporary, 'checkout')
    await mkdir(checkout)
    git(checkout, 'init', '-q')
    await writeFile(path.join(checkout, 'source.txt'), 'committed source\n')
    git(checkout, 'add', '.')
    git(
      checkout,
      '-c',
      'user.name=Packaging Fixture',
      '-c',
      'user.email=fixture@example.invalid',
      '-c',
      'core.hooksPath=/dev/null',
      'commit',
      '-qm',
      'fixture',
    )
    await use({ temporary, checkout, revision: git(checkout, 'rev-parse', 'HEAD') })
  } finally {
    await rm(temporary, { recursive: true, force: true })
  }
}

test('requires clean tracked and untracked source before archiving', () =>
  fixture(async ({ temporary, checkout, revision }) => {
    run('desktop_require_clean', checkout)
    await writeFile(path.join(checkout, 'source.txt'), 'dirty tracked source')
    assert.throws(
      () => run('desktop_archive_source', checkout, revision, path.join(temporary, 'dirty.tar.gz')),
      /Commit all source changes/,
    )
    git(checkout, 'restore', 'source.txt')
    await writeFile(path.join(checkout, 'untracked.txt'), 'uncommitted source')
    assert.throws(() => run('desktop_require_clean', checkout), /Commit all source changes/)
  }))

test('archives exact HEAD outside the app and isolates later checkout edits', () =>
  fixture(async ({ temporary, checkout, revision }) => {
    const archive = path.join(temporary, `source-${revision}.tar.gz`)
    run('desktop_archive_source', checkout, revision, archive)
    await writeFile(path.join(checkout, 'source.txt'), 'later live changes')
    const extracted = path.join(temporary, 'extracted')
    await mkdir(extracted)
    execFileSync('tar', ['-xzf', archive, '-C', extracted])
    assert.equal(await readFile(path.join(extracted, 'source.txt'), 'utf8'), 'committed source\n')
    assert.equal(execFileSync('tar', ['-xOf', archive, 'source.txt'], { encoding: 'utf8' }), 'committed source\n')
    git(checkout, 'restore', 'source.txt')
    assert.throws(
      () => run('desktop_archive_source', checkout, '0'.repeat(40), path.join(temporary, 'wrong.tar.gz')),
      /revision changed/,
    )
    assert.throws(() => run('desktop_archive_source', checkout, revision, archive), /already exists/)
  }))

test('requires the full selected Node distribution license instead of inventing notices', () =>
  fixture(async ({ temporary }) => {
    const distribution = path.join(temporary, 'node-distribution')
    const binary = path.join(distribution, 'bin/node')
    await mkdir(path.dirname(binary), { recursive: true })
    // Test fixture wrapper only: no runtime download, build or signing is involved.
    await writeFile(binary, `#!/bin/sh\nexec '${process.execPath.replaceAll("'", "'\\''")}' "$@"\n`, { mode: 0o700 })
    assert.throws(() => run('desktop_node_license', binary), /complete Node distribution/)
    const licensePath = path.join(distribution, 'LICENSE')
    await writeFile(licensePath, 'not the distribution license')
    assert.throws(() => run('desktop_node_license', binary), /incomplete or unexpected/)
    await writeFile(licensePath, license)
    assert.equal(run('desktop_node_license', binary), licensePath)
  }))

test('records actual app identity, exact source/archive and Node metadata for both signing modes', () =>
  fixture(async ({ temporary, checkout, revision }) => {
    const archive = path.join(temporary, `source-${revision}.tar.gz`)
    run('desktop_archive_source', checkout, revision, archive)
    const app = path.join(temporary, 'ZenUML.app')
    const local = path.join(app, 'Contents/Resources/local-server')
    await mkdir(local, { recursive: true })
    await writeFile(
      path.join(app, 'Contents/Info.plist'),
      '<plist version="1.0"><dict><key>CFBundleIdentifier</key><string>com.zenuml.app</string><key>CFBundleShortVersionString</key><string>1.1.0</string><key>CFBundleVersion</key><string>41</string></dict></plist>',
    )
    await writeFile(path.join(local, 'node'), 'fixture distribution executable before signing')
    const licenseSource = path.join(temporary, 'LICENSE')
    await writeFile(licenseSource, license)
    await copyFile(licenseSource, path.join(local, 'NODE-LICENSE'))
    for (const mode of ['--unsigned', '--sign']) {
      run('desktop_write_build_info', process.execPath, local, app, revision, archive, mode)
      const info = JSON.parse(await readFile(path.join(local, 'build-info.json'), 'utf8'))
      assert.equal(info.sourceSha, revision)
      assert.equal(info.sourceArchiveSha256, sha256(await readFile(archive)))
      assert.equal(info.bundleIdentifier, 'com.zenuml.app')
      assert.equal(info.version, '1.1.0')
      assert.equal(info.buildVersion, '41')
      assert.equal(info.nodeVersion, process.version)
      assert.equal(info.nodeLicenseSha256, sha256(await readFile(licenseSource)))
      assert.equal(info.adhoc, mode === '--unsigned')
      assert.equal(info.signingMode, mode === '--unsigned' ? 'adhoc' : 'mac-app-store')
      assert.throws(
        () => run('desktop_write_build_info', process.execPath, local, app, revision, archive, mode),
        /EEXIST/,
      )
      await rm(path.join(local, 'build-info.json'))
    }
    await writeFile(
      path.join(app, 'Contents/Info.plist'),
      '<plist version="1.0"><dict><key>CFBundleIdentifier</key><string>ai.diagramly.desktop</string><key>CFBundleShortVersionString</key><string>1.1.0</string><key>CFBundleVersion</key><string>41</string></dict></plist>',
    )
    assert.throws(
      () => run('desktop_write_build_info', process.execPath, local, app, revision, archive, '--unsigned'),
      /Unexpected ZenUML upgrade identity/,
    )
  }))

test('the actual command rejects uncommitted source before any build step', () =>
  fixture(async ({ temporary, checkout }) => {
    const copiedScript = path.join(checkout, 'scripts/desktop-app-store.sh')
    await mkdir(path.dirname(copiedScript))
    await copyFile(script, copiedScript)
    git(checkout, 'add', '.')
    git(
      checkout,
      '-c',
      'user.name=Packaging Fixture',
      '-c',
      'user.email=fixture@example.invalid',
      '-c',
      'core.hooksPath=/dev/null',
      'commit',
      '-qm',
      'packaging command',
    )
    await writeFile(path.join(checkout, 'not-committed'), 'dirty fixture')
    assert.throws(
      () => execFileSync('/bin/bash', [copiedScript, '--unsigned'], { stdio: ['ignore', 'pipe', 'pipe'] }),
      /Commit all source changes/,
    )
    await assert.rejects(readFile(path.join(temporary, 'desktop-app-store-builds')), { code: 'ENOENT' })
    assert.throws(() => run('desktop_require_clean', temporary), /not a git repository/)
  }))

test('the packaging command stops before signing when an audit exits zero without a manifest', () =>
  fixture(async ({ temporary, checkout }) => {
    const scriptDirectory = path.join(checkout, 'scripts')
    const entitlements = path.join(checkout, 'desktop/src-tauri/app-store')
    for (const directory of [
      scriptDirectory,
      entitlements,
      path.join(checkout, 'server'),
      path.join(checkout, 'shared'),
      path.join(checkout, 'dist'),
    ])
      await mkdir(directory, { recursive: true })
    await copyFile(script, path.join(scriptDirectory, 'desktop-app-store.sh'))
    await writeFile(path.join(scriptDirectory, 'desktop-bundle-audit.mjs'), 'process.exit(0)')
    await writeFile(path.join(entitlements, 'shell.entitlements'), '<plist version="1.0"><dict/></plist>')
    for (const file of ['package.json', 'bun.lock', 'tsconfig.json', 'LICENSE'])
      await writeFile(path.join(checkout, file), file === 'package.json' ? '{}' : 'fixture')
    for (const directory of ['server', 'shared', 'dist'])
      await writeFile(path.join(checkout, directory, 'fixture'), 'fixture')
    git(checkout, 'add', '.')
    git(
      checkout,
      '-c',
      'user.name=Packaging Fixture',
      '-c',
      'user.email=fixture@example.invalid',
      '-c',
      'core.hooksPath=/dev/null',
      'commit',
      '-qm',
      'packaging fixture',
    )
    const distribution = path.join(temporary, 'node')
    await mkdir(path.join(distribution, 'bin'), { recursive: true })
    const binary = path.join(distribution, 'bin/node')
    await writeFile(binary, `#!/bin/sh\nexec '${process.execPath.replaceAll("'", "'\\''")}' "$@"\n`, { mode: 0o700 })
    await writeFile(path.join(distribution, 'LICENSE'), license)
    const mocks = path.join(temporary, 'mocks')
    await mkdir(mocks)
    await writeFile(path.join(mocks, 'bun'), '#!/bin/sh\nmkdir -p node_modules\n', { mode: 0o700 })
    const target = path.join(temporary, 'target')
    await mkdir(path.join(target, 'release/bundle/macos/ZenUML.app/Contents'), { recursive: true })
    await writeFile(
      path.join(target, 'release/bundle/macos/ZenUML.app/Contents/Info.plist'),
      '<plist version="1.0"><dict><key>CFBundleIdentifier</key><string>com.zenuml.app</string><key>CFBundleShortVersionString</key><string>1.1.0</string><key>CFBundleVersion</key><string>41</string></dict></plist>',
    )
    await writeFile(path.join(mocks, 'bunx'), '#!/bin/sh\nexit 0\n', { mode: 0o700 })
    await writeFile(
      path.join(mocks, 'xcrun'),
      '#!/bin/sh\nwhile [ "$#" -gt 0 ]; do if [ "$1" = -o ]; then shift; touch "$1"; exit 0; fi; shift; done\n',
      { mode: 0o700 },
    )
    const signed = path.join(temporary, 'signing-started')
    await writeFile(path.join(mocks, 'codesign'), `#!/bin/sh\ntouch '${signed}'\nexit 1\n`, { mode: 0o700 })
    const output = path.join(temporary, 'output')
    assert.throws(
      () =>
        execFileSync('/bin/bash', [path.join(scriptDirectory, 'desktop-app-store.sh'), '--unsigned'], {
          env: {
            PATH: `${mocks}:/usr/bin:/bin`,
            DIAGRAMLY_NODE_BINARY: binary,
            DIAGRAMLY_BUILD_OUTPUT: output,
            CARGO_TARGET_DIR: target,
          },
          stdio: ['ignore', 'pipe', 'pipe'],
        }),
      /audit did not produce a manifest/,
    )
    await assert.rejects(readFile(signed), { code: 'ENOENT' })
  }))

test('foreground audit parsing rejects execution errors, malformed or incomplete manifests and unsafe paths', () =>
  fixture(async ({ temporary }) => {
    const app = path.join(temporary, 'ZenUML.app')
    const required = ['Contents/Resources/local-server/node', 'Contents/Helpers/DoopFrameSnapshot']
    for (const relative of required) {
      await mkdir(path.dirname(path.join(app, relative)), { recursive: true })
      await writeFile(path.join(app, relative), 'synthetic executable fixture')
    }
    const valid = {
      format: 1,
      bundleIdentifier: 'com.zenuml.app',
      version: '1.1.0',
      buildVersion: '41',
      minimumSystemVersion: '13.5',
      files: [],
      packages: [],
      native: required,
    }
    for (const [index, [body, expected]] of [
      ['process.exit(23)', /Bundle audit failed/],
      ['{}', /Invalid bundle audit manifest/],
      [JSON.stringify({ ...valid, native: [] }), /required executable/],
      [JSON.stringify({ ...valid, native: ['../outside'] }), /Invalid native path/],
    ].entries()) {
      const auditor = path.join(temporary, `audit-${index}.mjs`)
      await writeFile(
        auditor,
        index === 0 ? body : `import fs from 'node:fs'; fs.writeFileSync(process.argv[3], ${JSON.stringify(body)})`,
      )
      const manifest = path.join(temporary, `manifest-${index}.json`)
      assert.throws(() => run('desktop_run_audit', process.execPath, auditor, app, manifest), expected)
      await assert.rejects(readFile(manifest + '.native-list'), { code: 'ENOENT' })
    }
    const auditor = path.join(temporary, 'valid-audit.mjs')
    const manifest = path.join(temporary, 'valid-manifest.json')
    await writeFile(
      auditor,
      `import fs from 'node:fs'; fs.writeFileSync(process.argv[3], ${JSON.stringify(JSON.stringify(valid))})`,
    )
    run('desktop_run_audit', process.execPath, auditor, app, manifest)
    const canonicalApp = await realpath(app)
    assert.deepEqual(
      (await readFile(manifest + '.native-list', 'utf8')).split('\0').filter(Boolean),
      required.map((relative) => path.join(canonicalApp, relative)),
    )
    assert.throws(() => run('desktop_run_audit', process.execPath, auditor, app, manifest), /must be fresh/)
  }))
