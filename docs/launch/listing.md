# Store listing and creative brief

Draft only; no listing change or submission is recorded. Machine-readable copy is in [store-listing.json](store-listing.json). Confirm current App Store Connect limits and verify every claim against the exact signed build before submission.

## Brand and existing listing

Introduce Diagramly gradually through the existing paid ZenUML Mac App Store app record (`1602636196`, bundle ID `com.zenuml.app`). Keep its current price; current US and AU prices are still to be confirmed. This draft does not represent an uploaded listing or a submitted update.

The candidate icon is a design asset, not a confirmed shipping icon: [SVG master](assets/icon-v1/diagramly-desktop.svg), [size preview](assets/icon-v1/preview.png), [macOS ICNS](assets/icon-v1/icon.icns). Confirm the listing name, icon and metadata against the existing record before use.

## Proposed v1 claims

The copy proposes a local ZenUML and Mermaid editor with source editing and live preview; double-clicking a board diagram to open it in a separate editor; Pages tabs within a diagram; import of an older ZenUML JSON library; and connection to a customer-provided MCP client. The customer supplies and configures that client and any AI provider account. Do not imply Diagramly cloud AI, subscription billing, cloud sync, or verified purchase restore.

Do not list export formats or claim that an export workflow is available until each format is checked on the exact release build. Confirm the supported ZenUML JSON import format and handling of imported Pages on that build.

## Screenshot sequence

Capture actual screens from the signed candidate using synthetic diagrams and documents. Do not depict unavailable cloud features or unverified export formats.

| Order | Message                                    | Evidence to capture                                                |
| ----- | ------------------------------------------ | ------------------------------------------------------------------ |
| 1     | Edit the source and see the diagram update | Source editor and live preview showing one concrete edit           |
| 2     | Open a diagram from your board             | Double-click action and the independent editor for that diagram    |
| 3     | Keep related views in Pages                | Page tabs inside one diagram and switching between pages           |
| 4     | Use ZenUML or Mermaid                      | One synthetic diagram of each supported language                   |
| 5     | Bring an older ZenUML library              | JSON import with imported documents and Pages reviewed             |
| 6     | Connect your MCP client                    | A real customer-configured MCP edit appearing in the local diagram |

Use [demo-fixtures](demo-fixtures/) only as synthetic inputs. Record which steps pass on the shipping candidate before capturing screenshots or video. Remove private prompts, credentials, emails and customer work.

## App Review materials

Confirm the current public support and privacy URLs, seller details, support contact, privacy disclosures, age rating, export-compliance answers and third-party notices from the shipping candidate. The proposed `/desktop` landing page returned 404. `/desktop/support` returned HTTP 200; its content was checked for legacy import steps and the 10 MB limit, renderer-error troubleshooting, external agent/provider billing, and a support email. Recheck the live page before submission. Describe the customer-configured MCP flow and local data handling accurately. Do not include Diagramly cloud-AI, subscription, in-app purchase, purchase-restore, or unverified export claims.

Store requirements: [Apple app information](https://developer.apple.com/help/app-store-connect/reference/app-information/app-information/) and [App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/). Recheck before submission.
