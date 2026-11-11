// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '../src/lib/api'
import { LegacyZenUmlImport } from '../src/components/LegacyZenUmlImport'
import { DoopMark } from '../src/components/Logo'
import { Modal } from '../src/components/ui/modal'

describe('LegacyZenUmlImport prepared preview', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(async () => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, json: async () => ({ mode: 'diagramly' }) })),
    )
    const product = await import('../src/lib/product')
    await act(async () => product.initProduct())
    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    container.remove()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('shows validated initial documents and opens the imported active page', async () => {
    const onOpen = vi.fn()
    vi.spyOn(api, 'importLegacyZenUml').mockResolvedValue({
      canvases: [{ id: 'local-doc', name: 'Old checkout', pageId: 'local-page-2' }],
      imported: 1,
      skipped: 0,
      warnings: [],
    })
    const items = [
      {
        id: 'legacy-doc',
        title: 'Old checkout',
        currentPageId: 'legacy-page-2',
        pages: [
          { id: 'legacy-page-1', title: 'Overview', js: 'A->B: Start', css: '', cssMode: 'css' },
          { id: 'legacy-page-2', title: 'Details', js: 'B->C: Continue', css: '', cssMode: 'css' },
        ],
      },
    ]

    await act(async () => {
      root.render(
        <>
          <DoopMark size={14} />
          <Modal onClose={() => {}}>
            <LegacyZenUmlImport
              initialItems={items}
              initialFileName="old-library.json"
              onBack={() => {}}
              onBusyChange={() => {}}
              onOpen={onOpen}
            />
          </Modal>
        </>,
      )
    })

    expect(container.querySelector('img[src="/diagramly-brand/icon.svg"]')).not.toBeNull()
    expect(document.body.textContent).toContain('old-library.json: 1 document selected')
    expect(document.body.textContent).toContain('Old checkout')
    expect(document.body.textContent).toContain('2 pages')

    const importButton = [...document.body.querySelectorAll('button')].find((button) =>
      button.textContent?.includes('Import 1 document'),
    )
    expect(importButton).toBeDefined()
    await act(async () => importButton!.click())

    const openButton = [...document.body.querySelectorAll('button')].find((button) =>
      button.textContent?.includes('Open first document'),
    )
    expect(openButton).toBeDefined()
    await act(async () => openButton!.click())
    expect(onOpen).toHaveBeenCalledWith('local-doc', 'Old checkout', 'local-page-2')
  })

  it('shows a validation error instead of throwing for invalid prepared data', async () => {
    await act(async () => {
      root.render(
        <Modal onClose={() => {}}>
          <LegacyZenUmlImport
            initialItems={[{ title: 'Not a ZenUML export' }]}
            initialFileName="invalid.json"
            onBack={() => {}}
            onBusyChange={() => {}}
            onOpen={() => {}}
          />
        </Modal>,
      )
    })

    expect(document.body.querySelector('[role="alert"]')?.textContent).toContain('Could not read this export.')
  })
})
