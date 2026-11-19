/* What an agent reads to connect itself to the Diagramly desktop app. The desktop
   server serves it at /connect.md and the Connect AI dialog shows the same text,
   so what a person is told the agent will read is what it reads. */
export function connectInstructions(mcpUrl: string): string {
  return `# Connect Diagramly to this agent

Diagramly runs on this computer. Its MCP server is at ${mcpUrl} (streamable HTTP). No sign-in is needed.

1. Add it to this agent as an MCP server named diagramly-desktop, with that address.
2. A server added in the middle of a conversation is not loaded into that conversation until it is reopened. So check whether the Diagramly tools (mcp__diagramly-desktop__...) are available now. If they are not, do not stop and do not ask the user to restart. Talk to the server directly with curl, using the MCP protocol: POST to the address with the headers \`Content-Type: application/json\` and \`Accept: application/json, text/event-stream\`. Send \`initialize\`, then \`notifications/initialized\`, then \`tools/list\` and \`tools/call\`.
3. Start with the \`get_guide\` tool, topic \`design-instructions\`, and follow it. Then list the user's canvases and ask which one to work on, or create a new canvas if they want a fresh start.
4. At the end, tell the user in one sentence that the Diagramly tools will appear natively the next time they reopen this session.
`
}
