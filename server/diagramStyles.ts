import { createRequire } from 'node:module'
import { Worker } from 'node:worker_threads'

const require = createRequire(import.meta.url)
const supported = new Set(['css', 'less', 'scss', 'sass'])
const maximumSourceBytes = 512 * 1024
const maximumOutputBytes = 2 * 1024 * 1024
let compiling = 0

/* This scanner is a second boundary, not the file-access policy: compiler
   importers/file managers below independently refuse disk and network loads.
   Decode identifier escapes, and ignore strings/comments rather than matching
   directives inside generated labels. Check generated CSS as well. */
function refuseExternalDirectives(source: string, lineComments: boolean) {
  let index = 0
  while (index < source.length) {
    const char = source[index++]
    if (char === '"' || char === "'") {
      while (index < source.length) {
        const next = source[index++]
        if (next === '\\') index++
        else if (next === char) break
      }
    } else if (char === '/' && source[index] === '*') {
      const end = source.indexOf('*/', index + 1)
      index = end === -1 ? source.length : end + 2
    } else if (lineComments && char === '/' && source[index] === '/') {
      const end = source.indexOf('\n', index + 1)
      index = end === -1 ? source.length : end + 1
    } else if (char === '@') {
      let name = ''
      while (index < source.length) {
        const next = source[index]!
        if (/[a-z0-9_-]/i.test(next)) {
          name += next
          index++
        } else if (next === '\\') {
          index++
          const hex = /^[0-9a-f]{1,6}/i.exec(source.slice(index))?.[0]
          if (hex) {
            const value = Number.parseInt(hex, 16)
            name += value > 0 && value <= 0x10ffff ? String.fromCodePoint(value) : '\ufffd'
            index += hex.length
            if (/\s/.test(source[index] ?? '')) index++
          } else {
            name += source[index++] ?? ''
          }
        } else break
      }
      if (['import', 'use', 'forward', 'plugin'].includes(name.toLowerCase())) {
        throw new Error('Stylesheet imports and plugins are not supported in preprocessors.')
      }
    }
  }
}

/* Static trusted bootstrap only. User source is worker data, never JavaScript.
   A worker bounds Sass loops/expansion without blocking the local HTTP server.
   This is compiler isolation, not an operating-system filesystem sandbox. */
const bootstrap = String.raw`
const { parentPort, workerData } = require('node:worker_threads');
const denied = () => { throw new Error('Style file access is disabled.'); };
(async () => {
  try {
    let css;
    if (workerData.mode === 'less') {
      const less = require(workerData.compiler);
      class NoFiles extends less.FileManager {
        supports() { return true; }
        supportsSync() { return true; }
        loadFile() { return Promise.reject(new Error('Style file access is disabled.')); }
        loadFileSync() { return denied(); }
      }
      css = (await less.render(workerData.source, {
        javascriptEnabled: false,
        disablePluginRule: true,
        plugins: [{ install: (_less, manager) => manager.addFileManager(new NoFiles()) }],
      })).css;
    } else {
      const sass = require(workerData.compiler);
      css = sass.compileString(workerData.source, {
        syntax: workerData.mode === 'sass' ? 'indented' : 'scss',
        importer: { canonicalize: denied, load: denied },
        importers: [], loadPaths: [], functions: {},
        logger: sass.Logger.silent,
      }).css;
    }
    if (Buffer.byteLength(css, 'utf8') > workerData.maximumOutputBytes)
      throw new Error('Compiled stylesheet exceeds the size limit.');
    parentPort.postMessage({ css });
  } catch (error) {
    const message = String(error?.message ?? '');
    parentPort.postMessage({ error: message.includes('Style file access is disabled')
      ? 'Style file access is disabled.' : 'Stylesheet compilation failed. Check the selected format and syntax.' });
  }
})();
`

export async function compileDiagramStyle(source: string, mode: string): Promise<string> {
  if (!supported.has(mode)) {
    throw new Error(`Unsupported stylesheet format: ${mode}. The original stylesheet must be retained.`)
  }
  if (Buffer.byteLength(source, 'utf8') > maximumSourceBytes) throw new Error('Stylesheet exceeds the size limit.')
  /* Raw CSS never enters a compiler or reads server files. Retain legacy font
     imports; the renderer's CSP controls browser requests. */
  if (mode === 'css' || !source.trim()) return source
  refuseExternalDirectives(source, true)
  if (compiling >= 2) throw new Error('Two stylesheets are already compiling. Try again.')
  compiling++
  try {
    const css = await new Promise<string>((resolve, reject) => {
      const worker = new Worker(bootstrap, {
        eval: true,
        // Never inherit the desktop stdin-shutdown hook or TypeScript loaders.
        // The trusted worker bootstrap is plain CommonJS and needs neither.
        execArgv: [],
        workerData: { source, mode, maximumOutputBytes, compiler: require.resolve(mode === 'less' ? 'less' : 'sass') },
        resourceLimits: { maxOldGenerationSizeMb: 96, maxYoungGenerationSizeMb: 16, stackSizeMb: 4 },
      })
      let settled = false
      const finish = (error?: Error, result?: string) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        void worker.terminate()
        if (error) reject(error)
        else resolve(result ?? '')
      }
      const timer = setTimeout(() => finish(new Error('Stylesheet compilation exceeded the time limit.')), 3000)
      worker.on('message', (message: unknown) => {
        if (!message || typeof message !== 'object') return finish(new Error('Invalid stylesheet compiler result.'))
        if ('css' in message && typeof message.css === 'string') return finish(undefined, message.css)
        finish(
          new Error(
            'error' in message && typeof message.error === 'string' ? message.error : 'Stylesheet compilation failed.',
          ),
        )
      })
      worker.on('error', () => finish(new Error('Stylesheet compiler stopped safely.')))
      worker.on('exit', () => finish(new Error('Stylesheet compiler exited without a result.')))
    })
    refuseExternalDirectives(css, false)
    return css
  } finally {
    compiling--
  }
}
