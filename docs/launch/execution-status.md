# Desktop app execution status

Updated 2026-11-17. **Not yet ready for App Store submission.**

## Desktop candidate

- PR #32 prepares the existing ZenUML app (`com.zenuml.app`) for the Diagramly transition. It includes the renamed Claude extension, local MCP connection, title persistence and desktop workflow fixes. The PR has not yet been merged.
- The full JavaScript test run passed 3,071 tests with 19 skipped on commit `27025de`; later port and workflow changes have focused checks. The renamed extension was installed in Claude Desktop and used to read and edit an isolated test diagram, which was reopened in the desktop app.
- A sandboxed debug build showed the port-conflict message and restarted on its saved port once the conflict was removed. This does not verify automatic port discovery or a signed App Store build.
- Existing legacy diagrams have been imported and edited in an isolated build, including a synthetic diagram with two pages. A final candidate still needs a practical upgrade/import check.

## Payments and release

- Apple In-App Purchase remains the desktop payment channel. The native purchase bridge exists; real Apple Sandbox purchase, restore and renewal have not been verified.
- Backend Apple entitlement integration is on a separate branch. Its isolated database tests passed, while CI and production integration remain open. Do not enable the Apple gate or claim production readiness based on local tests alone.
- An unsigned macOS review bundle exists; the final source revision has not been signed or uploaded. The current local keychain lacks the required Mac App Store distribution identities. Confirm the App Store Connect product, provisioning and build-number state before packaging.
- Store listing, screenshots, pricing and support materials remain drafts. Confirm claims against the actual release candidate and complete the Apple review information before submission.

`docs/launch/current-readiness.json` is not updated by this snapshot. Keep `releaseReady` false until the actual release candidate is verified.
