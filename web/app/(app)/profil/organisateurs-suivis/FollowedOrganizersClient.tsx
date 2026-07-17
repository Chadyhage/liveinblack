'use client'

import { useState } from 'react'
import Link from 'next/link'
import OrganizerFollowButtonClient from '@/app/components/OrganizerFollowButtonClient'

// Port de src/pages/FollowedOrganizersPage.jsx (#6 phase profil).

interface AlertSettings {
  newEvent: boolean
  ticketing: boolean
  almostFull: boolean
  scheduleChanges: boolean
  newMedia: boolean
  importantAnnouncements: boolean
}

export interface FollowedOrganizerView {
  organizerId: string
  notificationsEnabled: boolean
  alerts: AlertSettings
  organizerName: string
  organizerSlug: string
  organizerAvatarUrl: string | null
  organizerCity: string | null
  organizerCountry: string | null
}

export interface OrganizerSuggestion {
  organizerId: string
  name: string
  slug: string
  city: string | null
  country: string | null
}

const ALERT_LABELS: { key: keyof AlertSettings; label: string }[] = [
  { key: 'newEvent', label: 'Nouvel événement publié' },
  { key: 'ticketing', label: 'Ouverture billetterie' },
  { key: 'almostFull', label: 'Événement bientôt complet' },
  { key: 'scheduleChanges', label: 'Annulation / report' },
  { key: 'newMedia', label: 'Nouveaux médias publiés' },
  { key: 'importantAnnouncements', label: 'Annonces importantes' },
]

const cardStyle: React.CSSProperties = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: 18 }

