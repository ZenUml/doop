import { expect, it } from 'vitest'
import { connectInstructions } from '../shared/connectInstructions'

it('names the server, the live address, the curl fallback and the guide', () => {
  const md = connectInstructions('http://127.0.0.1:61234/mcp')
  expect(md).toContain('http://127.0.0.1:61234/mcp')
  expect(md).toContain('diagramly-desktop')
  expect(md).toContain('do not ask the user to restart')
  expect(md).toContain('curl')
  expect(md).toContain('get_guide')
  expect(md).not.toContain('Mcp-Session-Id')
})
