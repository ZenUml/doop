import { useEffect, useRef, useState } from 'react'
import { placeCardThumbnail } from '../lib/cardThumbnailLayout'
import { FramePreview } from './FramePreview'

/**
 * A library card's diagram preview: the rendered diagram image drawn at 70% of
 * its native size, top-aligned with an inset, centred when narrow and cropped
 * on the right when wide (see cardThumbnailLayout.ts). Decorative only - it
 * takes no pointer or keyboard input; the whole card opens the document. An
 * empty or failed preview keeps FramePreview's quiet placeholder.
 */
export function CardThumbnail({ frameId, empty }: { frameId?: string | null; empty: string }) {
  const box = useRef<HTMLDivElement>(null)
  const [boxWidth, setBoxWidth] = useState(0)
  const [native, setNative] = useState<{ id: string; width: number; height: number } | null>(null)
  const [failed, setFailed] = useState<string | null>(null)

  useEffect(() => {
    const el = box.current
    if (!el) return
    const update = () => setBoxWidth(el.clientWidth)
    update()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(update)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  if (!frameId || failed === frameId)
    return <FramePreview frameId={null} empty={failed ? 'preview unavailable' : empty} />
  const size = native?.id === frameId ? native : null
  const place = size && boxWidth > 0 ? placeCardThumbnail(boxWidth, size) : null
  return (
    <div ref={box} className="pointer-events-none relative h-full w-full select-none overflow-hidden" aria-hidden>
      <img
        src={`/i/${frameId}.jpg?preview`}
        alt=""
        draggable={false}
        tabIndex={-1}
        className="absolute max-w-none bg-white"
        style={
          place ? { left: place.x, top: place.y, width: place.width, height: place.height } : { visibility: 'hidden' }
        }
        onLoad={(event) =>
          setNative({ id: frameId, width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight })
        }
        onError={() => setFailed(frameId)}
      />
    </div>
  )
}
