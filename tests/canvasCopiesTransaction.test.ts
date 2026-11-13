import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { expect, it, vi } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
import type { Canvas } from '../shared/types.ts'

it('rolls back every copied canvas when the second canvas has a database constraint failure', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'doop-copies-transaction-'))
  vi.stubEnv('DATABASE_URL', '')
  vi.stubEnv('DOOP_DATA_DIR', dir)
  vi.resetModules()
  let client: PGlite | undefined
  try {
    const database = await import('../server/db/index.ts')
    await database.initDb()
    client = (database.db as unknown as { $client: PGlite }).$client
    const { saveCanvasCopies } = await import('../server/db/persist.ts')
    const schema = await import('../server/db/schema.ts')
    const makeCanvas = (id: string): Canvas => ({
      id,
      name: id,
      createdAt: 1,
      updatedAt: 1,
      frames: [
        {
          id: 'duplicate-frame',
          canvasId: id,
          name: 'frame',
          x: 0,
          y: 0,
          width: 100,
          height: 100,
          html: '<p>synthetic</p>',
          createdAt: 1,
          updatedAt: 1,
          updatedBy: 'test',
        },
      ],
    })
    await expect(saveCanvasCopies([makeCanvas('first'), makeCanvas('second')])).rejects.toThrow()
    expect(await database.db.select().from(schema.canvases)).toEqual([])
    expect(await database.db.select().from(schema.frames)).toEqual([])
  } finally {
    await client?.close()
    vi.unstubAllEnvs()
    vi.resetModules()
    await rm(dir, { recursive: true, force: true })
  }
}, 30_000)
