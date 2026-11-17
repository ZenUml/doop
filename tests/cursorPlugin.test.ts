import { readFileSync, existsSync } from 'node:fs'
import { expect, it } from 'vitest'

const json = (path: string): Record<string, unknown> =>
  JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>

it('keeps marketplace distribution disabled and never installs a hosted MCP endpoint', () => {
  const marketplace = json('.cursor-plugin/marketplace.json')
  const plugin = json('cursor-plugin/.cursor-plugin/plugin.json')
  expect(marketplace.name).toBe('diagramly')
  expect(marketplace.plugins).toEqual([])
  expect(plugin.name).toBe('diagramly')
  expect(plugin.displayName).toBe('Diagramly')
  expect(plugin).not.toHaveProperty('mcpServers')
  expect(existsSync('cursor-plugin/mcp.json')).toBe(false)
  expect(existsSync('cursor-plugin/skills/doop-design')).toBe(false)
  const skill = readFileSync('cursor-plugin/skills/diagramly-design/SKILL.md', 'utf8')
  expect(skill).toContain('`diagramly` MCP server')
  expect(skill).toContain('get_guide({ topic: "design-instructions" })')
  expect(skill).toContain('Connect AI → Cursor')
  expect(skill).not.toMatch(/https?:\/\/[^\s`]+\/mcp/)
})

it('uses Diagramly package names without changing release components or version history', () => {
  const config = json('release-please-config.json')
  const packages = config.packages as Record<string, Record<string, unknown>>
  expect(packages['.']?.['package-name']).toBe('diagramly')
  expect(packages['.']?.['include-component-in-tag']).toBe(false)
  expect(packages.desktop?.['package-name']).toBe('diagramly-desktop')
  expect(packages.desktop?.component).toBe('desktop')
  expect(packages.desktop?.['skip-github-release']).toBe(true)
})
