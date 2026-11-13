import { constants } from 'node:fs'
import { lstat, open, readdir, realpath } from 'node:fs/promises'
import path from 'node:path'
import { deserialize } from 'node:v8'
import { createHash } from 'node:crypto'

// LevelDB disk formats: https://github.com/google/leveldb/tree/main/doc
// Chromium IndexedDB coding: https://chromium.googlesource.com/chromium/src/+/62.0.3178.1/content/browser/indexed_db/leveldb_coding_scheme.md
// Read only a stopped, privately copied database. No database engine opens or repairs it.
const MAX_FILE = 64 * 1024 * 1024
const MAX_TOTAL = 128 * 1024 * 1024
const MAX_BLOCK = 16 * 1024 * 1024
const MAX_DECOMPRESSED = 64 * 1024 * 1024
const MAX_RECORDS = 200_000
const MAX_DOCUMENTS = 1000
const MAX_EXPORT = 10 * 1024 * 1024
const LOG_BLOCK = 32768
const TABLE_MAGIC = '57fb808b247547db'

type RecordEntry = { key: Buffer; value: Buffer; seq: bigint; kind: number }
type Manifest = {
  log: number
  previous: number
  next: number
  sequence: bigint
  tables: Map<number, { level: number; size: number }>
}

function fail(message: string): never {
  throw new Error(`Unsupported or corrupt legacy IndexedDB: ${message}`)
}

class Cursor {
  offset = 0
  constructor(readonly data: Buffer) {}
  byte(): number {
    if (this.offset >= this.data.length) return fail('truncated byte')
    return this.data[this.offset++]!
  }
  take(size: number): Buffer {
    if (!Number.isSafeInteger(size) || size < 0 || size > this.data.length - this.offset) return fail('truncated data')
    const result = this.data.subarray(this.offset, this.offset + size)
    this.offset += size
    return result
  }
  varint(): bigint {
    let value = 0n
    for (let i = 0; i < 10; i++) {
      const byte = this.byte()
      if (i === 9 && byte > 1) return fail('invalid varint')
      value |= BigInt(byte & 127) << BigInt(i * 7)
      if (!(byte & 128)) {
        if (i > 0 && byte === 0) fail('non-canonical varint')
        return value
      }
    }
    return fail('invalid varint')
  }
  number(): number {
    const result = this.varint()
    if (result > BigInt(Number.MAX_SAFE_INTEGER)) return fail('integer too large')
    return Number(result)
  }
  slice(): Buffer {
    return this.take(this.number())
  }
  done(): boolean {
    return this.offset === this.data.length
  }
}

const crcTable = Array.from({ length: 256 }, (_, i) => {
  let crc = i
  for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0x82f63b78 : 0)
  return crc >>> 0
})
function crc32c(data: Buffer): number {
  let crc = 0xffffffff
  for (const byte of data) crc = (crc >>> 8) ^ crcTable[(crc ^ byte) & 255]!
  return (crc ^ 0xffffffff) >>> 0
}
function maskedCrc(data: Buffer): number {
  const crc = crc32c(data)
  return (((crc >>> 15) | (crc << 17)) + 0xa282ead8) >>> 0
}

