# Desktop measurement plan

Proposal only. No new telemetry has been configured. Instrument only after the desktop privacy review and the actual build's PostHog/replay behavior are verified. Prefer opt-in, low-cardinality events; never collect diagram content, source, screenshots, prompts, tokens, personal email or Apple purchase payloads.

## Outcomes and definitions

| Outcome                    | Operational definition                                                                                                        | Evidence source                                                  | Segment carefully                                                      |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- | ---------------------------------------------------------------------- |
| First useful local diagram | A new diagram is saved, then reopened successfully                                                                            | Local app event or opt-in diagnostic                             | New installs; distinguish ZenUML from Mermaid                          |
| Source edit success        | A source change produces a successful render and persists after reopen                                                        | Local app event plus release acceptance                          | Renderer and diagram kind; no source text                              |
| MCP edit success           | A compatible client reads or changes the intended open diagram and the app confirms the result                                | Local app event or opt-in diagnostic                             | MCP client family/version; no prompt or tool arguments                 |
| Legacy migration success   | Import completes, imported page count is nonzero, and at least one imported diagram is reopened and editable                  | Local import result; acceptance sample                           | Exporter version, size band and warnings; no document names/content    |
| Weekly retained editor     | Distinct privacy-reviewed installation or account identifier saves or edits a diagram in the week                             | Approved analytics event                                         | Cohort week and app version; avoid fingerprinting                      |
| Verified paid conversion   | A server-verified Apple transaction produces the intended active entitlement                                                  | StoreKit/backend reconciliation                                  | Product and storefront region; never raw transaction data in analytics |
| Paid retention             | Verified entitlement remains active and a qualifying use occurs in a later billing cohort                                     | Apple financial/subscription report plus approved service metric | Monthly versus annual; exclude free trial until one exists             |
| Net contribution           | Apple proceeds less refunds, taxes/commission adjustments, AI and infrastructure variable cost, and attributable support cost | Apple financial reports and cost ledger                          | Product, billing cohort and service-cost band                          |

An app open, button click, login, stored token or unverified transaction is not evidence of these outcomes.

## Weekly review

Use a consistent Monday-to-Sunday window and report the data extraction date. Show counts and denominators for each funnel step, cohort size, missing data and uncertainty. Separate Apple proceeds from existing website billing. Compare monthly and annual subscribers only after enough renewal cohorts exist. Do not infer willingness to pay from click-throughs or an unconfigured price sheet.

Suggested dashboard rows:

1. Installs that complete a first save → successful reopen.
2. Editors with a successful source edit → saved and reopened diagram.
3. MCP connection attempts → confirmed read/edit success.
4. Legacy import started → completed → reopened editable page.
5. Offer views → StoreKit purchase attempts → server-verified paid users.
6. Renewal, refund, entitlement mismatch and support rates by paid cohort.
7. Median and high-percentile variable cost per active paid user, plus net contribution.

## Decision rules

- Do not enable telemetry until the event list, retention period, consent/UI and replay capture scope pass privacy review on the release build.
- Keep an outcome metric if it changes a product or reliability decision. Remove events that only count clicks without a useful denominator.
- Investigate import or save errors before increasing acquisition. A saved-document loss or unauthorized access report pauses rollout while the team confirms scope.
- Do not expand cloud allowance or publish a numeric credit amount until model/provider cost is mapped to the allowance, high-percentile usage is measured and a server-enforced cap is verified.
- Review the $9.99 monthly and $99.99 annual proposal against verified activation, renewal, refunds and net contribution. Change prices only through the authorized App Store Connect owner after a documented decision.
- Record each decision, evidence date, cohort size, limitations and owner. Do not present small samples as forecasts.
