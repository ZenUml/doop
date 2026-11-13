# Store listing and creative brief

Draft only; no listing submitted. Machine-readable copy is in [store-listing.json](store-listing.json). Name, subtitle, keywords and promotional text must pass the App Store Connect limits again at upload time. Final claims must match the exact release.

## Brand

Product brand direction: Diagramly, introduced gradually from the existing ZenUML listing. This draft proposes the listing name “Diagramly Desktop” and subtitle “Mermaid & ZenUML diagrams”; it has not been submitted and no current App Store metadata has changed. Reuse the existing app record and bundle ID (`1602636196`, `com.zenuml.app`). Candidate icon: [SVG master](assets/icon-v1/diagramly-desktop.svg), [size preview](assets/icon-v1/preview.png), [macOS ICNS](assets/icon-v1/icon.icns), and square PNGs from 16 through 1024 pixels. The same candidate is staged at `desktop/src-tauri/icons/` for the native package. Root Tauri identity/configuration still needs to match the existing record and validate the App Store profile; this does not install the icon into a shipping build.

The icon uses a diagram-node D in Diagramly's blue/violet/pink palette. It is an original vector candidate drawn in code; no external image-generation service was used. The source is square and full bleed; the preview applies a rounded presentation only. Regenerate outputs on macOS with `node docs/launch/assets/icon-v1/generate.mjs` (requires the repository's `sharp` dependency and Apple `iconutil`). Verify name availability, brand rights and contrast at small sizes before submission.

The copy in [store-listing.json](store-listing.json) describes local ZenUML and Mermaid editing, local document/page persistence, compatible MCP clients and import of the older ZenUML JSON library. It makes no cloud-AI or subscription availability claim. Validate all four workflows on the exact signed build; any unsupported or unstable workflow must be removed from the listing.

## Screenshot sequence

Capture actual screens from the shipping build with synthetic documents, after the agreed UI cleanup. Use current Apple size requirements from App Store Connect at upload time. Do not manufacture screenshots of unimplemented cloud features.

| Order | Message                                    | Actual product evidence to capture                                                    |
| ----- | ------------------------------------------ | ------------------------------------------------------------------------------------- |
| 1     | Architecture diagrams you can keep editing | A clean, readable synthetic system diagram and editable source                        |
| 2     | Revise the source, see the result          | A concrete before/after source edit with a visible changed message/node               |
| 3     | Work with your AI agent                    | A real MCP edit appearing on the correct document; no private prompt, token or email  |
| 4     | Bring your ZenUML library                  | Synthetic exported library preview, multiple pages and subsequent source edit         |
| 5     | Keep your work organized                   | Documents/pages using the approved terminology; save/reopen evidence                  |
| 6     | Optional cloud assistance                  | Only if implemented: a verified cloud task and accurate Apple subscription experience |

Synthetic source files and a legacy import fixture are in [demo-fixtures](demo-fixtures/). Demo script: open the checkout Mermaid source, add an inventory call through the editor, request one MCP revision, import `legacy-library.json`, edit a page, restart and reopen. Record which steps work on the shipping build before capturing actual screenshots or editing a short product video. No private legacy export or personal QA account appears in marketing.

## Public pages and review package

Proposed desktop landing/support URLs are not deployed. Existing [privacy](https://diagramly.ai/legal/privacy-policy), [terms](https://diagramly.ai/legal/terms) and [refund policy](https://diagramly.ai/legal/refund-policy) pages resolve, but desktop coverage and Apple purchase wording require review. Do not mark legal requirements complete merely because these URLs return content. Internal response templates and incident fields are in [support-playbook.md](support-playbook.md); they are not public support pages or an SLA.

Explain the local server, loopback-only MCP access, exact JSON import format, external-agent connection, sandbox permissions, account linking, purchase/restore and account deletion in App Review notes. Supply safe demo access for cloud features where required; never supply an owner's account or production token. Prepare age rating, privacy labels, export-compliance answers, third-party notices, support contact and subscription review information from verified implementation facts. Event definitions and weekly review rules are in [measurement-plan.md](measurement-plan.md); no telemetry is configured by that plan.

Store requirements reference: [Apple app information](https://developer.apple.com/help/app-store-connect/reference/app-information/app-information/) and [App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/). Recheck before submission.
