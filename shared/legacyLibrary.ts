export type LegacyLibraryState =
  'ready' | 'not_found' | 'needs_folder_access' | 'preserved_needs_export' | 'busy' | 'error'

export interface LegacyLibrarySnapshot {
  id: string
  createdAt: string
  fileCount: number
  logicalBytes: number
  canImport: boolean
}

export interface LegacyLibraryStatus {
  configured: boolean
  status: LegacyLibraryState
  snapshots: LegacyLibrarySnapshot[]
}
