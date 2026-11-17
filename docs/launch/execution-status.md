# Desktop app execution status

Updated 2026-11-18. **Draft only; App Store submission has not been verified.**

## Product and listing

- The release direction is to update the existing paid ZenUML Mac App Store app, bundle ID `com.zenuml.app` (record ID `1602636196`), and introduce Diagramly branding gradually. No new listing or price change is authorized.
- `origin/main` is at `8011907` and includes the merge of PR #32 (`079a82a`) and the local StoreKit development-signing change in #34. These commits do not establish that a candidate was uploaded or submitted.
- A current public iTunes lookup reports the existing US listing as “Sequence Diagram Tool | ZenUML”, version 1.0.7, priced at $29.99 USD, with seller Peng Xiao. The Australia price is unverified. The `/desktop` marketing URL returned 404; `/desktop/support` returned HTTP 200, but its content has not been reviewed. App Store Connect submission and build history remain unverified.
- The proposed v1 is local diagram editing with a source editor and live preview; opening a board diagram in its own editor by double-click; per-diagram Pages tabs; ZenUML and Mermaid; importing an older ZenUML JSON library; and connecting an MCP client the customer provides and configures.
- Editor and Pages implementation commits exist on the focused-editor workstream, including `74eb200`, but are not in `origin/main` at this snapshot. Release-audit integration and the final candidate still need confirmation. Treat the listing as proposed copy until the exact release build is checked.
- Do not describe Diagramly cloud AI, a Diagramly subscription, in-app purchases, cloud sync, or purchase restore as part of this v1. Do not claim unverified export formats.

## Release state to verify

- Current App Store Connect listing status, app availability, seller, version/build, and current storefront prices have not been checked for this update. Keep the existing paid app and price; record the actual US and AU prices only after checking the live listing.
- No listing change or submission is recorded here. Draft metadata, screenshots, support pages, signing and App Review materials remain to be prepared and verified against the candidate.
- Complete a clean install and existing-app update check, source editing and preview, board double-click into the independent editor, Pages tabs, both diagram languages, legacy JSON import, customer-owned MCP connection, save/reopen, and relevant failure paths on the exact signed Mac App Store build.
- Check signing, provisioning, bundle identity, privacy disclosures, third-party notices, support contact, and review notes before submission. Keep `releaseReady` false until the exact candidate passes the release audit and human acceptance.

`docs/launch/current-readiness.json` is a prior snapshot, not evidence for a new candidate. Refresh it only after checking the exact build.
