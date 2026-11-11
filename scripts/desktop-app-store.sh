#!/bin/bash
# Local/review build only. Signing creates an uploadable pkg but never uploads.
set -euo pipefail
# Kept as functions so provenance checks can be tested without a build/signing.
desktop_require_clean() {
  local status
  status="$(git -C "$1" status --porcelain --untracked-files=all --ignore-submodules=none)" || return 1
  [[ -z "$status" ]] || {
    echo 'Commit all source changes and remove untracked files before packaging.' >&2; return 1;
  }
}

desktop_archive_source() {
  local checkout="$1" revision="$2" destination="$3"
  desktop_require_clean "$checkout" || return 1
  [[ "$(git -C "$checkout" rev-parse HEAD)" == "$revision" ]] || { echo 'Source revision changed before archiving.' >&2; return 1; }
  [[ ! -e "$destination" ]] || { echo 'Source archive already exists.' >&2; return 1; }
  git -C "$checkout" archive --format=tar.gz --output="$destination" "$revision"
}

desktop_node_license() {
  local binary="$1" license
  # Official tar distributions put bin/node and LICENSE under the same root.
  license="$(dirname "$(dirname "$binary")")/LICENSE"
  [[ -f "$license" && ! -L "$license" ]] || { echo 'Select bin/node from its complete Node distribution, including LICENSE.' >&2; return 1; }
  "$binary" - "$license" <<'NODE'
const fs = require('node:fs');
const license = fs.readFileSync(process.argv[2], 'utf8');
if (!license.startsWith('Node.js is licensed for use as follows:') ||
    !license.includes('Copyright Node.js contributors. All rights reserved.') ||
    !license.includes('The externally maintained libraries used by Node.js are:'))
  throw Error('The selected Node distribution LICENSE is incomplete or unexpected');
process.stdout.write(process.argv[2]);
NODE
}

desktop_write_build_info() {
  local binary="$1" local_server="$2" app="$3" revision="$4" archive="$5" mode="$6"
  local identifier version build_version
  identifier="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "$app/Contents/Info.plist")"
  version="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$app/Contents/Info.plist")"
  build_version="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleVersion' "$app/Contents/Info.plist")"
  "$binary" - "$local_server" "$revision" "$archive" "$mode" "$identifier" "$version" "$build_version" <<'NODE'
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const [local, sourceSha, archive, mode, bundleIdentifier, version, buildVersion] = process.argv.slice(2);
if (!/^[a-f0-9]{40}$/.test(sourceSha)) throw Error('Exact Git source revision required');
if (bundleIdentifier !== 'com.zenuml.app' || version !== '1.1.0' || buildVersion !== '41')
  throw Error('Unexpected ZenUML upgrade identity/version/build');
if (!['--unsigned', '--sign'].includes(mode)) throw Error('Unknown signing mode');
const sha256 = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const info = {
  schemaVersion: 1, sourceSha, sourceArchive: path.basename(archive), sourceArchiveSha256: sha256(archive),
  bundleIdentifier, version, buildVersion, nodeVersion: process.version,
  nodeDistributionBinarySha256: sha256(path.join(local, 'node')),
  nodeLicenseSha256: sha256(path.join(local, 'NODE-LICENSE')),
  adhoc: mode === '--unsigned', signingMode: mode === '--unsigned' ? 'adhoc' : 'mac-app-store',
};
fs.writeFileSync(path.join(local, 'build-info.json'), JSON.stringify(info, null, 2) + '\n', {flag: 'wx'});
NODE
}