function logicalRecords(file: Buffer): Buffer[] {
  const output: Buffer[] = []
  let fragments: Buffer[] | undefined
  let size = 0
  for (let base = 0; base < file.length; base += LOG_BLOCK) {
    const end = Math.min(base + LOG_BLOCK, file.length)
    let pos = base
    while (pos < end) {
      if (end - pos < 7) {
        if (file.subarray(pos, end).some((byte) => byte !== 0)) fail('invalid log trailer')
        break
      }
      const checksum = file.readUInt32LE(pos)
      const length = file.readUInt16LE(pos + 4)
      const type = file[pos + 6]!
      // Zero records can mask a lost batch; reject them rather than guessing recovery.
      if (type === 0 && checksum === 0 && length === 0) fail('zero log record')
      if (type < 1 || type > 4 || pos + 7 + length > end) fail('invalid log record')
      const payload = file.subarray(pos + 7, pos + 7 + length)
      if (maskedCrc(Buffer.concat([Buffer.from([type]), payload])) !== checksum) fail('log checksum')
      if (type === 1) {
        if (fragments) fail('unfinished log record')
        output.push(payload)
      } else if (type === 2) {
        if (fragments) fail('overlapping log records')
        fragments = [payload]
        size = payload.length
      } else {
        if (!fragments) fail('orphan log fragment')
        fragments.push(payload)
        size += payload.length
        if (size > MAX_BLOCK) fail('log record too large')
        if (type === 4) {
          output.push(Buffer.concat(fragments, size))
          fragments = undefined
          size = 0
        }
      }
      if (output.length > MAX_RECORDS) fail('too many records')
      pos += 7 + length
    }
  }
  if (fragments) fail('truncated log fragment')
  return output
}

function manifestState(file: Buffer): Manifest {
  const state: Manifest = { log: -1, previous: 0, next: -1, sequence: -1n, tables: new Map() }
  let comparator = ''
  for (const edit of logicalRecords(file)) {
    const cursor = new Cursor(edit)
    while (!cursor.done()) {
      const tag = cursor.number()
      if (tag === 1) comparator = cursor.slice().toString('utf8')
      else if (tag === 2) state.log = cursor.number()
      else if (tag === 3) state.next = cursor.number()
      else if (tag === 4) state.sequence = cursor.varint()
      else if (tag === 9) state.previous = cursor.number()
      else if (tag === 5) {
        cursor.number()
        cursor.slice()
      } else if (tag === 6) {
        const level = cursor.number()
        const number = cursor.number()
        const existing = state.tables.get(number)
        if (existing && existing.level !== level) fail('table level mismatch')
        state.tables.delete(number)
      } else if (tag === 7) {
        const level = cursor.number()
        const number = cursor.number()
        const size = cursor.number()
        cursor.slice()
        cursor.slice()
        if (level > 6 || number <= 0 || size > MAX_FILE || state.tables.has(number)) fail('invalid manifest table')
        state.tables.set(number, { level, size })
      } else fail('unsupported manifest edit')
    }
  }
  if (comparator !== 'idb_cmp1' || state.log < 0 || state.next < 0 || state.sequence < 0n) fail('incomplete manifest')
  return state
}

function uncompressSnappy(input: Buffer): Buffer {
  const cursor = new Cursor(input)
  const length = cursor.number()
  if (length > MAX_BLOCK) fail('compressed block too large')
  const result = Buffer.alloc(length)
  let position = 0
  while (!cursor.done()) {
    const tag = cursor.byte()
    const kind = tag & 3
    if (kind === 0) {
      let count = tag >>> 2
      if (count >= 60) {
        const width = count - 59
        if (width > 4) fail('invalid compressed literal')
        count = 0
        for (let i = 0; i < width; i++) count += cursor.byte() * 2 ** (8 * i)
      }
      count++
      if (count > length - position) fail('compressed literal overflow')
      cursor.take(count).copy(result, position)
      position += count
    } else {
      let count: number
      let offset: number
      if (kind === 1) {
        count = 4 + ((tag >>> 2) & 7)
        offset = ((tag & 0xe0) << 3) | cursor.byte()
      } else if (kind === 2) {
        count = 1 + (tag >>> 2)
        offset = cursor.byte() | (cursor.byte() << 8)
      } else {
        count = 1 + (tag >>> 2)
        offset = cursor.byte() + cursor.byte() * 256 + cursor.byte() * 65536 + cursor.byte() * 16777216
      }
      if (!offset || offset > position || count > length - position) fail('invalid compressed copy')
      for (let i = 0; i < count; i++) {
        result[position] = result[position - offset]!
        position++
      }
    }
  }
  if (position !== length) fail('truncated compressed block')
  return result
}

