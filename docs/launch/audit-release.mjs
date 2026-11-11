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
const tauriBase = JSON.parse(fs.readFileSync(path.join(root, 'desktop/src-tauri/tauri.conf.json'), 'utf8'))
const appStoreProfilePath = 'desktop/src-tauri/tauri.app-store.conf.json'
const appStoreProfile = JSON.parse(fs.readFileSync(path.join(root, appStoreProfilePath), 'utf8'))
const appStoreBuildScript = fs.readFileSync(path.join(root, 'scripts/desktop-app-store.sh'), 'utf8')
const profile = {
  source: appStoreProfilePath,
  productNameStatus: 'Owner approved gradual Diagramly branding while retaining the existing ZenUML app identity.',
  appStoreIdentifierStatus:
    'Reuse existing App Store app 1602636196 and bundle com.zenuml.app; the separate candidate ID is unused.',
  templateName: tauriBase.productName,
  templateId: tauriBase.identifier,
  productName: appStoreProfile.productName,
  identifier: appStoreProfile.identifier,
  updaterOverride: appStoreProfile.plugins?.updater,
  upstreamUpdaterDisabled:
    appStoreProfile.plugins?.updater === null && appStoreProfile.bundle?.createUpdaterArtifacts === false,
  appleUpdatePolicy: 'Intended through Mac App Store; delivery is not verified in a shipped build.',
  bundleTargets: appStoreProfile.bundle?.targets,
  entitlements: appStoreProfile.bundle?.macOS?.entitlements,
  infoPlist: appStoreProfile.bundle?.macOS?.infoPlist,
  appStoreCapability: appStoreProfile.app?.security?.capabilities?.includes('app-store') ?? false,
  buildUsesAppStoreFeature:
    appStoreBuildScript.includes('--features app-store') && appStoreBuildScript.includes('--no-default-features'),
  profileIsSelectedByLocalBuild: appStoreBuildScript.includes('--config src-tauri/tauri.app-store.conf.json'),
}
const profileConfigured =
  profile.productName === 'ZenUML' &&
  profile.identifier === 'com.zenuml.app' &&
  profile.upstreamUpdaterDisabled &&
  profile.bundleTargets?.includes('app') &&
  profile.entitlements &&
  profile.infoPlist &&
  profile.appStoreCapability &&
  profile.buildUsesAppStoreFeature &&
  profile.profileIsSelectedByLocalBuild
add(
  'release-profile',
  profileConfigured ? 'review' : 'blocked',
  profile,
  'The profile and build command are static configuration evidence only. Build the signed update, inspect its effective identity, capabilities and update path, then verify old-data migration and paid primary functionality before distribution.',
)
const appleEvidenceFiles = [
  'desktop/commerce/CommercePolicy.swift',
  'desktop/commerce/StoreKitBridge.swift',
  'desktop/src-tauri/src/commerce.rs',
  'src/lib/diagramly.ts',
  'src/pages/DiagramlySettings.tsx',
  'server/diagramlyRouter.ts',
  'server/diagramlyConnection.ts',
]
const appleEvidence = Object.fromEntries(appleEvidenceFiles.map((file) => [file, fs.existsSync(path.join(root, file))]))
const doopProductDefaultsOff =
  /DOOP_PRODUCT:\s*str\(\{\s*choices:\s*\[[^\]]*diagramly[^\]]*\],\s*default:\s*'doop'/s.test(
    fs.readFileSync(path.join(root, 'server/env.ts'), 'utf8'),
  )
add(
  'apple-commerce-implementation',
  Object.values(appleEvidence).every(Boolean) ? 'review' : 'blocked',
  {
    sourceEvidencePresent: appleEvidence,
    backendProductDefaultsToDoop: doopProductDefaultsOff,
    storekitTestStatus: 'unverified; latest simulator attempt returned StoreKit error code 3',
    note: 'Source presence does not prove a live StoreKit connection or an effective entitlement.',
  },
  'Run StoreKit configuration and App Store sandbox tests, verify signed transaction delivery and account binding, and confirm the Diagramly service is intentionally enabled for the test environment.',
)
add(
  'apple-commerce',
  'blocked',
  {
    selectedChannel: listing.paymentChannel,
    status: 'not live',
    productsConfigured: false,
    transactionsVerified: false,
    backendProductDefaultsToDoop: doopProductDefaultsOff,
  },
  'Configure real products only after the reviewed offer and backend flow are ready. Then test purchase, pending, cancellation, restore, renewal, refund and account-switch cases end to end. A selected channel or source file is not a verified connection.',
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
    const matchesAppStoreProfile = identity.name === profile.productName && identity.identifier === profile.identifier
    add(
      'bundle-identity',
      matchesAppStoreProfile ? 'review' : 'blocked',
      {
        ...identity,
        expectedName: profile.productName,
        expectedIdentifier: profile.identifier,
        matchesAppStoreProfile,
      },
      'Identity retains the owner-selected existing app. Verify old-library migration, paid primary functionality and the signed update path before distribution.',
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
