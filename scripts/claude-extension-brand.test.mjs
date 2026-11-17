import assert from 'node:assert/strict'
import test from 'node:test'
import { getClaudeExtensionAssets, productModeFromEnvironment } from '../claude-extension/product-assets.mjs'

test('Diagramly extension uses its own install identity and requires the local MCP URL', async () => {
  const { iconSource, manifest, readme } = await getClaudeExtensionAssets()
  assert.equal(iconSource, 'desktop/src-tauri/icons/icon.png')
  assert.equal(manifest.name, 'diagramly')
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
  assert.equal(manifest.user_config.server_url.required, true)
  assert.equal(manifest.homepage, 'https://diagramly.ai')
  assert.equal(manifest.documentation, 'https://github.com/ZenUml/doop/tree/main/claude-extension')
  assert.equal(manifest.support, 'https://github.com/ZenUml/doop/issues')
  assert.doesNotMatch(JSON.stringify(manifest) + readme, /doop\.design|kgoedecke\/doop|Doop account/)
  assert.match(readme, /local MCP URL shown in Diagramly/)
  assert.match(readme, /Do not substitute a\s+hosted server URL/)
})

test('extension always builds Diagramly, including without build markers', () => {
  assert.equal(productModeFromEnvironment({}), 'diagramly')
  assert.equal(productModeFromEnvironment({ DIAGRAMLY_PRODUCT: 'diagramly' }), 'diagramly')
})
