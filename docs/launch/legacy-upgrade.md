# Existing ZenUML customers and library upgrade

The update reuses App Store record `1602636196`, bundle `com.zenuml.app`. The package remains **ZenUML**, version 1.1.0 build 41, while the interface introduces Diagramly. There is no second app listing and no forced cloud account merge.

## Local rights

The local product profile is designed to provide library import, diagram source and whole-diagram style editing, saving, portable backup/restore, external MCP, PNG, transparent PNG and JPG without a Diagramly cloud subscription. This capability statement is not acceptance of the new native app; packaged native UI, purchase and clean-machine checks remain release gates below. A previously paid download does not automatically grant new cloud AI credits. Cloud identity, local profile and Apple purchase identity remain separate.

The verified 2023 source exposes whole-diagram CSS, LESS, SCSS and SASS editing; these are retained. The new local compiler bounds time, memory and concurrency and rejects compiler filesystem/network/plugin access. Ordinary CSS can retain external font imports: local documents are not an unconditional promise of zero network requests.

Stylus and AtomicCSS conversion is unsupported. Import warns and preserves original style text, AtomicCSS configuration and original HTML as recovery text. It must not claim equivalent appearance. Keep the original app and recovery copy until visual review is complete. The exact old 1.0.7 executable has not been replayed; historical source inspection is separate evidence.

## Migration behavior

Before opening the new local database, the sandboxed shell preserves the existing ZenUML IndexedDB and local-storage files in a private recovery directory. An explicit native folder chooser supports libraries outside the app container. Original files are never opened through Chromium or modified. Busy, corrupt and unavailable libraries are reported without pretending that the library is empty or successfully migrated.

The server reads only a manifest-owned recovery path. It selects the active LevelDB manifest, verifies checksums and record versions, applies tombstones, and strictly decodes the known ZenUML IndexedDB schema. Untrusted V8 decoding runs in a bounded separate Node process. A complete validated JSON export is written only into the recovery directory; invalid input produces no partial import.

The migration target is one Diagramly Document per legacy ZenUML document, containing one default Board and one Diagram. All legacy pages must stay inside that Diagram as Pages; they must not become separate Boards or Diagrams. Import must preserve each Page's source, style inputs, saved dimensions and current-page selection when the legacy current page matches a page ID.

The keyed reader carries a stable `sourceRecordId` derived from the IndexedDB object-store key while keeping the legacy payload ID unchanged. Distinct storage records with the same payload ID therefore remain distinct. Re-importing the same keyed snapshot uses the same source identity and skips a previously imported record, preserving edits. Older `Export all` JSON has no storage key and uses a separate content-derived identity. There is no persistent alias connecting an already imported no-key JSON record to a later keyed-reader record, so importing both formats may create a second copy; automatic cross-format association is not implemented. Another local profile does not inherit document ownership. Portable backups preserve source, style inputs, pages and diagram layout; they omit account grants, history, comments and external image files.

## Acceptance boundaries

- Automated tests use synthetic libraries for active-page selection, styles, malformed-input rejection, repeated imports, restart persistence, profile separation and no-subscription access.
- A private real legacy sample has five single-page records. It verifies strict-reader behavior and unchanged source hashes; it does not prove multi-page import, current-page restoration or native UI acceptance. Private diagrams and their titles are excluded from source control and public evidence.
- Native UI import/render/edit/export/restart evidence must name the exact assembled app/source commit. A decoder result alone does not establish this acceptance.
- A valid ad-hoc seal is local QA only. Fresh Apple signing/provisioning, real Sandbox purchase lifecycle, clean-machine upgrade, minimum-OS and Intel/universal compatibility remain release gates.

Do not close migration or release issues solely because source files or fixture tests exist.
