# Diagramly Desktop: commercial release

Status: preparation, not ready for sale. Updated 2026-11-11.

Commercial release tracker: [launch epic #26](https://github.com/ZenUml/doop/issues/26), with ten independently scoped launch issues.

The user assigned responsibility for the product, engineering, brand, listing, pricing, release and operations. The user then chose **Apple App Store payments**. The desktop sales channel is therefore the **Mac App Store with Apple In-App Purchase**. This supersedes the earlier suggestion to use the website checkout for desktop purchases. Existing website billing is unchanged.

## Product direction

Working product name: **Diagramly Desktop**. Store search name: **Diagramly – AI Diagrams**. Use the existing Diagramly brand rather than introducing another unrelated product. Name availability and trademark clearance remain unverified.

Serve developers and technical teams who need editable Mermaid and ZenUML diagrams, a local library, and collaboration with their own AI agent. Lead with the concrete result: **Turn architecture ideas into diagrams you can keep editing.** Legacy ZenUML library import is a useful migration path, not the entire positioning.

The first release should make three tasks dependable: create and revise a diagram; import and continue editing an old library; connect an external MCP agent and see the changes. Cloud AI becomes a paid capability only after account access, entitlements, metering and Apple billing work together. A login or connected-agent badge is not evidence that paid cloud AI works.

## Commercial decisions

| Area            | Working decision                                                       | State                                                                                  |
| --------------- | ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Desktop payment | Apple In-App Purchase through StoreKit                                 | User decision; not implemented                                                         |
| Distribution    | Mac App Store; updates through Apple                                   | Selected route; eligibility and submission pending                                     |
| Local core      | Free download; local create/import/edit/save and external MCP          | Proposed packaging, requires final capability review                                   |
| Paid offer      | One Pro tier, monthly and annual, for metered Diagramly cloud services | Pricing proposal in [pricing.md](pricing.md)                                           |
| Identity        | Apple purchase identity and Diagramly login remain separate            | Design in [apple-payments.md](apple-payments.md)                                       |
| Icon            | Diagram connection nodes forming a D; existing brand palette           | [Candidate v1](assets/icon-v1/preview.png), not installed                              |
| Feature changes | Review all issues first, then apply agreed removals together           | Existing user constraint, [feature epic #14](https://github.com/ZenUml/doop/issues/14) |

Product copy uses Document → Page → Diagram as a candidate vocabulary. Do not rename storage fields or MCP protocols merely to change interface labels; [terminology issue #15](https://github.com/ZenUml/doop/issues/15) owns that review.

## Evidence and release gates

The local spike has real legacy import and native edit/restart evidence. That does not establish a commercial release. The current audit is [current-readiness.json](current-readiness.json). Run it again for each candidate:

```sh
node docs/launch/audit-release.mjs --bundle /absolute/path/Candidate.app --output /tmp/diagramly-release-audit.json
```

Exit 2 means a known blocker. Exit 0 means further review is required, never automatic release approval.

Current blockers include: AGPL distribution/source compliance and App Store terms compatibility; unpublished modified source; spike identity and container migration; ad-hoc signature; no Apple purchase implementation or verified products; cloud login/entitlement integration; privacy/data-flow review; and a production build lane. The measured bundle allocation was 1,187 MiB, including development dependencies. This is a build diagnostic, not a measured download size or reclaimable disk-space estimate.

The root AGPL licence must be respected. Do not assume that attaching the upstream repository satisfies source obligations for the modified app, that an App Store EULA solves compatibility, or that all remote Diagramly services automatically share the app's licence. Record a qualified licence/channel determination before distribution.

## Delivery order

1. Resolve the licence/channel gate and record the shipping capability set from #14. Preserve existing data and keep the current app usable.
2. Build the production sandbox/release lane and safe data migration. Connect Diagramly identity and scoped entitlement APIs.
3. Implement and test StoreKit purchases plus server verification. Establish costs and final subscription benefits before configuring paid products.
4. Run clean-install, upgrade, restore, offline, account-switch and failure acceptance. Use synthetic diagrams in store assets.
5. Complete App Store metadata, privacy disclosures, support pages, review instructions and a private beta. Submit the exact reviewed build; publish only after all gates pass.

## Ownership and operating evidence

The agent owns the backlog, implementation, validation, assets, release preparation, support runbook and measurement. Keep credentials local. Record decisions and evidence in this directory and the launch issues. Do not accept legal contracts, change bank/tax details, spend money, contact customers, or publish a release silently. Prepare concrete reviewable work before any necessary account-holder action.

Measure useful outcomes: first diagram saved and reopened; a source edit successfully rendered; agent edit visible; imported pages still editable; retained weekly editors; verified paid conversion; net proceeds after refunds and usage costs. App opens, button clicks, a token in storage, and gross sales alone do not prove those outcomes.

See [Apple payments](apple-payments.md), [pricing](pricing.md), [listing and screenshots](listing.md), [operations](operations.md), and [launch issues](issues.json).