main() {
  CHECKOUT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
  MODE="${1:---unsigned}"
  [[ "$MODE" == --unsigned || "$MODE" == --sign ]] || { echo 'Usage: scripts/desktop-app-store.sh [--unsigned|--sign]' >&2; exit 1; }
  desktop_require_clean "$CHECKOUT_ROOT"
  SOURCE_SHA="$(git -C "$CHECKOUT_ROOT" rev-parse HEAD)"
  NODE_BINARY="${DIAGRAMLY_NODE_BINARY:-$(node -p process.execPath)}"
  NODE_BINARY="$("$NODE_BINARY" -p 'require("node:fs").realpathSync(process.argv[1])' "$NODE_BINARY")"
  "$NODE_BINARY" -e 'const [major,minor]=process.versions.node.split(".").map(Number);if(major<22||(major===22&&minor<19))throw Error("Node >=22.19 required")'
  NODE_LICENSE="$(desktop_node_license "$NODE_BINARY")"
  export PATH="$(dirname "$NODE_BINARY"):$PATH"
  OUTPUT="${DIAGRAMLY_BUILD_OUTPUT:-$CHECKOUT_ROOT/../desktop-app-store-builds/$SOURCE_SHA}"
  mkdir -p "$OUTPUT"
  OUTPUT="$(cd "$OUTPUT" && pwd -P)"
  "$NODE_BINARY" - "$CHECKOUT_ROOT" "$OUTPUT" <<'NODE'
const fs = require('node:fs'), path = require('node:path');
const [checkout, output] = process.argv.slice(2).map(p => fs.realpathSync(p));
if (output === checkout || output.startsWith(checkout + path.sep)) throw Error('Build output must be outside the source checkout');
if (fs.readdirSync(output).length) throw Error('Build output must be empty');
NODE
  SOURCE_ARCHIVE="$OUTPUT/source-$SOURCE_SHA.tar.gz"
  desktop_archive_source "$CHECKOUT_ROOT" "$SOURCE_SHA" "$SOURCE_ARCHIVE"
  STAGE="$(mktemp -d "${TMPDIR:-/tmp}/diagramly-mas.XXXXXX")"
  trap 'rm -rf "$STAGE"' EXIT
  ROOT="$STAGE/source"
  mkdir -p "$ROOT"
  tar -xzf "$SOURCE_ARCHIVE" -C "$ROOT"
  # Reuse the existing external cache; never delete it with the source staging tree.
  export CARGO_TARGET_DIR="${CARGO_TARGET_DIR:-$CHECKOUT_ROOT/desktop/src-tauri/target}"
  mkdir -p "$CARGO_TARGET_DIR"
  CARGO_TARGET_DIR="$(cd "$CARGO_TARGET_DIR" && pwd -P)"
  export CARGO_TARGET_DIR
  if [[ "$MODE" == --sign ]]; then
    : "${MAS_APPLICATION_IDENTITY:?Set an Apple Distribution or 3rd Party Mac Developer Application identity}"
    : "${MAS_INSTALLER_IDENTITY:?Set a 3rd Party Mac Developer Installer identity}"
    : "${MAS_PROVISIONING_PROFILE:?Set the explicit com.zenuml.app provisioning profile path}"
    [[ "$MAS_APPLICATION_IDENTITY" == 'Apple Distribution:'* || "$MAS_APPLICATION_IDENTITY" == '3rd Party Mac Developer Application:'* ]] || { echo 'Mac App Store application identity required' >&2; exit 1; }
    [[ "$MAS_INSTALLER_IDENTITY" == '3rd Party Mac Developer Installer:'* ]] || { echo 'Mac App Store installer identity required' >&2; exit 1; }
  fi
  cd "$ROOT"
  bun install --frozen-lockfile
  # Build the product frontend without packaging the upstream Claude extension.
  VITE_PRODUCT_MODE=diagramly bunx vite build
  cd "$ROOT/desktop"
  bun install --frozen-lockfile
  # Sign only after all server resources and helpers are assembled.
  bunx tauri build --ci --no-sign --features app-store --bundles app --config src-tauri/tauri.app-store.conf.json -- --no-default-features
  APP="$OUTPUT/ZenUML.app"
  [[ ! -e "$APP" ]] || { echo "Output already exists; choose another DIAGRAMLY_BUILD_OUTPUT: $APP" >&2; exit 1; }
  ditto "$CARGO_TARGET_DIR/release/bundle/macos/ZenUML.app" "$APP"
  LOCAL="$APP/Contents/Resources/local-server"
  mkdir -p "$LOCAL/app" "$APP/Contents/Helpers"
  cp "$NODE_BINARY" "$LOCAL/node"
  cp "$NODE_LICENSE" "$LOCAL/NODE-LICENSE"
  desktop_write_build_info "$NODE_BINARY" "$LOCAL" "$APP" "$SOURCE_SHA" "$SOURCE_ARCHIVE" "$MODE"
  for directory in server shared dist; do ditto "$ROOT/$directory" "$LOCAL/app/$directory"; done
  cp "$ROOT/package.json" "$ROOT/bun.lock" "$ROOT/tsconfig.json" "$LOCAL/app/"
  cp "$ROOT/LICENSE" "$LOCAL/app/LICENSE"
  # A separate installation prunes development packages and avoids copying the
  # workspace's node_modules symlink or credentials into the bundle.
  cp "$ROOT/package.json" "$ROOT/bun.lock" "$STAGE/"
  # Optional peer suggestions include better-auth's Vitest integration. Shipping
  # runtime peers (React, pg, zod) are already explicit production dependencies.
  (cd "$STAGE" && bun install --production --omit peer --frozen-lockfile --ignore-scripts)
  ditto "$STAGE/node_modules" "$LOCAL/app/node_modules"
  rm -rf "$LOCAL/app/dist/claude-extension"
  xcrun swiftc -O -parse-as-library -target "$(uname -m)-apple-macosx13.5" "$ROOT/desktop/scripts/FrameSnapshot.swift" -o "$APP/Contents/Helpers/DoopFrameSnapshot"
  "$NODE_BINARY" "$ROOT/scripts/desktop-bundle-audit.mjs" "$APP" "$OUTPUT/provenance-before-signing.json"
  IDENTITY=-
  if [[ "$MODE" == --sign ]]; then
    IDENTITY="$MAS_APPLICATION_IDENTITY"
    security cms -D -i "$MAS_PROVISIONING_PROFILE" > "$STAGE/profile.plist"
    APP_ID="$(/usr/libexec/PlistBuddy -c 'Print :Entitlements:com.apple.application-identifier' "$STAGE/profile.plist")"
    [[ "$APP_ID" == *.com.zenuml.app ]] || { echo 'Provisioning profile does not match com.zenuml.app' >&2; exit 1; }
    cp "$MAS_PROVISIONING_PROFILE" "$APP/Contents/embedded.provisionprofile"
  fi
  # Sign every nested Mach-O, including npm native modules, before the outer app.
  while IFS= read -r -d '' executable; do
    if /usr/bin/file --brief "$executable" | /usr/bin/grep -q 'Mach-O'; then
      [[ "$executable" == "$APP/Contents/MacOS/"* ]] && continue
      if /usr/bin/file --brief "$executable" | /usr/bin/grep -q 'executable'; then
        codesign --force --sign "$IDENTITY" --entitlements "$ROOT/desktop/src-tauri/app-store/inherit.entitlements" "$executable"
      else
        codesign --force --sign "$IDENTITY" "$executable"
      fi
      codesign --verify --strict "$executable"
    fi
  done < <("$NODE_BINARY" -e 'const fs=require("node:fs"),path=require("node:path");for(const file of JSON.parse(fs.readFileSync(process.argv[2],"utf8")).native)process.stdout.write(path.join(process.argv[1],file)+"\0")' "$APP" "$OUTPUT/provenance-before-signing.json")
  cp "$ROOT/desktop/src-tauri/app-store/shell.entitlements" "$STAGE/shell.entitlements"
  if [[ "$MODE" == --sign ]]; then
    # Provisioning-controlled identity entitlements are merged only from the
    # supplied profile; no signing identifier or team is guessed in source.
    /usr/libexec/PlistBuddy -c "Add :com.apple.application-identifier string $APP_ID" "$STAGE/shell.entitlements"
    TEAM="$(/usr/libexec/PlistBuddy -c 'Print :Entitlements:com.apple.developer.team-identifier' "$STAGE/profile.plist")"
    /usr/libexec/PlistBuddy -c "Add :com.apple.developer.team-identifier string $TEAM" "$STAGE/shell.entitlements"
  fi
  codesign --force --sign "$IDENTITY" --entitlements "$STAGE/shell.entitlements" "$APP"
  codesign --verify --deep --strict --verbose=2 "$APP"
  SIGNATURE="$(codesign -d --verbose=4 "$APP" 2>&1)"
  if [[ "$MODE" == --unsigned ]]; then
    [[ "$SIGNATURE" == *'Signature=adhoc'* ]] || { echo 'Expected an ad-hoc review signature.' >&2; exit 1; }
  else
    [[ "$SIGNATURE" != *'Signature=adhoc'* ]] || { echo 'Expected a Mac App Store distribution signature.' >&2; exit 1; }
  fi
  "$NODE_BINARY" "$ROOT/scripts/desktop-bundle-audit.mjs" "$APP" "$OUTPUT/provenance.json"
  if [[ "$MODE" == --sign ]]; then
    productbuild --component "$APP" /Applications --sign "$MAS_INSTALLER_IDENTITY" "$OUTPUT/ZenUML-1.1.0.pkg"
    pkgutil --check-signature "$OUTPUT/ZenUML-1.1.0.pkg"
  fi
  echo "Built $APP ($MODE). No upload was performed."
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then main "$@"; fi
