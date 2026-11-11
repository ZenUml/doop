import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { appRoot, resolveDataDir } from '../server/dataDir'

describe('the data directory', () => {
  it('is ./data under the working directory when nothing is configured', () => {
    expect(resolveDataDir(undefined, '/srv/doop', 'pg')).toBe('/srv/doop/data/pg')
    expect(resolveDataDir('', '/srv/doop', 'assets')).toBe('/srv/doop/data/assets')
  })

  it('is the configured directory when one is set, wherever the server runs from', () => {
    /* a packaged desktop app runs from its read-only bundle and keeps data in its container */
    const container = '/Users/me/Library/Containers/app/Data/doop'
    expect(resolveDataDir(container, '/Applications/Doop.app/Contents/Resources/app', 'pg')).toBe(`${container}/pg`)
    expect(resolveDataDir(container, '/anywhere')).toBe(container)
  })

  it('finds the app root from the server files, not from the working directory', () => {
    /* the macOS App Sandbox starts a process in its container, whatever directory it was launched from */
    const before = process.cwd()
    process.chdir('/')
    try {
      expect(fs.existsSync(path.join(appRoot(), 'package.json'))).toBe(true)
      expect(fs.existsSync(path.join(appRoot(), 'server', 'index.ts'))).toBe(true)
    } finally {
      process.chdir(before)
    }
  })
})