export default function FollowedOrganizersClient({ initialFollows, suggestions }: { initialFollows: FollowedOrganizerView[]; suggestions: OrganizerSuggestion[] }) {
  const [follows, setFollows] = useState(initialFollows);

  function remove(organizerId: string) {
    setFollows((list) => list.filter((f) => f.organizerId !== organizerId))
  }

  function patch(organizerId: string, next: Partial<Pick<FollowedOrganizerView, 'notificationsEnabled' | 'alerts'>>) {
    setFollows((list) => list.map((f) => (f.organizerId === organizerId ? { ...f, ...next } : f)))
  }

  return (
    <main style={{ minHeight: '100vh', padding: '34px 18px 110px' }}>
      <div style={{ maxWidth: 820, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 22 }}>
        <div>
          <Link href="/profil" style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.6)', textDecoration: 'none' }}>
            ← Retour au profil
          </Link>
          <h1 style={{ fontSize: 'clamp(36px,7vw,56px)', fontWeight: 800, margin: '10px 0 0', fontFamily: 'inherit' }}>Organisateurs suivis</h1>
          <p style={{ fontSize: 13.5, color: 'rgba(255,255,255,0.48)', margin: '6px 0 0' }}>Gère tes abonnements et choisis précisément les alertes que tu veux recevoir.</p>
        </div>

        {follows.length === 0 ? (
          <div style={{ ...cardStyle, textAlign: 'center', padding: '48px 24px' }}>
            <div style={{ width: 56, height: 56, borderRadius: '50%', margin: '0 auto 16px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.06)' }}>
              <IconUsers />
            </div>
            <p style={{ fontWeight: 700, fontSize: 16, color: '#fff', margin: '0 0 6px' }}>Aucun organisateur suivi</p>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '0 0 18px' }}>Suis tes organisateurs préférés pour être alerté de leurs prochains événements.</p>
            <Link
              href="/organisateurs"
              style={{ display: 'inline-block', padding: '11px 22px', borderRadius: 10, background: 'linear-gradient(180deg,#d8bd8a,#c8a96e)', color: '#1a1508', fontWeight: 700, fontSize: 14, textDecoration: 'none' }}
            >
              Découvrir les organisateurs
            </Link>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {follows.map((f) => (
              <FollowCard key={f.organizerId} follow={f} onUnfollowed={() => remove(f.organizerId)} onPatch={(next) => patch(f.organizerId, next)} />
            ))}
          </div>
        )}

        {suggestions.length > 0 && (
          <div>
            <h2 style={{ fontSize: 'clamp(22px,4vw,34px)', fontWeight: 800, margin: '0 0 12px' }}>Organisateurs à suivre</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px,1fr))', gap: 12 }}>
              {suggestions.map((s) => (
                <div key={s.organizerId} style={{ ...cardStyle, padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div>
                    <Link href={`/organisateurs/${s.slug}`} style={{ fontSize: 14.5, fontWeight: 700, color: '#fff', textDecoration: 'none' }}>
                      {s.name}
                    </Link>
                    {(s.city || s.country) && <p style={{ fontSize: 11.5, color: 'var(--text-faint)', margin: '2px 0 0' }}>{[s.city, s.country].filter(Boolean).join(' · ')}</p>}
                  </div>
                  <OrganizerFollowButtonClient organizerId={s.organizerId} organizerName={s.name} initialFollowing={false} isAuthenticated compact />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </main>
  )
}

function FollowCard({
  follow,
  onUnfollowed,
  onPatch,
}: {
  follow: FollowedOrganizerView
  onUnfollowed: () => void
  onPatch: (next: Partial<Pick<FollowedOrganizerView, 'notificationsEnabled' | 'alerts'>>) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const [savingMaster, setSavingMaster] = useState(false)

  async function toggleMaster() {
    const next = !follow.notificationsEnabled
    setSavingMaster(true)
    onPatch({ notificationsEnabled: next })
    try {
      await fetch(`/api/organizers/${follow.organizerId}/follow/alerts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notificationsEnabled: next }),
      })
    } finally {
      setSavingMaster(false)
    }
  }

  async function toggleAlert(key: keyof AlertSettings) {
    const nextAlerts = { ...follow.alerts, [key]: !follow.alerts[key] }
    onPatch({ alerts: nextAlerts })
    await fetch(`/api/organizers/${follow.organizerId}/follow/alerts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [key]: nextAlerts[key] }),
    })
  }

  return (
    <section style={cardStyle}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div
          style={{
            width: 54,
            height: 54,
            borderRadius: '50%',
            background: follow.organizerAvatarUrl ? `url(${follow.organizerAvatarUrl}) center/cover` : '#111',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 20,
            fontWeight: 800,
            color: 'var(--teal)',
            flexShrink: 0,
          }}
        >
          {!follow.organizerAvatarUrl && follow.organizerName[0]?.toUpperCase()}
        </div>
        <div style={{ flex: 1, minWidth: 160 }}>
          <h2 style={{ fontSize: 20, fontWeight: 800, margin: 0 }}>{follow.organizerName}</h2>
          {(follow.organizerCity || follow.organizerCountry) && (
            <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '2px 0 0' }}>{[follow.organizerCity, follow.organizerCountry].filter(Boolean).join(' · ')}</p>
          )}
        </div>
        <Link
          href={`/organisateurs/${follow.organizerSlug}`}
          style={{ padding: '9px 16px', borderRadius: 999, border: '1px solid var(--border-strong)', color: '#fff', fontSize: 12.5, fontWeight: 700, textDecoration: 'none' }}
        >
          Voir la page
        </Link>
        <OrganizerFollowButtonClient organizerId={follow.organizerId} organizerName={follow.organizerName} initialFollowing onUnfollow={onUnfollowed} isAuthenticated compact />
      </div>

      <div style={{ borderTop: '1px solid var(--border)', marginTop: 14, paddingTop: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#fff', cursor: 'pointer' }}>
          <input type="checkbox" checked={follow.notificationsEnabled} onChange={toggleMaster} disabled={savingMaster} />
          Notifications de cet organisateur
        </label>
        <button onClick={() => setExpanded((v) => !v)} style={{ background: 'transparent', border: 'none', color: 'var(--teal)', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>
          {expanded ? 'Masquer les réglages' : 'Personnaliser les alertes'}
        </button>
      </div>

      {expanded && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px,1fr))', gap: 8, marginTop: 12 }}>
          {ALERT_LABELS.map(({ key, label }) => (
            <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: '#fff', background: 'rgba(255,255,255,0.04)', borderRadius: 10, padding: '9px 12px', cursor: 'pointer' }}>
              <input type="checkbox" checked={follow.alerts[key]} onChange={() => toggleAlert(key)} />
              {label}
            </label>
          ))}
        </div>
      )}
    </section>
  )
}

function IconUsers() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.55)" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
    </svg>
  )
}
