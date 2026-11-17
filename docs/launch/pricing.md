# Pricing and storefront status

Status: **existing paid Mac App Store app; current price not verified for this update.** No price change is proposed or authorized.

## Decision

Continue the existing ZenUML paid Mac App Store listing (`com.zenuml.app`, record ID `1602636196`) and transition its branding gradually to Diagramly. Keep the current storefront price and paid-app model. Do not add a subscription, in-app purchase, or Diagramly cloud-AI charge to this release.

A current public iTunes lookup for app ID `1602636196` confirms the US storefront price is **$29.99 USD**. The Australia storefront price has not been checked and remains **unverified**. Confirm both storefront prices in App Store Connect before preparing metadata. Do not change the price as part of this documentation update.

## Product boundary

The proposed v1 is local editing and preview for ZenUML and Mermaid, an independent editor for a board diagram opened by double-click, Pages tabs within a diagram, import of an older ZenUML JSON library, and an MCP connection configured by the customer. The customer supplies their MCP client and any associated AI account or provider billing. Diagramly cloud AI and recurring billing are outside this release scope.

No price, discount, subscription duration, trial, cloud allowance, or renewal term should appear in new copy. Do not imply that purchase restore or other commerce behavior has been verified. Preserve the existing paid-app listing and price while release readiness is checked.
