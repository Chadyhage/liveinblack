'use client'

import { AlertCircle, CheckCircle2, Info } from 'lucide-react'
import styles from './ToastViewport.module.css'

export type ToastViewportKind = 'success' | 'error' | 'info'
export interface ToastViewportItem { id: string | number; message: string; kind?: ToastViewportKind }

export default function ToastViewport({ items }: { items: ToastViewportItem[] }) {
  if (!items.length) return null
  return (
    <div className={styles.viewport} aria-live="polite" aria-atomic="false">
      {items.map((item) => {
        const kind = item.kind || 'info'
        const Icon = kind === 'success' ? CheckCircle2 : kind === 'error' ? AlertCircle : Info
        return (
          <div key={item.id} className={`${styles.toast} ${styles[kind]}`} role={kind === 'error' ? 'alert' : 'status'}>
            <Icon size={18} aria-hidden="true" />
            <span>{item.message}</span>
          </div>
        )
      })}
    </div>
  )
}
