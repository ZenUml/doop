import { Router, type Request, type Response } from 'express'
import path from 'node:path'
import { env } from './env.ts'
import { DiagramlyConnection, DiagramlyError } from './diagramlyConnection.ts'

const connections = new DiagramlyConnection(
  path.resolve(env.DOOP_DATA_DIR ?? 'data', 'diagramly-accounts'),
  env.BETTER_AUTH_SECRET,
  env.DIAGRAMLY_ORIGIN,
)
const handle = (action: (req: Request) => Promise<unknown> | unknown) => (req: Request, res: Response) => {
  Promise.resolve()
    .then(() => action(req))
    .then((result) => {
      res.setHeader('Cache-Control', 'no-store')
      res.json(result)
    })
    .catch((error: unknown) => {
      res.status(error instanceof DiagramlyError ? error.status : 503).json({
        error:
          error instanceof DiagramlyError
            ? error.message
            : 'Diagramly connection is unavailable. Local documents remain available.',
      })
    })
}

/** Native StoreKit owns signed data; a short-lived, one-use ticket replaces
 * cookie credentials on URLSession. This single route precedes the session gate. */
export const deliverApplePurchase = handle((req) => {
  if (env.DOOP_PRODUCT !== 'diagramly') throw new DiagramlyError(404, 'Not available.')
  const { deliveryTicket, transactionId, signedTransaction } = req.body ?? {}
  if (
    typeof deliveryTicket !== 'string' ||
    typeof transactionId !== 'string' ||
    typeof signedTransaction !== 'string' ||
    signedTransaction.length > 100_000
  )
    throw new DiagramlyError(400, 'Invalid delivery request.')
  return connections.deliver(deliveryTicket, transactionId, signedTransaction)
})

export const diagramlyRouter = Router()
diagramlyRouter.use((req, res, next) => {
  res.setHeader('Cache-Control', 'no-store')
  if (env.DOOP_PRODUCT !== 'diagramly') return res.status(404).json({ error: 'Not available.' })
  if (req.method !== 'GET' && req.get('origin') !== new URL(env.BETTER_AUTH_URL).origin)
    return res.status(403).json({ error: 'Use the Diagramly application to change its cloud connection.' })
  next()
})
diagramlyRouter.get(
  '/connection',
  handle((req) => connections.status(req.user!.id)),
)
diagramlyRouter.post(
  '/connection/start',
  handle((req) => connections.start(req.user!.id)),
)
diagramlyRouter.post(
  '/connection/poll',
  handle((req) => connections.poll(req.user!.id)),
)
diagramlyRouter.delete(
  '/connection',
  handle((req) => {
    connections.disconnect(req.user!.id)
    return { status: 'disconnected' }
  }),
)
diagramlyRouter.get(
  '/account',
  handle((req) =>
    connections.account(req.user!.id, typeof req.query.teamId === 'string' ? req.query.teamId : undefined),
  ),
)
diagramlyRouter.post(
  '/apple/account-token',
  handle((req) => connections.call(req.user!.id, 'apple/account-token', req.body ?? {})),
)
diagramlyRouter.post(
  '/apple/purchase-context',
  handle((req) => connections.call(req.user!.id, 'apple/purchase-context', req.body ?? {})),
)
diagramlyRouter.post(
  '/apple/delivery-ticket',
  handle((req) =>
    connections.ticket(
      req.user!.id,
      req.body?.transactionId,
      typeof req.body?.teamId === 'string' ? req.body.teamId : undefined,
    ),
  ),
)
diagramlyRouter.post(
  '/generation',
  handle((req) => connections.call(req.user!.id, 'generation', req.body)),
)
diagramlyRouter.get(
  '/generation/status',
  handle((req) => {
    if (typeof req.query.jobId !== 'string') throw new DiagramlyError(400, 'A generation job is required.')
    return connections.call(req.user!.id, `generation/status?jobId=${encodeURIComponent(req.query.jobId)}`)
  }),
)
