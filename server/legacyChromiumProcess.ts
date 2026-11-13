import { execFile } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'

/** Keep untrusted V8 allocations and parser CPU outside the live library
 * process. The child has no inherited credentials and reads only the private
 * snapshot directory authorized by LegacyLibrary. A failure returns no rows. */
export function decodeLegacyCopy(directory: string): Promise<unknown[]> {
  if ('bun' in process.versions) return Promise.reject(new Error('Legacy decoding requires the bundled Node runtime.'))
  return new Promise((resolve, reject) => {
    const child = execFile(
      process.execPath,
      [
        '--max-old-space-size=128',
        '--import',
        new URL('../node_modules/tsx/dist/loader.mjs', import.meta.url).href,
        fileURLToPath(new URL('./legacyChromiumWorker.ts', import.meta.url)),
      ],
      {
        env: { PATH: '/usr/bin:/bin', TMPDIR: tmpdir(), TSX_DISABLE_CACHE: '1' },
        encoding: 'utf8',
        timeout: 30_000,
        killSignal: 'SIGKILL',
        maxBuffer: 12 * 1024 * 1024,
      },
      (error, stdout) => {
        if (error) return reject(new Error('The preserved library could not be decoded safely.'))
        try {
          const items: unknown = JSON.parse(stdout)
          if (!Array.isArray(items)) throw new Error('Invalid decoder response')
          resolve(items)
        } catch {
          reject(new Error('The preserved library could not be decoded safely.'))
        }
      },
    )
    const stop = () => child.kill('SIGKILL')
    process.once('exit', stop)
    child.once('close', () => process.off('exit', stop))
    child.stdin?.on('error', () => {})
    child.stdin?.end(JSON.stringify({ directory }))
  })
}
