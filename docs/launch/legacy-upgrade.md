# Existing ZenUML customers and library upgrade

The update reuses App Store record `1602636196`, bundle `com.zenuml.app`. The package remains **ZenUML**, version 1.1.0 build 41, while the interface introduces Diagramly. There is no second app listing and no forced cloud account merge.

## Local rights

Local library import, diagram source and whole-diagram style editing, saving, portable backup/restore, external MCP, PNG, transparent PNG and JPG are available without a Diagramly cloud subscription. A previously paid download does not automatically grant new cloud AI credits. Cloud identity, local profile and Apple purchase identity remain separate.

The verified 2023 source exposes whole-diagram CSS, LESS, SCSS and SASS editing; these are retained. The new local compiler bounds time, memory and concurrency and rejects compiler filesystem/network/plugin access. Ordinary CSS can retain external font imports: local documents are not an unconditional promise of zero network requests.

Stylus and AtomicCSS conversion is unsupported. Import warns and preserves original style text, AtomicCSS configuration and original HTML as recovery text. It must not claim equivalent appearance. Keep the original app and recovery copy until visual review is complete. The exact old 1.0.7 executable has not been replayed; historical source inspection is separate evidence.

## Migration behavior

Before opening the new local database, the sandboxed shell preserves the existing ZenUML IndexedDB and local-storage files in a private recovery directory. An explicit native folder chooser supports libraries outside the app container. Original files are never opened through Chromium or modified. Busy, corrupt and unavailable libraries are reported without pretending that the library is empty or successfully migrated.

The server reads only a manifest-owned recovery path. It selects the active LevelDB manifest, verifies checksums and record versions, applies tombstones, and strictly decodes the known ZenUML IndexedDB schema. Untrusted V8 decoding runs in a bounded separate Node process. A complete validated JSON export is written only into the recovery directory; invalid input produces no partial import.

The user reviews documents/pages before importing into the current local profile. Migration identity uses the owner and stable IndexedDB record key when available. Older JSON exports retain content-derived identities and preserve repeated identical entries as distinct documents. Re-importing the same records skips previously imported documents, including documents edited afterward. Another local profile does not inherit document ownership. Portable backups preserve source, style inputs, pages and diagram layout; they omit account grants, history, comments and external image files.

## Acceptance boundaries

- Automated tests use synthetic libraries for active-page selection, styles, malformed-input rejection, repeated imports, restart persistence, profile separation and no-subscription access.
- A private real legacy copy has been decoded successfully and its original raw-file hashes verified unchanged. Private diagrams and their titles are excluded from source control and public evidence.
- Native UI import/render/edit/export/restart evidence must name the exact assembled app/source commit. A decoder result alone does not establish this acceptance.
- A valid ad-hoc seal is local QA only. Fresh Apple signing/provisioning, real Sandbox purchase lifecycle, clean-machine upgrade, minimum-OS and Intel/universal compatibility remain release gates.

Do not close migration or release issues solely because source files or fixture tests exist.
