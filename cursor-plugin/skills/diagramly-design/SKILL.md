---
name: diagramly-design
description: Create, inspect, and refine HTML designs on a shared Diagramly canvas. Use when the user asks to work in Diagramly, provides a Diagramly canvas URL, or asks to implement a design from a Diagramly canvas in their codebase.
---

# Diagramly design

Use the connected `diagramly` MCP server for Diagramly work. The server provides the current tool schemas and design guidance; do not substitute local HTML files for edits the user requested on a shared canvas.

1. Call `get_guide({ topic: "design-instructions" })` before other Diagramly tools and follow the returned workflow. Reload it if the conversation has lost that context.
2. Use the canvas ID from the user's `/c/<id>` URL or explicit canvas ID. If they have not identified a canvas, use the available discovery tools and ask them to choose when the target is ambiguous. Do not guess or create a replacement canvas for an existing design.
3. Pick one `agent_name` and keep it consistent. Read the canvas with `get_canvas`, then fetch its relevant guidelines and references before designing. Announce progress with `set_status` as described by the server.
4. Make the requested changes through the available Diagramly tools. Inspect the rendered result with `get_frame_screenshot`, correct visual issues, and respond to feedback from people on the canvas. Clear your status when finished.
5. When the user asks to implement a Diagramly design in their codebase, inspect the source frame and its screenshot first, then follow the repository's conventions. Modify the shared canvas only when the user requests design changes.
6. Finish with a link to the canvas and a brief description of the work completed.

If Diagramly tools are missing or authentication fails, ask the user to enable the Diagramly MCP server in Cursor's Customize panel and complete its browser sign-in. Do not request tokens in chat. This skill does not install a server connection. In the Diagramly instance the user selected, open **Connect AI → Cursor** and use its **Add to Cursor** link. Review the destination before approving it; never substitute an unrelated hosted service.
