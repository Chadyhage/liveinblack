import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import Layout from '../components/Layout'
import { useAuth } from '../context/AuthContext'
import {
  EVENT_STATS_DEFINITIONS,
  buildEventInsights,
  canAccessEventStats,
  computeDemographics,
  computeEventStats,
  eventStatsCsvRows,
  ticketPrice,
} from '../utils/eventStats'
import { eventCurrency } from '../utils/money'
import './EventStatsPage.css'

const TABS = [
  ['overview', "Vue d'ensemble"],
  ['sales', 'Ventes'],
  ['participants', 'Participants'],
  ['checkin', 'Check-in'],
  ['data', 'Données'],
]

const money = (value, cur = 'EUR') => String(cur).toUpperCase() === 'XOF'
  ? `${Math.round(Number(value) || 0).toLocaleString('fr-FR')} FCFA`
  : new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(value || 0)
const number = value => new Intl.NumberFormat('fr-FR').format(value || 0)
const percent = value => value == null ? '—' : `${Math.round(value)} %`
const shortDate = value => {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })
}
const dateTime = value => {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })
}

function initialEvent(eventId) {
  try {
    return JSON.parse(localStorage.getItem('lib_created_events') || '[]').find(event => String(event.id) === String(eventId)) || null
  } catch { return null }
}

// Boutons d'action solides (surchargent les pilules translucides du CSS)
const ACTION_BTN = {
  padding: '10px 16px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.14)',
  background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.9)',
  font: '600 12px Inter, sans-serif', letterSpacing: 'normal', textTransform: 'none', cursor: 'pointer',
}
const PAGE_BTN = {
  padding: '7px 14px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.14)',
  background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.85)',
  font: '600 12px Inter, sans-serif', letterSpacing: 'normal', textTransform: 'none',
}

// Icônes fines (stroke = currentColor) — une par métrique, pour lisibilité immédiate
const I = {
  revenue: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M18 7c0-1.66-3-3-6-3S6 5.34 6 7m12 0c0 1.66-3 3-6 3S6 8.66 6 7m12 0v10c0 1.66-3 3-6 3s-6-1.34-6-3V7m12 5c0 1.66-3 3-6 3s-6-1.34-6-3"/></svg>,
  ticket: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v1a2 2 0 0 0 0 4v1a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-1a2 2 0 0 0 0-4V8Z"/><path d="M13 6v12" strokeDasharray="2 2"/></svg>,
  gauge: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"/><path d="M12 3a9 9 0 0 0-9 9m9-9a9 9 0 0 1 9 9m-9-9v3m-6.36.64 2.12 2.12M3 12h3m12 0h3m-4.76-6.36-2.12 2.12"/></svg>,
  seat: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M5 11V6a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v5m-1 0a2 2 0 0 1 2 2v3H3v-3a2 2 0 0 1 2-2h14ZM6 19v2m12-2v2"/></svg>,
  present: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm7 3 2 2 4-4"/></svg>,
  attend: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="m19 5-14 14M6.5 9a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Zm11 11a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z"/></svg>,
}

function Info({ definition }) {
  return (
    <details className="event-stats-info">
      <summary aria-label={`Définition de ${definition.label}`}>i</summary>
      <div>
        <strong>{definition.label}</strong>
        <p>{definition.definition}</p>
        <span>Calcul · {definition.formula}</span>
        <small>{definition.limitation}</small>
      </div>
    </details>
  )
}

function MetricCard({ definition, value, helper, tone = 'teal', icon }) {
  return (
    <article className={`event-stats-metric tone-${tone}`}>
      <div className="event-stats-metric-top">
        {icon && <span className="event-stats-metric-icon">{icon}</span>}
        <Info definition={definition} />
      </div>
      <div className="event-stats-metric-body">
        <span className="event-stats-metric-name" style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)' }}>{definition.label}</span>
        <strong style={{ color: 'rgba(255,255,255,0.95)' }}>{value}</strong>
        <p>{helper}</p>
      </div>
    </article>
  )
}

