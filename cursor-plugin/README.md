# Diagramly for Cursor

This package supplies the `diagramly-design` workflow skill. It does not register an MCP server or connect to a hosted service automatically.

## Connect your instance

1. Open the Diagramly instance you want Cursor to use.
2. Choose **Connect AI → Cursor → Add to Cursor**.
3. Review the instance's MCP address and approve the connection. Complete sign-in if that instance requests it.
4. In Cursor, enable the `diagramly` server. Send the document prompt copied from Diagramly.

Cursor running on your computer can reach a local desktop instance. A remote agent needs an address it can reach. Choose that address through your instance's connection flow; this package does not provide a public Diagramly endpoint.

The connected server supplies its current tool schemas and guidance through `get_guide({ topic: "design-instructions" })`. The skill uses that guide, reads the selected document, and reviews rendered results before completing edits. Use your own Cursor agent; this package contains no model credentials.

## Distribution status

Marketplace distribution is disabled: the root `.cursor-plugin/marketplace.json` intentionally lists no plugins. The old package connected to an unrelated hosted service and must not be submitted or installed as a ready-to-use Diagramly connection. Re-enable marketplace discovery only after an instance-selection flow is implemented and tested.

For local development, copy this directory to an empty `~/.cursor/plugins/local/diagramly` directory. Reload Cursor and confirm that the `diagramly-design` skill is available. Connect your selected instance separately using the steps above. Organization policy and Cursor's plugin support determine whether local imports are available.

## Package contents

- `.cursor-plugin/plugin.json`: Diagramly metadata and the skills directory.
- `skills/diagramly-design/SKILL.md`: the document workflow.
- `LICENSE`: AGPL-3.0 license.

The package has no automatic MCP endpoint, executable hooks, bundled runtime, or embedded credentials. An authorized MCP connection can read and modify designs accessible to its signed-in account. Disconnect it in Cursor when it is no longer needed.

The repository URL remains [kgoedecke/doop](https://github.com/kgoedecke/doop), the existing upstream source location. Renaming this package does not move that repository or establish a new hosted service.
