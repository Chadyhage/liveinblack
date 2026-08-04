'use client'

import { useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Image from 'next/image'
import { fmtMoney } from '@/lib/shared/money'
import { Button, Textarea, Label } from '@/app/components/ui'

// Port de src/pages/PublicPrestatairePage.jsx (openServiceInquiry /
// sendServiceInquiry) — "Demander ce service" par item de catalogue, sur la
// page publique d'un prestataire. Ferme un intégration morte de la
// migration : l'entrée point n'existait tout simplement pas ici, et le
// serveur rejetait de toute façon le type 'catalog_item' (voir
// lib/server/messaging.ts SENDABLE_TYPES) même s'il avait existé.
//
// Contrairement au legacy (modale d'auth inline via openAuthModal, la
// conversation créée puis le message envoyé restent dans le même geste
// utilisateur), l'absence de session redirige vers /login?next=... — même
// convention que ProviderReviewsClient.tsx sur cette même page. Le contenu
// réel du message 'catalog_item' n'est JAMAIS construit ici : ce composant
// n'envoie que `catalogItemId`, le serveur reconstruit le payload depuis le
// VRAI catalogue Mongo du prestataire (voir sendMessage) — impossible de
// forger un nom/prix arbitraire ou de référencer l'item d'un AUTRE
// prestataire depuis le client.

const FONT = 'Inter, system-ui, sans-serif'

const inquiryBtn: React.CSSProperties = {
  flex: '1 1 160px',
  minHeight: 40,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 7,
  padding: '9px 12px',
  borderRadius: 3,
  border: '1px solid var(--border-strong)',
  background: 'var(--violet-cta)',
  color: 'var(--primary-ink)',
  fontFamily: FONT,
  fontSize: 12,
  fontWeight: 500,
  textTransform: 'none',
  letterSpacing: 'normal',
  cursor: 'pointer',
}
const primaryBtn: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 8,
  minHeight: 46,
  padding: '12px 18px',
  borderRadius: 3,
  border: '1px solid var(--border-strong)',
  cursor: 'pointer',
  background: 'var(--violet-cta)',
  color: 'var(--primary-ink)',
  fontFamily: FONT,
  fontSize: 13,
  fontWeight: 500,
  textTransform: 'none',
  letterSpacing: 'normal',
}
const ghostBtn: React.CSSProperties = {
  flex: 1,
  minHeight: 46,
  borderRadius: 12,
  border: '1px solid var(--border-strong)',
  background: 'var(--surface)',
  color: 'var(--text)',
  fontFamily: FONT,
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
}
const disabledBtn: React.CSSProperties = { opacity: 0.5, cursor: 'not-allowed' }

async function apiFetch<T>(url: string, init?: RequestInit): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  try {
    const res = await fetch(url, init)
    const data = await res.json().catch(() => ({}))
    if (!res.ok || data?.ok === false) return { ok: false, error: data?.error ?? 'unknown_error' }
    return { ok: true, data: data as T }
  } catch {
    return { ok: false, error: 'network_error' }
  }
}

const ERROR_MESSAGES: Record<string, string> = {
  blocked: 'Impossible de contacter ce prestataire.',
  cannot_message_self: 'Tu ne peux pas t’envoyer un message à toi-même.',
  user_not_found: 'Ce prestataire est introuvable.',
  catalog_item_not_found: 'Cette offre n’est plus disponible — actualise la page.',
}
const GENERIC_ERROR = 'Une erreur est survenue — réessaie dans un instant.'

export interface CatalogInquiryItem {
  id: string
  name: string
  description?: string
  price?: number | null
  currency?: string
  unit?: string
  category?: string
  image?: string | null
}

