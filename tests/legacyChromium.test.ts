import {
  appendFile,
  cp,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rm,
  symlink,
  truncate,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { serialize } from 'node:v8'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { readLegacyChromiumLibrary } from '../server/legacyChromium.ts'

// Entirely synthetic LevelDB fixture, assembled from the published LevelDB and
// Chromium IndexedDB formats. It contains no copied browser or user data.
// A separate optional test exercises an actual Chromium 140 generated fixture.
const realFixture = process.env.LEGACY_CHROMIUM_FIXTURE
const temporary: string[] = []
let syntheticFixture = ''
async function testDirectory() {
  const result = await mkdtemp(path.join(await realpath(tmpdir()), 'doop-legacy-reader-'))
  temporary.push(result)
  return result
}
const b = (...values: number[]) => Buffer.from(values)
function varint(value: number): Buffer {
  const bytes: number[] = []
  do {
    const part = value % 128
    value = Math.floor(value / 128)
    bytes.push(part | (value ? 128 : 0))
  } while (value)
  return Buffer.from(bytes)
}
function prefixed(data: Buffer): Buffer {
  return Buffer.concat([varint(data.length), data])
}
function utf16be(value: string): Buffer {
  const data = Buffer.from(value, 'utf16le')
  data.swap16()
  return data
}
function textKey(value: string): Buffer {
  return Buffer.concat([varint(value.length), utf16be(value)])
}
function checksum(data: Buffer): number {
  let crc = 0xffffffff
  for (const byte of data) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0x82f63b78 : 0)
  }
  crc = (crc ^ 0xffffffff) >>> 0
  return (((crc >>> 15) | (crc << 17)) + 0xa282ead8) >>> 0
}
function physicalRecord(data: Buffer): Buffer {
  const header = Buffer.alloc(7)
  header.writeUInt32LE(checksum(Buffer.concat([b(1), data])), 0)
  header.writeUInt16LE(data.length, 4)
  header[6] = 1
  return Buffer.concat([header, data])
}
function tableBlock(entries: Array<[Buffer, Buffer]>): Buffer {
  const rows: Buffer[] = []
  const offsets: number[] = []
  let offset = 0
  for (const [key, value] of entries) {
    offsets.push(offset)
    const row = Buffer.concat([b(0), varint(key.length), varint(value.length), key, value])
    rows.push(row)
    offset += row.length
  }
  if (!offsets.length) offsets.push(0)
  const restarts = Buffer.alloc(4 * (offsets.length + 1))
  offsets.forEach((position, i) => restarts.writeUInt32LE(position, i * 4))
  restarts.writeUInt32LE(offsets.length, offsets.length * 4)
  return Buffer.concat([...rows, restarts])
}
function tableWithTrailer(data: Buffer): Buffer {
  const trailer = Buffer.alloc(5)
  trailer[0] = 0
  trailer.writeUInt32LE(checksum(Buffer.concat([data, b(0)])), 1)
  return Buffer.concat([data, trailer])
}
function internal(key: Buffer, seq: number, kind = 1): Buffer {
  const suffix = Buffer.alloc(8)
  suffix.writeBigUInt64LE((BigInt(seq) << 8n) | BigInt(kind))
  return Buffer.concat([key, suffix])
}
function objectKey(index: number, id: string): Buffer {
  return Buffer.concat([b(0, 1, 1, index, 1), textKey(id)])
}
function value(
  id: string,
  title: string,
  unsupported: 'date' | 'sparse' | 'expansion' | undefined = undefined,
): Buffer {
  const sparse: unknown[] = []
  if (unsupported === 'sparse') {
    sparse.length = 0xffffffff
    sparse[0] = 'value'
  }
  const shared = Array.from({ length: 20 }, () => 'x'.repeat(1000))
  const expansion = unsupported === 'expansion' ? Array.from({ length: 600 }, () => shared) : undefined
  return Buffer.concat([
    b(1, 0xff, 20),
    serialize({
      id,
      data: {
        id,
        title,
        js: 'A->B',
        ...(unsupported === 'date' ? { attachment: new Date('2020-01-01T00:00:00Z') } : {}),
        ...(unsupported === 'sparse' ? { unexpected: sparse } : {}),
        ...(unsupported === 'expansion' ? { unexpected: expansion } : {}),
        pages: [
          { id: 'p1', js: 'A->B' },
          { id: 'p2', js: 'B->C' },
        ],
      },
    }),
  ])
}
async function makeSyntheticFixture(
  directory: string,
  unsupported: 'date' | 'sparse' | 'expansion' | undefined = undefined,
) {
  const databaseName = Buffer.concat([b(0, 0, 0, 0, 201), textKey('file://'), textKey('ZenUML_DB')])
  const storeName = b(0, 1, 0, 0, 50, 1, 0)
  const edited = objectKey(1, 'edited')
  const editedExists = objectKey(2, 'edited')
  const deleted = objectKey(1, 'deleted')
  const deletedExists = objectKey(2, 'deleted')
  const created = objectKey(1, 'created')
  const createdExists = objectKey(2, 'created')
  const data = tableWithTrailer(
    tableBlock([
      [internal(databaseName, 1), b(1)],
      [internal(storeName, 2), utf16be('datatable')],
      [internal(edited, 3), value('edited', 'before')],
      [internal(editedExists, 4), b(1)],
      [internal(deleted, 5), value('deleted', 'deleted')],
      [internal(deletedExists, 6), b(1)],
    ]),
  )
  const meta = tableWithTrailer(tableBlock([]))
  const indexPayload = tableBlock([[b(1), Buffer.concat([varint(0), varint(data.length - 5)])]])
  const index = tableWithTrailer(indexPayload)
  const footer = Buffer.alloc(48)
  Buffer.concat([
    varint(data.length),
    varint(meta.length - 5),
    varint(data.length + meta.length),
    varint(index.length - 5),
  ]).copy(footer)
  Buffer.from('57fb808b247547db', 'hex').copy(footer, 40)
  const table = Buffer.concat([data, meta, index, footer])
  const manifest = Buffer.concat([
    b(1),
    prefixed(Buffer.from('idb_cmp1')),
    b(2, 3, 3, 6, 4, 6),
    b(7, 0, 5),
    varint(table.length),
    prefixed(internal(databaseName, 1)),
    prefixed(internal(deletedExists, 6)),
  ])
  const batchHeader = Buffer.alloc(12)
  batchHeader.writeBigUInt64LE(7n)
  batchHeader.writeUInt32LE(6, 8)
  const put = (key: Buffer, val: Buffer) => Buffer.concat([b(1), prefixed(key), prefixed(val)])
  const del = (key: Buffer) => Buffer.concat([b(0), prefixed(key)])
  const batch = Buffer.concat([
    batchHeader,
    put(edited, value('edited', 'after', unsupported)),
    put(editedExists, b(1)),
    del(deleted),
    del(deletedExists),
    put(created, value('created', 'new')),
    put(createdExists, b(1)),
  ])
  await Promise.all([
    writeFile(path.join(directory, 'CURRENT'), 'MANIFEST-000001\n'),
    writeFile(path.join(directory, 'MANIFEST-000001'), physicalRecord(manifest)),
    writeFile(path.join(directory, '000003.log'), physicalRecord(batch)),
    writeFile(path.join(directory, '000005.ldb'), table),
  ])
}
beforeAll(async () => {
  syntheticFixture = await testDirectory()
  await makeSyntheticFixture(syntheticFixture)
})
afterEach(async () => {
  const pending = temporary.splice(1)
  await Promise.all(pending.map((directory) => rm(directory, { recursive: true, force: true })))
})
afterAll(async () => {
  await Promise.all(temporary.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})
async function fixtureCopy() {
  const destination = path.join(await testDirectory(), 'db')
  await cp(syntheticFixture, destination, { recursive: true })
  return destination
}

describe('read-only legacy Chromium IndexedDB', () => {
  it('reads current data from a synthetic SST + WAL and applies updates and tombstones', async () => {
    const docs = (await readLegacyChromiumLibrary(syntheticFixture)) as Array<Record<string, unknown>>
    expect(docs.map((row) => row.title)).toEqual(['new', 'after'])
    expect(docs[1]?.pages).toHaveLength(2)
  })
  it('rejects a missing or malformed CURRENT instead of returning an empty library', async () => {
    const directory = await testDirectory()
    await expect(readLegacyChromiumLibrary(directory)).rejects.toThrow()
    await writeFile(path.join(directory, 'CURRENT'), '../outside\n')
    await expect(readLegacyChromiumLibrary(directory)).rejects.toThrow()
  })
  it('rejects a symbolic-link snapshot directory', async () => {
    const directory = await testDirectory()
    const link = `${directory}-link`
    temporary.push(link)
    await symlink(directory, link)
    await expect(readLegacyChromiumLibrary(link)).rejects.toThrow()
  })
  it.each(['MANIFEST-000001', '000003.log', '000005.ldb'])('rejects corrupted active %s', async (name) => {
    const directory = await fixtureCopy()
    const file = path.join(directory, name)
    const data = await readFile(file)
    const offset = name.endsWith('.ldb') ? 16 : 7
    data[offset] = data[offset]! ^ 1
    await writeFile(file, data)
    await expect(readLegacyChromiumLibrary(directory)).rejects.toThrow()
  })
  it('rejects an oversized Snappy block even when its checksum is valid', async () => {
    const directory = await fixtureCopy()
    const file = path.join(directory, '000005.ldb')
    const data = await readFile(file)
    // First footer handle is the meta-index offset, immediately after data + trailer.
    let at = data.length - 48
    let metaOffset = 0
    let shift = 0
    let byte: number
    do {
      byte = data[at++]!
      metaOffset += (byte & 127) * 2 ** shift
      shift += 7
    } while (byte & 128)
    const size = metaOffset - 5
    varint(16 * 1024 * 1024 + 1).copy(data, 0)
    data[size] = 1
    data.writeUInt32LE(checksum(data.subarray(0, size + 1)), size + 1)
    await writeFile(file, data)
    await expect(readLegacyChromiumLibrary(directory)).rejects.toThrow('compressed block too large')
  })
  it('rejects unsupported structured values instead of returning partial documents', async () => {
    const directory = await testDirectory()
    await makeSyntheticFixture(directory, 'date')
    await expect(readLegacyChromiumLibrary(directory)).rejects.toThrow('unsupported structured value')
  })
  it('rejects a huge sparse array before JSON serialization', async () => {
    const directory = await testDirectory()
    await makeSyntheticFixture(directory, 'sparse')
    await expect(readLegacyChromiumLibrary(directory)).rejects.toThrow('array too large')
  })
  it('rejects shared-reference expansion beyond the JSON output budget', async () => {
    const directory = await testDirectory()
    await makeSyntheticFixture(directory, 'expansion')
    await expect(readLegacyChromiumLibrary(directory)).rejects.toThrow('legacy export too large')
  })
  it('rejects a noncanonical tombstone rather than resurrecting its logical key', async () => {
    const directory = await fixtureCopy()
    const key = Buffer.concat([b(0, 1, 1, 1, 1, 0x86, 0), utf16be('edited')])
    const header = Buffer.alloc(12)
    header.writeBigUInt64LE(100n)
    header.writeUInt32LE(1, 8)
    await appendFile(path.join(directory, '000003.log'), physicalRecord(Buffer.concat([header, b(0), prefixed(key)])))
    await expect(readLegacyChromiumLibrary(directory)).rejects.toThrow('non-canonical')
  })
  it('rejects a truncated active WAL', async () => {
    const directory = await fixtureCopy()
    const file = path.join(directory, '000003.log')
    const data = await readFile(file)
    await truncate(file, data.length - 1)
    await expect(readLegacyChromiumLibrary(directory)).rejects.toThrow()
  })
  it('ignores obsolete table and log files not selected by the manifest', async () => {
    const directory = await fixtureCopy()
    await writeFile(path.join(directory, '000001.ldb'), 'obsolete corruption')
    await writeFile(path.join(directory, '000001.log'), 'obsolete corruption')
    expect(await readLegacyChromiumLibrary(directory)).toHaveLength(2)
  })
  it('rejects a missing active table rather than importing a partial library', async () => {
    const directory = await fixtureCopy()
    await rm(path.join(directory, '000005.ldb'))
    await expect(readLegacyChromiumLibrary(directory)).rejects.toThrow()
  })
  it('rejects an active file replaced with a symlink', async () => {
    const directory = await fixtureCopy()
    const file = path.join(directory, '000005.ldb')
    await rm(file)
    await symlink(path.join(syntheticFixture, '000005.ldb'), file)
    await expect(readLegacyChromiumLibrary(directory)).rejects.toThrow()
  })
})

describe.skipIf(!realFixture)('real Chromium 140 fixture, without private user data', () => {
  it('reads 801 live documents, the latest update and no deleted row', async () => {
    const docs = (await readLegacyChromiumLibrary(realFixture!)) as Array<Record<string, unknown>>
    expect(docs).toHaveLength(801)
    expect(docs.filter((item) => item.title === 'deleted' || item.title === 'before')).toHaveLength(0)
    const edited = docs.find((item) => item.title === 'after')
    expect(edited).toMatchObject({ id: 'edited', js: 'new' })
    expect(edited?.pages).toHaveLength(2)
    expect((await readdir(realFixture!)).some((name) => name.endsWith('.ldb'))).toBe(true)
  })
})

describe.skipIf(!process.env.LEGACY_CHROMIUM_BLOB_FIXTURE)('real Chromium Blob fixture', () => {
  it('rejects unsupported Blob-backed values without returning documents', async () => {
    await expect(readLegacyChromiumLibrary(process.env.LEGACY_CHROMIUM_BLOB_FIXTURE!)).rejects.toThrow()
  })
})
