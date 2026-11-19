/* The desktop app's local server answers /mcp without a credential, as the
   library's owner. That is only safe when the caller is provably on this
   machine and not a web page talking to it: the socket peer must be loopback
   (never req.ip, which `trust proxy` lets X-Forwarded-For spoof), Host must be
   our own loopback address and port (DNS rebinding sends the attacker's name),
   and a browser's Origin / Sec-Fetch-Site must be ours. A hosted server never
   sets `desktop`. */
export interface LocalDesktopRequest {
  desktop: boolean
  port: number
  remoteAddress: string | undefined
  host: string | undefined
  origin: string | undefined
  secFetchSite: string | undefined
}

const LOOPBACK_PEERS = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1'])

export function isLocalDesktopRequest(r: LocalDesktopRequest): boolean {
  if (!r.desktop) return false
  if (!r.remoteAddress || !LOOPBACK_PEERS.has(r.remoteAddress)) return false
  const hosts = [`127.0.0.1:${r.port}`, `localhost:${r.port}`, `[::1]:${r.port}`]
  if (!r.host || !hosts.includes(r.host.toLowerCase())) return false
  if (r.origin !== undefined && !hosts.some((h) => r.origin === `http://${h}`)) return false
  if (r.secFetchSite === 'cross-site') return false
  return true
}
