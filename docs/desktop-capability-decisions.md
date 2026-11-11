# Diagramly desktop capability decisions

2026-11-11. The owner instructed us to resolve the remaining issues and delegated product ownership. This completes the review before the coordinated product-mode implementation. It does not remove stored data or rename the MCP/storage protocol.

| Issues | Decision                                                                                                                                                                                            |
| ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| #1–4   | Keep local document ownership; connect Diagramly cloud identity separately, use scoped cloud access and Apple purchases. Disable upstream model-account and billing entry points in Diagramly mode. |
| #5     | Replace the HTML-element inspector/tree with a diagram list and source editor. Keep moving/arranging whole diagrams and persisted legacy CSS.                                                       |
| #6     | Remove development approvals/prototype controls from Diagramly mode. Preserve old fields.                                                                                                           |
| #7     | Keep legacy JSON import; add source-file import. Website/live-app/GitHub screen imports are outside this product mode.                                                                              |
| #8     | Retain rendered legacy styles; remove generic design tokens, image-generation/model settings and web-design font tooling from navigation.                                                           |
| #9     | Local links are explicitly local. Do not advertise sharing across computers without an implemented private cloud publish action.                                                                    |
| #10    | Advertise only verified raster/source/backup exports. PDF/SVG remain unavailable until release-build verification.                                                                                  |
| #11    | Remove generic automations, webhooks, integrations and design memory from Diagramly navigation and entry points. External MCP remains independent.                                                  |
| #12    | Home focuses on documents, import and external AI connection. Settings separate local identity, cloud account and Apple subscription.                                                               |
| #13    | Apply this set through a product profile. Existing upstream behavior remains available in the upstream profile; compatible storage and history remain.                                              |
| #15    | Use Document → Page → Diagram in user-facing Diagramly surfaces. Internal Canvas/Frame and MCP identifiers remain compatible.                                                                       |

The implementation and acceptance evidence determine issue completion; this record alone does not close implementation issues. Cloud generation must never fall back to another provider or payment channel. Apple account configuration and production submission remain distinct from local code completion.
