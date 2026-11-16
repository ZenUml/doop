import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { getClaudeExtensionAssets, productModeFromEnvironment } from '../claude-extension/product-assets.mjs'

test('Doop keeps its published extension identity and destinations', async () => {
  const baseline = JSON.parse(await readFile(new URL('../claude-extension/manifest.json', import.meta.url), 'utf8'))
  const { iconSource, manifest, readme } = await getClaudeExtensionAssets('doop')
  assert.equal(iconSource, 'public/logo.png')
  assert.deepEqual(manifest, baseline)
  assert.match(readme, /Doop for Claude Desktop/)
  assert.equal(manifest.user_config.server_url.default, 'https://doop.design/mcp')
})

test('Diagramly changes visible brand and owned links but keeps protocol and install identity', async () => {
  const { iconSource, manifest, readme } = await getClaudeExtensionAssets('diagramly')
  assert.equal(iconSource, 'desktop/src-tauri/icons/icon.png')
  assert.equal(manifest.name, 'doop')
  assert.equal(manifest.display_name, 'Diagramly')
  assert.equal(manifest.version, '0.1.0')
  assert.equal(manifest.server.entry_point, 'node_modules/mcp-remote/dist/proxy.js')
  assert.equal(manifest.user_config.server_url.title, 'Diagramly server URL')
  assert.deepEqual(manifest.server.mcp_config.args.slice(0, 6), [
    '${__dirname}/node_modules/mcp-remote/dist/proxy.js',
    '${user_config.server_url}',
    '--transport',
    'http-only',
    '--auth-timeout',
    '300',
  ])
  assert.equal(manifest.user_config.server_url.default, undefined)
  assert.equal(manifest.homepage, 'https://diagramly.ai')
  assert.equal(manifest.documentation, 'https://github.com/ZenUml/doop/tree/main/claude-extension')
  assert.equal(manifest.support, 'https://github.com/ZenUml/doop/issues')
  assert.doesNotMatch(JSON.stringify(manifest) + readme, /doop\.design|kgoedecke\/doop|Doop account/)
  assert.doesNotMatch(readme, /Doop for Claude|Doop account|Doop Cloud|Doop server/i)
  assert.match(readme, /local MCP URL shown in Diagramly/)
  assert.match(readme, /Do not substitute a\s+hosted server URL/)
})

test('extension build mode recognizes Diagramly desktop build markers only', () => {
  assert.equal(productModeFromEnvironment({}), 'doop')
  assert.equal(productModeFromEnvironment({ VITE_PRODUCT_MODE: 'diagramly' }), 'diagramly')
  assert.equal(productModeFromEnvironment({ DOOP_PRODUCT: 'diagramly' }), 'diagramly')
  assert.equal(productModeFromEnvironment({ VITE_PRODUCT_MODE: 'doop', DOOP_PRODUCT: 'doop' }), 'doop')
})
