import fs from 'node:fs'
import path from 'node:path'
import { env, windowsBrowserDirectories } from './env.ts'

/** The first usable browser executable supported on this platform. */
export function findBrowserPath(): string | null {
  const candidates = [env.CHROME_PATH, ...platformBrowserPaths()].filter(
    (candidate): candidate is string => !!candidate,
  )
  for (const candidate of candidates) {
    try {
      fs.accessSync(candidate, fs.constants.X_OK)
      return candidate
    } catch {
      /* keep looking */
    }
  }
  return null
}

function platformBrowserPaths(): string[] {
  if (process.platform === 'win32') {
    const directories = windowsBrowserDirectories()
    return [
      ...directories.map((dir) => path.join(dir, 'Google', 'Chrome', 'Application', 'chrome.exe')),
      ...directories.map((dir) => path.join(dir, 'Microsoft', 'Edge', 'Application', 'msedge.exe')),
      ...directories.map((dir) => path.join(dir, 'BraveSoftware', 'Brave-Browser', 'Application', 'brave.exe')),
    ]
  }
  if (process.platform === 'darwin') {
    return [
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Chromium.app/Contents/MacOS/Chromium',
      '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
      '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
    ]
  }
  if (process.platform === 'linux') {
    return [
      '/usr/bin/google-chrome',
      '/usr/bin/chromium',
      '/usr/bin/chromium-browser',
      '/usr/bin/microsoft-edge',
      '/usr/bin/brave-browser',
    ]
  }
  return []
}
