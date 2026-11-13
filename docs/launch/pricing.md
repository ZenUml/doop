# Pricing and unit economics

Status: proposed desktop offer, no live price changes. Payment decision: Apple In-App Purchase, 2026-11-11.

## Initial offer

| Offer       | Proposed US price              | Benefit and boundary                                                                                                          |
| ----------- | ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| Local       | Free download                  | Local Mermaid/ZenUML create, import, edit and save; external MCP connection. External agent costs belong to its own provider. |
| Pro monthly | $9.99 / month                  | Metered Diagramly cloud AI and paid cloud benefits after integration and cost verification                                    |
| Pro annual  | $99.99 / year, billed annually | Same service, annual commitment; monthly equivalent about $8.33, not a monthly charge                                         |

Use one subscription group with monthly and annual alternatives; avoid multiple overlapping new desktop tiers at launch. These are working USD targets, not registered products or verified available Apple price points. StoreKit's localized product data must supply the actual price shown to customers. No free trial or lifetime/unlimited AI promise is included in this proposal.

The owner approved reuse of the existing paid Mac App Store app record. Preserve the primary functionality existing purchasers paid for before enabling subscription gates. Apple App Review Guideline 3.1.2(a) says changing an existing app to a subscription model must not take away those paid-for primary features. Define and test how prior purchasers retain access before configuring a new paid offer; new recurring cloud services can be considered separately after entitlement and policy review.

## Product catalogue decision checklist

Keep the catalogue to one auto-renewable Pro subscription group with monthly and annual durations. Before the App Store Connect owner creates products, record the final bundle ID, seller, subscription-group display name, immutable product identifiers, exact benefits, renewal wording, localization set, tax category and support/refund destinations. Treat product IDs and group membership as durable public billing contracts. Do not create placeholder live products to test copy.

The $9.99 monthly and $99.99 annual amounts are USD targets for review only. Verify that Apple offers the desired price points in App Store Connect, check the localized customer price and billing period returned by StoreKit, and show that returned value in every purchase surface. No product is currently configured. The app cannot sell Pro until purchase, server verification, entitlement grant/expiry/refund handling and Restore Purchases all work end to end.

Before fixing the paid allowance, map each included cloud operation to actual provider and infrastructure cost, choose a server-enforced monthly cap, measure high-percentile use, and prove that the cap protects the conservative proceeds case. Keep local editing and customer-owned external MCP providers outside the Diagramly cloud allowance.

Pro should initially map to a clearly defined, server-enforced allowance compatible with Diagramly Basic. Determine the actual models, credit-to-cost mapping, reset schedule and limits before publishing a numeric allowance. Preserve existing Plus customer access; do not silently downgrade website subscribers or create a second subscription for them. Entitlement mapping is a launch gate, not a new label on the old Doop plan.

## Existing baseline and market context

The public Diagramly catalogue checked on 2026-11-11 lists Basic $9.99/month or $99/year, and Plus $19.99/month or $179/year: [public API](https://diagramly.ai/api/billing.plans), [saved normalized baseline](public-price-baseline.json). The website also advertises promotional prices; these are not the proposed App Store prices. Checkout, taxes and promo eligibility were not tested. Existing website billing remains unchanged.

For context, [Mermaid's public pricing](https://mermaid.ai/pricing) lists Plus at $10/user/month and Premium at $20/user/month when billed annually. This supports testing a $9.99 entry offer; it does not prove willingness to pay or feature equivalence. Validate the offer with actual activation, repeat use and paid retention before adding more tiers or discounts.

## Apple proceeds scenarios

Apple's [subscription overview](https://developer.apple.com/app-store/subscriptions/) describes standard subscription proceeds of 70% initially and 85% after one year of paid service, minus applicable taxes. The [Small Business Program](https://developer.apple.com/app-store/small-business-program/) has a reduced 15% commission for approved eligible developers. Our enrollment and contract rate have not been verified. Budget both scenarios; do not assume we receive the reduced rate.

Illustrative proceeds below exclude taxes, refunds, currency adjustments and all service costs:

| Proposed price | At 30% commission              | At 15% commission               |
| -------------- | ------------------------------ | ------------------------------- |
| $9.99 monthly  | $6.993 / month                 | $8.4915 / month                 |
| $99.99 annual  | $69.993 / year ($5.8328/month) | $84.9915 / year ($7.0826/month) |

Planning rule: test whether AI, rendering, storage and support variable costs fit within 30% of these proceeds. That leaves a proposed 70% contribution margin before fixed costs, not an observed margin. The conservative annual scenario allows about **$1.75/customer/month** of variable cost under that assumption. Meter real job costs and heavy-user tails; a monthly credit count without cost mapping cannot establish profitability.

Annual cash arrives on an annual schedule while cloud costs continue monthly. Reserve enough proceeds to serve prepaid customers and handle refunds; do not treat the first payout as earned monthly margin. Reconcile actual Apple financial reports before making pricing decisions.

## Activation and conversion

Let customers complete and reopen one useful local diagram before showing a contextual paid cloud offer. Present the relevant cloud benefit, actual price, allowance and renewal terms. Show Restore Purchases and Manage Subscription. Do not block access to imported documents or use a misleading connected-AI indicator to force a purchase.

Measure saved/reopened diagrams, successful revisions, retained weekly editors, paywall-to-verified-purchase conversion, 30-day paid retention, refunds, and net contribution. Use sample sizes and cohorts; no invented revenue forecasts or guaranteed conversion target.
