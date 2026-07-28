'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'

export type ToastKind = 'ok' | 'err'
export interface ToastState {
  text: string
  kind: ToastKind
}

// Remplace le patron `useState<{text,kind}|null>` + `setTimeout` d'auto-
// dismiss dupliqué dans une douzaine d'écrans (portefeuille, messagerie,
// panneaux agent, etc.). `showToast` annule le timer précédent si un
// deuxième toast arrive avant l'expiration du premier.
export function useToast(): { toast: ToastState | null; showToast: (text: string, kind?: ToastKind) => void } {
  const [toast, setToast] = useState<ToastState | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const showToast = useCallback((text: string, kind: ToastKind = 'ok') => {
    if (timerRef.current) clearTimeout(timerRef.current)
    setToast({ text, kind })
    timerRef.current = setTimeout(() => setToast(null), kind === 'err' ? 4200 : 2600)
  }, [])

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current)
  }, [])

  return { toast, showToast }
}

// Bulle flottante — à placer dans un ancêtre `position: relative`, comme le
// faisaient les implémentations dupliquées d'origine (`top:-14, left:50%`).
export default function Toast({ toast, style }: { toast: ToastState | null; style?: CSSProperties }) {
  if (!toast) return null
  return (
    <div
      style={{
        position: 'absolute',
        top: -14,
        left: '50%',
        transform: 'translateX(-50%)',
        padding: '6px 14px',
        borderRadius: 'var(--radius-lg)',
        background: toast.kind === 'ok' ? 'var(--gold)' : 'var(--pink)',
        color: toast.kind === 'ok' ? '#171500' : '#fff',
        fontSize: 11.5,
        fontWeight: 700,
        whiteSpace: 'nowrap',
        zIndex: 10,
        ...style,
      }}
    >
      {toast.text}
    </div>
  )
}