export default function ProviderCatalogInquiry({
  providerId,
  providerName,
  isAuthenticated,
  item,
  catalogDefaultCurrency,
}: {
  providerId: string
  providerName: string
  isAuthenticated: boolean
  item: CatalogInquiryItem
  catalogDefaultCurrency: string
}) {
  const router = useRouter()
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')

  function openSheet() {
    if (!isAuthenticated) {
      router.push(`/login?next=${encodeURIComponent(pathname)}`)
      return
    }
    setText(`Bonjour ${providerName || ''}, je suis intéressé par « ${item.name} ». Peux-tu me donner plus d'informations ?`)
    setError('')
    setOpen(true)
  }

  function closeSheet() {
    if (sending) return
    setOpen(false)
    setText('')
    setError('')
  }

  async function handleSend() {
    if (sending) return
    setSending(true)
    setError('')

    const convRes = await apiFetch<{ conversation: { id: string } }>('/api/conversations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ otherUserId: providerId }),
    })
    if (!convRes.ok) {
      setError(ERROR_MESSAGES[convRes.error] ?? GENERIC_ERROR)
      setSending(false)
      return
    }
    const conversationId = convRes.data.conversation.id

    const catalogRes = await apiFetch(`/api/conversations/${conversationId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'catalog_item', content: '', catalogItemId: item.id }),
    })
    if (!catalogRes.ok) {
      setError(ERROR_MESSAGES[catalogRes.error] ?? GENERIC_ERROR)
      setSending(false)
      return
    }

    const trimmed = text.trim()
    if (trimmed) {
      const textRes = await apiFetch(`/api/conversations/${conversationId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'text', content: trimmed }),
      })
      if (!textRes.ok) {
        // La fiche du service est déjà envoyée (étape précédente réussie) —
        // on ne bloque pas la navigation, mais un window.alert() natif
        // jurerait avec le sheet custom du reste du composant. On réutilise
        // le même encart d'erreur inline que les autres échecs ci-dessus, le
        // temps qu'il soit visible avant la redirection vers la conversation.
        setError('La demande a été envoyée, mais ton message n’a pas pu être transmis. Tu pourras le renvoyer depuis la conversation.')
        setSending(false)
        await new Promise((resolve) => setTimeout(resolve, 1600))
      }
    }

    router.push(`/messages?conversationId=${encodeURIComponent(conversationId)}`)
  }

  return (
    <>
      <Button type="button" onClick={openSheet} style={inquiryBtn}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z" />
        </svg>
        Demander ce service
      </Button>

      {open && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 3200, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(3,4,8,.72)', backdropFilter: 'blur(8px)' }} onClick={closeSheet} />
          <div
            style={{
              position: 'relative',
              width: 'min(100%, 520px)',
              maxHeight: '88vh',
              overflowY: 'auto',
              borderRadius: '20px 20px 0 0',
              background: 'var(--surface-2)',
              border: '1px solid var(--border)',
              boxShadow: '0 -26px 80px rgba(0,0,0,.65)',
              padding: '18px 18px 24px',
            }}
          >
            <div style={{ width: 44, height: 4, borderRadius: 999, background: 'var(--border-strong)', margin: '0 auto 16px' }} />
            <p style={{ fontFamily: 'var(--font-display), sans-serif', fontSize: 14, fontWeight: 400, letterSpacing: '3.2px', textTransform: 'uppercase', color: 'var(--gold)', margin: '0 0 7px' }}>
              Demande au prestataire
            </p>
            <h3 style={{ fontFamily: FONT, fontSize: 22, lineHeight: 1.1, letterSpacing: '-.6px', margin: '0 0 14px', color: 'var(--text)' }}>
              Envoyer ce service à {providerName}
            </h3>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: item.image ? '70px 1fr' : '1fr',
                gap: 13,
                padding: 12,
                borderRadius: 16,
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                marginBottom: 14,
              }}
            >
              {item.image && (
                <div style={{ width: 70, height: 70, borderRadius: 12, overflow: 'hidden', background: 'var(--surface-2)' }}>
                  <Image src={item.image} alt="" width={70} height={70} style={{ objectFit: 'cover' }} />
                </div>
              )}
              <div style={{ minWidth: 0 }}>
                {item.category && (
                  <p style={{ fontFamily: FONT, fontSize: 10.5, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--teal)', margin: '0 0 5px' }}>
                    {item.category}
                  </p>
                )}
                <p style={{ fontFamily: FONT, fontSize: 16, fontWeight: 700, color: 'var(--text)', margin: 0, lineHeight: 1.2 }}>{item.name}</p>
                <p style={{ fontFamily: FONT, fontSize: 13, fontWeight: 800, color: 'var(--gold)', margin: '8px 0 0' }}>
                  {Number(item.price) > 0 ? `${fmtMoney(Number(item.price), item.currency || catalogDefaultCurrency)}${item.unit ? ` / ${item.unit}` : ''}` : 'Tarif sur demande'}
                </p>
              </div>
            </div>

            <Label style={{ display: 'block', fontFamily: FONT, fontSize: 12, fontWeight: 600, letterSpacing: '.04em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 8 }}>
              Message
            </Label>
            <Textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={4}
              placeholder="Ajoute ta date, ton lieu, ton budget ou ta question…"
              style={{
                minHeight: 100,
                borderRadius: 12,
                border: '1px solid var(--border)',
                background: 'var(--obsidian)',
                color: 'var(--text)',
                padding: 14,
                fontFamily: FONT,
                fontSize: 14,
                lineHeight: 1.55,
              }}
            />
            <p style={{ fontFamily: FONT, fontSize: 11, lineHeight: 1.55, color: 'var(--text-faint)', margin: '9px 0 16px' }}>
              Le prestataire recevra la fiche du service dans la conversation, puis ton message. Vous gérez ensuite les conditions et le paiement entre vous.
            </p>

            {error && (
              <p role="alert" style={{ fontFamily: FONT, fontSize: 12.5, color: '#ff8fb2', background: 'rgba(194,52,127,.12)', border: '1px solid rgba(194,52,127,.4)', borderRadius: 10, padding: '10px 12px', margin: '0 0 12px' }}>
                {error}
              </p>
            )}

            <div style={{ display: 'flex', gap: 10 }}>
              <Button type="button" variant="secondary" onClick={closeSheet} disabled={sending} style={{ ...ghostBtn, ...(sending ? disabledBtn : null) }}>
                Annuler
              </Button>
              <Button
                type="button"
                onClick={handleSend}
                loading={sending}
                loadingText="Envoi…"
                style={{ ...primaryBtn, flex: 1.6, ...(sending ? disabledBtn : null) }}
              >
                Envoyer la demande
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