// Entonnoir de conversion : rend limpide la chaîne Capacité → Billets émis →
// Entrées, et surtout la DIFFÉRENCE entre les deux taux (chacun avec son
// dénominateur explicite). C'est la pièce anti-confusion de la page.
function StatsFunnel({ stats }) {
  const cap = stats.capacity || 0
  const emitted = stats.assignedTickets || 0
  const present = stats.present || 0
  const pct = (n, d) => d > 0 ? Math.max(0, Math.min(100, Math.round(n / d * 100))) : null
  // SOURCE UNIQUE des taux : stats.fillRate (stock vendu ÷ capacité, une table = 1)
  // et stats.attendanceRate — mêmes arrondis partout sur la page (fin des 0 % ici
  // vs 1 % ailleurs pour la même donnée).
  const fill = stats.fillRate != null ? Math.round(stats.fillRate) : null
  const attend = stats.attendanceRate != null ? Math.round(stats.attendanceRate) : null
  const steps = [
    { key: 'cap', label: 'Capacité en vente', val: cap ? number(cap) : '—', sub: 'places en vente (une table de groupe = 1)', bar: 100, tone: 'muted', note: fill != null ? { rate: `${fill} %`, txt: 'déjà vendues — taux de remplissage' } : null },
    { key: 'emit', label: 'Billets émis', val: number(emitted), sub: 'personnes attendues (vendus + invitations)', bar: cap ? Math.min(100, pct(emitted, cap) ?? 0) : (emitted ? 100 : 0), tone: 'teal', note: null },
    { key: 'pres', label: 'Entrées confirmées', val: number(present), sub: "scannées à l'entrée", bar: emitted ? pct(present, emitted) : 0, tone: 'gold', note: attend != null ? { rate: `${attend} %`, txt: 'des billets émis — taux de présence' } : { rate: '—', txt: 'check-in pas encore commencé' } },
  ]
  return (
    <div className="event-stats-funnel" role="img" aria-label={`Capacité ${cap}, billets émis ${emitted}, entrées ${present}`}>
      {steps.map((s, i) => (
        <div className={`funnel-step tone-${s.tone}`} key={s.key}>
          <div className="funnel-head">
            <span className="funnel-label">{s.label}</span>
            <span className="funnel-val">{s.val}</span>
          </div>
          <div className="funnel-track"><span style={{ width: `${s.bar}%` }} /></div>
          <div className="funnel-foot">
            <span className="funnel-sub">{s.sub}</span>
            {s.note && <span className="funnel-note"><b>{s.note.rate}</b> {s.note.txt}</span>}
          </div>
          {i < steps.length - 1 && <span className="funnel-arrow" aria-hidden>→</span>}
        </div>
      ))}
    </div>
  )
}

// Agrège les points de vente par semaine quand il y en a trop (> 30 jours)
function aggregateByWeek(series) {
  if (series.length <= 30) return series
  const weekMap = new Map()
  series.forEach(point => {
    const d = new Date(point.date)
    // Clé = lundi de la semaine ISO
    const day = d.getDay() || 7
    const monday = new Date(d)
    monday.setDate(d.getDate() - day + 1)
    const key = `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, '0')}-${String(monday.getDate()).padStart(2, '0')}`
    const current = weekMap.get(key) || { date: key, tickets: 0, revenue: 0 }
    current.tickets += point.tickets
    current.revenue += point.revenue
    weekMap.set(key, current)
  })
  const weeks = [...weekMap.values()].sort((a, b) => a.date.localeCompare(b.date))
  let cumRevenue = 0, cumTickets = 0
  weeks.forEach(w => {
    cumRevenue += w.revenue
    cumTickets += w.tickets
    w.cumulativeRevenue = cumRevenue
    w.cumulativeTickets = cumTickets
  })
  return weeks
}

