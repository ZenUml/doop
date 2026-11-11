import { execFile } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { defaultTreeAdapter, html, parse, serialize } from 'parse5'
import sharp from 'sharp'
import { buildDiagramHtml, DIAGRAM_VENDOR_PATH, readDiagramFrame } from '../shared/diagramFrame.ts'
import { exportPixelSize, MAX_EXPORT_SIDE } from '../shared/exportScale.ts'
import type { Frame } from '../shared/types.ts'
import { env } from './env.ts'
import { TRANSPARENT_DIAGRAM_STYLE } from '../shared/diagramExport.ts'

const MAX_PIXELS = 24_000_000
const MAX_WORKERS = 2
const MAX_WAITING = 4
let workers = 0
const waiting: (() => void)[] = []

interface Options {
  type?: 'png' | 'jpeg'
  quality?: number
  maxHeight?: number
  transparent?: boolean
}

/** A fresh WebKit view for a saved frame, available only in the bundled desktop app. */
export async function renderDesktopFrame(helper: string, frame: Frame, scale: number, opts: Options): Promise<Buffer> {
  const { width, height } = exportPixelSize(frame, 1)
  const captureHeight = Math.min(height, opts.maxHeight ?? height)
  const output = exportPixelSize({ width, height: captureHeight }, scale)
  if (
    !Number.isFinite(width + height + output.width + output.height) ||
    Math.max(width, height, output.width, output.height) > MAX_EXPORT_SIDE ||
    Math.max(width * height, output.width * output.height) > MAX_PIXELS
  ) {
    throw new Error('Frame is too large for a desktop screenshot')
  }

  if (workers < MAX_WORKERS) workers++
  else {
    if (waiting.length >= MAX_WAITING) throw new Error('Desktop screenshot renderer is busy')
    await new Promise<void>((resolve) => waiting.push(resolve))
  }
  try {
    const origin = new URL(env.BETTER_AUTH_URL).origin
    const diagram = readDiagramFrame(frame.html)
    const document = diagram ? buildDiagramHtml(diagram) : frame.html
    const input = JSON.stringify({
      html: snapshotDocument(document, origin, Boolean(diagram), opts.type !== 'jpeg' && opts.transparent === true),
      origin: `${origin}/`,
      width,
      height,
      captureHeight,
      outputWidth: output.width,
      diagram: Boolean(diagram),
      transparent: opts.type !== 'jpeg' && opts.transparent === true,
    })
    const png = await capture(helper, input)
    const image = sharp(png).resize({ ...output, fit: 'fill' })
    if (!opts.transparent || opts.type === 'jpeg') image.flatten({ background: '#fff' })
    return await (opts.type === 'jpeg' ? image.jpeg({ quality: opts.quality ?? 90 }) : image.png()).toBuffer()
  } finally {
    const next = waiting.shift()
    if (next) next()
    else workers--
  }
}

/** Only our generated diagram code may execute. A frame's saved HTML can
 *  come from an agent or an import and is never a trusted WebKit document. */
function snapshotDocument(source: string, origin: string, diagram: boolean, transparent = false): string {
  const nonce = randomBytes(16).toString('base64')
  const document = parse(
    diagram ? source.replace('<script type="module">', `<script nonce="${nonce}" type="module">`) : source,
  )
  const head = document.childNodes
    .filter((node) => 'tagName' in node)
    .find((node) => node.tagName === 'html')
    ?.childNodes.filter((node) => 'tagName' in node)
    .find((node) => node.tagName === 'head')
  if (!head) throw new Error('Frame has no document head')

  const assets = `${origin}/a/`
  const policy = [
    "default-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
    `img-src data: blob: ${assets} ${origin}/bg/`,
    `style-src 'unsafe-inline' ${assets} https://fonts.googleapis.com`,
    `font-src data: ${assets} https://fonts.gstatic.com`,
    `script-src ${diagram ? `'nonce-${nonce}' ${origin}${DIAGRAM_VENDOR_PATH}/` : "'none'"}`,
  ].join('; ')
  const meta = defaultTreeAdapter.createElement('meta', html.NS.HTML, [
    { name: 'http-equiv', value: 'Content-Security-Policy' },
    { name: 'content', value: policy },
  ])
  if (head.childNodes[0]) defaultTreeAdapter.insertBefore(head, meta, head.childNodes[0])
  else defaultTreeAdapter.appendChild(head, meta)
  if (transparent) {
    const style = defaultTreeAdapter.createElement('style', html.NS.HTML, [])
    defaultTreeAdapter.insertText(style, TRANSPARENT_DIAGRAM_STYLE)
    defaultTreeAdapter.appendChild(head, style)
  }
  return serialize(document)
}

function capture(helper: string, input: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const child = execFile(
      helper,
      [],
      {
        encoding: 'buffer',
        timeout: 14_000,
        killSignal: 'SIGKILL',
        maxBuffer: 100 * 1024 * 1024,
      },
      (error, stdout, stderr) => {
        if (error) {
          const detail = stderr.toString().trim().split('\n').at(-1)
          reject(new Error(detail || 'WebKit screenshot helper failed'))
        } else resolve(stdout)
      },
    )
    const stop = () => {
      child.kill('SIGKILL')
    }
    process.once('exit', stop)
    child.once('close', () => process.off('exit', stop))
    child.stdin?.on('error', () => {})
    child.stdin?.end(input)
  })
}
