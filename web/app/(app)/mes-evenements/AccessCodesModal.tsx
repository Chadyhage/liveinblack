'use client'

import { useState } from 'react'

interface AccessCodesModalProps {
  event: { id: string; name: string }
  onClose: () => void
}

interface AccessCodesGenerateResponse {
  ok: true
  codes: string[]
}

interface ApiErrorResponse {
  error?: string
}

const GENERATE_ERROR_MESSAGES: Record<string, string> = {
  forbidden: "Tu n'as pas accès à cet événement.",
  event_not_found: 'Événement introuvable.',
  event_not_private: "Cet événement n'est pas en accès privé.",
}

function Spinner({ size = 14, color = '#181206' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" style={{ display: 'inline-block' }} aria-hidden="true">
      <circle cx="12" cy="12" r="9" fill="none" stroke="rgba(0,0,0,0.2)" strokeWidth={3} />
      <path d="M21 12a9 9 0 00-9-9" fill="none" stroke={color} strokeWidth={3} strokeLinecap="round">
        <animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="0.8s" repeatCount="indefinite" />
      </path>
    </svg>
  )
}

export default function AccessCodesModal({ event, onClose }: AccessCodesModalProps) {
  const [qty, setQty] = useState('')
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState('')
  const [codes, setCodes] = useState<string[] | null>(null)
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null)
  const [allCopied, setAllCopied] = useState(false)

  async function generateCodes() {
    if (generating) return
    const parsed = Number(qty)
    const count = Number.isFinite(parsed) && parsed > 0 ? Math.min(100, Math.floor(parsed)) : 10
    setGenerating(true)
    setError('')
    try {
      const res = await fetch(`/api/organizer-events/${event.id}/access-codes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ count }),
      })
      const data = (await res.json().catch(() => null)) as (AccessCodesGenerateResponse & ApiErrorResponse) | null
      if (!res.ok || !data?.ok) {
        setError(GENERATE_ERROR_MESSAGES[data?.error ?? ''] ?? 'Impossible de générer les codes.')
        return
      }
      setCodes(data.codes)
    } catch {
      setError('Impossible de générer les codes.')
    } finally {
      setGenerating(false)
    }
  }

  async function copyOneCode(code: string, idx: number) {
    try {
      await navigator.clipboard.writeText(code)
      setCopiedIdx(idx)
      setTimeout(() => {
        setCopiedIdx((prev) => (prev === idx ? null : prev))
      }, 2000)
    } catch {
      // Clipboard access denied — silently ignore, matching legacy behavior.
    }
  }

  async function copyAllCodes() {
    if (!codes) return
    try {
      await navigator.clipboard.writeText(codes.join('\n'))
      setAllCopied(true)
      setTimeout(() => setAllCopied(false), 2000)
    } catch {
      // Clipboard access denied — silently ignore, matching legacy behavior.
    }
  }

  function backToGeneration() {
    setCodes(null)
    setError('')
    setAllCopied(false)
    setCopiedIdx(null)
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 3000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(3,4,8,0.72)', backdropFilter: 'blur(8px)' }} onClick={onClose} />
      <div
        style={{
          position: 'relative',
          width: '100%',
          maxWidth: 420,
          maxHeight: '88vh',
          overflowY: 'auto',
          background: '#12131c',
          border: '1px solid rgba(255,255,255,0.10)',
          borderRadius: 20,
          padding: 22,
          boxShadow: '0 24px 64px rgba(0,0,0,0.55)',
        }}
      >
        <button
          onClick={onClose}
          aria-label="Fermer"
          style={{ position: 'absolute', top: 14, right: 16, background: 'none', border: 0, color: 'rgba(255,255,255,0.5)', fontSize: 26, cursor: 'pointer', lineHeight: 1 }}
        >
          ×
        </button>

        <div style={{ marginBottom: 16, paddingRight: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--gold)" strokeWidth={1.5}>
              <rect x="3" y="11" width="18" height="11" rx="2" />
              <path d="M7 11V7a5 5 0 0110 0v4" />
            </svg>
            <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 20, fontWeight: 700, color: 'rgba(255,255,255,0.93)', margin: 0 }}>Codes d&apos;accès</p>
          </div>
          <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 13, color: 'rgba(255,255,255,0.55)', lineHeight: 1.6, margin: 0 }}>
            Génère des codes uniques pour <span style={{ color: 'var(--gold)' }}>{event.name}</span>
          </p>
        </div>

        {!codes ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <label style={{ display: 'block', fontFamily: 'Inter, sans-serif', fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.55)', marginBottom: 6 }}>
                Nombre de codes à générer
              </label>
              <input
                type="number"
                value={qty}
                onChange={(e) => setQty(e.target.value)}
                placeholder="10"
                min={1}
                max={100}
                style={{
                  width: '100%',
                  boxSizing: 'border-box',
                  background: 'rgba(255,255,255,0.06)',
                  border: '1px solid rgba(255,255,255,0.12)',
                  borderRadius: 10,
                  padding: '10px 12px',
                  color: '#fff',
                  fontFamily: 'Inter, sans-serif',
                  fontSize: 14,
                }}
              />
              <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, color: 'rgba(255,255,255,0.45)', marginTop: 4 }}>100 codes maximum par génération</p>
            </div>
            {error && <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, color: 'rgba(220,100,100,0.9)', margin: 0 }}>{error}</p>}
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={onClose}
                style={{
                  flex: 1,
                  padding: 12,
                  borderRadius: 10,
                  cursor: 'pointer',
                  background: 'rgba(255,255,255,0.08)',
                  border: '1px solid rgba(255,255,255,0.14)',
                  color: 'rgba(255,255,255,0.9)',
                  fontFamily: 'Inter, sans-serif',
                  fontSize: 13,
                  fontWeight: 600,
                }}
              >
                Annuler
              </button>
              <button
                onClick={generateCodes}
                disabled={generating}
                style={{
                  flex: 1,
                  padding: 12,
                  borderRadius: 10,
                  border: 'none',
                  cursor: generating ? 'not-allowed' : 'pointer',
                  background: generating ? 'rgba(255,255,255,0.07)' : 'var(--gold)',
                  color: generating ? 'rgba(255,255,255,0.35)' : '#181206',
                  fontFamily: 'Inter, sans-serif',
                  fontSize: 13,
                  fontWeight: 700,
                }}
              >
                {generating ? (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, justifyContent: 'center' }}>
                    <Spinner size={14} />
                    Génération…
                  </span>
                ) : (
                  'Générer'
                )}
              </button>
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(78,232,200,0.35)', borderRadius: 12, padding: '10px 14px' }}>
              <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 13, fontWeight: 600, color: 'var(--teal)', margin: 0 }}>{codes.length} codes générés</p>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 240, overflowY: 'auto' }}>
              {codes.map((code, idx) => (
                <div
                  key={code}
                  style={{
                    background: 'rgba(255,255,255,0.04)',
                    border: '1px solid rgba(255,255,255,0.07)',
                    borderRadius: 12,
                    padding: '8px 12px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 8,
                  }}
                >
                  <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 14, fontWeight: 600, color: 'var(--gold)', letterSpacing: '0.05em', textTransform: 'uppercase' }}>{code}</span>
                  <button
                    onClick={() => copyOneCode(code, idx)}
                    style={{
                      padding: '8px 14px',
                      borderRadius: 10,
                      cursor: 'pointer',
                      background: copiedIdx === idx ? '#3ed6b5' : 'rgba(255,255,255,0.08)',
                      border: copiedIdx === idx ? 'none' : '1px solid rgba(255,255,255,0.14)',
                      color: copiedIdx === idx ? '#04120e' : 'rgba(255,255,255,0.9)',
                      fontFamily: 'Inter, sans-serif',
                      fontSize: 12,
                      fontWeight: 600,
                      flexShrink: 0,
                    }}
                  >
                    {copiedIdx === idx ? 'Copié' : 'Copier'}
                  </button>
                </div>
              ))}
            </div>
            <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, color: 'rgba(255,255,255,0.5)', lineHeight: 1.6, margin: 0 }}>
              Copie et envoie ces codes à tes invités. Chaque code ne peut être utilisé qu&apos;une seule fois.
            </p>
            <button
              onClick={copyAllCodes}
              style={{
                width: '100%',
                padding: 12,
                borderRadius: 10,
                border: 'none',
                cursor: 'pointer',
                background: 'var(--gold)',
                color: '#181206',
                fontFamily: 'Inter, sans-serif',
                fontSize: 13,
                fontWeight: 700,
              }}
            >
              {allCopied ? 'Tous les codes copiés' : 'Copier tous les codes'}
            </button>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={backToGeneration}
                style={{
                  flex: 1,
                  padding: 12,
                  borderRadius: 10,
                  cursor: 'pointer',
                  background: 'rgba(255,255,255,0.08)',
                  border: '1px solid rgba(255,255,255,0.14)',
                  color: 'rgba(255,255,255,0.9)',
                  fontFamily: 'Inter, sans-serif',
                  fontSize: 13,
                  fontWeight: 600,
                }}
              >
                Générer d&apos;autres codes
              </button>
              <button
                onClick={onClose}
                style={{
                  flex: 1,
                  padding: 12,
                  borderRadius: 10,
                  cursor: 'pointer',
                  background: 'rgba(255,255,255,0.08)',
                  border: '1px solid rgba(255,255,255,0.14)',
                  color: 'rgba(255,255,255,0.9)',
                  fontFamily: 'Inter, sans-serif',
                  fontSize: 13,
                  fontWeight: 600,
                }}
              >
                Fermer
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
