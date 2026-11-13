const STORAGE_PREFIX = 'diagram-draft:v1:'
const MAX_ID_LENGTH = 512
const MAX_SOURCE_BYTES = 1_000_000

interface StoredDiagramDraft {
  version: 1
  source: string
  baseSource: string
  updatedAt: number
}

export interface DiagramDraft {
  source: string
  baseSource: string
  updatedAt: number
}

function validId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= MAX_ID_LENGTH
}

function sourceWithinBounds(value: unknown): value is string {
  if (typeof value !== 'string') return false
  try {
    return new TextEncoder().encode(value).byteLength <= MAX_SOURCE_BYTES
  } catch {
    return false
  }
}

function storageKey(userId: string, frameId: string, pageId?: string) {
  return `${STORAGE_PREFIX}${encodeURIComponent(userId)}:${encodeURIComponent(frameId)}${pageId ? `:page:${encodeURIComponent(pageId)}` : ''}`
}

function localStorageOrNull(): Storage | null {
  try {
    return globalThis.localStorage
  } catch {
    return null
  }
}

function decodeDraft(raw: string): DiagramDraft | null {
  try {
    const value: unknown = JSON.parse(raw)
    if (value === null || typeof value !== 'object') return null
    const record = value as Partial<StoredDiagramDraft>
    const keys = Object.keys(value)
    if (
      keys.length !== 4 ||
      !keys.includes('version') ||
      !keys.includes('source') ||
      !keys.includes('baseSource') ||
      !keys.includes('updatedAt') ||
      record.version !== 1 ||
      !sourceWithinBounds(record.source) ||
      !sourceWithinBounds(record.baseSource) ||
      typeof record.updatedAt !== 'number' ||
      !Number.isSafeInteger(record.updatedAt) ||
      record.updatedAt <= 0
    ) {
      return null
    }
    return { source: record.source, baseSource: record.baseSource, updatedAt: record.updatedAt }
  } catch {
    return null
  }
}

/** Read one user's unsent diagram source draft from this browser's local storage. */
export function readDiagramDraft(userId: string, frameId: string, pageId?: string): DiagramDraft | null {
  if (!validId(userId) || !validId(frameId) || (pageId !== undefined && !validId(pageId))) return null
  try {
    const storage = localStorageOrNull()
    if (!storage) return null
    const raw = storage.getItem(storageKey(userId, frameId, pageId))
    return raw === null ? null : decodeDraft(raw)
  } catch {
    return null
  }
}

/**
 * Store one user's unsent source locally. `true` means localStorage accepted
 * the write; browser storage can still be cleared or unavailable later.
 */
export function writeDiagramDraft(
  userId: string,
  frameId: string,
  draft: { source: string; baseSource: string },
  pageId?: string,
): boolean {
  if (
    !validId(userId) ||
    !validId(frameId) ||
    (pageId !== undefined && !validId(pageId)) ||
    !draft ||
    !sourceWithinBounds(draft.source) ||
    !sourceWithinBounds(draft.baseSource)
  ) {
    return false
  }

  try {
    const storage = localStorageOrNull()
    if (!storage) return false
    const stored: StoredDiagramDraft = {
      version: 1,
      source: draft.source,
      baseSource: draft.baseSource,
      updatedAt: Date.now(),
    }
    storage.setItem(storageKey(userId, frameId, pageId), JSON.stringify(stored))
    return true
  } catch {
    return false
  }
}

/**
 * Remove a draft. When a source is supplied, remove only the exact version
 * that was confirmed as saved so a newer keystroke remains recoverable.
 */
export function clearDiagramDraft(userId: string, frameId: string, confirmedSource?: string, pageId?: string): void {
  if (!validId(userId) || !validId(frameId) || (pageId !== undefined && !validId(pageId))) return
  try {
    const storage = localStorageOrNull()
    if (!storage) return
    const key = storageKey(userId, frameId, pageId)
    if (confirmedSource !== undefined) {
      const current = decodeDraft(storage.getItem(key) ?? '')
      if (!current || current.source !== confirmedSource) return
    }
    storage.removeItem(key)
  } catch {
    // Local persistence is best-effort; never turn a storage failure into data loss elsewhere.
  }
}
