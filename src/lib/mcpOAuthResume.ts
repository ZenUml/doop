import { useEffect } from 'react'

/** The MCP login page is `/`; resume after a session is restored or created. */
export function useResumeMcpOAuth(signedIn: boolean): void {
  useEffect(() => {
    if (!signedIn || location.pathname !== '/') return
    const params = new URLSearchParams(location.search)
    if (params.has('client_id') && params.has('response_type')) {
      location.assign(`/api/auth/mcp/authorize${location.search}`)
    }
  }, [signedIn])
}
