import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const here = new URL('.', import.meta.url)
const diagramlyReadme = new URL('./README.diagramly.md', here)
const doopReadme = new URL('./README.md', here)

/** Build visible extension assets for one product without changing its MCP protocol identity. */
export async function getClaudeExtensionAssets(mode = 'doop') {
  const manifest = JSON.parse(await readFile(new URL('./manifest.json', here), 'utf8'))
  const readmePath = mode === 'diagramly' ? diagramlyReadme : doopReadme

  if (mode === 'diagramly') {
    manifest.display_name = 'Diagramly'
    manifest.description = 'Create and revise editable diagrams with Claude and Diagramly Desktop.'
    manifest.author = { name: 'Diagramly', url: 'https://diagramly.ai' }
    manifest.homepage = 'https://diagramly.ai'
    manifest.documentation = 'https://github.com/ZenUml/doop/tree/main/claude-extension'
    manifest.support = 'https://github.com/ZenUml/doop/issues'
    manifest.repository = { type: 'git', url: 'https://github.com/ZenUml/doop' }
    manifest.server.mcp_config.args[7] = JSON.stringify({
      client_name: 'Diagramly for Claude Desktop',
      client_uri: 'https://diagramly.ai',
    })
    manifest.user_config.server_url = {
      type: 'string',
      title: 'Diagramly server URL',
      description:
        'Paste the local MCP URL shown in Diagramly Desktop under Connect AI → Claude. This keeps Claude connected to the selected local library.',
      required: true,
    }
    manifest.keywords = ['diagramly', 'mermaid', 'zenuml', 'architecture', 'mcp', 'claude']
  }

  return {
    iconSource: mode === 'diagramly' ? 'desktop/src-tauri/icons/icon.png' : 'public/logo.png',
    manifest,
    readme: await readFile(readmePath, 'utf8'),
  }
}

export function productModeFromEnvironment(environment = process.env) {
  return environment.VITE_PRODUCT_MODE === 'diagramly' || environment.DOOP_PRODUCT === 'diagramly'
    ? 'diagramly'
    : 'doop'
}
