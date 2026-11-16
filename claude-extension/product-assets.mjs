import { readFile } from 'node:fs/promises'
import { URL } from 'node:url'

const here = new URL('.', import.meta.url)

/** Diagramly is the sole product and extension install identity. */
export async function getClaudeExtensionAssets() {
  return {
    iconSource: 'desktop/src-tauri/icons/icon.png',
    manifest: JSON.parse(await readFile(new URL('./manifest.json', here), 'utf8')),
    readme: await readFile(new URL('./README.md', here), 'utf8'),
  }
}

export function productModeFromEnvironment() {
  return 'diagramly'
}
