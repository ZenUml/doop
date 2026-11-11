import type { ProductMode } from '../../shared/product'

let mode: ProductMode = import.meta.env.VITE_PRODUCT_MODE === 'diagramly' ? 'diagramly' : 'doop'

export function isDiagramly(): boolean {
  return mode === 'diagramly'
}

export async function initProduct(): Promise<void> {
  try {
    const response = await fetch('/api/product-config')
    if (!response.ok) return
    const config: unknown = await response.json()
    if (config && typeof config === 'object' && 'mode' in config && config.mode === 'diagramly') mode = 'diagramly'
  } catch {
    // Offline bootstrap keeps the build's explicit product mode.
  }
  if (isDiagramly()) document.title = 'Diagramly Desktop'
}