function SalesChart({ series: rawSeries, cur = 'EUR' }) {
  if (!rawSeries.length) return <EmptyState title="Aucune vente sur cette période" body="Les prochaines attributions apparaîtront ici automatiquement." />
  const series = aggregateByWeek(rawSeries)
  const isAggregated = series.length < rawSeries.length
  const width = 760
  const height = 260
  const pad = 34
  const maxRevenue = Math.max(...series.map(point => point.cumulativeRevenue), 1)
  const maxTickets = Math.max(...series.map(point => point.tickets), 1)
  const x = index => series.length === 1 ? width / 2 : pad + index * ((width - pad * 2) / (series.length - 1))
  const y = value => height - pad - (value / maxRevenue) * (height - pad * 2)
  const line = series.map((point, index) => `${index ? 'L' : 'M'} ${x(index)} ${y(point.cumulativeRevenue)}`).join(' ')

  return (
    <div className="event-stats-chart-wrap">
      <div className="event-stats-chart-legend"><span className="line" /> CA cumulé estimé <span className="bar" /> billets attribués{isAggregated && <small style={{ marginLeft: 8, color: 'rgba(255,255,255,0.45)' }}>(agrégé par semaine)</small>}</div>
      <svg className="event-stats-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Évolution des ventes et du chiffre d'affaires estimé">
        {[0, 1, 2, 3, 4].map(row => {
          const yy = pad + row * ((height - pad * 2) / 4)
          return <line key={row} x1={pad} y1={yy} x2={width - pad} y2={yy} className="grid" />
        })}
        {series.map((point, index) => {
          const barHeight = Math.max(3, point.tickets / maxTickets * 74)
          return <rect key={point.date} x={x(index) - 7} y={height - pad - barHeight} width="14" height={barHeight} className="sales-bar"><title>{point.tickets} billet(s)</title></rect>
        })}
        <path d={line} className="revenue-line" />
        {series.map((point, index) => <circle key={point.date} cx={x(index)} cy={y(point.cumulativeRevenue)} r="4" className="revenue-dot"><title>{money(point.cumulativeRevenue, cur)}</title></circle>)}
        {series.map((point, index) => {
          const show = series.length <= 8 || index === 0 || index === series.length - 1 || index % Math.ceil(series.length / 6) === 0
          return show ? <text key={point.date} x={x(index)} y={height - 8} textAnchor="middle">{shortDate(point.date)}</text> : null
        })}
      </svg>
    </div>
  )
}

function PlaceBreakdown({ rows, total, cur = 'EUR' }) {
  if (!rows.length) return <EmptyState title="Aucune catégorie vendue" body="La répartition apparaîtra après la première attribution." />
  return (
    <div className="event-stats-breakdown">
      {rows.map((row, index) => {
        const ratio = total ? row.count / total * 100 : 0
        return (
          <div className="event-stats-breakdown-row" key={row.name}>
            <div><strong>{row.name}</strong><span>{number(row.count)} billet{row.count > 1 ? 's' : ''} · {money(row.revenue, cur)}</span></div>
            <div className="event-stats-progress"><span style={{ width: `${ratio}%` }} /></div>
            <b>{Math.round(ratio)} %</b>
          </div>
        )
      })}
    </div>
  )
}

const TICKETS_PER_PAGE = 50

// Nom du TITULAIRE COURANT du billet : compte lié (users/), sinon nom saisi sur
// la guestlist, sinon identifiant masqué. Pour un siège de table attribué,
// ticket.userId = l'invité (le registre est réécrit à l'attribution) — c'est
// donc bien la personne qui entrera, pas l'acheteur de la table.
function holderName(ticket, usersById) {
  if (ticket.userId && usersById[String(ticket.userId)]?.name) return usersById[String(ticket.userId)].name
  if (ticket.guestName) return ticket.guestName
  if (ticket.assignedName) return ticket.assignedName
  if (ticket.userId) return `Compte ••••${String(ticket.userId).slice(-4)}`
  return 'Non renseigné'
}

