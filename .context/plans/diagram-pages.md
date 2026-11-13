# Diagram-owned pages

The accepted model is Document → Board → Diagram → Page. See `../../GLOSSARY.md` for the product language.

- Keep outer board storage and existing protocol page identifiers compatible; change Diagramly labels and new default names to Boards.
- Keep a multi-page diagram in one frame, with versioned page metadata, stable inner page IDs and its current page. Existing single-page diagrams remain readable and editable.
- Preserve every legacy page's source, original/compiled styles, recovery text and dimensions. A legacy document imports as one document, a default board and one diagram, with its previously current inner page selected.
- Source and style updates target one inner page. Switching, adding, renaming and deleting pages must preserve every other page and reject stale writes. A diagram always retains at least one page.
- Local drafts belong to the user, diagram and inner page. Queued saves, stale responses and unapplied style drafts must not spill into another page.
- A renderer owns its mount and current language. Delayed module loading must not let an old renderer interpret another page's language; switching back must restore cached library styles without accumulating observers.
- Backup/restore, frame history, duplication and MCP reads/updates preserve all inner pages. Existing outer `pageId` remains an outer-board identifier; inner page targets use a distinct name.

Acceptance uses a two-page legacy document with different source and styles. Verify one board and one diagram, restore the current page, edit one page, switch between them, reopen/restart, inspect a complete backup and retry import without losing edits. Then verify the assembled native desktop app and its image exports. The private real legacy sample contains five single-page records; it complements but cannot prove multi-page behavior.

The renderer regression delays the first Mermaid module request by one second, then completes two ZenUML → Mermaid → ZenUML cycles in the actual app. It checks the rendered language, labels, page CSS, mount geometry and restored ZenUML library styles; a readiness marker alone is insufficient evidence.

Preserve singleton drafts when the first inner pages are added. Recover them only on the original page, including after undo, and retain the old stored draft if writing its replacement fails. Duplication and undo/redo must retain all page source and styles. Reject backups whose displayed content disagrees with their active page before restoring any documents.

Backup stacking order is a finite ordering value, often a timestamp or fraction, rather than a bounded canvas coordinate. Acceptance must create new diagrams through the server before exporting and restoring a library; import-only fixtures do not exercise this value.

Older unkeyed JSON identities must remain stable when page dimensions become recognized. Cross-format association between an unkeyed JSON import and a keyed IndexedDB export requires a durable alias; it is tracked separately in the migration issue and must not be inferred from an unstored content match.
