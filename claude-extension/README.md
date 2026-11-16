# Diagramly for Claude Desktop

Use Claude to create and revise editable diagrams in your Diagramly Desktop
library. The extension connects Claude Desktop to the local MCP server started
by Diagramly and uses your Diagramly sign-in for access.

## Install

In Diagramly Desktop, open a document and choose **Connect AI → Claude → Desktop
app**. Use the install option shown by your build. If it asks you to install the
extension manually:

1. Choose **Install manually → Download extension** in Diagramly Desktop.
2. Open the downloaded MCPB file with Claude Desktop and install it. If opening the file does
   not start installation, use **Settings → Extensions → Advanced settings →
   Install Extension** in Claude and select the file.
3. In Claude's extension settings, paste the local MCP URL shown in Diagramly's
   Claude connection panel into **Diagramly server URL**. Do not substitute a
   hosted server URL.
4. Enable the extension and approve the Diagramly sign-in in the browser that
   opens. Start a new Claude chat, enable Diagramly in the tools menu, and use
   the prompt shown by Diagramly for the current document.

The saved MCP URL belongs to the current Diagramly Desktop library and stays
the same across restarts. If another app occupies its port, Diagramly shows a
startup error. Close the other app or another Diagramly copy, then reopen
Diagramly; the saved Claude URL does not need to change.

## Build and validation

```sh
VITE_PRODUCT_MODE=diagramly bun run build:claude-extension
```

The build writes `public/claude-extension/diagramly.mcpb` (the current shell's
compatibility filename), a ZIP containing the
Diagramly manifest, these instructions, the app icon, license, and pinned
`mcp-remote` proxy with its runtime dependencies and their licenses. The MCP
transport, tool names, OAuth flow, and stable extension identifier remain
unchanged so saved Claude settings continue to work.

The proxy forwards MCP tools and handles OAuth registration, PKCE sign-in, and
token refresh. Credentials are stored locally by `mcp-remote` under
`~/.mcp-auth`, not in the extension. Disable or remove the extension in Claude's
settings to stop it connecting. Removing the extension does not remove the
proxy's separate OAuth cache.

Before release, install the built file in Claude Desktop on macOS and Windows,
complete browser sign-in, and create a diagram on a test document. Test again
after restarting Claude and Diagramly Desktop.

Source and support: [source repository](https://github.com/ZenUml/doop).

Format: [MCP Bundles](https://github.com/modelcontextprotocol/mcpb).
Proxy: [mcp-remote](https://github.com/punkpeye/mcp-remote).
