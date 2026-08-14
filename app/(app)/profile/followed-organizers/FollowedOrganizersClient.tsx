'use client'

import { useState } from 'react'
import Link from 'next/link'
import OrganizerFollowButtonClient from '@/app/components/OrganizerFollowButtonClient'
import { ArrowLeft } from 'lucide-react'
import { ActionLink, Avatar, Button, Card, Checkbox, EmptyState, Pagination, pagedSlice } from '@/app/components/ui'
import { useQueryParamState } from '@/lib/client/useQueryParamState'

const PAGE_SIZE = 20

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

const DEFAULT_ALERTS: AlertSettings = {
  newEvent: true,
  ticketing: true,
  almostFull: true,
  scheduleChanges: true,
  newMedia: true,
  importantAnnouncements: true,
}

export default function FollowedOrganizersClient({ initialFollows, suggestions }: { initialFollows: FollowedOrganizerView[]; suggestions: OrganizerSuggestion[] }) {
  const [follows, setFollows] = useState(initialFollows)
  const [pageParam, setPageParam] = useQueryParamState<string>('page', '1')
  const page = Number(pageParam)
  const setPage = (n: number) => setPageParam(String(n))
  const { pageItems: pagedFollows, pageCount } = pagedSlice(follows, page, PAGE_SIZE)

  function remove(organizerId: string) {
    setFollows((list) => list.filter((f) => f.organizerId !== organizerId))
  }

  function patch(organizerId: string, next: Partial<Pick<FollowedOrganizerView, 'notificationsEnabled' | 'alerts'>>) {
    setFollows((list) => list.map((f) => (f.organizerId === organizerId ? { ...f, ...next } : f)))
  }

  // Suivre depuis "Organisateurs à suivre" ne renvoie que l'ID côté API — la
  // carte de suggestion connaît déjà nom/slug/ville, donc on les réutilise
  // pour insérer directement l'entrée ici plutôt que de re-fetch la liste.
  function addFollow(s: OrganizerSuggestion) {
    setFollows((list) =>
      list.some((f) => f.organizerId === s.organizerId)
        ? list
        : [
            ...list,
            {
              organizerId: s.organizerId,
              notificationsEnabled: true,
              alerts: DEFAULT_ALERTS,
              organizerName: s.name,
              organizerSlug: s.slug,
              organizerAvatarUrl: null,
              organizerCity: s.city,
              organizerCountry: s.country,
            },
          ]
    )
  }

  return (
    <main className="lb-dashboard-page">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <Link href="/profile" style={{ minHeight: 44, display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 14, fontWeight: 700, color: 'var(--text-muted)', textDecoration: 'none' }}>
            <ArrowLeft size={17} aria-hidden="true" />
            Profil
          </Link>
          <ActionLink href="/organizers">Découvrir</ActionLink>
        </div>

        <header>
          <h1 style={{ margin: 0, color: '#f5f5f7', fontSize: 'clamp(34px,5vw,48px)', fontWeight: 720, letterSpacing: '-.045em' }}>Organisateurs suivis</h1>
          <p style={{ maxWidth: 620, margin: '10px 0 0', color: 'rgba(245,245,247,.62)', fontSize: 15, lineHeight: 1.55 }}>Gère tes abonnements et choisis précisément les alertes que tu souhaites recevoir.</p>
        </header>

        {follows.length === 0 ? (
          <EmptyState
            title="Aucun organisateur suivi"
            description="Suis tes organisateurs préférés pour être alerté de leurs prochains événements."
            action={
              <Link
                href="/organizers"
                style={{ minHeight: 44, display: 'inline-flex', alignItems: 'center', padding: '11px 22px', borderRadius: 12, background: 'linear-gradient(180deg, var(--primary), var(--primary-strong))', color: 'var(--primary-ink)', fontWeight: 700, fontSize: 14, textDecoration: 'none' }}
              >
                Découvrir les organisateurs
              </Link>
            }
          />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 420px), 1fr))', gap: 12, alignItems: 'start' }}>
              {pagedFollows.map((f) => (
                <FollowCard key={f.organizerId} follow={f} onUnfollowed={() => remove(f.organizerId)} onPatch={(next) => patch(f.organizerId, next)} />
              ))}
            </div>
            <Pagination page={page} pageCount={pageCount} onPageChange={setPage} totalItems={follows.length} pageSize={PAGE_SIZE} />
          </div>
        )}

        {suggestions.length > 0 && (
          <div>
            <h2 style={{ fontSize: 'clamp(22px,4vw,34px)', fontWeight: 800, margin: '0 0 12px' }}>Organisateurs à suivre</h2>
            <div className="lb-card-grid">
              {suggestions
                .filter((s) => !follows.some((f) => f.organizerId === s.organizerId))
                .map((s) => (
                  <Card key={s.organizerId} style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <div>
                      <Link href={`/organizers/${s.slug}`} style={{ minHeight: 44, display: 'inline-flex', alignItems: 'center', fontSize: 15, fontWeight: 700, color: '#fff', textDecoration: 'none' }}>
                        {s.name}
                      </Link>
                      {(s.city || s.country) && <p style={{ fontSize: 11.5, color: 'var(--text-faint)', margin: '2px 0 0' }}>{[s.city, s.country].filter(Boolean).join(' · ')}</p>}
                    </div>
                    <OrganizerFollowButtonClient organizerId={s.organizerId} organizerName={s.name} initialFollowing={false} isAuthenticated compact onFollow={() => addFollow(s)} />
                  </Card>
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
    <Card>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <Avatar src={follow.organizerAvatarUrl} name={follow.organizerName} size="lg" style={{ width: 54, height: 54 }} />
        <div style={{ flex: 1, minWidth: 160 }}>
          <h2 style={{ fontSize: 20, fontWeight: 800, margin: 0 }}>{follow.organizerName}</h2>
          {(follow.organizerCity || follow.organizerCountry) && (
            <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '2px 0 0' }}>{[follow.organizerCity, follow.organizerCountry].filter(Boolean).join(' · ')}</p>
          )}
        </div>
        <Link
          href={`/organizers/${follow.organizerSlug}`}
          style={{ minHeight: 44, display: 'inline-flex', alignItems: 'center', padding: '9px 16px', borderRadius: 999, border: '1px solid var(--border-strong)', color: '#fff', fontSize: 14, fontWeight: 700, textDecoration: 'none' }}
        >
          Voir la page
        </Link>
        <OrganizerFollowButtonClient organizerId={follow.organizerId} organizerName={follow.organizerName} initialFollowing onUnfollow={onUnfollowed} isAuthenticated compact />
      </div>

      <div style={{ borderTop: '1px solid var(--border)', marginTop: 14, paddingTop: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
        <Checkbox
          label="Notifications de cet organisateur"
          checked={follow.notificationsEnabled}
          onChange={toggleMaster}
          disabled={savingMaster}
          style={{ fontSize: 13, color: '#fff' }}
        />
        <Button variant="link" onClick={() => setExpanded((v) => !v)} style={{ fontSize: 12.5 }}>
          {expanded ? 'Masquer les réglages' : 'Personnaliser les alertes'}
        </Button>
      </div>

      {expanded && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px,1fr))', gap: 8, marginTop: 12 }}>
          {ALERT_LABELS.map(({ key, label }) => (
            <Checkbox
              key={key}
              label={label}
              checked={follow.alerts[key]}
              onChange={() => toggleAlert(key)}
              style={{ fontSize: 12.5, color: '#fff', background: 'rgba(255,255,255,0.04)', borderRadius: 10, padding: '9px 12px' }}
            />
          ))}
        </div>
      )}
    </Card>
  )
}
