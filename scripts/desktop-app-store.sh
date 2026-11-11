#!/bin/bash
# Local/review build only. Signing creates an uploadable pkg but never uploads.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MODE="${1:---unsigned}"
[[ "$MODE" == --unsigned || "$MODE" == --sign ]] || { echo 'Usage: scripts/desktop-app-store.sh [--unsigned|--sign]' >&2; exit 1; }
NODE_BINARY="${DIAGRAMLY_NODE_BINARY:-$(node -p process.execPath)}"
"$NODE_BINARY" -e 'const [major,minor]=process.versions.node.split(".").map(Number);if(major<22||(major===22&&minor<19))throw Error("Node >=22.19 required")'
export PATH="$(dirname "$NODE_BINARY"):$PATH"
OUTPUT="${DIAGRAMLY_BUILD_OUTPUT:-$ROOT/desktop/app-store-build}"
mkdir -p "$OUTPUT"
STAGE="$(mktemp -d "${TMPDIR:-/tmp}/diagramly-mas.XXXXXX")"
trap 'rm -rf "$STAGE"' EXIT
if [[ "$MODE" == --sign ]]; then
  : "${MAS_APPLICATION_IDENTITY:?Set an Apple Distribution or 3rd Party Mac Developer Application identity}"
  : "${MAS_INSTALLER_IDENTITY:?Set a 3rd Party Mac Developer Installer identity}"
  : "${MAS_PROVISIONING_PROFILE:?Set the explicit ai.diagramly.desktop provisioning profile path}"
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
APP="$OUTPUT/Diagramly Desktop.app"
[[ ! -e "$APP" ]] || { echo "Output already exists; choose another DIAGRAMLY_BUILD_OUTPUT: $APP" >&2; exit 1; }
ditto "$ROOT/desktop/src-tauri/target/release/bundle/macos/Diagramly Desktop.app" "$APP"
LOCAL="$APP/Contents/Resources/local-server"
mkdir -p "$LOCAL/app" "$APP/Contents/Helpers"
cp "$NODE_BINARY" "$LOCAL/node"
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
  [[ "$APP_ID" == *.ai.diagramly.desktop ]] || { echo 'Provisioning profile does not match ai.diagramly.desktop' >&2; exit 1; }
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
"$NODE_BINARY" "$ROOT/scripts/desktop-bundle-audit.mjs" "$APP" "$OUTPUT/provenance.json"
if [[ "$MODE" == --sign ]]; then
  productbuild --component "$APP" /Applications --sign "$MAS_INSTALLER_IDENTITY" "$OUTPUT/Diagramly-Desktop.pkg"
  pkgutil --check-signature "$OUTPUT/Diagramly-Desktop.pkg"
fi
echo "Built $APP ($MODE). No upload was performed."
