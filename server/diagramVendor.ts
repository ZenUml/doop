import express from 'express'
import { createRequire } from 'node:module'
import path from 'node:path'
import { DIAGRAM_VENDOR_PATH } from '../shared/diagramFrame'

/**
 * Serves the diagram renderers from this server, so a diagram frame needs no
 * CDN and renders offline. Public and CORS-open, as `/a/` assets are: frames
 * run in sandboxed iframes with an opaque origin, and a module import from
 * there is a cross-origin request.
 *
 * Spike module: mounted from server/index.ts, allowed in server/screenshot.ts.
 */

const require = createRequire(import.meta.url)

function zenumlDist(): string {
  /* the package's exports map hides its dist files; its main entry sits in dist */
  return path.dirname(require.resolve('@zenuml/core'))
}

export function diagramVendorRouter(): express.Router {
  const router = express.Router()
  const dist = zenumlDist()
  const open = (res: express.Response) => {
    res.set('Access-Control-Allow-Origin', '*')
    res.set('Cache-Control', 'public, max-age=3600')
  }
  router.get('/zenuml.mjs', (_req, res) => {
    open(res)
    res.type('text/javascript')
    res.sendFile(path.join(dist, 'zenuml.esm.mjs'))
  })
  /* the bundle loads its icon chunk by a relative address */
  router.use(express.static(dist, { index: false, fallthrough: false, setHeaders: open }))
  return router
}

/** True for a renderer file on this server: the screenshot browser may load it directly. */
export function isDiagramVendorUrl(url: URL, serverOrigin: string): boolean {
  return url.origin === serverOrigin && url.pathname.startsWith(`${DIAGRAM_VENDOR_PATH}/`)
}
