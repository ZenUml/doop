# Desktop app release plan

Status: **preparation; no updated listing submission or release is verified.** Updated 2026-11-18.

## Product and commercial decision

Update the existing paid ZenUML Mac App Store app (`com.zenuml.app`, record ID `1602636196`) and introduce Diagramly branding gradually. Keep the current app record, paid-app model and price. No price change, subscription, in-app purchase, or Diagramly cloud-AI offer is part of this v1. A current public iTunes lookup confirms the US price is $29.99 USD; the Australia price remains unverified. Check App Store Connect before publishing price details.

The proposed v1 focuses on local editing: source editing with live preview, opening a board diagram in its own editor by double-click, Pages tabs within each diagram, ZenUML and Mermaid, import of an older ZenUML JSON library, and a customer-provided MCP client. Customers provide and configure their MCP client and any related AI provider account. Do not promise cloud AI, cloud sync, purchase restore, or unverified export formats.

## Current evidence

`origin/main` is `8011907`, including PR #32 (`079a82a`) and PR #34's development signing fix. The focused editor and Pages implementation through `74eb200` is integrated locally on `codex/release-integration-local-20261118`; it is not in `origin/main` or a released candidate. Verify the exact candidate before treating this copy as shipping behavior.

A public iTunes lookup reports the existing listing as “Sequence Diagram Tool | ZenUML”, version 1.0.7, $29.99 USD in the US storefront, seller Peng Xiao. The `/desktop` URL returned 404. `/desktop/support` returned HTTP 200; its content was checked for legacy import steps and the 10 MB limit, renderer-error troubleshooting, external agent/provider billing, and a support email. The distribution certificate is available, but App Store Connect login is incomplete, so the latest build and submission history remain unchecked. No listing change or submission is recorded here. Read [execution status](execution-status.md) for the candidate gates and [pricing](pricing.md) for the pricing decision.

## Release gates

- Confirm App Store Connect record, seller, current availability and current US/AU prices; preserve the existing price.
- Integrate and verify the focused source editor, live preview, board double-click behavior and Pages tabs on the release candidate.
- Verify ZenUML and Mermaid editing, legacy ZenUML JSON import, save/reopen, and the customer-provided MCP flow on the exact signed Mac App Store build.
- Verify bundle identity, signing, provisioning, privacy disclosures, support details, third-party notices, and App Review materials.
- Capture screenshots from the candidate and remove claims that do not pass acceptance. Do not publish a listing or claim submission until it is actually done.

`current-readiness.json` is a prior snapshot. Keep release readiness false until the exact signed candidate passes the audit and human acceptance. See [listing and screenshots](listing.md), [support playbook](support-playbook.md), and [release issues](issues.json).
