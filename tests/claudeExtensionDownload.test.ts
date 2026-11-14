import type { Server } from 'node:http'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import express from 'express'
import { afterEach, expect, it } from 'vitest'
import { claudeExtensionDownload } from '../server/claudeExtensionDownload'

let server: Server | undefined
let directory = ''
afterEach(async () => {
  await new Promise<void>(
    (resolve, reject) => server?.close((error) => (error ? reject(error) : resolve())) ?? resolve(),
  )
  if (directory) await rm(directory, { recursive: true, force: true })
})

it('serves the bundled extension as an attachment and returns 404 when missing', async () => {
  directory = await mkdtemp(join(tmpdir(), 'extension-download-'))
  await mkdir(join(directory, 'claude-extension'))
  const bundle = join(directory, 'claude-extension/doop.mcpb')
  await writeFile(bundle, 'fixture bundle')
  const app = express()
  app.use(claudeExtensionDownload(directory))
  server = app.listen(0, '127.0.0.1')
  await new Promise<void>((resolve) => server!.once('listening', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('No listening port')
  const url = `http://127.0.0.1:${address.port}/claude-extension/doop.mcpb`
  const response = await fetch(url)
  expect(response.status).toBe(200)
  expect(response.headers.get('content-disposition')).toBe('attachment; filename="doop.mcpb"')
  expect(await response.text()).toBe('fixture bundle')
  await rm(bundle)
  expect((await fetch(url)).status).toBe(404)
})
