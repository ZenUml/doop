/** Product decisions are separate from storage/protocol compatibility. */
export type ProductMode = 'doop' | 'diagramly'

export const DIAGRAMLY_DECISIONS = {
  documents: true,
  pages: true,
  diagramSource: true,
  legacyImport: true,
  externalMcp: true,
  localRasterExport: true,
  localBackup: true,
  htmlInspector: false,
  prototype: false,
  developmentApproval: false,
  websiteImport: false,
  designTokens: false,
  designMemory: false,
  automations: false,
  integrations: false,
  community: false,
  upstreamBilling: false,
  upstreamModelAccounts: false,
  sessionReplay: false,
} as const

/** Deny unsupported entry points as well as hiding their navigation. Data is retained. */
export function diagramlyApiAvailable(path: string): boolean {
  return !(
    /^\/(?:automations|integrations|community|webhooks|billing|custom-providers|model-account|agent-runners|image-model|image-descriptions|local-agent)(?:\/|$)/.test(
      path,
    ) ||
    /^\/canvases\/[^/]+\/(?:publish|sync-keys|github|tokens|token-themes|guidelines|references|proposals|tasks)(?:\/|$)/.test(
      path,
    ) ||
    /^\/frames\/[^/]+\/approval(?:\/|$)/.test(path) ||
    /^\/canvases\/[^/]+\/pages\/[^/]+\/flow-start$/.test(path)
  )
}
