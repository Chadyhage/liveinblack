'use client'

import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { X } from 'lucide-react'
import Button from './Button'
import styles from './ImmersiveDialog.module.css'

export interface ImmersiveDialogProps {
  title: string
  subtitle?: string
  onClose: () => void
  children: ReactNode
  actions?: ReactNode
  maxWidth?: number
  zIndex?: number
  media?: boolean
  dismissible?: boolean
}

export default function ImmersiveDialog({
  title,
  subtitle,
  onClose,
  children,
  actions,
  maxWidth = 980,
  zIndex = 3000,
  media = false,
  dismissible = true,
}: ImmersiveDialogProps) {
  const [visible, setVisible] = useState(false)
  const [closing, setClosing] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)

  const close = useCallback(() => {
    if (!dismissible || closing) return
    setClosing(true)
    setVisible(false)
    window.setTimeout(onClose, 220)
  }, [closing, dismissible, onClose])

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const raf = requestAnimationFrame(() => {
      setVisible(true)
      closeRef.current?.focus()
    })
    return () => {
      cancelAnimationFrame(raf)
      document.body.style.overflow = previousOverflow
      previousFocus?.focus()
    }
  }, [])

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') return close()
      if (event.key !== 'Tab' || !rootRef.current) return
      const controls = Array.from(rootRef.current.querySelectorAll<HTMLElement>('a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'))
      if (!controls.length) return
      const first = controls[0]
      const last = controls[controls.length - 1]
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [close])

  return (
    <div
      ref={rootRef}
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className={`${styles.root}${visible ? ` ${styles.visible}` : ''}${closing ? ` ${styles.closing}` : ''}${media ? ` ${styles.media}` : ''}`}
      style={{ zIndex, '--immersive-width': `${maxWidth}px` } as CSSProperties}
    >
      <header className={styles.header}>
        <div className={styles.heading}>
          <h1>{title}</h1>
          {subtitle ? <p>{subtitle}</p> : null}
        </div>
        <Button ref={closeRef} variant="ghost" className={styles.close} onClick={close} disabled={!dismissible} aria-label="Fermer">
          <X size={20} aria-hidden="true" />
        </Button>
      </header>
      <div className={styles.scroller}>
        <main className={styles.content}>{children}</main>
      </div>
      {actions ? <footer className={styles.actions}>{actions}</footer> : null}
    </div>
  )
}
