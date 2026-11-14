import express from 'express'
import path from 'node:path'

/** An attachment response lets embedded webviews invoke their native save flow. */
export function claudeExtensionDownload(dist: string): express.Router {
  const router = express.Router()
  router.get('/claude-extension/doop.mcpb', (_req, res) => {
    res.download(path.join(dist, 'claude-extension/doop.mcpb'), 'doop.mcpb')
  })
  return router
}