// variant 'checkin' : remplace Prix/Attribution par l'heure d'entrée — l'onglet
// Check-in répond à « qui est entré, quand » quand Participants répond à
// « qui a un billet ».
function TicketTable({ event, tickets, usersById = {}, variant = 'default' }) {
  const [page, setPage] = useState(0)
  const totalPages = Math.max(1, Math.ceil(tickets.length / TICKETS_PER_PAGE))
  // Clamp page if tickets change (ex: filter applied)
  const safePage = Math.min(page, totalPages - 1)
  const pageTickets = tickets.slice(safePage * TICKETS_PER_PAGE, (safePage + 1) * TICKETS_PER_PAGE)
  const checkin = variant === 'checkin'

  if (!tickets.length) return <EmptyState title="Aucun billet" body="Aucune donnée ne correspond aux filtres actifs." />
  return (
    <div className="event-stats-table-wrap">
      <table className="event-stats-table">
        <thead><tr><th>Titulaire</th><th>Catégorie</th>{!checkin && <th>Prix payé</th>}<th>{checkin ? 'Entré à' : 'Réservé le'}</th><th>Billet</th><th>Statut</th></tr></thead>
        <tbody>
          {pageTickets.map(ticket => (
            <tr key={ticket.ticketCode || ticket.id}>
              <td>{holderName(ticket, usersById)}</td>
              <td>{ticket.place || 'Standard'}</td>
              {!checkin && <td>{ticket.paid === true ? money(ticketPrice(event, ticket), eventCurrency(event)) : 'Gratuit'}</td>}
              <td>{checkin ? (ticket.checkedInAt ? dateTime(ticket.checkedInAt) : '—') : dateTime(ticket.bookedAt)}</td>
              <td style={{ fontSize: 11, opacity: .6 }}>{ticket.ticketCode || ticket.id}</td>
              <td><span className={`event-stats-status ${ticket.checkedInAt ? 'checked' : ticket.paid === true ? 'paid' : 'free'}`}>{ticket.checkedInAt ? 'Entré' : ticket.paid === true ? 'Payé — pas encore entré' : 'Invitation — pas encore entré'}</span></td>
            </tr>
          ))}
        </tbody>
      </table>
      {totalPages > 1 && (
        <div className="event-stats-pagination">
          <button style={PAGE_BTN} disabled={safePage === 0} onClick={() => setPage(safePage - 1)}>← Précédent</button>
          <span>{safePage + 1} / {totalPages}</span>
          <button style={PAGE_BTN} disabled={safePage >= totalPages - 1} onClick={() => setPage(safePage + 1)}>Suivant →</button>
        </div>
      )}
    </div>
  )
}

function EmptyState({ title, body }) {
  return <div className="event-stats-empty"><strong>{title}</strong><p>{body}</p></div>
}

// ─── Démographie du public (onglet Données) ───────────────────────────────────
// Âge et genre des TITULAIRES de billets (déclarés à l'inscription/profil —
// optionnels, utilisés UNIQUEMENT pour ces stats, jamais pour bloquer un achat).
// Événement avec limite d'âge : les tranches commencent à l'âge minimum, et un
// âge déclaré inférieur est compté dans la première tranche (à l'entrée, la
// personne a forcément l'âge requis).
function Demographics({ tickets, usersById, minAge = 0 }) {
  const demo = useMemo(() => computeDemographics(tickets, usersById, minAge), [tickets, usersById, minAge])
  const bar = (count, total, color) => (
    <div className="event-stats-progress" style={{ flex: 1 }}><span style={{ width: `${total ? Math.round(count / total * 100) : 0}%`, background: color }} /></div>
  )
  const pctTxt = (count, total) => total ? `${Math.round(count / total * 100)} %` : '—'
  const genderRows = [
    ['Femmes', demo.gender.femme, '#e05aaa'],
    ['Hommes', demo.gender.homme, '#4ee8c8'],
    ['Autre', demo.gender.autre, '#c8a96e'],
  ]
  return (
    <section className="event-stats-lower-grid">
      <article className="event-stats-panel">
        <div className="event-stats-panel-heading"><div><h2>Âge du public</h2><p>{minAge > 0 ? `Événement ${minAge}+ : les tranches commencent à ${minAge} ans.` : 'Selon l’année de naissance déclarée par les titulaires.'}</p></div></div>
        {demo.ageKnown === 0 ? (
          <EmptyState title="Pas encore de données d'âge" body="L'âge est déclaré par les participants à l'inscription ou dans leur profil — les stats se rempliront au fil des ventes." />
        ) : (
          <div className="event-stats-breakdown">
            {demo.buckets.map(bucket => (
              <div className="event-stats-breakdown-row" key={bucket.label}>
                <div><strong>{bucket.label}</strong><span>{number(bucket.count)} participant{bucket.count > 1 ? 's' : ''}</span></div>
                {bar(bucket.count, demo.ageKnown, '#4ee8c8')}
                <b>{pctTxt(bucket.count, demo.ageKnown)}</b>
              </div>
            ))}
            <p style={{ margin: '10px 0 0', font: '500 11.5px Inter, sans-serif', color: 'rgba(255,255,255,0.4)' }}>{number(demo.ageKnown)} âge{demo.ageKnown > 1 ? 's' : ''} renseigné{demo.ageKnown > 1 ? 's' : ''} sur {number(demo.total)} billets · {number(demo.ageUnknown)} non renseigné{demo.ageUnknown > 1 ? 's' : ''}{demo.noAccount > 0 ? ` (dont ${number(demo.noAccount)} invitation${demo.noAccount > 1 ? 's' : ''} sans compte)` : ''}</p>
          </div>
        )}
      </article>
      <article className="event-stats-panel">
        <div className="event-stats-panel-heading"><div><h2>Genre du public</h2><p>Déclaré librement par les participants — optionnel.</p></div></div>
        {demo.genderKnown === 0 ? (
          <EmptyState title="Pas encore de données de genre" body="Le genre est déclaré par les participants à l'inscription ou dans leur profil — les stats se rempliront au fil des ventes." />
        ) : (
          <div className="event-stats-breakdown">
            {genderRows.map(([label, count, color]) => (
              <div className="event-stats-breakdown-row" key={label}>
                <div><strong>{label}</strong><span>{number(count)} participant{count > 1 ? 's' : ''}</span></div>
                {bar(count, demo.genderKnown, color)}
                <b>{pctTxt(count, demo.genderKnown)}</b>
              </div>
            ))}
            <p style={{ margin: '10px 0 0', font: '500 11.5px Inter, sans-serif', color: 'rgba(255,255,255,0.4)' }}>{number(demo.genderKnown)} genre{demo.genderKnown > 1 ? 's' : ''} renseigné{demo.genderKnown > 1 ? 's' : ''} sur {number(demo.total)} billets · les pourcentages portent sur les réponses renseignées.</p>
          </div>
        )}
      </article>
    </section>
  )
}

