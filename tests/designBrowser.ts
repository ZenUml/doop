import { rmSync } from 'node:fs'
import path from 'node:path'
import { afterAll, beforeAll } from 'vitest'
import { buildFixtures, serveBuilt, type BuiltServer } from './browser'

/** HTML editor coverage has its own explicit build; the app rig keeps its production default. */
export function designFixtureUrl(): (file: string) => string {
  let builtDir: string | undefined
  let server: BuiltServer | undefined

  beforeAll(async () => {
    builtDir = await buildFixtures('design')
    server = await serveBuilt(undefined, builtDir)
  }, 120_000)

  afterAll(async () => {
    await server?.close()
    if (builtDir) rmSync(builtDir, { recursive: true, force: true })
  })

  return (file) => {
    if (!server) throw new Error('Design fixture server has not started')
    return `${server.origin}/${path.posix.join('tests/fixtures', file)}`
  }
}