function block(file: Buffer, offset: number, size: number, budget: { used: number }): Buffer {
  if (offset < 0 || size < 0 || size > MAX_BLOCK || offset + size + 5 > file.length - 48) fail('invalid table block')
  const data = file.subarray(offset, offset + size)
  const compression = file[offset + size]!
  if (maskedCrc(file.subarray(offset, offset + size + 1)) !== file.readUInt32LE(offset + size + 1))
    fail('table checksum')
  if (compression === 0) {
    budget.used += data.length
    if (budget.used > MAX_DECOMPRESSED) fail('decompressed snapshot too large')
    return data
  }
  if (compression === 1) {
    const sizeCursor = new Cursor(data)
    budget.used += sizeCursor.number()
    if (budget.used > MAX_DECOMPRESSED) fail('decompressed snapshot too large')
    return uncompressSnappy(data)
  }
  return fail('unknown compression')
}
function entries(data: Buffer): Array<{ key: Buffer; value: Buffer }> {
  if (data.length < 8) return fail('invalid table entries')
  const count = data.readUInt32LE(data.length - 4)
  if (!count || count > (data.length - 4) / 4) return fail('invalid table restarts')
  const limit = data.length - 4 - count * 4
  let previousRestart = -1
  const restarts = new Set<number>()
  for (let i = 0; i < count; i++) {
    const restart = data.readUInt32LE(limit + i * 4)
    if ((i === 0 && restart !== 0) || restart < previousRestart || restart > limit) fail('invalid table restart')
    if (restarts.has(restart)) fail('duplicate table restart')
    restarts.add(restart)
    previousRestart = restart
  }
  const cursor = new Cursor(data.subarray(0, limit))
  let last = Buffer.alloc(0)
  const result: Array<{ key: Buffer; value: Buffer }> = []
  while (!cursor.done()) {
    const entryOffset = cursor.offset
    const shared = cursor.number()
    const nonshared = cursor.number()
    const valueSize = cursor.number()
    if (restarts.has(entryOffset)) {
      if (shared !== 0) fail('invalid restart key')
      restarts.delete(entryOffset)
    }
    if (shared > last.length || nonshared > MAX_BLOCK || valueSize > MAX_BLOCK) fail('invalid table entry')
    const key = Buffer.concat([last.subarray(0, shared), cursor.take(nonshared)])
    const value = cursor.take(valueSize)
    result.push({ key, value })
    last = key
    if (result.length > MAX_RECORDS) fail('too many table entries')
  }
  if (limit === 0) restarts.delete(0)
  if (restarts.size) fail('restart does not point to an entry')
  return result
}
function handle(value: Buffer): [number, number] {
  const cursor = new Cursor(value)
  const offset = cursor.number()
  const size = cursor.number()
  if (!cursor.done()) fail('invalid block handle')
  return [offset, size]
}
function readTable(file: Buffer, out: RecordEntry[], budget: { used: number }): void {
  if (file.length < 48 || file.subarray(file.length - 8).toString('hex') !== TABLE_MAGIC) fail('invalid table footer')
  const footer = new Cursor(file.subarray(file.length - 48, file.length - 8))
  const metaOffset = footer.number()
  const metaSize = footer.number()
  const indexOffset = footer.number()
  const indexSize = footer.number()
  for (const item of entries(block(file, metaOffset, metaSize, budget))) {
    const [offset, size] = handle(item.value)
    block(file, offset, size, budget)
  }
  for (const index of entries(block(file, indexOffset, indexSize, budget))) {
    const [offset, size] = handle(index.value)
    for (const item of entries(block(file, offset, size, budget))) {
      if (item.key.length < 8) fail('invalid internal key')
      const trailer = item.key.readBigUInt64LE(item.key.length - 8)
      const kind = Number(trailer & 255n)
      if (kind !== 0 && kind !== 1) fail('invalid internal record type')
      out.push({ key: item.key.subarray(0, -8), value: item.value, seq: trailer >> 8n, kind })
      if (out.length > MAX_RECORDS) fail('too many records')
    }
  }
}
function readBatch(batch: Buffer, out: RecordEntry[]): void {
  if (batch.length < 12) fail('truncated batch')
  let seq = batch.readBigUInt64LE(0)
  const count = batch.readUInt32LE(8)
  if (seq + BigInt(count) > 1n << 56n) fail('invalid batch sequence')
  if (count > MAX_RECORDS || out.length + count > MAX_RECORDS) fail('too many records')
  const cursor = new Cursor(batch.subarray(12))
  for (let i = 0; i < count; i++) {
    const kind = cursor.byte()
    if (kind !== 0 && kind !== 1) fail('invalid batch record')
    const key = cursor.slice()
    const value = kind === 1 ? cursor.slice() : Buffer.alloc(0)
    out.push({ key, value, seq, kind })
    seq++
  }
  if (!cursor.done()) fail('batch count mismatch')
}

