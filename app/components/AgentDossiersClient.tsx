'use client'

import { useEffect, useMemo, useState } from 'react'
import { regions } from '@/lib/shared/regions'
import { getApplicationCompleteness } from '@/lib/shared/applicationValidation'
import { getProviderCategories } from '@/lib/shared/providerCategories'

// Port de la section « Dossiers » de src/pages/AgentPage.jsx (#9 phase
// agent/admin) — file/queue de candidatures organisateur/prestataire, panneau
// de détail slide-up, actions de modération. Voir lib/server/applications.ts
// (moderateApplication) pour la machine à états côté serveur, et
// lib/server/agentGuard.ts pour la garde d'accès (déjà vérifiée par la page
// serveur qui monte ce composant).
//
// Différences volontaires avec le legacy :
// - Pas de bloc « Demandes de rôle » (roleRequests/pending_validations) — ce
//   raccourci Firestore (octroi de rôle sans aucune revue de dossier) n'est
//   jamais atteignable depuis ce port : tout octroi de rôle passe par un
//   Application réel. Le porter créerait une UI pour un flux mort.
// - « Notes internes » est un simple champ texte (un seul `adminNote` en
//   base, cf. lib/models/Application.ts) plutôt que la checklist legacy à
//   plusieurs entrées cochables — fidèle au schéma déjà arrêté en #62.

type AppType = 'organisateur' | 'prestataire'
type ApplicationStatus = 'draft' | 'submitted' | 'under_review' | 'needs_changes' | 'resubmitted' | 'approved' | 'rejected' | 'suspended'
type ModerateAction = 'under_review' | 'approve' | 'request_changes' | 'reject' | 'suspend' | 'reactivate'

interface ApplicationSummary {
  id: string
  type: AppType
  status: ApplicationStatus
  userId: string
  userEmail: string
  userName: string
  displayName: string
  requestedChanges: string
  submittedAt: string | null
  updatedAt: string
}

interface DocumentEntry {
  name: string
  url: string
  size: number
  uploadedAt: string | null
}

interface AuditLogEntry {
  action: string
  by: string
  byName: string
  at: string
  note: string
}

interface ApplicationDetail {
  id: string
  type: AppType
  status: ApplicationStatus
  formData: Record<string, unknown>
  documents: Record<string, DocumentEntry[]>
  requestedChanges: string
  rejectionReason: string
  candidateNote: string
  submittedAt: string | null
  approvedAt: string | null
  rejectedAt: string | null
  updatedAt: string
  userEmail: string
  userName: string
  userPhone: string
  adminNote: string
  auditLog: AuditLogEntry[]
}

const SECTIONS: { key: string; label: string; color: string; statuses: ApplicationStatus[] }[] = [
  { key: 'pending', label: 'En attente', color: '#c8a96e', statuses: ['submitted'] },
  { key: 'review', label: 'En révision', color: '#3b82f6', statuses: ['under_review'] },
  { key: 'correction', label: 'À corriger', color: '#f59e0b', statuses: ['needs_changes'] },
  { key: 'resubmitted', label: 'Re-soumis', color: '#a78bfa', statuses: ['resubmitted'] },
  { key: 'validated', label: 'Validés', color: '#22c55e', statuses: ['approved'] },
  { key: 'refused', label: 'Refusés', color: '#e05aaa', statuses: ['rejected', 'suspended'] },
]

const STATUS_LABEL: Record<ApplicationStatus, string> = {
  draft: 'Brouillon',
  submitted: 'Soumis',
  under_review: "En cours d'examen",
  needs_changes: 'Corrections requises',
  resubmitted: 'Re-soumis',
  approved: 'Approuvé',
  rejected: 'Refusé',
  suspended: 'Suspendu',
}

const STATUS_COLOR: Record<ApplicationStatus, string> = {
  draft: 'var(--text-faint)',
  submitted: '#c8a96e',
  under_review: '#3b82f6',
  needs_changes: '#f59e0b',
  resubmitted: '#a78bfa',
  approved: '#22c55e',
  rejected: '#e05aaa',
  suspended: '#e05aaa',
}

const AUDIT_ACTION_LABEL: Record<string, string> = {
  submitted: 'Soumis',
  resubmitted: 'Re-soumis',
  under_review: 'Passé en révision',
  approve: 'Approuvé',
  request_changes: 'Corrections demandées',
  reject: 'Refusé',
  suspended: 'Suspendu',
  reactivated: 'Réactivé',
}
const AUDIT_ACTION_COLOR: Record<string, string> = {
  submitted: '#c8a96e',
  resubmitted: '#a78bfa',
  under_review: '#3b82f6',
  approve: '#22c55e',
  request_changes: '#f59e0b',
  reject: '#e05aaa',
  suspended: '#e05aaa',
  reactivated: '#22c55e',
}
const AUTO_NOTE_ACTIONS = new Set(['submitted', 'resubmitted'])

const DOC_LABELS: Record<string, string> = {
  identity: "Pièce d'identité",
  billing_proof: 'Justificatif de facturation (auto-entrepreneur, statut artiste…)',
  business_doc: "Document officiel de l'entreprise (KBIS, statuts, récépissé INSEE…)",
  insurance: 'Attestation d’assurance responsabilité civile professionnelle',
  exploitation_proof: "Justificatif d'exploitation du lieu (bail, autorisation…)",
  rc_pro: 'Attestation d’assurance RC Pro (optionnelle)',
  alcohol_license: 'Licence / justificatif de débit de boissons',
}

