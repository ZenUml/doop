# ChatGPT plugin package

The package uploaded to platform.openai.com/plugins to list Diagramly in the ChatGPT plugin directory.
The public URLs and MCP address in the package use `example.invalid` placeholders. Configure them
with verified values for your deployment before installation or publication; the package is disabled
until then. The server side (tool annotations, the preview card, OAuth discovery) lives in `server/`; this
folder is only the listing: `plugin.json` (identity, listing copy, review test cases), `mcp.json`
(sets the MCP endpoint and OAuth + dynamic client registration) and the logo.

Build the ZIP with `node scripts/build-chatgpt-plugin.mjs` (writes `chatgpt-plugin/dist/diagramly.zip`,
gitignored). Before uploading, replace `review.demo_recording_url` with a reviewer-accessible video.
Reviewer test credentials are entered in the dashboard (Metadata & Skills → Review information),
never in this package. Process and field limits: `.context/specs/chatgpt-app.md`.
