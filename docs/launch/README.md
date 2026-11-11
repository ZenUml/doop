# Desktop app: commercial release plan

Status: **preparation; not ready for sale or distribution**. Updated 2026-11-11.

The working tracker is [launch epic #26](https://github.com/ZenUml/doop/issues/26), with active execution issues #17–25. Issue #16 is closed as an owner decision: Apple In-App Purchase through the Mac App Store is the selected channel. That decision does not resolve the separate AGPL/source/notices review required before distribution.

The owner approved a gradual transition from ZenUML to the **Diagramly** brand and reuse of the existing Mac App Store app record, app ID `1602636196`, bundle ID `com.zenuml.app`. No public listing metadata has been changed and no new app record has been created. Apple In-App Purchase through the Mac App Store remains the selected channel. No live product or purchase is verified, and no final signed Mac App Store build has been produced.

## Product direction

The owner selected **Diagramly** as the product brand, with a gradual transition from the existing ZenUML listing. The existing app record and bundle identity remain the update path; do not create a second listing or change customer-facing store metadata until the migration and paid-customer rights plan is reviewed. The candidate icon is still a design asset, not a confirmed shipping icon.

The planned local product is for developers and technical teams who need editable Mermaid and ZenUML diagrams, a document/page library, and a way to work with their own AI agent. Its first useful jobs are to create and revise diagrams, import an older ZenUML library, and connect a compatible external MCP client. The external client uses its own AI account, model access and billing. Desktop sign-in, MCP authorization and Apple purchases are separate identities; people must authorize the expected Diagramly account where the client requests it.

The desktop MCP service is intended to bind to loopback on the same Mac. It is not a network-wide MCP service. Local documents do not silently become cloud documents. Paid Diagramly cloud services remain unavailable until account access, server-side entitlements, metering and Apple purchases work together.

The import path supports the legacy ZenUML JSON library export. It is an explicit import, not an account or workspace merge. The earlier Doop Desktop preview uses a separate app container; Diagramly does not automatically copy its data. Keep the old app and its data until an explicit export/import has been checked. Portable backups omit version history, comments and external image files; keep those separately. Before any new subscription gate is enabled, define and verify how existing purchasers retain the primary functionality they paid for. Apple Guideline 3.1.2(a) says an app changing to a subscription model must not remove primary functionality existing users already paid for.

## Commercial decisions and current evidence

| Area            | Decision or intended behavior                                                                   | Current evidence and remaining work                                                                                                                                                                                                                                               |
| --------------- | ----------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Desktop payment | Apple In-App Purchase through StoreKit; selected in closed issue #16                            | Paid Apps Agreement was accepted and verified active on 2026-11-10. Native StoreKit bridge and purchase UI are implemented. No live products are configured; simulator verification returned StoreKit error code 3.                                                               |
| Distribution    | Reuse the existing Mac App Store record `1602636196` (`com.zenuml.app`); Apple supplies updates | Current candidate profile still declares `ai.diagramly.desktop`, which does not match the selected existing record. Reconcile the shipping bundle identity before building. No listing metadata has been changed; final build, signing and submission eligibility remain pending. |
| Local core      | Local Mermaid/ZenUML editing, import, save/restore and external MCP                             | Product-profile UI/API and backup code are in progress and have focused test evidence. Clean-machine and final signed sandbox acceptance remain.                                                                                                                                  |
| Paid offer      | One Pro tier with monthly and annual options                                                    | $9.99 monthly and $99.99 annual are planning targets only. No price is shown here as live; verify StoreKit price points, costs, entitlements and products before sale. See [pricing](pricing.md).                                                                                 |
| Identity        | Apple purchase identity and Diagramly sign-in are separate                                      | Connection and purchase-context API work exists in a separate backend branch and remains default-off; integration and live verification are pending. See [Apple payments](apple-payments.md).                                                                                     |
| Name and icon   | Diagramly brand, introduced gradually on the existing ZenUML listing                            | Brand direction is approved. The existing listing remains unchanged until the paid-customer rights and migration plan is verified. The candidate icon is not yet approved for the shipping build.                                                                                 |
| Public support  | `/desktop` and `/desktop/support` explain the pre-launch offer and migration boundaries         | Pages are committed locally in branch `codex/desktop-marketing` (`bd17c5ee6`); they are not deployed. There is no published Desktop response-time promise.                                                                                                                        |

Product copy uses Document → Page → Diagram as interface vocabulary. Keep storage and protocol names compatible; see [terminology issue #15](https://github.com/ZenUml/doop/issues/15).

## Issue #16 decision and continuing licence work

Issue #16 is closed because the owner selected the Mac App Store and Apple In-App Purchase. This closes the channel-choice question only. The root AGPL licence, modified-source publication obligations, third-party notices, and compatibility of the chosen channel still require a qualified release review. Do not assume that attaching the upstream repository satisfies source obligations, that an App Store EULA resolves compatibility, or that the remote Diagramly service shares the app's licence boundary. Preserve `LICENSE` and all third-party notices throughout packaging and review.

## Evidence and release gates

The current evidence and open dependencies are recorded in [execution-status.md](execution-status.md). The local release audit is [audit-release.mjs](audit-release.mjs). It reads the dedicated App Store profile rather than treating the upstream Doop template config as the selected product profile:

```sh
node docs/launch/audit-release.mjs \
  --bundle "/tmp/diagramly-commercial-final/Diagramly Desktop.app" \
  --output /tmp/diagramly-release-audit.json
```

That candidate path is the intended final output and **does not exist yet**. Earlier native artifacts were built before the latest fixes and are not release candidates. An audit without a new candidate remains blocked. `current-readiness.json` is a prior snapshot and must not be treated as evidence for the final bundle; refresh it only after the exact final candidate has been built.

The audit checks configuration and bundle facts. Static profile or source-file presence does not prove StoreKit behavior, server verification, sandbox compliance, App Review acceptance, or release readiness. Exit 2 means a known blocker; exit 0 means further human and end-to-end review is still required. `releaseReady` remains false.

The candidate App Store profile currently uses product name `Diagramly Desktop`, identifier `ai.diagramly.desktop`, no self-updater and an Apple-delivered update policy. The owner selected Diagramly and reuse of existing record `1602636196` / bundle `com.zenuml.app`; therefore the candidate identifier must be aligned with that record before a shipping build. The base Tauri config intentionally remains the upstream Doop profile for other builds. The local bundle path uses the dedicated candidate profile and `app-store` Cargo feature.

Current release gates include:

- source/licence/notices and distribution-channel review;
- final production profile build, signing, provisioning and bundle verification;
- StoreKit product configuration, live purchase/restore/manage testing, and server-side signed transaction verification;
- confirmation and implementation of existing paid customers' access to the primary functionality they purchased before any subscription gate is enabled;
- completion and review of the default-off Diagramly connection/entitlement integration;
- privacy and local-security review, including loopback MCP and generated content;
- clean-machine install, migration, backup/restore, account switching and failure acceptance;
- public support/listing publication and App Store review materials.

The bundle-allocation measurement of 1,187 MiB included development dependencies. It is not the signed download size or a reclaimable-space estimate.

## Delivery order

1. Complete source/licence/notices review and confirm the shipping capability set. Keep legacy data and the current app usable.
2. Finish the dedicated production build, identity/container migration and local-data recovery checks.
3. Complete account-bound StoreKit delivery, server verification, restore, notifications, product configuration and real sandbox acceptance. Confirm service costs before publishing an allowance or price.
4. Run clean-install, upgrade, offline-start, account-switch, MCP, import, backup/restore and purchase-failure acceptance on the exact signed build.
5. Deploy reviewed `/desktop` and `/desktop/support` content; finish App Store metadata, privacy disclosures, review instructions and private beta. Submit only the reviewed candidate after all gates pass.

## Ownership and operating evidence

Prepare reviewable work before any necessary account-holder action. Keep credentials, private account details, banking/tax details, signing secrets and customer data out of this directory. Do not accept legal contracts, alter bank/tax settings, spend money, contact customers, upload a build or publish a release without the required authorization.

Measure first diagrams saved and reopened, successful source edits, visible MCP edits, imported pages remaining editable, retained weekly editors, verified purchases, refunds and net proceeds after usage costs. App opens, button clicks, a token in storage and gross sales do not establish those outcomes.

See [Apple payments](apple-payments.md), [pricing](pricing.md), [listing and screenshots](listing.md), [operations](operations.md), [support playbook](support-playbook.md), [launch issues](issues.json) and [execution status](execution-status.md).