const TYPE_ARTISTE_LABEL: Record<string, string> = {
  dj: 'DJ',
  musicien_live: 'Musicien live / Band',
  danseur: 'Danseur / Danseuse',
  performeur: 'Performeur / Show',
  dj_sax: 'DJ-Saxophoniste',
  orchestre: 'Orchestre / Groupe',
  animateur: 'Animateur / MC',
  humoriste: 'Humoriste / Stand-up',
  autre: 'Autre',
}
const EXPERIENCE_LABEL: Record<string, string> = { moins_1: '< 1 an', '1_3': '1–3 ans', '3_5': '3–5 ans', '5_10': '5–10 ans', plus_10: '> 10 ans' }
const FACTURATION_LABEL: Record<string, string> = {
  auto_entrepreneur: 'Auto-entrepreneur',
  artiste_auteur: 'Artiste-auteur',
  salarie_intermittent: 'Salarié intermittent',
  structure: 'Structure / société',
  autre: 'Autre',
}
const TYPE_LIEU_LABEL: Record<string, string> = {
  salle_reception: 'Salle de réception',
  loft: 'Loft',
  rooftop: 'Rooftop',
  club: 'Club',
  chateau: 'Château',
  warehouse: 'Warehouse',
  plein_air: 'Plein air',
  autre: 'Autre',
}
const TYPE_FOOD_LABEL: Record<string, string> = {
  traiteur: 'Traiteur',
  boissons: 'Boissons',
  cocktail: 'Bar / cocktails',
  food_truck: 'Food truck',
  desserts: 'Pâtisserie / desserts',
  autre: 'Autre',
}
const TARIF_TYPE_LABEL: Record<string, string> = {
  soiree: 'Par soirée / événement',
  heure: 'Par heure',
  journee: 'Par journée',
  forfait: 'Au forfait',
  personne: 'Par personne',
}

const cardStyle: React.CSSProperties = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: 20 }
const inputStyle: React.CSSProperties = { width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border-strong)', background: 'var(--surface-2)', color: '#fff', fontSize: 13.5, outline: 'none' }
const sectionTitleStyle: React.CSSProperties = { fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-faint)', margin: '0 0 10px' }

function str(v: unknown): string {
  return v == null ? '' : String(v)
}

function zonesLabel(ids: unknown): string {
  const list = Array.isArray(ids) ? (ids as string[]) : []
  if (list.length === 0) return '—'
  return list
    .map((id) => {
      if (id === 'international') return '🌍 International'
      const r = regions.find((r) => r.id === id)
      return r ? `${r.flag} ${r.name}` : id
    })
    .join(', ')
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('fr-FR')
}
function fmtDateTime(iso: string): string {
  const d = new Date(iso)
  return `${d.toLocaleDateString('fr-FR')} ${d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`
}

function FieldRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '6px 0', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
      <span style={{ color: 'var(--text-faint)' }}>{label}</span>
      <span style={{ color: '#fff', textAlign: 'right' }}>{value || '—'}</span>
    </div>
  )
}

function organizerFieldRows(f: Record<string, unknown>): { label: string; value: string }[] {
  const rows: { label: string; value: string }[] = []
  rows.push({ label: 'Nom commercial', value: str(f.nomCommercial) })
  rows.push({ label: 'SIRET', value: str(f.siret) })
  rows.push({ label: 'Email pro', value: str(f.emailPro) })
  rows.push({ label: 'Téléphone pro', value: f.telephonePro ? `${str(f.telephoneProCode)}${str(f.telephonePro)}` : '' })
  rows.push({ label: 'Adresse établissement', value: f.noFixedAddress ? 'Pas de lieu fixe' : str(f.adresseEtablissement) })
  if (f.siteWeb) rows.push({ label: 'Site web / Instagram', value: str(f.siteWeb) })
  rows.push({ label: "Type d'établissement", value: f.typeEtablissement === 'Autre' ? str(f.typeEtablissementCustom) || 'Autre' : str(f.typeEtablissement) })
  rows.push({ label: 'Itinérant', value: f.itinerant ? 'Oui' : 'Non' })
  if (f.itinerant) rows.push({ label: "Zones d'activité", value: zonesLabel(f.zonesActivite) })
  else rows.push({ label: 'Ville', value: str(f.ville) })
  rows.push({ label: 'Pays', value: str(f.pays) })
  if (f.capacite != null && f.capacite !== '') rows.push({ label: 'Capacité', value: `${f.capacite} pers.` })
  if (f.horaires) rows.push({ label: 'Horaires', value: str(f.horaires) })
  rows.push({ label: 'Alcool', value: f.alcool ? (f.alcoolAtteste ? 'Oui — attestation fournie' : 'Oui — attestation manquante') : 'Non' })
  if (f.description) rows.push({ label: 'Description', value: str(f.description) })
  return rows
}

