'use client'

import { useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'

export default function PublicProfileActions({ targetUserId, displayName, isAuthenticated, isSelf }: { targetUserId: string; displayName: string; isAuthenticated: boolean; isSelf: boolean }) {
  const router = useRouter()
  const pathname = usePathname()
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)
  const [reportOpen, setReportOpen] = useState(false)
  const [reason, setReason] = useState('contenu trompeur')
  const [details, setDetails] = useState('')
  const [status, setStatus] = useState('')

  function requireAuth() {
    if (isAuthenticated) return true
    router.push(`/login?next=${encodeURIComponent(pathname)}`)
    return false
  }

  async function contact() {
    if (!requireAuth() || busy) return
    setBusy(true)
    try {
      const response = await fetch('/api/conversations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ otherUserId: targetUserId }) })
      const data = await response.json().catch(() => null) as { conversation?: { id?: string } } | null
      if (response.ok && data?.conversation?.id) router.push(`/messages?conversationId=${encodeURIComponent(data.conversation.id)}`)
      else setStatus('Impossible d’ouvrir la conversation.')
    } catch {
      setStatus('Connexion impossible. Réessaie.')
    } finally {
      setBusy(false)
    }
  }

  async function share() {
    const payload = { title: `${displayName} — LIVEINBLACK`, text: `Découvre ${displayName} sur LIVEINBLACK`, url: window.location.href }
    try {
      if (navigator.share) await navigator.share(payload)
      else {
        await navigator.clipboard.writeText(payload.url)
        setCopied(true)
        setTimeout(() => setCopied(false), 1800)
      }
    } catch {
      // Annulation du partage natif: aucun message d'erreur nécessaire.
    }
  }

  async function submitReport(event: React.FormEvent) {
    event.preventDefault()
    if (!requireAuth() || busy) return
    setBusy(true)
    setStatus('')
    try {
      const response = await fetch('/api/users/report', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ targetUserId, reason: [reason, details.trim()].filter(Boolean).join(' — ') }) })
      if (!response.ok) throw new Error('report_failed')
      setStatus('Merci, le signalement a été transmis.')
      setDetails('')
    } catch {
      setStatus('Impossible d’envoyer le signalement.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 14 }}>
        {!isSelf && <button type="button" onClick={contact} disabled={busy} style={primary}>{busy ? 'Ouverture…' : 'Envoyer un message'}</button>}
        <button type="button" onClick={share} style={secondary}>{copied ? 'Lien copié' : 'Partager'}</button>
        {!isSelf && <button type="button" onClick={() => requireAuth() && setReportOpen(true)} style={secondary}>Signaler</button>}
      </div>
      {status && !reportOpen && <p role="status" style={{ color: 'var(--text-muted)', fontSize: 12, margin: '8px 0 0' }}>{status}</p>}

      {reportOpen && (
        <div role="dialog" aria-modal="true" aria-labelledby="profile-report-title" style={{ position: 'fixed', inset: 0, zIndex: 90, background: 'rgba(3,4,8,.78)', display: 'grid', placeItems: 'center', padding: 20 }} onClick={() => setReportOpen(false)}>
          <form onSubmit={submitReport} onClick={(event) => event.stopPropagation()} style={{ width: '100%', maxWidth: 430, padding: 24, borderRadius: 18, background: 'var(--surface-2)', border: '1px solid var(--border-strong)' }}>
            <h2 id="profile-report-title" style={{ margin: '0 0 16px', fontSize: 21 }}>Signaler {displayName}</h2>
            <label htmlFor="profile-report-reason" style={label}>Motif</label>
            <select id="profile-report-reason" value={reason} onChange={(event) => setReason(event.target.value)} style={input}>
              <option value="faux profil">Faux profil</option><option value="contenu trompeur">Contenu trompeur</option><option value="contenu inapproprié">Contenu inapproprié</option><option value="suspicion d’arnaque">Suspicion d’arnaque</option><option value="usurpation d’identité">Usurpation d’identité</option><option value="autre">Autre</option>
            </select>
            <label htmlFor="profile-report-details" style={{ ...label, marginTop: 12 }}>Précisions facultatives</label>
            <textarea id="profile-report-details" value={details} onChange={(event) => setDetails(event.target.value)} maxLength={850} rows={4} style={{ ...input, resize: 'vertical' }} />
            {status && <p role="status" style={{ color: status.startsWith('Merci') ? 'var(--teal)' : 'var(--pink)', fontSize: 12 }}>{status}</p>}
            <div style={{ display: 'flex', gap: 9, marginTop: 16 }}><button type="button" onClick={() => setReportOpen(false)} style={{ ...secondary, flex: 1 }}>Fermer</button><button type="submit" disabled={busy} style={{ ...primary, flex: 1 }}>{busy ? 'Envoi…' : 'Envoyer'}</button></div>
          </form>
        </div>
      )}
    </>
  )
}

const primary: React.CSSProperties = { padding: '10px 15px', borderRadius: 10, border: 0, background: 'var(--teal-solid)', color: '#04120e', fontWeight: 800, cursor: 'pointer' }
const secondary: React.CSSProperties = { padding: '10px 15px', borderRadius: 10, border: '1px solid var(--border-strong)', background: 'var(--surface)', color: 'var(--text)', fontWeight: 700, cursor: 'pointer' }
const label: React.CSSProperties = { display: 'block', fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }
const input: React.CSSProperties = { width: '100%', boxSizing: 'border-box', padding: '11px 12px', borderRadius: 10, border: '1px solid var(--border-strong)', background: 'var(--obsidian)', color: 'var(--text)' }
