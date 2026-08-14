'use client'

import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type CSSProperties, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import Button from './Button'

let bodyLockCount = 0
let bodyOverflowBeforeLock = ''
const modalStack: HTMLElement[] = []
const subscribeToHydration = () => () => undefined

function lockBodyScroll() {
  if (bodyLockCount === 0) {
    bodyOverflowBeforeLock = document.body.style.overflow
    document.body.style.overflow = 'hidden'
  }
  bodyLockCount += 1
}

function unlockBodyScroll() {
  bodyLockCount = Math.max(0, bodyLockCount - 1)
  if (bodyLockCount === 0) document.body.style.overflow = bodyOverflowBeforeLock
}

export interface BaseModalRenderContext {
  close: () => void
}

export interface BaseModalProps {
  onClose: () => void
  children: ReactNode | ((context: BaseModalRenderContext) => ReactNode)
  rootClassName: string
  visibleClassName: string
  closingClassName: string
  panelClassName?: string
  backdropClassName?: string
  rootStyle?: CSSProperties
  panelStyle?: CSSProperties
  ariaLabel?: string
  ariaLabelledBy?: string
  ariaDescribedBy?: string
  backdropLabel?: string
  dismissible?: boolean
  closeDelay?: number
}

// Primitive unique de toutes les expériences modales de l'app. Les variantes
// Modal, SlideOverModal et ImmersiveDialog ne gèrent que leur présentation ;
// focus, Échap, scroll, backdrop, animation de sortie et attributs ARIA vivent
// exclusivement ici.
export default function BaseModal({
  onClose,
  children,
  rootClassName,
  visibleClassName,
  closingClassName,
  panelClassName,
  backdropClassName,
  rootStyle,
  panelStyle,
  ariaLabel,
  ariaLabelledBy,
  ariaDescribedBy,
  backdropLabel = 'Fermer la fenêtre',
  dismissible = true,
  closeDelay = 220,
}: BaseModalProps) {
  const canUseDOM = useSyncExternalStore(subscribeToHydration, () => true, () => false)
  const [visible, setVisible] = useState(false)
  const [closing, setClosing] = useState(false)
  const [closeTimer, setCloseTimer] = useState<number | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  const close = useCallback(() => {
    if (!dismissible || closing) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      onClose()
      return
    }
    setClosing(true)
    setVisible(false)
    setCloseTimer(window.setTimeout(onClose, closeDelay))
  }, [closeDelay, closing, dismissible, onClose])

  useEffect(() => {
    if (!canUseDOM) return
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const root = rootRef.current
    if (root) modalStack.push(root)
    lockBodyScroll()
    const raf = requestAnimationFrame(() => {
      setVisible(true)
      const scope = panelRef.current || rootRef.current
      const activeElement = document.activeElement
      if (activeElement instanceof HTMLElement && scope?.contains(activeElement)) return
      const firstControl = scope?.querySelector<HTMLElement>('[data-autofocus],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),button:not([disabled]),a[href],[tabindex]:not([tabindex="-1"])')
      ;(firstControl || panelRef.current || rootRef.current)?.focus()
    })
    return () => {
      cancelAnimationFrame(raf)
      unlockBodyScroll()
      if (root) {
        const index = modalStack.lastIndexOf(root)
        if (index >= 0) modalStack.splice(index, 1)
      }
      previouslyFocused?.focus()
    }
  }, [canUseDOM])

  useEffect(() => () => {
    if (closeTimer !== null) window.clearTimeout(closeTimer)
  }, [closeTimer])

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (modalStack.at(-1) !== rootRef.current) return
      if (event.key === 'Escape') return close()
      if (event.key !== 'Tab') return
      const scope = panelRef.current || rootRef.current
      if (!scope) return
      const controls = Array.from(scope.querySelectorAll<HTMLElement>('a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'))
      if (!controls.length) return
      const first = controls[0]
      const last = controls[controls.length - 1]
      if (!scope.contains(document.activeElement)) {
        event.preventDefault()
        ;(event.shiftKey ? last : first).focus()
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [close])

  const stateClassName = `${rootClassName}${visible ? ` ${visibleClassName}` : ''}${closing ? ` ${closingClassName}` : ''}`
  const content = typeof children === 'function' ? children({ close }) : children
  const dialogProps = {
    role: 'dialog' as const,
    'aria-modal': true as const,
    'aria-label': ariaLabel,
    'aria-labelledby': ariaLabelledBy,
    'aria-describedby': ariaDescribedBy,
  }

  const modal = (
    <div ref={rootRef} className={stateClassName} style={rootStyle} {...(!panelClassName ? dialogProps : {})}>
      {backdropClassName ? (
        <Button variant="ghost" className={backdropClassName} onClick={close} disabled={!dismissible} aria-label={backdropLabel} />
      ) : null}
      {panelClassName ? (
        <div ref={panelRef} className={panelClassName} style={panelStyle} tabIndex={-1} {...dialogProps}>
          {content}
        </div>
      ) : content}
    </div>
  )

  // Les modales peuvent être déclenchées depuis des cartes utilisant
  // backdrop-filter. Ce filtre crée un nouveau repère pour position: fixed et
  // réduisait alors la fenêtre à la taille de la carte. Le portail garantit
  // un vrai overlay viewport, commun à tous les écrans et toutes les couches.
  return canUseDOM ? createPortal(modal, document.body) : null
}
