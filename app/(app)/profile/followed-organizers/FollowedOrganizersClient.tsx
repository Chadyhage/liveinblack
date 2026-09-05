'use client'

import { useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import OrganizerFollowButtonClient from '@/app/components/features/organizer/OrganizerFollowButtonClient'
import { ArrowLeft, UsersRound } from 'lucide-react'
import { ActionLink, Avatar, Button, Card, Checkbox, Pagination, pagedSlice } from '@/app/components/ui'
import { useQueryParamState } from '@/lib/client/useQueryParamState'
import { placeholderPhotoUrl } from '@/lib/shared/placeholderImage'
import styles from './FollowedOrganizersClient.module.css'

const PAGE_SIZE = 24

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
  organizerBannerUrl: string | null
  organizerCity: string | null
  organizerCountry: string | null
}

export interface OrganizerSuggestion {
  organizerId: string
  name: string
  slug: string
  city: string | null
  country: string | null
  avatarUrl: string | null
  bannerUrl: string | null
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
  const visibleSuggestions = suggestions.filter((s) => !follows.some((f) => f.organizerId === s.organizerId))

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
              organizerAvatarUrl: s.avatarUrl,
              organizerBannerUrl: s.bannerUrl,
              organizerCity: s.city,
              organizerCountry: s.country,
            },
          ]
    )
  }

  return (
    <main className={`lb-dashboard-page ${styles.page}`}>
      <div className={styles.stack}>
        <div className={styles.topbar}>
          <Link href="/profile" className={styles.backLink}>
            <ArrowLeft size={17} aria-hidden="true" />
            Profil
          </Link>
          {follows.length > 0 && <ActionLink href="/organizers">Découvrir</ActionLink>}
        </div>

        <header className={styles.intro}>
          <div>
            <h1>Organisateurs suivis</h1>
            <p>Gère tes abonnements et les alertes que tu souhaites recevoir.</p>
          </div>
          <span className={styles.count}>{follows.length} suivi{follows.length > 1 ? 's' : ''}</span>
        </header>

        {follows.length === 0 ? (
          <div className={styles.emptyPanel}>
            <span className={styles.emptyIcon}><UsersRound size={22} aria-hidden="true" /></span>
            <div>
              <h2>Construis ta sélection</h2>
              <p>Suis tes organisateurs préférés pour retrouver leurs soirées et recevoir uniquement les alertes utiles.</p>
            </div>
            <Link href="/organizers" className={styles.emptyAction}>Explorer l’annuaire</Link>
          </div>
        ) : (
          <section className={styles.section}>
            <div className={styles.sectionHeader}>
              <div>
                <h2>Mes abonnements</h2>
                <p>Ouvre une carte pour personnaliser ses notifications.</p>
              </div>
            </div>
            <div className={styles.followGrid}>
              {pagedFollows.map((f) => (
                <FollowCard key={f.organizerId} follow={f} onUnfollowed={() => remove(f.organizerId)} onPatch={(next) => patch(f.organizerId, next)} />
              ))}
            </div>
            <Pagination page={page} pageCount={pageCount} onPageChange={setPage} totalItems={follows.length} pageSize={PAGE_SIZE} />
          </section>
        )}

        {visibleSuggestions.length > 0 && (
          <section className={styles.section}>
            <div className={styles.sectionHeader}>
              <div>
                <h2>Suggestions pour toi</h2>
                <p>Des organisateurs actifs à découvrir.</p>
              </div>
            </div>
            <div className={styles.suggestionGrid}>
              {visibleSuggestions.map((s) => (
                  <Card key={s.organizerId} className={styles.suggestionCard}>
                    <div className={styles.banner}>
                      <Image src={s.bannerUrl || placeholderPhotoUrl(s.organizerId, 720, 280)} alt="" fill style={{ objectFit: 'cover' }} sizes="(max-width: 760px) 100vw, 420px" />
                    </div>
                    <div className={styles.suggestionBody}>
                      <div className={styles.followIdentity}>
                        <Avatar src={s.avatarUrl || placeholderPhotoUrl(`${s.organizerId}-avatar`, 160, 160)} name={s.name} size="md" />
                        <div className={styles.identityCopy}>
                          <Link href={`/organizers/${s.slug}`}>{s.name}</Link>
                          {(s.city || s.country) && <p>{[s.city, s.country].filter(Boolean).join(' · ')}</p>}
                        </div>
                      </div>
                      <div className={styles.followActions}>
                        <Link href={`/organizers/${s.slug}`} className={styles.pageLink}>Voir le profil</Link>
                        <OrganizerFollowButtonClient organizerId={s.organizerId} organizerName={s.name} initialFollowing={false} isAuthenticated compact onFollow={() => addFollow(s)} />
                      </div>
                    </div>
                  </Card>
                ))}
            </div>
          </section>
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
    <Card className={styles.followCard}>
      <div className={styles.banner}>
        <Image src={follow.organizerBannerUrl || placeholderPhotoUrl(follow.organizerId, 760, 300)} alt="" fill style={{ objectFit: 'cover' }} sizes="(max-width: 760px) 100vw, 440px" />
      </div>
      <div className={styles.followBody}>
        <div className={styles.followIdentity}>
          <Avatar src={follow.organizerAvatarUrl || placeholderPhotoUrl(`${follow.organizerId}-avatar`, 160, 160)} name={follow.organizerName} size="md" />
          <div className={styles.identityCopy}>
            <h3>{follow.organizerName}</h3>
            {(follow.organizerCity || follow.organizerCountry) && <p>{[follow.organizerCity, follow.organizerCountry].filter(Boolean).join(' · ')}</p>}
          </div>
        </div>
        <div className={styles.followActions}>
          <Link href={`/organizers/${follow.organizerSlug}`} className={styles.pageLink}>Voir le profil</Link>
          <OrganizerFollowButtonClient organizerId={follow.organizerId} organizerName={follow.organizerName} initialFollowing onUnfollow={onUnfollowed} isAuthenticated compact showUnfollowLabel />
        </div>
      </div>

      <div className={styles.notificationRow}>
        <Checkbox
          label="Notifications de cet organisateur"
          checked={follow.notificationsEnabled}
          onChange={toggleMaster}
          disabled={savingMaster}
          style={{ fontSize: 'var(--font-size-footnote)', color: 'var(--text)' }}
        />
        <Button variant="link" onClick={() => setExpanded((v) => !v)} style={{ fontSize: 'var(--font-size-caption-lg)' }}>
          {expanded ? 'Masquer les réglages' : 'Personnaliser les alertes'}
        </Button>
      </div>

      {expanded && (
        <div className={styles.alertsGrid}>
          {ALERT_LABELS.map(({ key, label }) => (
            <Checkbox
              key={key}
              label={label}
              checked={follow.alerts[key]}
              onChange={() => toggleAlert(key)}
              style={{ fontSize: 'var(--font-size-caption-lg)', color: 'var(--text)', background: 'var(--fill-secondary)', borderRadius: 9, padding: '7px 9px' }}
            />
          ))}
        </div>
      )}
    </Card>
  )
}
