# Release and operations

Status: operating plan; customer-facing promises and automated systems are not active.

## Every release

Identify the exact reviewed commit and dependency lockfiles; produce the matching source archive and third-party notices. Build the Mac App Store profile with the intended app/container identity, least-privilege sandbox entitlements, correct nested signatures and store provisioning. Check that the store build cannot self-update or fall back to Doop services. Upload through the approved Apple tooling. Do not call a Developer ID/ad-hoc build an App Store build.

Measure candidate download size and clean launch time on the supported Macs. The current spike includes a large dependency tree; remove development and wrong-platform files by a tested packaging process. Ensure all required JS, fonts and renderers are bundled. No downloaded executable extension may change app functionality after review. Verify native helper/server termination after quit.

Run release acceptance on a clean supported Mac and upgrade installation: local save/reopen, real-format synthetic legacy import, duplicate import preserving edits, long/multipage diagrams, MCP read/edit/screenshot, each advertised export, offline start, port conflict, account switch, login expiry, purchase, pending/cancelled purchase, restore, notification retries, refund/expiry and recovery after interrupted writes. Existing real-library tests are valuable but cannot replace clean-machine/store-sandbox tests.

Back up local data before migrations. Implement and test a supported backup/restore path before claiming recovery. A payment or cloud-account change must not move or delete local documents. Migration rollbacks must account for schema compatibility; do not downgrade a database blindly. Keep a last-known-good source/build and a forward-fix path through Apple review. Apple controls store updates, so an instant binary rollback is not promised.

## Privacy and security

Map each network destination and data category: local DB, external MCP clients, Diagramly auth/cloud, Apple purchases, diagnostics. Make upload scope explicit. Imported libraries stay local until a user chooses a cloud action. Default proposed diagnostics exclude diagram source, rendered contents, screenshots, prompts, tokens, purchase JWS and personal email.

The current optional PostHog integration can capture replay/iframe contents if enabled. No new telemetry key was added. Audit the actual compiled build and choose a desktop data policy before enabling analytics; a generic website policy is insufficient evidence. Prefer outcome events with opaque identifiers and opt-in diagnostic bundles that users can inspect.

Review loopback-server authentication, bind address, origins/CORS, MCP authorization, diagram iframe isolation, native command origins, token storage, renderer/code execution and dependency vulnerabilities. Do not turn a desktop service into an unauthenticated listener on the LAN. Store cloud credentials in an appropriate OS/backend credential store and redact them in support logs.

## Support and incidents

Use the existing Diagramly support channel once desktop instructions are published. Prepare templates for import/display failures, account mismatch, purchase/restore problems and data recovery. Do not ask for an entire private diagram library when a small redacted example or local diagnostic will suffice. Customer contact is not initiated by this plan.

Proposed internal triage: data loss, unauthorized access and purchased access failing broadly take priority over cosmetic defects. Record affected build/platform, reproduction, customer impact, mitigation and verified recovery. Freeze further rollout when a release causes reproducible data corruption or widespread paid-access failures. These are internal operating rules, not a published response-time SLA.

Use server-side feature controls to pause failing cloud generation without deleting local work. Keep Apple notification processing durable and observable. Reconcile stuck purchases and entitlement mismatches; never fix them by manually giving unlimited credits without an auditable reason.

## Weekly commercial review

Review activation and saved/reopened diagrams, weekly retained editors, verified purchases, renewals, refunds, support themes and service cost per paying account. Separate Apple proceeds from gross sales and existing web revenue. Investigate heavy-user cost tails and failures before buying traffic.

Start acquisition with the existing ZenUML/Diagramly audience, a clear migration guide, technical examples and a short truthful demo. Prepare posts and release notes, then publish through authorized channels after the build is ready. No ad spend, customer email campaign, review solicitation or public launch has been executed. Use App Store discovery data to revise screenshots/keywords; do not promise sales or ask for incentivized reviews.

Support intake and incident templates are in [support-playbook.md](support-playbook.md). Proposed event definitions and review rules are in [measurement-plan.md](measurement-plan.md). Neither document activates customer support or telemetry; verify the release build and privacy settings before use.
