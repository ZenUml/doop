// Read-only diagnostics for a candidate macOS bundle. This is a release aid,
// not a replacement for native acceptance, licence review or store review.
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import console from 'node:console'
import { execFileSync, spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const launchDir = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(launchDir, '../..')
const args = process.argv.slice(2)
const argument = (name) => {
  const index = args.indexOf(name)
  return index < 0 ? undefined : args[index + 1]
}
const bundle = argument('--bundle')
const output = argument('--output')
const checks = []
const add = (id, status, evidence, next) => checks.push({ id, status, evidence, ...(next ? { next } : {}) })
const command = (file, args) =>
  execFileSync(file, args, { cwd: root, encoding: 'utf8', timeout: 15_000, stdio: ['ignore', 'pipe', 'pipe'] }).trim()
const listing = JSON.parse(fs.readFileSync(path.join(launchDir, 'store-listing.json'), 'utf8'))
const license = fs.readFileSync(path.join(root, 'LICENSE'), 'utf8')
add(
  'licence',
  'review',
  license.includes('GNU AFFERO GENERAL PUBLIC LICENSE')
    ? 'Root licence is AGPLv3; exact release/source obligations and distribution channel require recorded review.'
    : 'Root licence requires review.',
  'Complete the licence/channel issue before distribution. Do not assume the remote Diagramly backend has the same licence boundary.',
)
const dirty = command('git', ['status', '--porcelain']).split('\n').filter(Boolean).length
add(
  'reproducible-source',
  dirty ? 'blocked' : 'review',
  `${dirty} working-tree entries differ from HEAD.`,
  'Map the shipped bundle to its exact reviewed source commit/archive; a public upstream fork alone does not identify the modified build.',
)
const lengths = [
  ['name', 30],
  ['subtitle', 30],
  ['keywords', 100],
  ['promotionalText', 170],
  ['description', 4000],
]
add(
  'metadata-lengths',
  lengths.every(([key, max]) => [...listing[key]].length <= max) ? 'pass' : 'blocked',
  Object.fromEntries(lengths.map(([key, max]) => [key, { characters: [...listing[key]].length, max }])),
)
add(
  'listing',
  listing.status === 'draft-not-submitted' ? 'blocked' : 'review',
  `Listing state: ${listing.status}. Product and policy URLs still need release verification.`,
  'Use only claims supported by the shipping build and verified public URLs.',
)
const tauri = JSON.parse(fs.readFileSync(path.join(root, 'desktop/src-tauri/tauri.conf.json'), 'utf8'))
add(
  'release-profile',
  'review',
  {
    templateName: tauri.productName,
    templateId: tauri.identifier,
    updateEndpoints: tauri.plugins.updater.endpoints,
    bundledUpdaterGuard: 'updates.rs disables upstream updates for the current debug/bundled local-server build',
  },
  'Provide a Diagramly Mac App Store profile with store signing/provisioning and Apple-delivered updates. Verify that no upstream service fallback or self-update path is active.',
)
add(
  'apple-commerce',
  'blocked',
  { selectedChannel: listing.paymentChannel, status: listing.commerceStatus },
  'Complete native StoreKit, authenticated server verification, account binding, restore, notifications and sandbox acceptance. A selected channel is not a verified connection.',
)
if (bundle) {
  if (!fs.existsSync(bundle)) add('bundle', 'blocked', 'Bundle path does not exist.')
  else {
    const plist = path.join(bundle, 'Contents/Info.plist')
    const get = (key) => command('/usr/libexec/PlistBuddy', ['-c', `Print ${key}`, plist])
    const identity = {
      name: get('CFBundleName'),
      identifier: get('CFBundleIdentifier'),
      version: get('CFBundleShortVersionString'),
    }
    add(
      'bundle-identity',
      /spike|doop/i.test(identity.name + identity.identifier) ? 'blocked' : 'review',
      identity,
      'Decide the production bundle identity and verify migration from the spike and legacy app before changing containers.',
    )
    const verification = spawnSync('/usr/bin/codesign', ['--verify', '--strict', bundle], {
      encoding: 'utf8',
      timeout: 15_000,
    })
    // codesign writes its display result to stderr even on success.
    const display = spawnSync('/usr/bin/codesign', ['--display', '--verbose=4', bundle], {
      encoding: 'utf8',
      timeout: 15_000,
    })
    const signature = display.stderr || ''
    const adHoc = /Signature=adhoc/.test(signature)
    const validSignature = verification.status === 0 && display.status === 0
    const authorities = [...signature.matchAll(/^Authority=(.+)$/gm)].map((match) => match[1])
    add(
      'distribution-signature',
      validSignature && !adHoc ? 'review' : 'blocked',
      { validSignature, adHoc, authorities, storeProvisioningVerified: false },
      'Verify Mac App Store signing, provisioning, nested executables and sandbox entitlements in the shipping archive. A valid seal or Developer ID certificate alone does not establish store eligibility.',
    )
    const mebibytes = Number(command('/usr/bin/du', ['-sm', bundle]).split(/\s/)[0])
    add(
      'bundle-size',
      mebibytes > 500 ? 'review' : 'pass',
      { allocatedMiB: mebibytes },
      'Measure the signed download and cold start; prune development dependencies and wrong-platform files before a customer release.',
    )
  }
} else add('bundle', 'blocked', 'No candidate bundle supplied. Use --bundle /absolute/path/App.app.')
const report = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  releaseReady: false,
  status: checks.some((check) => check.status === 'blocked') ? 'blocked' : 'review-required',
  checks,
  limitation:
    'Passing these static checks does not certify release readiness. Native acceptance, exact source compliance, billing, privacy and channel sign-off remain separate evidence.',
}
if (output) fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n')
console.log(JSON.stringify(report, null, 2))
process.exitCode = report.status === 'blocked' ? 2 : 0