function prestataireFieldRows(f: Record<string, unknown>): { header: string | null; rows: { label: string; value: string }[] }[] {
  const types = Array.isArray(f.prestataireTypes) ? (f.prestataireTypes as string[]) : []
  const blocks: { header: string | null; rows: { label: string; value: string }[] }[] = []

  const common: { label: string; value: string }[] = [
    { label: 'Activités prestataire', value: getProviderCategories({ prestataireTypes: types }).map((c) => c.label).join(' · ') },
    { label: 'Nom', value: [f.prenom, f.nom].map(str).filter(Boolean).join(' ') },
    { label: 'Téléphone', value: f.telephone ? `${str(f.telephoneCode)}${str(f.telephone)}` : '' },
    { label: 'Ville', value: str(f.ville) },
  ]
  if (types.includes('artiste') && f.nomScene) common.push({ label: 'Nom de scène', value: str(f.nomScene) })
  common.push({ label: 'Nom commercial', value: str(f.nomCommercial) })
  if (f.siret) common.push({ label: 'SIRET', value: str(f.siret) })
  if (f.siteWeb) common.push({ label: 'Site web / Instagram', value: str(f.siteWeb) })
  common.push({ label: "Zones d'intervention", value: zonesLabel(f.zonesIntervention) })
  if (f.description) common.push({ label: 'Description', value: str(f.description) })
  if (f.specialitesLibre) common.push({ label: 'Spécialités', value: str(f.specialitesLibre) })
  blocks.push({ header: null, rows: common })

  if (types.includes('artiste')) {
    const rows: { label: string; value: string }[] = []
    if (f.typeArtiste) rows.push({ label: "Type d'artiste", value: TYPE_ARTISTE_LABEL[str(f.typeArtiste)] || str(f.typeArtiste) })
    if (f.styles) rows.push({ label: 'Styles / Spécialités', value: str(f.styles) })
    if (f.anneesExperience) rows.push({ label: 'Expérience', value: EXPERIENCE_LABEL[str(f.anneesExperience)] || str(f.anneesExperience) })
    if (f.statutFacturation) rows.push({ label: 'Statut facturation', value: FACTURATION_LABEL[str(f.statutFacturation)] || str(f.statutFacturation) })
    if (f.portfolio) rows.push({ label: 'Portfolio', value: str(f.portfolio) })
    if (f.instagram) rows.push({ label: 'Instagram', value: str(f.instagram) })
    if (f.besoinstechniques) rows.push({ label: 'Rider technique', value: str(f.besoinstechniques) })
    blocks.push({ header: 'Artiste', rows })
  }
  if (types.includes('salle')) {
    const rows: { label: string; value: string }[] = []
    if (f.adresseLieu) rows.push({ label: 'Adresse', value: str(f.adresseLieu) })
    if (f.capaciteLieu != null && f.capaciteLieu !== '') rows.push({ label: 'Capacité', value: `${f.capaciteLieu} pers.` })
    if (f.typeLieu) rows.push({ label: 'Type de lieu', value: TYPE_LIEU_LABEL[str(f.typeLieu)] || str(f.typeLieu) })
    if (f.equipements) rows.push({ label: 'Équipements', value: str(f.equipements) })
    if (f.horairesAutorises) rows.push({ label: 'Horaires autorisés', value: str(f.horairesAutorises) })
    if (f.reglesDuLieu) rows.push({ label: 'Règles', value: str(f.reglesDuLieu) })
    blocks.push({ header: 'Lieu', rows })
  }
  if (types.includes('materiel')) {
    const rows: { label: string; value: string }[] = []
    if (f.categoriesMateriel) rows.push({ label: 'Catégories', value: str(f.categoriesMateriel) })
    if (f.inventaire) rows.push({ label: 'Inventaire', value: str(f.inventaire) })
    if (f.conditionsLocation) rows.push({ label: 'Conditions location', value: str(f.conditionsLocation) })
    if (f.politiqueCaution) rows.push({ label: 'Politique caution', value: str(f.politiqueCaution) })
    blocks.push({ header: 'Matériel', rows })
  }
  if (types.includes('food')) {
    const rows: { label: string; value: string }[] = []
    if (f.typeActiviteFood) rows.push({ label: "Type d'activité", value: TYPE_FOOD_LABEL[str(f.typeActiviteFood)] || str(f.typeActiviteFood) })
    if (f.menuBase) rows.push({ label: 'Menu / Carte', value: str(f.menuBase) })
    rows.push({ label: 'Alcool', value: f.alcoolFood ? (f.alcoolFoodAtteste ? 'Oui — attestation fournie' : 'Oui — vérifier la licence alcool') : 'Non' })
    blocks.push({ header: 'Food / Boissons', rows })
  }

  const hasTarif = f.tarifDevis || f.tarifMin != null || f.tarifMax != null || f.tarifType
  if (hasTarif) {
    const rows: { label: string; value: string }[] = []
    if (f.tarifDevis) {
      rows.push({ label: 'Tarification', value: 'Sur devis uniquement' })
    } else {
      if (f.tarifMin != null || f.tarifMax != null) rows.push({ label: 'Fourchette', value: `${f.tarifMin ?? '?'}€ – ${f.tarifMax ?? '?'}€` })
      if (f.tarifType) rows.push({ label: 'Type', value: TARIF_TYPE_LABEL[str(f.tarifType)] || str(f.tarifType) })
    }
    blocks.push({ header: 'Tarifs', rows })
  }

  return blocks
}

interface ToastState {
  message: string
  kind: 'success' | 'error'
}

const TOAST_LABEL: Partial<Record<ModerateAction, string>> = {
  approve: 'Dossier approuvé',
  reject: 'Dossier refusé',
  request_changes: 'Corrections demandées',
  under_review: 'Dossier en révision',
}

