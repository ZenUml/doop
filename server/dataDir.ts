import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { env } from './env.ts'

/**
 * Where the server keeps what it writes: the embedded database and uploaded
 * assets. `./data` under the working directory unless `DOOP_DATA_DIR` names
 * another place. A packaged desktop app needs that: it runs from its
 * read-only bundle and may write only inside its container (spike).
 */
export function resolveDataDir(configured: string | undefined, cwd: string, ...parts: string[]): string {
  return path.join(configured || path.join(cwd, 'data'), ...parts)
}

export function dataDir(...parts: string[]): string {
  return resolveDataDir(env.DOOP_DATA_DIR, process.cwd(), ...parts)
}

/**
 * The directory holding `server/`, `dist/` and `package.json`, found from this
 * file rather than the working directory: the macOS App Sandbox starts a
 * process in its container, whatever directory it was launched from (spike).
 */
export function appRoot(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
}
