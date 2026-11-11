# Desktop app execution status

Updated 2026-11-11. Status: **not ready for distribution**. This is a snapshot of local implementation evidence and remaining verification; it is not an App Store submission or customer release record.

## Product and package

- The release branch is `codex/desktop-commercial-release`. Work is still in progress; do not treat the current dirty worktree as a source archive for a customer build.
- The product name is not decided between Diagramly and ZenUML. The current Diagramly name, wordmark, icon, listing and App Store configuration are candidates, not final identity. `Diagramly Desktop` is a working code/profile label.
- `ai.diagramly.desktop` is registered in the Developer Portal, but no App Store app record has been created. Do not create a listing SKU or finalize listing metadata before the owner chooses the name.
- The dedicated candidate Mac App Store profile is `desktop/src-tauri/tauri.app-store.conf.json`: product name `Diagramly Desktop`, identifier `ai.diagramly.desktop`, `plugins.updater: null`, `createUpdaterArtifacts: false`, the App Store sandbox capability, and an Apple-delivered update policy. `scripts/desktop-app-store.sh` selects this candidate profile with the `app-store` feature and disables Cargo default features. The upstream Tauri template still names Doop and configures its updater for other build profiles; it is not the selected App Store profile. Static configuration does not make the candidate name final or prove shipped update behavior.
- The current intended final bundle path is `/tmp/diagramly-commercial-final/Diagramly Desktop.app`. It has **not** been built. An earlier local native artifact predates the latest fixes and is not a release candidate. No final candidate has been signed, provisioned, or submitted.
- The local bundler and build audit are implemented. Reported focused evidence: App Store bundler tests 8 passed. This does not establish that the not-yet-built candidate is installable or eligible for App Review.

## StoreKit and backend

- StoreKit native bridge, commerce policy, app settings UI and Diagramly transaction-delivery code are present in the worktree. Source presence and unit tests do not prove a live purchase or entitlement.
- Reported native test results: 40 App Store Rust tests and 42 default Rust tests passed; 4 WebKit security-boundary tests passed. The latest StoreKit simulator attempt returned `SKInternalErrorDomain` code 3, so live StoreKit behavior remains **unverified**.
- The Paid Apps Agreement was accepted and verified active on 2026-11-10. There is no remaining Paid Apps Agreement blocker. No App Store products are configured or verified. The $9.99 monthly and $99.99 annual figures remain proposal targets in `pricing.md`; they are not customer-facing configured prices. No Apple purchase, restore or subscription-management flow has passed the live lifecycle.
- The backend connection and purchase-verification work is on a separate branch. Its recorded commits are `f080e5c0f`, `5a8303c50`, `7cb510084` and `d074a5796`; critical fixes are still pending. The current server product default remains `DOOP_PRODUCT=doop`, so Diagramly endpoints are unavailable unless a Diagramly environment is explicitly enabled. No production or live Apple transaction has been verified.

## Product-profile tests

- Diagramly canvas browser tests initially found three fixture-mode failures; those were fixed, and the latest focused canvas run passed 4/4.
- The latest Diagramly cloud browser run passed 5 tests.
- These are local feature tests, not a complete release acceptance run. Do not combine them into a single total or infer that the signed App Store build is validated.
- Local backup and restore code is present. The portable backup omits version history, comments and external image files; test the actual final package before claiming recovery.

## Marketing, support and operations

- The truthful `/desktop` and `/desktop/support` route pages are committed locally in the separate `diagramly.ai` worktree, branch `codex/desktop-marketing`, commit `bd17c5ee6`. They are **not deployed**. The pages contain a labeled synthetic source example and no fake app screenshot, Store badge, download, live price or purchase link.
- `store-listing.json`, screenshots, demo sequence, support playbook, operating procedures and measurement plan are drafts. No listing was submitted and no shipping-build screenshots exist.
- No Desktop support response-time commitment is published. Do not mark support, incident response, privacy, App Store review, or marketing deployment complete from local documents alone.

## Remaining release gates

1. Issue #16's channel decision is closed: the owner selected Mac App Store plus Apple In-App Purchase. Its source/licence/notices review remains an open release gate; preserve `LICENSE` and third-party notices.
2. Finish the pending backend critical fixes, review the branch, and verify account binding, server-side signed transaction handling and entitlement behavior in the intentionally enabled test environment.
3. Configure the reviewed Apple product catalogue and perform StoreKit sandbox acceptance for purchase, pending, cancellation, restore, renewal, refund, expiry and account switching.
4. Build a fresh final bundle at the intended path, inspect its effective identity, entitlements, update path and nested signatures, and run clean-machine WebKit sandbox acceptance.
5. Complete local-data migration/recovery, privacy and security review, App Review materials, and deployment of the support pages before any public release.

`docs/launch/current-readiness.json` is intentionally not updated by this snapshot. Refresh it only after the final candidate bundle exists and has been audited. `releaseReady` must remain false until all release gates have evidence.