export default function AgentDossiersClient() {
  const [applications, setApplications] = useState<ApplicationSummary[]>([])
  const [listLoading, setListLoading] = useState(true)
  const [listError, setListError] = useState(false)
  const [section, setSection] = useState('pending')
  const [search, setSearch] = useState('')

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [detail, setDetail] = useState<ApplicationDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)

  const [activeAction, setActiveAction] = useState<'approve' | 'changes' | 'reject' | null>(null)
  const [actionNote, setActionNote] = useState('')
  const [actionBusy, setActionBusy] = useState(false)
  const [confirmSuspend, setConfirmSuspend] = useState(false)

  const [noteDraft, setNoteDraft] = useState('')
  const [noteBusy, setNoteBusy] = useState(false)

  const [toast, setToast] = useState<ToastState | null>(null)

  function showToast(message: string, kind: ToastState['kind']) {
    setToast({ message, kind })
    setTimeout(() => setToast(null), 3000)
  }

  async function loadList() {
    setListLoading(true)
    setListError(false)
    try {
      const res = await fetch('/api/agent/applications')
      const data = await res.json()
      if (!res.ok || !data.ok) throw new Error('load_failed')
      setApplications(data.applications)
    } catch {
      setListError(true)
    } finally {
      setListLoading(false)
    }
  }

  async function loadDetail(id: string) {
    setDetailLoading(true)
    try {
      const res = await fetch(`/api/agent/applications/${id}`)
      const data = await res.json()
      if (!res.ok || !data.ok) throw new Error('load_failed')
      setDetail(data.application)
      setNoteDraft(data.application.adminNote)
    } finally {
      setDetailLoading(false)
    }
  }

  useEffect(() => {
    let cancelled = false
    async function run() {
      setListLoading(true)
      setListError(false)
      try {
        const res = await fetch('/api/agent/applications')
        const data = await res.json()
        if (!res.ok || !data.ok) throw new Error('load_failed')
        if (!cancelled) setApplications(data.applications)
      } catch {
        if (!cancelled) setListError(true)
      } finally {
        if (!cancelled) setListLoading(false)
      }
    }
    run()
    return () => {
      cancelled = true
    }
  }, [])

  function closeDetail() {
    setSelectedId(null)
    setDetail(null)
  }

  useEffect(() => {
    if (!selectedId) return
    let cancelled = false
    async function run() {
      setDetailLoading(true)
      try {
        const res = await fetch(`/api/agent/applications/${selectedId}`)
        const data = await res.json()
        if (!res.ok || !data.ok) throw new Error('load_failed')
        if (!cancelled) {
          setDetail(data.application)
          setNoteDraft(data.application.adminNote)
        }
      } finally {
        if (!cancelled) setDetailLoading(false)
      }
    }
    run()
    return () => {
      cancelled = true
    }
  }, [selectedId])

  useEffect(() => {
    if (!selectedId) return
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') closeDetail()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [selectedId])

  const activeSection = SECTIONS.find((s) => s.key === section) || SECTIONS[0]

  const filteredBySection = useMemo(() => applications.filter((a) => activeSection.statuses.includes(a.status)), [applications, activeSection])

  const searched = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return filteredBySection
    return filteredBySection.filter((a) => a.displayName.toLowerCase().includes(term) || a.userEmail.toLowerCase().includes(term) || a.userName.toLowerCase().includes(term))
  }, [filteredBySection, search])

  const sorted = useMemo(() => [...searched].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()), [searched])

  const grouped = useMemo(() => {
    const byEmail = new Map<string, ApplicationSummary[]>()
    for (const app of sorted) {
      const key = app.userEmail || app.userId
      byEmail.set(key, [...(byEmail.get(key) ?? []), app])
    }
    return [...byEmail.values()]
  }, [sorted])

  const totalAllPending = applications.filter((a) => a.status === 'submitted' || a.status === 'under_review' || a.status === 'resubmitted').length

  async function runAction(action: ModerateAction, note?: string) {
    if (!detail) return
    setActionBusy(true)
    try {
      const res = await fetch(`/api/agent/applications/${detail.id}/moderate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, note }),
      })
      const data = await res.json()
      if (!res.ok || !data.ok) {
        showToast('Échec serveur — dossier non mis à jour. Réessaie.', 'error')
        return
      }
      showToast(TOAST_LABEL[action] ?? 'Dossier mis à jour', 'success')
      setActiveAction(null)
      setActionNote('')
      setConfirmSuspend(false)
      await Promise.all([loadList(), loadDetail(detail.id)])
    } finally {
      setActionBusy(false)
    }
  }

  async function saveNote() {
    if (!detail) return
    setNoteBusy(true)
    try {
      const res = await fetch(`/api/agent/applications/${detail.id}/note`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note: noteDraft }),
      })
      const data = await res.json()
      if (!res.ok || !data.ok) {
        showToast('Échec de l’enregistrement de la note.', 'error')
        return
      }
      showToast('Note enregistrée', 'success')
    } finally {
      setNoteBusy(false)
    }
  }

  return (
    <main style={{ minHeight: '100vh', padding: '32px 16px 80px' }}>
      <div style={{ maxWidth: 760, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: '#fff', margin: 0 }}>Dossiers</h1>
          {totalAllPending > 0 && (
            <span style={{ padding: '4px 10px', borderRadius: 999, background: 'rgba(224,90,170,0.16)', color: '#e05aaa', fontSize: 12, fontWeight: 700 }}>
              {totalAllPending} en attente
            </span>
          )}
        </div>

        {listError && (
          <div style={{ ...cardStyle, border: '1px solid rgba(224,90,170,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>Lecture impossible. Recharge la page ; si ça persiste, reconnecte-toi (droits agent).</p>
            <button onClick={loadList} style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid var(--border-strong)', background: 'transparent', color: '#fff', cursor: 'pointer', fontSize: 12.5 }}>
              Recharger
            </button>
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
          {SECTIONS.map((s) => {
            const count = applications.filter((a) => s.statuses.includes(a.status)).length
            const active = s.key === section
            return (
              <button
                key={s.key}
                onClick={() => {
                  setSection(s.key)
                  setSearch('')
                }}
                style={{
                  padding: '12px 10px',
                  borderRadius: 12,
                  border: `1px solid ${active ? s.color : 'var(--border)'}`,
                  background: active ? `${s.color}22` : 'var(--surface)',
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
              >
                <div style={{ fontSize: 20, fontWeight: 800, color: s.color }}>{count}</div>
                <div style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: active ? s.color : 'var(--text-faint)' }}>{s.label}</div>
              </button>
            )
          })}
        </div>

        {filteredBySection.length > 0 && (
          <input
            style={inputStyle}
            placeholder={`Rechercher dans « ${activeSection.label} »…`}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        )}

        {listLoading ? (
          <p style={{ fontSize: 13, color: 'var(--text-faint)' }}>Chargement…</p>
        ) : grouped.length === 0 ? (
          <div style={{ ...cardStyle, textAlign: 'center' }}>
            <p style={{ fontSize: 15, fontWeight: 700, color: '#fff', margin: '0 0 6px' }}>{search ? 'Aucun résultat' : 'Aucun dossier'}</p>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>
              {search ? `Aucun dossier ne correspond à « ${search} » dans « ${activeSection.label} ».` : `Aucun dossier dans la section « ${activeSection.label} ».`}
            </p>
            {search && (
              <button onClick={() => setSearch('')} style={{ marginTop: 12, padding: '8px 14px', borderRadius: 8, border: '1px solid var(--border-strong)', background: 'transparent', color: '#fff', cursor: 'pointer', fontSize: 12.5 }}>
                Effacer la recherche
              </button>
            )}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {grouped.map((group) =>
              group.length === 1 ? (
                <AppCard key={group[0].id} app={group[0]} onClick={() => setSelectedId(group[0].id)} />
              ) : (
                <div key={group[0].userEmail || group[0].userId} style={{ ...cardStyle, background: 'var(--surface-2)', border: '1px solid var(--border-strong)', padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 11.5, color: 'var(--text-faint)' }}>Même compte · plusieurs activités</span>
                    <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>{group.length} dossiers</span>
                  </div>
                  {group.map((app) => (
                    <AppCard key={app.id} app={app} compact onClick={() => setSelectedId(app.id)} />
                  ))}
                </div>
              )
            )}
          </div>
        )}
      </div>

      {selectedId && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 60, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
          <div onClick={closeDetail} style={{ position: 'absolute', inset: 0, background: 'rgba(3,4,8,0.72)', backdropFilter: 'blur(8px)' }} />
          <div style={{ position: 'relative', width: '100%', maxWidth: 560, maxHeight: '88vh', overflowY: 'auto', background: 'var(--surface-2)', borderRadius: '16px 16px 0 0', padding: '18px 20px 32px' }}>
            <div style={{ width: 36, height: 4, borderRadius: 999, background: 'var(--border-strong)', margin: '0 auto 16px' }} />
            <button
              type="button"
              onClick={closeDetail}
              aria-label="Fermer le dossier"
              style={{ position: 'absolute', top: 12, right: 14, width: 36, height: 36, borderRadius: 10, border: '1px solid var(--border-strong)', background: 'var(--surface)', color: 'var(--text)', cursor: 'pointer', fontSize: 20, lineHeight: 1 }}
            >
              ×
            </button>
            {detailLoading || !detail ? (
              <p style={{ fontSize: 13, color: 'var(--text-faint)', textAlign: 'center', padding: '40px 0' }}>Chargement…</p>
            ) : (
              <DetailPanel
                detail={detail}
                activeAction={activeAction}
                setActiveAction={setActiveAction}
                actionNote={actionNote}
                setActionNote={setActionNote}
                actionBusy={actionBusy}
                confirmSuspend={confirmSuspend}
                setConfirmSuspend={setConfirmSuspend}
                noteDraft={noteDraft}
                setNoteDraft={setNoteDraft}
                noteBusy={noteBusy}
                onSaveNote={saveNote}
                onAction={runAction}
              />
            )}
          </div>
        </div>
      )}

      {toast && (
        <div
          style={{
            position: 'fixed',
            bottom: 24,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 80,
            padding: '10px 18px',
            borderRadius: 10,
            background: 'var(--surface-2)',
            border: `1px solid ${toast.kind === 'success' ? 'var(--teal)' : '#e05aaa'}`,
            color: '#fff',
            fontSize: 13,
          }}
        >
          {toast.message}
        </div>
      )}
    </main>
  )
}

function AppCard({ app, compact, onClick }: { app: ApplicationSummary; compact?: boolean; onClick: () => void }) {
  const typeLabel = app.type === 'organisateur' ? 'Organisateur' : 'Prestataire'
  const dateLabel = app.submittedAt ? `Soumis le ${fmtDate(app.submittedAt)}` : `Mis à jour le ${fmtDate(app.updatedAt)}`

  return (
    <button
      onClick={onClick}
      style={{
        ...cardStyle,
        padding: compact ? '10px 12px' : 16,
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        cursor: 'pointer',
        textAlign: 'left',
        width: '100%',
        border: compact ? '1px solid var(--border)' : cardStyle.border,
      }}
    >
      <div
        style={{
          width: compact ? 28 : 36,
          height: compact ? 28 : 36,
          borderRadius: '50%',
          background: 'var(--gold)',
          color: 'var(--obsidian)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontWeight: 800,
          fontSize: compact ? 12 : 14,
          flexShrink: 0,
        }}
      >
        {(app.displayName || '?').charAt(0).toUpperCase()}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ flex: 1, minWidth: 0, fontSize: compact ? 13 : 14.5, fontWeight: 700, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{app.displayName}</span>
          <span style={{ flexShrink: 0, whiteSpace: 'nowrap', fontSize: 10.5, padding: '2px 6px', borderRadius: 6, background: `${STATUS_COLOR[app.status]}22`, color: STATUS_COLOR[app.status] }}>{STATUS_LABEL[app.status]}</span>
        </div>
        <p style={{ fontSize: 11.5, color: 'var(--text-faint)', margin: '2px 0 0' }}>
          {typeLabel} · {app.userEmail} · {dateLabel}
        </p>
        {app.status === 'needs_changes' && app.requestedChanges && (
          <p style={{ fontSize: 11.5, color: '#f59e0b', background: 'rgba(245,158,11,0.1)', borderRadius: 6, padding: '4px 8px', margin: '6px 0 0' }}>{app.requestedChanges}</p>
        )}
      </div>
    </button>
  )
}

function DetailPanel({
  detail,
  activeAction,
  setActiveAction,
  actionNote,
  setActionNote,
  actionBusy,
  confirmSuspend,
  setConfirmSuspend,
  noteDraft,
  setNoteDraft,
  noteBusy,
  onSaveNote,
  onAction,
}: {
  detail: ApplicationDetail
  activeAction: 'approve' | 'changes' | 'reject' | null
  setActiveAction: (a: 'approve' | 'changes' | 'reject' | null) => void
  actionNote: string
  setActionNote: (v: string) => void
  actionBusy: boolean
  confirmSuspend: boolean
  setConfirmSuspend: (v: boolean) => void
  noteDraft: string
  setNoteDraft: (v: string) => void
  noteBusy: boolean
  onSaveNote: () => void
  onAction: (action: ModerateAction, note?: string) => void
}) {
  const displayName =
    detail.type === 'organisateur'
      ? str(detail.formData.nomCommercial) || detail.userName || '—'
      : str(detail.formData.nomCommercial) || detail.userName || '—'
  const typeLabel = detail.type === 'organisateur' ? 'Organisateur' : 'Prestataire'
  const uploadedDocKeys = Object.keys(detail.documents)
  const completeness = getApplicationCompleteness(detail.type, detail.formData, uploadedDocKeys)

  const lastMessage = detail.status === 'needs_changes' ? detail.requestedChanges : detail.status === 'rejected' || detail.status === 'suspended' ? detail.rejectionReason : ''

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <h2 style={{ fontSize: 19, fontWeight: 800, color: '#fff', margin: 0 }}>{displayName}</h2>
          <span style={{ fontSize: 11, padding: '3px 8px', borderRadius: 999, background: `${STATUS_COLOR[detail.status]}22`, color: STATUS_COLOR[detail.status], fontWeight: 700 }}>
            {STATUS_LABEL[detail.status]}
          </span>
        </div>
        <p style={{ fontSize: 12.5, color: 'var(--text-faint)', margin: '4px 0 0' }}>
          {detail.userEmail} · {typeLabel}
        </p>
      </div>

      <div>
        <p style={sectionTitleStyle}>Complétude</p>
        <div style={{ height: 6, borderRadius: 999, background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${completeness}%`, background: completeness >= 80 ? 'var(--teal)' : completeness >= 50 ? 'var(--gold)' : '#e05aaa' }} />
        </div>
        <p style={{ fontSize: 11.5, color: 'var(--text-faint)', margin: '4px 0 0' }}>{completeness}%</p>
      </div>

      {detail.candidateNote && (
        <div style={{ background: 'rgba(139,92,246,0.1)', border: '1px solid rgba(139,92,246,0.3)', borderRadius: 12, padding: 14 }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: '#a78bfa', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 6px' }}>
            {detail.status === 'resubmitted' ? 'Message joint à la re-soumission' : 'Message joint à la soumission'}
          </p>
          <p style={{ fontSize: 13.5, color: '#fff', margin: 0, fontStyle: 'italic' }}>« {detail.candidateNote} »</p>
        </div>
      )}

      <div>
        <p style={sectionTitleStyle}>Informations formulaire</p>
        {detail.type === 'organisateur' ? (
          <div>{organizerFieldRows(detail.formData).map((r) => <FieldRow key={r.label} label={r.label} value={r.value} />)}</div>
        ) : (
          prestataireFieldRows(detail.formData).map((block, i) => (
            <div key={i} style={{ marginTop: i > 0 ? 14 : 0 }}>
              {block.header && <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--gold)', margin: '0 0 4px' }}>{block.header}</p>}
              {block.rows.map((r) => (
                <FieldRow key={r.label} label={r.label} value={r.value} />
              ))}
            </div>
          ))
        )}
      </div>

      <div>
        <p style={sectionTitleStyle}>Documents déposés</p>
        {uploadedDocKeys.length === 0 ? (
          <p style={{ fontSize: 13, color: 'var(--text-faint)', margin: 0 }}>Aucun document</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {uploadedDocKeys.map((key) => (
              <div key={key}>
                <p style={{ fontSize: 12, fontWeight: 700, color: '#fff', margin: '0 0 4px' }}>{DOC_LABELS[key] || key}</p>
                {detail.documents[key].map((doc, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text-muted)', padding: '3px 0' }}>
                    <span>
                      {doc.name}
                      {doc.size ? ` · ${Math.round(doc.size / 1024)}ko` : ''}
                    </span>
                    {doc.url ? (
                      <a href={doc.url} target="_blank" rel="noreferrer" style={{ color: 'var(--teal)' }}>
                        Voir →
                      </a>
                    ) : (
                      <span style={{ color: 'var(--text-faint)' }}>Fichier indisponible</span>
                    )}
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>

      {lastMessage && (
        <div>
          <p style={sectionTitleStyle}>Dernier message envoyé</p>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>« {lastMessage} »</p>
        </div>
      )}

      <div>
        <p style={sectionTitleStyle}>Notes internes</p>
        <p style={{ fontSize: 11, color: 'var(--text-faint)', margin: '0 0 8px' }}>Privé — jamais visible par le candidat.</p>
        <textarea style={{ ...inputStyle, minHeight: 70 }} value={noteDraft} onChange={(e) => setNoteDraft(e.target.value)} placeholder="Ajouter une note…" />
        <button
          onClick={onSaveNote}
          disabled={noteBusy || noteDraft === detail.adminNote}
          style={{ marginTop: 8, padding: '8px 14px', borderRadius: 8, border: '1px solid var(--border-strong)', background: 'transparent', color: '#fff', cursor: noteBusy ? 'default' : 'pointer', fontSize: 12.5, opacity: noteDraft === detail.adminNote ? 0.5 : 1 }}
        >
          Enregistrer la note
        </button>
      </div>

      <div>
        <p style={sectionTitleStyle}>Actions</p>
        <DossierActions
          status={detail.status}
          activeAction={activeAction}
          setActiveAction={setActiveAction}
          actionNote={actionNote}
          setActionNote={setActionNote}
          actionBusy={actionBusy}
          confirmSuspend={confirmSuspend}
          setConfirmSuspend={setConfirmSuspend}
          displayName={displayName}
          onAction={onAction}
        />
      </div>

      {detail.auditLog.length > 0 && (
        <div>
          <p style={sectionTitleStyle}>Historique</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[...detail.auditLog].reverse().map((entry, i) => (
              <div key={i} style={{ display: 'flex', gap: 10 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: AUDIT_ACTION_COLOR[entry.action] || 'var(--text-faint)', marginTop: 5, flexShrink: 0 }} />
                <div>
                  <p style={{ fontSize: 12.5, color: '#fff', margin: 0 }}>{AUDIT_ACTION_LABEL[entry.action] || entry.action}</p>
                  {entry.note && !AUTO_NOTE_ACTIONS.has(entry.action) && (
                    <p style={{ fontSize: 12, color: AUDIT_ACTION_COLOR[entry.action] || 'var(--text-muted)', margin: '2px 0' }}>« {entry.note} »</p>
                  )}
                  <p style={{ fontSize: 11, color: 'var(--text-faint)', margin: '2px 0 0' }}>
                    {entry.byName || entry.by} · {fmtDateTime(entry.at)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function DossierActions({
  status,
  activeAction,
  setActiveAction,
  actionNote,
  setActionNote,
  actionBusy,
  confirmSuspend,
  setConfirmSuspend,
  displayName,
  onAction,
}: {
  status: ApplicationStatus
  activeAction: 'approve' | 'changes' | 'reject' | null
  setActiveAction: (a: 'approve' | 'changes' | 'reject' | null) => void
  actionNote: string
  setActionNote: (v: string) => void
  actionBusy: boolean
  confirmSuspend: boolean
  setConfirmSuspend: (v: boolean) => void
  displayName: string
  onAction: (action: ModerateAction, note?: string) => void
}) {
  const btnBase: React.CSSProperties = { padding: '11px 16px', borderRadius: 10, border: 'none', fontSize: 13, fontWeight: 700, cursor: 'pointer', width: '100%' }
  const teal: React.CSSProperties = { ...btnBase, background: 'var(--teal)', color: 'var(--obsidian)' }
  const amber: React.CSSProperties = { ...btnBase, background: '#f59e0b', color: '#1a1508' }
  const pink: React.CSSProperties = { ...btnBase, background: '#c2347f', color: '#fff' }
  const blue: React.CSSProperties = { ...btnBase, background: '#3b82f6', color: '#fff' }

  function reset() {
    setActiveAction(null)
    setActionNote('')
  }

  if (status === 'rejected') {
    return <p style={{ fontSize: 13, color: 'var(--text-faint)', margin: 0 }}>Dossier refusé — aucune action disponible.</p>
  }

  if (status === 'approved') {
    return (
      <>
        <button style={pink} onClick={() => setConfirmSuspend(true)} disabled={actionBusy}>
          Suspendre le compte
        </button>
        {confirmSuspend && (
          <ConfirmModal
            title={`Suspendre le dossier de ${displayName} ?`}
            color="#c2347f"
            busy={actionBusy}
            onCancel={() => setConfirmSuspend(false)}
            onConfirm={() => onAction('suspend')}
          />
        )}
      </>
    )
  }

  if (status === 'suspended') {
    return (
      <button style={teal} onClick={() => onAction('reactivate')} disabled={actionBusy}>
        Réactiver le dossier
      </button>
    )
  }

  if (status === 'needs_changes') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <p style={{ fontSize: 12.5, color: 'var(--text-muted)', margin: 0 }}>
          Le candidat a été notifié des corrections à apporter. Le dossier repassera en « En attente » une fois re-soumis.
        </p>
        {activeAction === 'reject' ? (
          <ActionForm
            label="Motif de refus (optionnel)"
            required={false}
            placeholder="Ex : Malgré les corrections demandées, le dossier ne répond pas aux critères."
            helper="Ce motif sera visible par le candidat depuis son espace."
            note={actionNote}
            setNote={setActionNote}
            busy={actionBusy}
            confirmLabel="Confirmer le refus"
            confirmStyle={pink}
            onCancel={reset}
            onConfirm={() => onAction('reject', actionNote)}
          />
        ) : (
          <button style={pink} onClick={() => setActiveAction('reject')} disabled={actionBusy}>
            Refuser définitivement
          </button>
        )}
      </div>
    )
  }

  // submitted | under_review | resubmitted
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {activeAction === 'approve' ? (
        <ActionForm
          label="Message d'approbation (optionnel)"
          required={false}
          placeholder="Ex : Votre dossier a été approuvé. Bienvenue sur LIVEINBLACK."
          note={actionNote}
          setNote={setActionNote}
          busy={actionBusy}
          confirmLabel="Confirmer l'approbation"
          confirmStyle={teal}
          onCancel={reset}
          onConfirm={() => onAction('approve', actionNote)}
        />
      ) : (
        <button style={teal} onClick={() => setActiveAction('approve')} disabled={actionBusy}>
          Approuver le dossier
        </button>
      )}

      {activeAction === 'changes' ? (
        <ActionForm
          label="Corrections requises *"
          required
          placeholder="Ex : Merci de renvoyer une pièce d'identité valide et de compléter la section activité."
          helper="Ce message sera visible par le candidat depuis son espace."
          note={actionNote}
          setNote={setActionNote}
          busy={actionBusy}
          confirmLabel="Envoyer les corrections"
          confirmStyle={amber}
          onCancel={reset}
          onConfirm={() => onAction('request_changes', actionNote)}
        />
      ) : (
        <button style={amber} onClick={() => setActiveAction('changes')} disabled={actionBusy}>
          Demander des corrections
        </button>
      )}

      {(status === 'submitted' || status === 'resubmitted') && (
        <button style={blue} onClick={() => onAction('under_review')} disabled={actionBusy}>
          Passer en révision
        </button>
      )}

      {activeAction === 'reject' ? (
        <ActionForm
          label="Motif de refus (optionnel)"
          required={false}
          placeholder="Ex : Le dossier ne correspond pas aux critères d'éligibilité."
          helper="Ce motif sera visible par le candidat depuis son espace."
          note={actionNote}
          setNote={setActionNote}
          busy={actionBusy}
          confirmLabel="Confirmer le refus"
          confirmStyle={pink}
          onCancel={reset}
          onConfirm={() => onAction('reject', actionNote)}
        />
      ) : (
        <button style={pink} onClick={() => setActiveAction('reject')} disabled={actionBusy}>
          Refuser le dossier
        </button>
      )}
    </div>
  )
}

function ActionForm({
  label,
  required,
  placeholder,
  helper,
  note,
  setNote,
  busy,
  confirmLabel,
  confirmStyle,
  onCancel,
  onConfirm,
}: {
  label: string
  required: boolean
  placeholder: string
  helper?: string
  note: string
  setNote: (v: string) => void
  busy: boolean
  confirmLabel: string
  confirmStyle: React.CSSProperties
  onCancel: () => void
  onConfirm: () => void
}) {
  const disabled = busy || (required && !note.trim())
  return (
    <div style={{ ...cardStyle, padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <label style={{ fontSize: 12, color: 'var(--text-muted)' }}>{label}</label>
      <textarea style={{ ...inputStyle, minHeight: 70 }} value={note} onChange={(e) => setNote(e.target.value)} placeholder={placeholder} />
      {helper && <p style={{ fontSize: 11, color: 'var(--text-faint)', margin: 0 }}>{helper}</p>}
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={onCancel} disabled={busy} style={{ flex: 1, padding: '9px 12px', borderRadius: 8, border: '1px solid var(--border-strong)', background: 'transparent', color: '#fff', cursor: 'pointer', fontSize: 12.5 }}>
          Annuler
        </button>
        <button onClick={onConfirm} disabled={disabled} style={{ ...confirmStyle, flex: 1, opacity: disabled ? 0.5 : 1, padding: '9px 12px', fontSize: 12.5 }}>
          {confirmLabel}
        </button>
      </div>
    </div>
  )
}

function ConfirmModal({ title, color, busy, onCancel, onConfirm }: { title: string; color: string; busy: boolean; onCancel: () => void; onConfirm: () => void }) {
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 90, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div onClick={onCancel} style={{ position: 'absolute', inset: 0, background: 'rgba(3,4,8,0.72)', backdropFilter: 'blur(8px)' }} />
      <div style={{ position: 'relative', ...cardStyle, maxWidth: 360, width: '90%', textAlign: 'center' }}>
        <p style={{ fontSize: 15, fontWeight: 700, color: '#fff', margin: '0 0 18px' }}>{title}</p>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={onCancel} disabled={busy} style={{ flex: 1, padding: '10px 14px', borderRadius: 8, border: '1px solid var(--border-strong)', background: 'transparent', color: '#fff', cursor: 'pointer', fontSize: 13 }}>
            Annuler
          </button>
          <button onClick={onConfirm} disabled={busy} style={{ flex: 1, padding: '10px 14px', borderRadius: 8, border: 'none', background: color, color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>
            Confirmer
          </button>
        </div>
      </div>
    </div>
  )
}