function csvEscape(value) {
  const text = String(value ?? '')
  return /[;"\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

export default function EventStatsPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const [event, setEvent] = useState(() => initialEvent(id))
  const [access, setAccess] = useState('checking')
  const [tickets, setTickets] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [activeTab, setActiveTab] = useState('overview')
  const [range, setRange] = useState('all')
  const [place, setPlace] = useState('all')
  const [updatedAt, setUpdatedAt] = useState(new Date())
  // Profils des titulaires (users/{uid} → name, birthYear, gender) : noms dans
  // les tableaux + démographie de l'onglet Données. Chargés par lots, best-effort.
  const [usersById, setUsersById] = useState({})
  const statCur = eventCurrency(event) // XOF (FCFA) ou EUR selon la région de l'event

  useEffect(() => {
    const uids = [...new Set(tickets.map(t => t.userId).filter(Boolean).map(String))]
    const missing = uids.filter(uid => !(uid in usersById))
    if (!missing.length) return
    let cancelled = false
    import('../utils/firestore-sync').then(async ({ loadUsersByIds }) => {
      const loaded = await loadUsersByIds(missing)
      if (!cancelled && Object.keys(loaded).length) setUsersById(current => ({ ...current, ...loaded }))
    }).catch(() => {})
    return () => { cancelled = true }
  }, [tickets]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    let unsubscribe = () => {}
    let cancelled = false
    const cachedEvent = initialEvent(id)
    setLoading(true)
    setError('')
    import('../utils/firestore-sync').then(async ({ loadDoc, listenTicketsForEvent }) => {
      const [remoteEvent, userEventsDoc] = await Promise.all([
        loadDoc(`events/${id}`),
        user?.uid ? loadDoc(`user_events/${user.uid}`) : Promise.resolve(null),
      ])
      if (cancelled) return
      const userEvent = (userEventsDoc?.items || []).find(item => String(item.id) === String(id)) || null
      const allowed = canAccessEventStats({ user, event: remoteEvent, userEvent, cachedEvent, eventId: id })
      setAccess(allowed ? 'allowed' : 'denied')
      if (!allowed) { setLoading(false); return }

      // Le document public apporte les données fraîches ; l'entrée user_events
      // conserve les champs métier propres à l'organisateur. Le cache sert de
      // dernier filet hors-ligne.
      const mergedEvent = { ...(cachedEvent || {}), ...(remoteEvent || {}), ...(userEvent || {}), id }
      setEvent(mergedEvent)
      unsubscribe = listenTicketsForEvent(id, nextTickets => {
        if (cancelled) return
        setTickets(nextTickets)
        setUpdatedAt(new Date())
        setLoading(false)
      }, () => {
        if (!cancelled) { setError('Impossible de charger les billets en temps réel.'); setLoading(false) }
      })
    }).catch(() => {
      if (!cancelled) {
        const offlineAllowed = canAccessEventStats({ user, cachedEvent, eventId: id })
        setAccess(offlineAllowed ? 'allowed' : 'denied')
        setError('Impossible de charger les statistiques en temps réel.')
        setLoading(false)
      }
    })
    return () => { cancelled = true; unsubscribe() }
  }, [id, user?.uid, user?.id, user?.role])

  const stats = useMemo(() => computeEventStats(event, tickets, { filters: { range, place } }), [event, tickets, range, place])
  const insights = useMemo(() => buildEventInsights(stats), [stats])
  // Fusionner les catégories définies dans l'événement avec celles des billets vendus
  // pour que les catégories avec 0 vente apparaissent dans le filtre.
  const places = useMemo(() => {
    const fromTickets = tickets.map(ticket => ticket.place || 'Standard')
    const fromEvent = (event?.places || []).map(p => p.type || 'Standard')
    return [...new Set([...fromEvent, ...fromTickets])]
  }, [tickets, event])

  function exportCsv() {
    const rows = eventStatsCsvRows(event, stats)
    const headers = Object.keys(rows[0] || { ticket_id: '', evenement: '', categorie: '', prix_estime: '', type: '', statut: '', acheteur_id: '', date_attribution: '', date_check_in: '' })
    const csv = '\ufeff' + [headers.join(';'), ...rows.map(row => headers.map(header => csvEscape(row[header])).join(';'))].join('\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    const link = document.createElement('a')
    link.href = url
    link.download = `statistiques-${String(event?.name || id).toLowerCase().replace(/[^a-z0-9]+/g, '-')}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  if (access === 'checking') return <Layout hideNav><div className="event-stats-state">Vérification de l'événement…</div></Layout>
  if (!event || access === 'denied') return <Layout hideNav><div className="event-stats-state"><strong>Statistiques indisponibles</strong><p>Cet événement n'existe pas dans ton espace ou tu n'es pas autorisé à consulter ses données.</p><button style={{ ...ACTION_BTN, padding: '12px 20px', font: '600 13px Inter, sans-serif' }} onClick={() => navigate('/mes-evenements')}>Retour à mes événements</button></div></Layout>

  return (
    <Layout hideNav>
      <main className="event-stats-page">
        <header className="event-stats-header">
          <button className="event-stats-back" onClick={() => navigate('/mes-evenements')}>← Retour aux événements</button>
          <div className="event-stats-heading-row">
            <div>
              <h1>{event.name}</h1>
              <p>{event.dateDisplay || shortDate(event.date)} · {event.city || event.location || 'Lieu à préciser'} <span style={event.cancelled ? { color: '#e05aaa', borderColor: 'rgba(224,90,170,0.45)' } : new Date(event.date) < new Date() ? { color: 'rgba(255,255,255,0.6)', borderColor: 'rgba(255,255,255,0.25)' } : undefined}>{event.cancelled ? 'Annulé' : new Date(event.date) < new Date() ? 'Terminé' : 'En vente'}</span></p>
            </div>
            <div className="event-stats-actions">
              <small>Dernière mise à jour {updatedAt.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</small>
              <button style={ACTION_BTN} onClick={exportCsv}>Exporter CSV</button>
              <button style={ACTION_BTN} onClick={() => window.print()}>Imprimer</button>
            </div>
          </div>
        </header>

        <nav className="event-stats-tabs" aria-label="Sections statistiques">
          {TABS.map(([key, label]) => <button key={key} className={activeTab === key ? 'active' : ''} onClick={() => setActiveTab(key)}>{label}</button>)}
        </nav>

        <section className="event-stats-filters" aria-label="Filtres statistiques">
          <label>Période<select value={range} onChange={e => setRange(e.target.value)}><option value="all">Depuis l'ouverture</option><option value="30d">30 derniers jours</option><option value="7d">7 derniers jours</option></select></label>
          <label>Catégorie<select value={place} onChange={e => setPlace(e.target.value)}><option value="all">Toutes les catégories</option>{places.map(name => <option key={name} value={name}>{name}</option>)}</select></label>
          <p>{number(stats.assignedTickets)} billet{stats.assignedTickets > 1 ? 's' : ''} dans la vue · filtres appliqués à toute la page</p>
        </section>

        {error && <div className="event-stats-error">{error}</div>}

        <div key={activeTab} className="lib-tab-content">
        {activeTab === 'overview' && (
          <section className="event-stats-flow">
            <div className="event-stats-flow-head">
              <h2>Parcours des billets</h2>
              <p>De la salle à l'entrée : combien de places vendues, combien de personnes réellement venues.</p>
            </div>
            <StatsFunnel stats={stats} />
          </section>
        )}

        {(activeTab === 'overview' || activeTab === 'sales') && (
          <>
            <section className="event-stats-metrics">
              <MetricCard icon={I.revenue} definition={EVENT_STATS_DEFINITIONS.estimatedRevenue} value={money(stats.estimatedRevenue, statCur)} helper="Hors frais, remises et remboursements" tone="teal" />
              <MetricCard icon={I.ticket} definition={EVENT_STATS_DEFINITIONS.assignedTickets} value={number(stats.assignedTickets)} helper={`${number(stats.paidTickets)} payant${stats.paidTickets > 1 ? 's' : ''} · ${number(stats.freeTickets)} invitation${stats.freeTickets > 1 ? 's' : ''}`} tone="gold" />
              <MetricCard icon={I.gauge} definition={EVENT_STATS_DEFINITIONS.fillRate} value={percent(stats.fillRate)} helper={stats.capacity ? `${number(stats.soldUnits)} / ${number(stats.capacity)} places vendues` : 'Capacité non définie'} tone="teal" />
              <MetricCard icon={I.seat} definition={EVENT_STATS_DEFINITIONS.remaining} value={stats.remaining == null ? '—' : number(stats.remaining)} helper={stats.capacity ? 'Encore en vente (une table = 1)' : 'Capacité non définie'} tone="gold" />
              <MetricCard icon={I.present} definition={EVENT_STATS_DEFINITIONS.present} value={number(stats.present)} helper={`${number(stats.present)} / ${number(stats.assignedTickets)} billets scannés`} tone="teal" />
              <MetricCard icon={I.attend} definition={EVENT_STATS_DEFINITIONS.attendanceRate} value={percent(stats.attendanceRate)} helper={stats.checkInReliable ? `${number(stats.present)} entrée${stats.present > 1 ? 's' : ''} sur ${number(stats.assignedTickets)} billets` : 'Check-in pas encore commencé'} tone={stats.checkInReliable ? 'teal' : 'pink'} />
            </section>

            <section className="event-stats-overview-grid">
              <article className="event-stats-panel event-stats-sales-panel"><h2>Évolution des ventes</h2><SalesChart series={stats.salesSeries} cur={statCur} /></article>
              <aside className="event-stats-panel event-stats-insights"><h2>Points clés</h2>{insights.map((item, index) => <div key={index} className={`insight-${item.tone}`}><span>{index + 1}</span><p>{item.text}</p></div>)}</aside>
            </section>
          </>
        )}

        {activeTab === 'overview' && (
          <section className="event-stats-lower-grid">
            <article className="event-stats-panel"><h2>Répartition par catégorie</h2><PlaceBreakdown rows={stats.byPlace} total={stats.assignedTickets} cur={statCur} /></article>
            <article className="event-stats-panel"><h2>Derniers billets</h2><TicketTable event={event} usersById={usersById} tickets={[...stats.tickets].sort((a, b) => new Date(b.bookedAt) - new Date(a.bookedAt)).slice(0, 6)} /></article>
          </section>
        )}

        {activeTab === 'sales' && (
          <section className="event-stats-lower-grid">
            <div style={{ display: 'grid', gap: 12 }}><article className="event-stats-panel"><h2>Performance des catégories</h2><PlaceBreakdown rows={stats.byPlace} total={stats.assignedTickets} cur={statCur} /></article><article className="event-stats-panel event-stats-summary-list"><h2>Précommandes de consommations</h2>{stats.preorderItems.length ? <dl>{stats.preorderItems.map(item => <div key={item.name}><dt>{item.name} · ×{item.quantity}</dt><dd>{money(item.revenue, statCur)}</dd></div>)}</dl> : <EmptyState title="Aucune précommande" body="Les boissons et snacks commandés avec les billets apparaîtront ici." />}</article></div>
            <article className="event-stats-panel event-stats-summary-list"><h2>Lecture des revenus</h2><dl><div><dt>Billetterie estimée</dt><dd>{money(stats.estimatedRevenue, statCur)}</dd></div><div><dt>Précommandes</dt><dd>{money(stats.preorderRevenue, statCur)}</dd></div><div><dt>Total estimé</dt><dd>{money(stats.totalEstimatedRevenue, statCur)}</dd></div><div><dt>Revenu moyen par billet payant</dt><dd>{money(stats.averageRevenuePerPaidTicket, statCur)}</dd></div><div><dt>Billets payants</dt><dd>{number(stats.paidTickets)}</dd></div><div><dt>Billets gratuits</dt><dd>{number(stats.freeTickets)}</dd></div></dl><p>Les remboursements, remises et frais de paiement ne sont pas déduits tant qu'ils ne sont pas exposés à l'organisateur.</p></article>
          </section>
        )}

        {/* PARTICIPANTS = « qui a un billet » : la liste nominative complète. */}
        {activeTab === 'participants' && (
          <section className="event-stats-section-stack"><div className="event-stats-metrics compact"><MetricCard definition={EVENT_STATS_DEFINITIONS.assignedTickets} value={number(stats.assignedTickets)} helper={`${number(stats.uniqueBuyers)} compte${stats.uniqueBuyers > 1 ? 's' : ''} titulaire${stats.uniqueBuyers > 1 ? 's' : ''}`} /><MetricCard definition={EVENT_STATS_DEFINITIONS.present} value={number(stats.present)} helper="déjà entrés" /><MetricCard definition={EVENT_STATS_DEFINITIONS.attendanceRate} value={percent(stats.attendanceRate)} helper={stats.checkInReliable ? 'taux de présence' : 'en attente du check-in'} /></div><article className="event-stats-panel"><div className="event-stats-panel-heading"><div><h2>Participants</h2><p>Toutes les personnes qui ont un billet — le titulaire affiché est celui qui entrera (un siège de table attribué appartient à l'invité, pas à l'acheteur).</p></div></div><TicketTable event={event} usersById={usersById} tickets={stats.tickets} /></article></section>
        )}

        {/* CHECK-IN = « qui est entré, quand » : entrées en tête, heure de scan. */}
        {activeTab === 'checkin' && (
          <section className="event-stats-section-stack"><div className="event-stats-metrics compact"><MetricCard definition={EVENT_STATS_DEFINITIONS.present} value={number(stats.present)} helper="scans uniques valides" /><MetricCard definition={EVENT_STATS_DEFINITIONS.attendanceRate} value={percent(stats.attendanceRate)} helper={stats.checkInReliable ? 'sur billets émis' : 'non fiable pour le moment'} /><MetricCard definition={EVENT_STATS_DEFINITIONS.toScan} value={number(Math.max(0, stats.assignedTickets - stats.present))} helper="personnes encore attendues" /></div><article className="event-stats-panel"><div className="event-stats-panel-heading"><div><h2>Journal des entrées</h2><p>Les billets scannés d'abord, avec l'heure d'entrée — puis ceux qu'on attend encore.</p></div></div><TicketTable event={event} usersById={usersById} variant="checkin" tickets={[...stats.tickets].sort((a, b) => new Date(b.checkedInAt || 0) - new Date(a.checkedInAt || 0))} /></article></section>
        )}

        {/* DONNÉES = démographie du public + export brut. */}
        {activeTab === 'data' && (
          <section className="event-stats-section-stack">
            <Demographics tickets={stats.tickets} usersById={usersById} minAge={Number(event.minAge) || 0} />
            <section className="event-stats-panel"><div className="event-stats-panel-heading"><div><h2>Données brutes</h2><p>Tous les billets de la vue courante. L'export CSV respecte les filtres actifs.</p></div><button style={ACTION_BTN} onClick={exportCsv}>Exporter CSV</button></div><TicketTable event={event} usersById={usersById} tickets={stats.tickets} /></section>
          </section>
        )}
        </div>

        {loading && <div className="event-stats-loading">Actualisation…</div>}
      </main>
    </Layout>
  )
}
