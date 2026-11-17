#!/bin/bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BUILD="$(mktemp -d "${TMPDIR:-/tmp}/diagramly-commerce.XXXXXX")"
trap 'rm -rf "$BUILD"' EXIT
xcrun swiftc "$ROOT/desktop/commerce/CommercePolicy.swift" "$ROOT/desktop/commerce/Tests/main.swift" -o "$BUILD/policy"
"$BUILD/policy"
xcrun swiftc -parse-as-library -emit-library -static -target "$(uname -m)-apple-macosx13.0" \
  "$ROOT/desktop/commerce/CommercePolicy.swift" "$ROOT/desktop/commerce/StoreKitBridge.swift" -o "$BUILD/libcommerce.a"
if [[ "${1:-}" == "--webkit" ]]; then
  xcrun swiftc -parse-as-library "$ROOT/desktop/commerce/CommercePolicy.swift" \
    "$ROOT/desktop/commerce/StoreKitBridge.swift" "$ROOT/desktop/commerce/Tests/WebKitBoundary.swift" -o "$BUILD/webkit"
  "$BUILD/webkit"
fi
if [[ "${1:-}" == "--storekit" ]]; then
  FRAMEWORKS="$(xcode-select -p)/Platforms/MacOSX.platform/Developer/Library/Frameworks"
  TEST_APP="$BUILD/DiagramlyCommerceTests.app"
  mkdir -p "$TEST_APP/Contents/MacOS"
  cat > "$TEST_APP/Contents/Info.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0"><dict><key>CFBundleIdentifier</key><string>ai.diagramly.desktop.commercetests</string><key>CFBundleExecutable</key><string>storekit</string><key>CFBundlePackageType</key><string>APPL</string></dict></plist>
PLIST
  xcrun swiftc -parse-as-library -F "$FRAMEWORKS" -framework StoreKitTest -Xlinker -rpath -Xlinker "$FRAMEWORKS" \
    "$ROOT/desktop/commerce/CommercePolicy.swift" "$ROOT/desktop/commerce/Tests/StoreKitTesting.swift" -o "$TEST_APP/Contents/MacOS/storekit"
  # StoreKit's local test service requires a development/debuggable caller.
  # Keep this entitlement on the disposable test app, never the release app.
  cat > "$BUILD/test.entitlements" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0"><dict><key>com.apple.security.get-task-allow</key><true/></dict></plist>
PLIST
  codesign --force --sign - --entitlements "$BUILD/test.entitlements" "$TEST_APP"
  "$TEST_APP/Contents/MacOS/storekit" "$ROOT/desktop/commerce/Diagramly.storekit"
fi
