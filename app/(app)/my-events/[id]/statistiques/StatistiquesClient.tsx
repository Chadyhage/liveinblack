'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import type { EventStatsView } from '@/lib/server/eventStats'
import { eventStatsCsvRows } from '@/lib/shared/eventStats'
import { formatMoney } from '../../types'

const TONE_COLOR: Record<string, string> = {
  gold: 'var(--gold)',
  teal: 'var(--teal)',
  pink: 'var(--pink)',
  muted: 'var(--text-muted)',
}

const TONE_PREFIX: Record<string, string> = {
  gold: '★',
  teal: '✓',
  pink: '⚠',
  muted: '·',
}

function pct(value: number | null): string {
  return value == null ? '—' : `${Math.round(value)} %`
}

function slugifyEventName(name: string): string {
  // Normalise les accents (é, è, à…) avant de retirer les caractères non
  // alphanumériques, pour éviter un nom de fichier réduit à des tirets
  // (ex. "Café XL" → "cafe-xl" au lieu de "caf--xl").
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/gi, '-')
}

function downloadCsv(view: EventStatsView) {
  const rows = eventStatsCsvRows({ places: [], date: view.event.date, minAge: 0 }, view.stats)
  if (rows.length === 0) return
  const headers = Object.keys(rows[0])
  const csv = [headers.join(','), ...rows.map((r) => headers.map((h) => `"${String(r[h]).replace(/"/g, '""')}"`).join(','))].join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${slugifyEventName(view.event.name)}-billets.csv`
  a.click()
  URL.revokeObjectURL(url)
}

export default function StatistiquesClient({ eventId, initialView }: { eventId: string; initialView: EventStatsView }) {
  const [view, setView] = useState(initialView)
  const [range, setRange] = useState<'all' | '7d' | '30d'>('all')
  const [place, setPlace] = useState('all')
  const [filterError, setFilterError] = useState(false)
  const [isPending, startTransition] = useTransition()

  function applyFilters(nextRange: typeof range, nextPlace: string) {
    setRange(nextRange)
    setPlace(nextPlace)
    startTransition(async () => {
      const params = new URLSearchParams({ range: nextRange, place: nextPlace })
      try {
        const res = await fetch(`/api/organizer-events/${eventId}/stats?${params.toString()}`)
        const data = await res.json()
        if (res.ok && data.ok) {
          setView(data)
          setFilterError(false)
        } else {
          setFilterError(true)
        }
      } catch {
        setFilterError(true)
      }
    })
  }

  function resetFilters() {
    applyFilters('all', 'all')
  }

  const { stats, insights, demographics, placeOptions } = view
  const hasActiveFilter = range !== 'all' || place !== 'all'
  const maxPlaceCount = stats.byPlace[0]?.count ?? 0

  return (
    <main style={{ maxWidth: 900, margin: '0 auto', padding: '28px 20px 80px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <Link href="/my-events" aria-label="Retour" style={{ color: '#fff', fontSize: 20, textDecoration: 'none', padding: 10, margin: -10, lineHeight: 1 }}>
          ←
        </Link>
        <div>
          <h1 style={{ font: '600 22px Inter, sans-serif', color: '#fff', margin: 0 }}>{view.event.name}</h1>
          <p style={{ font: '500 12px Inter, sans-serif', color: 'var(--text-muted)', margin: '2px 0 0' }}>
            Statistiques · {view.event.dateDisplay || view.event.date} · {view.event.city}
          </p>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, flexWrap: 'wrap' }}>
        <select
          value={range}
          onChange={(e) => applyFilters(e.target.value as typeof range, place)}
          style={{ padding: '9px 12px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface)', color: '#fff' }}
        >
          <option value="all">Toute la période</option>
          <option value="7d">7 derniers jours</option>
          <option value="30d">30 derniers jours</option>
        </select>
        <select
          value={place}
          onChange={(e) => applyFilters(range, e.target.value)}
          style={{ padding: '9px 12px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface)', color: '#fff' }}
        >
          <option value="all">Toutes les places</option>
          {placeOptions.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
        {hasActiveFilter && (
          <button onClick={resetFilters} style={{ padding: '9px 12px', borderRadius: 10, border: 'none', background: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 12, textDecoration: 'underline' }}>
            Réinitialiser
          </button>
        )}
        <button
          onClick={() => downloadCsv(view)}
          disabled={stats.assignedTickets === 0}
          style={{
            marginLeft: 'auto',
            padding: '9px 16px',
            borderRadius: 10,
            border: '1px solid var(--border)',
            background: 'rgba(255,255,255,0.05)',
            color: stats.assignedTickets === 0 ? 'var(--text-faint)' : '#fff',
            cursor: stats.assignedTickets === 0 ? 'default' : 'pointer',
            fontSize: 12.5,
          }}
        >
          Exporter en CSV
        </button>
      </div>

      {isPending && <p style={{ color: 'var(--text-muted)', fontSize: 12, marginBottom: 10 }}>Actualisation…</p>}
      {filterError && (
        <p role="status" style={{ color: 'var(--pink)', fontSize: 12, marginBottom: 10 }}>
          Impossible d&rsquo;actualiser, réessaie.
        </p>
      )}

      <div style={{ opacity: isPending ? 0.5 : 1, transition: 'opacity 0.15s' }}>
        {stats.assignedTickets === 0 ? (
          <div style={{ padding: '50px 20px', textAlign: 'center', border: '1px solid var(--border)', borderRadius: 16, background: 'var(--surface)' }}>
            <p style={{ color: 'var(--text-muted)', fontSize: 14, margin: '0 0 16px' }}>Aucune réservation enregistrée.</p>
            <Link
              href={`/events/${view.event.id}`}
              style={{ display: 'inline-block', padding: '10px 18px', borderRadius: 10, background: 'var(--gold)', color: 'var(--obsidian)', fontSize: 12.5, fontWeight: 700, textDecoration: 'none' }}
            >
              Voir ma page événement
            </Link>
          </div>
        ) : (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10, marginBottom: 18 }}>
              <div style={{ padding: '14px 16px', border: '1px solid var(--border)', borderRadius: 14, background: 'var(--surface)' }}>
                <p style={{ font: '600 10.5px Inter, sans-serif', letterSpacing: '.05em', textTransform: 'uppercase', color: 'var(--text-muted)', margin: '0 0 6px' }}>Billets vendus</p>
                <p style={{ font: '600 20px Inter, sans-serif', color: '#fff', margin: 0 }}>{stats.assignedTickets}</p>
              </div>
              <div style={{ padding: '14px 16px', border: '1px solid var(--border)', borderRadius: 14, background: 'var(--surface)' }}>
                <p style={{ font: '600 10.5px Inter, sans-serif', letterSpacing: '.05em', textTransform: 'uppercase', color: 'var(--text-muted)', margin: '0 0 6px' }}>Revenus totaux</p>
                <p style={{ font: '600 20px Inter, sans-serif', color: '#fff', margin: '0 0 8px' }}>{formatMoney(stats.totalEstimatedRevenue, view.event.currency)}</p>
                <div style={{ display: 'grid', gap: 4, paddingLeft: 10, borderLeft: '2px solid var(--border)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
                    <span style={{ color: 'var(--text-faint)' }}>Dont billetterie</span>
                    <span style={{ color: 'var(--text-muted)' }}>{formatMoney(stats.estimatedRevenue, view.event.currency)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
                    <span style={{ color: 'var(--text-faint)' }}>Dont précommandes</span>
                    <span style={{ color: 'var(--text-muted)' }}>{formatMoney(stats.preorderRevenue, view.event.currency)}</span>
                  </div>
                </div>
              </div>
              <div style={{ padding: '14px 16px', border: '1px solid var(--border)', borderRadius: 14, background: 'var(--surface)' }}>
                <p style={{ font: '600 10.5px Inter, sans-serif', letterSpacing: '.05em', textTransform: 'uppercase', color: 'var(--text-muted)', margin: '0 0 6px' }}>Taux de remplissage</p>
                <p style={{ font: '600 20px Inter, sans-serif', color: '#fff', margin: 0 }} title={stats.fillRate == null ? 'Pas encore de capacité renseignée pour ce calcul.' : undefined}>
                  {pct(stats.fillRate)}
                </p>
              </div>
              <div style={{ padding: '14px 16px', border: '1px solid var(--border)', borderRadius: 14, background: 'var(--surface)' }}>
                <p style={{ font: '600 10.5px Inter, sans-serif', letterSpacing: '.05em', textTransform: 'uppercase', color: 'var(--text-muted)', margin: '0 0 6px' }}>Taux de présence</p>
                <p style={{ font: '600 20px Inter, sans-serif', color: '#fff', margin: 0 }} title={stats.attendanceRate == null ? "Disponible une fois l'événement passé et les entrées scannées." : undefined}>
                  {pct(stats.attendanceRate)}
                </p>
              </div>
            </div>

            <div style={{ display: 'grid', gap: 8, marginBottom: 20 }}>
              {insights.map((insight, i) => (
                <p key={i} style={{ fontSize: 12.5, color: TONE_COLOR[insight.tone] ?? 'var(--text-muted)', margin: 0, lineHeight: 1.6 }}>
                  <span aria-hidden="true">{TONE_PREFIX[insight.tone] ?? TONE_PREFIX.muted}</span> {insight.text}
                </p>
              ))}
            </div>

            <section style={{ marginBottom: 20 }}>
              <h2 style={{ font: '600 11px Inter, sans-serif', letterSpacing: '.05em', textTransform: 'uppercase', color: 'var(--text-muted)', margin: '0 0 10px' }}>Répartition par place</h2>
              <div style={{ display: 'grid', gap: 8 }}>
                {stats.byPlace.map((p) => (
                  <div key={p.name} style={{ padding: '10px 14px', border: '1px solid var(--border)', borderRadius: 10, background: 'var(--surface)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, marginBottom: stats.byPlace.length > 1 ? 6 : 0 }}>
                      <span style={{ color: '#fff' }}>{p.name}</span>
                      <span style={{ color: 'var(--gold)' }}>
                        {p.count} ({p.paid} payant{p.paid > 1 ? 's' : ''} / {p.free} gratuit{p.free > 1 ? 's' : ''})
                      </span>
                    </div>
                    {stats.byPlace.length > 1 && (
                      <div style={{ height: 6, borderRadius: 999, background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${maxPlaceCount ? (p.count / maxPlaceCount) * 100 : 0}%`, background: 'var(--teal)' }} />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </section>

            {stats.preorderItems.length > 0 && (
              <section style={{ marginBottom: 20 }}>
                <h2 style={{ font: '600 11px Inter, sans-serif', letterSpacing: '.05em', textTransform: 'uppercase', color: 'var(--text-muted)', margin: '0 0 10px' }}>Précommandes consommées</h2>
                <div style={{ display: 'grid', gap: 8 }}>
                  {stats.preorderItems.map((item) => (
                    <div key={item.name} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px', border: '1px solid var(--border)', borderRadius: 10, background: 'var(--surface)', fontSize: 12.5 }}>
                      <span style={{ color: '#fff' }}>
                        {item.quantity}× {item.name}
                      </span>
                      <span style={{ color: 'var(--gold)', fontWeight: 600 }}>{formatMoney(item.revenue, view.event.currency)}</span>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {demographics.ageKnown + demographics.genderKnown > 0 && (
              <section>
                <h2 style={{ font: '600 11px Inter, sans-serif', letterSpacing: '.05em', textTransform: 'uppercase', color: 'var(--text-muted)', margin: '0 0 10px' }}>Démographie</h2>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                  <div>
                    <p style={{ fontSize: 11.5, color: 'var(--text-faint)', margin: '0 0 8px' }}>Âge ({demographics.ageKnown} connu(s), {demographics.noAccount} sans compte)</p>
                    <div style={{ display: 'grid', gap: 6 }}>
                      {demographics.buckets.map((b) => (
                        <div key={b.label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                          <span style={{ color: 'var(--text-muted)' }}>{b.label}</span>
                          <span style={{ color: '#fff' }}>{b.count}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p style={{ fontSize: 11.5, color: 'var(--text-faint)', margin: '0 0 8px' }}>Genre ({demographics.genderKnown} connu(s))</p>
                    <div style={{ display: 'grid', gap: 6 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                        <span style={{ color: 'var(--text-muted)' }}>Femme</span>
                        <span style={{ color: '#fff' }}>{demographics.gender.femme}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                        <span style={{ color: 'var(--text-muted)' }}>Homme</span>
                        <span style={{ color: '#fff' }}>{demographics.gender.homme}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                        <span style={{ color: 'var(--text-muted)' }}>Autre</span>
                        <span style={{ color: '#fff' }}>{demographics.gender.autre}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </main>
  )
}
