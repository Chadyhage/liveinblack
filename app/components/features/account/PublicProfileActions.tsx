'use client'

import { useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { Button, Select, Textarea, Label, Modal } from '@/app/components/ui'

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
        {!isSelf && <Button type="button" onClick={contact} disabled={busy} style={primary}>{busy ? 'Ouverture…' : 'Envoyer un message'}</Button>}
        <Button type="button" variant="secondary" onClick={share} style={secondary}>{copied ? 'Lien copié' : 'Partager'}</Button>
        {!isSelf && <Button type="button" variant="secondary" onClick={() => requireAuth() && setReportOpen(true)} style={secondary}>Signaler</Button>}
      </div>
      {status && !reportOpen && <p role="status" style={{ color: 'var(--text-muted)', fontSize: 12, margin: '8px 0 0' }}>{status}</p>}

      {reportOpen && (
        <Modal onClose={() => setReportOpen(false)} ariaLabel={`Signaler ${displayName}`}>
          <form onSubmit={submitReport}>
            <h2 id="profile-report-title" style={{ margin: '0 0 16px', fontSize: 21 }}>Signaler {displayName}</h2>
            <Label htmlFor="profile-report-reason" style={label}>Motif</Label>
            <Select
              id="profile-report-reason"
              value={reason}
              onChange={(value) => setReason(value)}
              options={[
                { value: 'faux profil', label: 'Faux profil' },
                { value: 'contenu trompeur', label: 'Contenu trompeur' },
                { value: 'contenu inapproprié', label: 'Contenu inapproprié' },
                { value: 'suspicion d’arnaque', label: 'Suspicion d’arnaque' },
                { value: 'usurpation d’identité', label: 'Usurpation d’identité' },
                { value: 'autre', label: 'Autre' },
              ]}
            />
            <Label htmlFor="profile-report-details" style={{ ...label, marginTop: 12 }}>Précisions facultatives</Label>
            <Textarea id="profile-report-details" value={details} onChange={(event) => setDetails(event.target.value)} maxLength={850} rows={4} style={input} />
            {status && <p role="status" style={{ color: status.startsWith('Merci') ? 'var(--teal)' : 'var(--pink)', fontSize: 12 }}>{status}</p>}
            <div style={{ display: 'flex', gap: 9, marginTop: 16 }}><Button type="button" variant="secondary" onClick={() => setReportOpen(false)} style={{ ...secondary, flex: 1 }}>Fermer</Button><Button type="submit" disabled={busy} style={{ ...primary, flex: 1 }}>{busy ? 'Envoi…' : 'Envoyer'}</Button></div>
          </form>
        </Modal>
      )}
    </>
  )
}

const primary: React.CSSProperties = { padding: '10px 15px', borderRadius: 10, border: 0, background: 'var(--teal-solid)', color: '#250817', fontWeight: 800, cursor: 'pointer' }
const secondary: React.CSSProperties = { padding: '10px 15px', borderRadius: 10, border: '1px solid var(--border-strong)', background: 'var(--surface)', color: 'var(--text)', fontWeight: 700, cursor: 'pointer' }
const label: React.CSSProperties = { display: 'block', fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }
const input: React.CSSProperties = { width: '100%', boxSizing: 'border-box', padding: '11px 12px', borderRadius: 10, border: '1px solid var(--border-strong)', background: 'var(--obsidian)', color: 'var(--text)' }
