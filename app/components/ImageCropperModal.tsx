'use client'

import { useRef, useState } from 'react'

export default function ImageCropperModal({ src, title, aspect, outputWidth, circular = false, onCancel, onConfirm }: { src: string; title: string; aspect: number; outputWidth: number; circular?: boolean; onCancel: () => void; onConfirm: (dataUri: string) => Promise<void> | void }) {
  const previewWidth = 280
  const previewHeight = Math.round(previewWidth / aspect)
  const [zoom, setZoom] = useState(1)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [dragging, setDragging] = useState(false)
  const [saving, setSaving] = useState(false)
  const dragStart = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null)
  const imageRef = useRef<HTMLImageElement>(null)

  function move(dx: number, dy: number) {
    setOffset((current) => ({ x: current.x + dx, y: current.y + dy }))
  }

  async function confirm() {
    const image = imageRef.current
    if (!image) return
    setSaving(true)
    try {
      const outputHeight = Math.round(outputWidth / aspect)
      const canvas = document.createElement('canvas')
      canvas.width = outputWidth
      canvas.height = outputHeight
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      if (circular) {
        ctx.beginPath()
        ctx.arc(outputWidth / 2, outputHeight / 2, Math.min(outputWidth, outputHeight) / 2, 0, Math.PI * 2)
        ctx.clip()
      }
      const coverScale = Math.max(outputWidth / image.naturalWidth, outputHeight / image.naturalHeight) * zoom
      const width = image.naturalWidth * coverScale
      const height = image.naturalHeight * coverScale
      const scaleX = outputWidth / previewWidth
      const scaleY = outputHeight / previewHeight
      ctx.drawImage(image, (outputWidth - width) / 2 + offset.x * scaleX, (outputHeight - height) / 2 + offset.y * scaleY, width, height)
      await onConfirm(canvas.toDataURL('image/jpeg', 0.88))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="image-crop-title" style={{ position: 'fixed', inset: 0, zIndex: 3200, display: 'grid', placeItems: 'center', padding: 16, background: 'rgba(3,4,8,.86)', backdropFilter: 'blur(8px)' }}>
      <div style={{ width: '100%', maxWidth: 360, padding: 22, borderRadius: 20, background: 'var(--surface-2)', border: '1px solid var(--border-strong)', textAlign: 'center' }}>
        <h2 id="image-crop-title" style={{ margin: 0, fontSize: 18 }}>{title}</h2>
        <p style={{ margin: '5px 0 16px', color: 'var(--text-faint)', fontSize: 11 }}>Glisse l&apos;image pour la repositionner</p>
        <div
          onPointerDown={(event) => { setDragging(true); event.currentTarget.setPointerCapture(event.pointerId); dragStart.current = { x: event.clientX, y: event.clientY, ox: offset.x, oy: offset.y } }}
          onPointerMove={(event) => { if (dragging && dragStart.current) setOffset({ x: dragStart.current.ox + event.clientX - dragStart.current.x, y: dragStart.current.oy + event.clientY - dragStart.current.y }) }}
          onPointerUp={() => { setDragging(false); dragStart.current = null }}
          style={{ width: previewWidth, height: previewHeight, maxWidth: '100%', margin: '0 auto 16px', position: 'relative', overflow: 'hidden', borderRadius: circular ? '50%' : 14, background: '#000', cursor: dragging ? 'grabbing' : 'grab', touchAction: 'none' }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img ref={imageRef} src={src} alt="" draggable={false} style={{ width: '100%', height: '100%', objectFit: 'cover', transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom})`, userSelect: 'none', transformOrigin: 'center' }} />
        </div>
        <div role="group" aria-label="Repositionner l'image" style={{ display: 'flex', justifyContent: 'center', gap: 8, marginBottom: 12 }}>
          {[['←', -6, 0], ['↑', 0, -6], ['↓', 0, 6], ['→', 6, 0]].map(([glyph, dx, dy]) => <button key={String(glyph)} type="button" onClick={() => move(Number(dx), Number(dy))} style={controlButton}>{glyph}</button>)}
        </div>
        <label style={{ display: 'block', color: 'var(--text-muted)', fontSize: 11, textAlign: 'left' }}>Zoom</label>
        <input type="range" min={1} max={3} step={0.01} value={zoom} onChange={(event) => setZoom(Number(event.target.value))} style={{ width: '100%', accentColor: 'var(--gold)', margin: '5px 0 18px' }} />
        <div style={{ display: 'flex', gap: 10 }}>
          <button type="button" onClick={onCancel} disabled={saving} style={{ ...actionButton, background: 'transparent', color: '#fff', border: '1px solid var(--border-strong)' }}>Annuler</button>
          <button type="button" onClick={() => void confirm()} disabled={saving} style={{ ...actionButton, background: 'var(--gold)', color: '#181104', border: 0 }}>{saving ? 'Envoi…' : 'Valider'}</button>
        </div>
      </div>
    </div>
  )
}

const controlButton: React.CSSProperties = { width: 36, height: 36, borderRadius: 10, border: '1px solid var(--border-strong)', background: 'var(--surface)', color: '#fff', cursor: 'pointer', fontSize: 17 }
const actionButton: React.CSSProperties = { flex: 1, minHeight: 43, borderRadius: 10, fontWeight: 800, cursor: 'pointer' }