async function safeFile(directory: string, name: string): Promise<Buffer> {
  if (!/^(?:CURRENT|MANIFEST-\d+|\d+\.(?:log|ldb|sst))$/.test(name)) fail('invalid database filename')
  const file = path.join(directory, name)
  const info = await lstat(file)
  if (!info.isFile() || info.isSymbolicLink() || info.size > MAX_FILE) fail('invalid database file')
  const fd = await open(file, constants.O_RDONLY | constants.O_NOFOLLOW)
  try {
    const opened = await fd.stat()
    if (!opened.isFile() || opened.ino !== info.ino || opened.size !== info.size) fail('database changed during read')
    const data = await fd.readFile()
    const after = await fd.stat()
    if (
      data.length !== info.size ||
      after.size !== info.size ||
      after.mtimeMs !== opened.mtimeMs ||
      after.ctimeMs !== opened.ctimeMs
    )
      fail('database changed during read')
    return data
  } finally {
    await fd.close()
  }
}

function prefix(key: Buffer): { database: number; store: number; index: number; rest: Buffer } {
  const cursor = new Cursor(key)
  const widths = cursor.byte()
  const readLittle = (count: number) => {
    let result = 0n
    const bytes = cursor.take(count)
    if (count > 1 && bytes[count - 1] === 0) fail('non-canonical IndexedDB prefix')
    for (let i = 0; i < count; i++) result |= BigInt(bytes[i]!) << BigInt(i * 8)
    if (result > BigInt(Number.MAX_SAFE_INTEGER)) fail('invalid IndexedDB identifier')
    return Number(result)
  }
  const database = readLittle((widths >>> 5) + 1)
  const store = readLittle(((widths >>> 2) & 7) + 1)
  const index = readLittle((widths & 3) + 1)
  return { database, store, index, rest: key.subarray(cursor.offset) }
}
function string16(data: Buffer): string {
  if (data.length % 2) return fail('invalid IndexedDB string')
  const chars = Buffer.alloc(data.length)
  for (let i = 0; i < data.length; i += 2) {
    chars[i] = data[i + 1]!
    chars[i + 1] = data[i]!
  }
  return chars.toString('utf16le')
}
type ValueBudget = { nodes: number; properties: number; bytes: number }
function addJsonString(value: string, budget: ValueBudget): void {
  budget.bytes += 2
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i)
    if (code === 34 || code === 92) budget.bytes += 2
    else if (code < 32) budget.bytes += [8, 9, 10, 12, 13].includes(code) ? 2 : 6
    else if (code < 128) budget.bytes++
    else if (code < 2048) budget.bytes += 2
    else if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(i + 1)
      if (next >= 0xdc00 && next <= 0xdfff) {
        budget.bytes += 4
        i++
      } else budget.bytes += 6
    } else if (code >= 0xdc00 && code <= 0xdfff) budget.bytes += 6
    else budget.bytes += 3
    if (budget.bytes > MAX_EXPORT) fail('legacy export too large')
  }
}
function plain(value: unknown, seen: Set<object>, budget: ValueBudget, depth = 0): void {
  if (depth > 100) fail('document nesting too deep')
  if (++budget.nodes > 200_000) fail('too many legacy values')
  if (typeof value === 'string') {
    addJsonString(value, budget)
    return
  }
  if (value === null) {
    budget.bytes += 4
    return
  }
  if (typeof value === 'boolean') {
    budget.bytes += value ? 4 : 5
    return
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    budget.bytes += String(value).length
    return
  }
  if (!value || typeof value !== 'object' || seen.has(value)) fail('unsupported structured value')
  const isArray = Array.isArray(value)
  if (isArray && value.length > 100_000) fail('legacy array too large')
  const prototype = Object.getPrototypeOf(value)
  if (!isArray && prototype !== Object.prototype && prototype !== null) fail('unsupported structured value')
  budget.bytes += 2
  seen.add(value)
  let count = 0
  for (const key in value) {
    if (!Object.hasOwn(value, key)) continue
    if (++budget.properties > 200_000) fail('too many legacy properties')
    count++
    if (isArray) {
      const index = Number(key)
      if (!Number.isSafeInteger(index) || index < 0 || index >= value.length || String(index) !== key)
        fail('unsupported array property')
    } else addJsonString(key, budget)
    budget.bytes += isArray ? 1 : 2
    if (budget.bytes > MAX_EXPORT) fail('legacy export too large')
    const descriptor = Object.getOwnPropertyDescriptor(value, key)
    if (!descriptor || !('value' in descriptor)) fail('unsupported structured value')
    plain(descriptor.value, seen, budget, depth + 1)
  }
  if (isArray && count !== value.length) fail('sparse legacy array')
  seen.delete(value)
  if (budget.bytes > MAX_EXPORT) fail('legacy export too large')
}
function decodeValue(value: Buffer, budget: ValueBudget): unknown {
  const cursor = new Cursor(value)
  cursor.varint()
  const data = value.subarray(cursor.offset)
  if (data.length > MAX_BLOCK || data.length < 4 || data[0] !== 0xff) fail('unsupported Blink value')
  // Blink wraps V8's structured clone with its own 0xff/version header.
  const header = new Cursor(data)
  header.byte()
  const version = header.number()
  if (version >= 21) {
    if (version !== 21 || header.byte() !== 0xfe || header.take(12).some((byte) => byte !== 0))
      fail('unsupported Blink trailer')
  }
  const payload = data.subarray(header.offset)
  if (payload[0] !== 0xff) fail('unsupported Blink serialization')
  let result: unknown
  try {
    result = deserialize(payload)
  } catch {
    return fail('unsupported V8 value')
  }
  plain(result, new Set(), budget)
  return result
}

