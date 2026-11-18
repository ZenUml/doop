import { useState } from 'react'
import type { DiagramKind } from '../../shared/diagramFrame'
import { useT } from '../lib/i18n'
import { Button } from './ui/button'
import { Modal, ModalLede, ModalTitle } from './ui/modal'

export function NewDiagramModal({
  onCreate,
  onClose,
}: {
  onCreate: (kind: DiagramKind) => Promise<void>
  onClose: () => void
}) {
  const t = useT()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function create(kind: DiagramKind) {
    if (busy) return
    setBusy(true)
    setError('')
    try {
      await onCreate(kind)
      onClose()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('canvas.createDiagramFailed'))
      setBusy(false)
    }
  }

  return (
    <Modal
      onClose={() => {
        if (!busy) onClose()
      }}
    >
      <ModalTitle>{t('canvas.newDiagram')}</ModalTitle>
      <ModalLede>{t('canvas.chooseDiagramFormat')}</ModalLede>
      <div className="mt-5 flex flex-col gap-3">
        <Button disabled={busy} onClick={() => void create('zenuml')}>
          {t('canvas.newZenUmlDiagram')}
        </Button>
        <Button disabled={busy} onClick={() => void create('mermaid')}>
          {t('canvas.newMermaidDiagram')}
        </Button>
      </div>
      {error && (
        <p role="alert" className="mt-3 text-copy text-ink">
          {error}
        </p>
      )}
    </Modal>
  )
}
