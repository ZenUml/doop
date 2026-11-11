export async function diagramlyRequest<T>(path: string, body?: unknown, method?: string): Promise<T> {
  const response = await fetch(`/api/diagramly/${path}`, {
    method: method ?? (body === undefined ? 'GET' : 'POST'),
    headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  const result: unknown = await response.json()
  if (!response.ok)
    throw new Error(
      result && typeof result === 'object' && 'error' in result && typeof result.error === 'string'
        ? result.error
        : 'Diagramly is unavailable. Your local documents are unchanged.',
    )
  return result as T
}

export interface DiagramlyCloudStatus {
  status: string
  user?: { id: string; email: string; name: string | null }
  expiresAt?: number
}

export interface DiagramlyAccount {
  user: { id: string; name: string | null; email: string }
  teams: { id: string; name: string; role: string }[]
  selectedTeamId: string
  allowance: Record<string, unknown>
}

interface StoreProduct {
  id: string
  displayName: string
  displayPrice: string
  description: string
  subscriptionPeriod?: { value: number; unit: string }
}
interface AppleTransaction {
  transactionId: string
  productId: string
}
interface StoreResponses {
  products: { products: StoreProduct[] }
  transactions: { transactions: AppleTransaction[] }
  restore: { transactions: AppleTransaction[] }
  purchase: { status: 'purchased' | 'cancelled' | 'pending'; transaction?: AppleTransaction }
  deliver: { delivered: boolean; transactionId: string }
  manage: { opened: boolean }
}

type StoreBridge = { request: (action: string, payload?: unknown) => Promise<unknown> }
function bridge(): StoreBridge | undefined {
  return (window as unknown as { __DIAGRAMLY_STOREKIT__?: StoreBridge }).__DIAGRAMLY_STOREKIT__
}
export function hasApplePurchases() {
  return typeof bridge()?.request === 'function'
}
export async function appleRequest<K extends keyof StoreResponses>(
  action: K,
  payload?: unknown,
): Promise<StoreResponses[K]> {
  const store = bridge()
  if (!store) throw new Error('Apple purchases are available in the Mac App Store build.')
  return (await store.request(action, payload)) as StoreResponses[K]
}

export async function deliverAppleTransaction(transactionId: string, teamId: string) {
  const { deliveryTicket } = await diagramlyRequest<{ deliveryTicket: string }>('apple/delivery-ticket', {
    transactionId,
    teamId,
  })
  const delivered = await appleRequest('deliver', { transactionId, deliveryTicket })
  if (!delivered.delivered || delivered.transactionId !== transactionId)
    throw new Error('Purchase delivery is still pending. Restore Purchases can retry safely.')
}