function validateDocument(value: unknown): void {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('invalid legacy document')
  const document = value as Record<string, unknown>
  if (typeof document.id !== 'string' || !document.id.trim() || document.id.length > 1000)
    fail('invalid legacy document ID')
  const text = (field: unknown, limit: number) => {
    if (field !== undefined && field !== null && (typeof field !== 'string' || field.length > limit))
      fail('invalid legacy text')
  }
  text(document.title, 1000)
  text(document.cssMode, 20)
  if (document.pages !== undefined && !Array.isArray(document.pages)) fail('invalid legacy pages')
  const pages = Array.isArray(document.pages) && document.pages.length ? document.pages : [document]
  if (pages.length > 100) fail('too many legacy pages')
  for (const entry of pages) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) fail('invalid legacy page')
    const page = entry as Record<string, unknown>
    text(page.id, 1000)
    text(page.title, 1000)
    text(page.js, 200_000)
    text(page.css, 200_000)
  }
}

/** Read a private, stopped copy of Chromium's LevelDB; never opens or modifies the source database. */
export async function readLegacyChromiumLibrary(directory: string): Promise<unknown[]> {
  const absolute = path.resolve(directory)
  if ((await realpath(absolute)) !== absolute) fail('symbolic link in snapshot path')
  const directoryInfo = await lstat(absolute)
  if (!directoryInfo.isDirectory() || directoryInfo.isSymbolicLink()) fail('invalid snapshot directory')
  const names = await readdir(absolute)
  if (names.length > 100_000) fail('too many snapshot files')
  let total = 0
  for (const name of names) {
    const info = await lstat(path.join(absolute, name))
    if (info.isSymbolicLink() || !info.isFile()) fail('unsupported snapshot entry')
    total += info.size
    if (total > MAX_TOTAL || info.size > MAX_FILE) fail('snapshot too large')
  }
  const current = (await safeFile(absolute, 'CURRENT')).toString('utf8')
  if (!/^MANIFEST-\d+\n$/.test(current)) fail('invalid CURRENT')
  const manifest = manifestState(await safeFile(absolute, current.trim()))
  const records: RecordEntry[] = []
  const budget = { used: 0 }
  for (const [number, table] of manifest.tables) {
    const stem = String(number).padStart(6, '0')
    const candidates = [`${stem}.ldb`, `${stem}.sst`].filter((name) => names.includes(name))
    if (candidates.length !== 1) fail('missing or ambiguous active table')
    const data = await safeFile(absolute, candidates[0]!)
    if (data.length !== table.size) fail('active table size mismatch')
    readTable(data, records, budget)
  }
  const logs = names
    .filter((name) => /^\d+\.log$/.test(name))
    .map((name) => ({ name, number: Number(name.slice(0, -4)) }))
    .filter(({ number }) => number >= manifest.log || number === manifest.previous)
    .sort((a, b) => a.number - b.number)
  if (manifest.log > 0 && !logs.some(({ number }) => number === manifest.log)) fail('missing active log')
  if (manifest.previous > 0 && !logs.some(({ number }) => number === manifest.previous)) fail('missing previous log')
  for (const log of logs)
    for (const batch of logicalRecords(await safeFile(absolute, log.name))) readBatch(batch, records)
  const latest = new Map<string, RecordEntry>()
  for (const entry of records) {
    const structural = prefix(entry.key)
    if (structural.database === 0 && structural.store === 0 && structural.index === 0 && structural.rest[0] === 201) {
      const names = new Cursor(structural.rest.subarray(1))
      names.take(names.number() * 2)
      names.take(names.number() * 2)
      if (!names.done()) fail('invalid database name key')
    }
    if (structural.database > 0 && structural.store === 0 && structural.index === 0 && structural.rest[0] === 50) {
      const metadata = new Cursor(structural.rest.subarray(1))
      metadata.number()
      metadata.byte()
      if (!metadata.done()) fail('invalid object store metadata')
    }
    const key = entry.key.toString('hex')
    const previous = latest.get(key)
    if (previous && previous.seq === entry.seq && (previous.kind !== entry.kind || !previous.value.equals(entry.value)))
      fail('conflicting sequence')
    if (!previous || previous.seq < entry.seq) latest.set(key, entry)
  }
  const live = [...latest.values()].filter((entry) => entry.kind === 1)
  const databaseIds = new Set<number>()
  for (const entry of live) {
    const key = prefix(entry.key)
    if (key.database !== 0 || key.store !== 0 || key.index !== 0 || key.rest[0] !== 201) continue
    const names = new Cursor(key.rest.subarray(1))
    const origin = string16(names.take(names.number() * 2))
    const databaseName = string16(names.take(names.number() * 2))
    if (!names.done() || !origin || !entry.value.length || entry.value.length > 8)
      fail('invalid database name metadata')
    let databaseId = 0n
    for (let i = 0; i < entry.value.length; i++) databaseId |= BigInt(entry.value[i]!) << BigInt(i * 8)
    if (databaseId <= 0n || databaseId > BigInt(Number.MAX_SAFE_INTEGER)) fail('invalid database identifier')
    if (databaseName === 'ZenUML_DB') databaseIds.add(Number(databaseId))
  }
  if (databaseIds.size !== 1) fail('ZenUML_DB metadata not found or ambiguous')
  const database = [...databaseIds][0]!
  const stores = new Set<number>()
  for (const entry of live) {
    const key = prefix(entry.key)
    if (key.database !== database || key.store !== 0 || key.index !== 0 || key.rest[0] !== 50) continue
    const metadata = new Cursor(key.rest.subarray(1))
    const store = metadata.number()
    const kind = metadata.byte()
    if (!metadata.done()) fail('invalid object store metadata')
    if (kind === 0 && string16(entry.value) === 'datatable') stores.add(store)
  }
  if (stores.size !== 1) fail('datatable metadata not found or ambiguous')
  const store = [...stores][0]!
  // Validate primary-key encodings in every version, including tombstones,
  // before returning winners. IndexedDB compares logical keys, not raw bytes.
  for (const entry of records) {
    const key = prefix(entry.key)
    if (key.database !== database || key.store !== store || (key.index !== 1 && key.index !== 2 && key.index !== 3))
      continue
    const primary = new Cursor(key.rest)
    if (primary.byte() !== 1) fail('unsupported document key')
    const length = primary.number()
    const id = string16(primary.take(length * 2))
    if (!primary.done() || !id) fail('invalid document key')
  }
  const result: Array<{ id: string; data: unknown }> = []
  const valueBudget: ValueBudget = { nodes: 0, properties: 0, bytes: 0 }
  const ids = new Set<string>()
  for (const entry of live) {
    const key = prefix(entry.key)
    if (key.database !== database || key.store !== store) continue
    if (key.index === 3) fail('external Blob data is unsupported')
    if (key.index !== 1 && key.index !== 2) continue
    const indexOffset = 1 + (entry.key[0]! >>> 5) + 1 + ((entry.key[0]! >>> 2) & 7) + 1
    const indexWidth = (entry.key[0]! & 3) + 1
    const counterpart = Buffer.from(entry.key)
    counterpart.fill(0, indexOffset, indexOffset + indexWidth)
    counterpart[indexOffset] = key.index === 1 ? 2 : 1
    const other = latest.get(counterpart.toString('hex'))
    if (!other || other.kind !== 1) fail('missing object-store version entry')
    const dataValue = key.index === 1 ? entry.value : other.value
    const existsValue = key.index === 2 ? entry.value : other.value
    if (!existsValue.length || existsValue.length > 8) fail('invalid object-store version entry')
    let existsVersion = 0n
    for (let i = 0; i < existsValue.length; i++) existsVersion |= BigInt(existsValue[i]!) << BigInt(i * 8)
    if (new Cursor(dataValue).varint() !== existsVersion) fail('object-store version mismatch')
    if (key.index === 2) continue
    const primaryKey = new Cursor(key.rest)
    if (primaryKey.byte() !== 1) fail('unsupported document key')
    const length = primaryKey.number()
    const id = string16(primaryKey.take(length * 2))
    if (!primaryKey.done() || !id || ids.has(id)) fail('invalid or duplicate document key')
    const row = decodeValue(entry.value, valueBudget)
    if (!row || typeof row !== 'object' || Array.isArray(row)) fail('invalid document row')
    const record = row as Record<string, unknown>
    if (record.id !== id || !record.data || typeof record.data !== 'object' || Array.isArray(record.data))
      fail('invalid document row')
    validateDocument(record.data)
    if (Object.hasOwn(record.data, 'sourceRecordId')) fail('reserved source record metadata field')
    ids.add(id)
    result.push({ id, data: record.data })
    if (result.length > MAX_DOCUMENTS) fail('too many documents')
  }
  if (!result.length) fail('no documents found')
  result.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  const documents = result.map(({ id, data }) => ({
    ...(data as Record<string, unknown>),
    /* Keep the IndexedDB primary key separate from the payload's own ID. The
     * payload ID is application data and may collide between storage rows. */
    sourceRecordId: `idb1_${createHash('sha256').update(id, 'utf8').digest('hex')}`,
  }))
  if (Buffer.byteLength(JSON.stringify(documents), 'utf8') > MAX_EXPORT) fail('legacy export too large')
  return documents
}
