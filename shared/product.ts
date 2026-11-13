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
  designComponents: false,
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
    /^\/(?:automations|integrations|community|webhooks|billing|custom-providers|model-account|agent-runners|image-model|image-descriptions|local-agent)(?:\/|$)/i.test(
      path,
    ) ||
    /^\/canvases\/[^/]+\/(?:publish|sync-keys|github|tokens|token-themes|guidelines|references|proposals|tasks|components|component-libraries|component-candidates)(?:\/|$)/i.test(
      path,
    ) ||
    /^\/frames\/[^/]+\/(?:approval|instances)(?:\/|$)/i.test(path) ||
    /^\/canvases\/[^/]+\/pages\/[^/]+\/flow-start$/i.test(path)
  )
}

const WEB_DESIGN_TOOLS = new Set([
  'search_inspiration',
  'list_components',
  'get_component',
  'create_component',
  'update_component',
  'insert_instance',
  'update_instances',
  'find_component_candidates',
  'delete_component',
  'restore_component_version',
  'import_component',
  'sync_component',
  'get_component_preview',
  'list_guidelines',
  'get_guidelines',
  'set_guidelines',
  'get_tokens',
  'create_tokens',
  'set_tokens',
  'set_token_themes',
  'get_reference',
  'save_decision',
  'get_prototype',
  'set_prototype_start',
  'upload_asset',
  'generate_image',
  'search_images',
  'list_backgrounds',
  'search_icons',
  'search_logos',
  'view_website',
  'import_webpage',
])

/** Existing frame/source protocol names remain compatible. Unsupported product
 * tools are unavailable even if a client calls an old cached tool directly. */
export function diagramlyMcpAvailable(name: string): boolean {
  return !WEB_DESIGN_TOOLS.has(name)
}
