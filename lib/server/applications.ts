import bcrypt from 'bcryptjs'
import { getDb } from '../db/mongoose'
import User from '../models/User'
import Application, { type ApplicationDoc } from '../models/Application'
import { uploadDataUri } from './cloudinary'
import { applicationReceivedEmail } from './email-templates'
import { sendEmail } from './email'
import { validateOrganizerFormData, type OrganizerFormData, validatePrestataireFormData, type PrestataireFormData, getRequiredDocs } from '../shared/applicationValidation'
import { applicationApprovedEmail, applicationRejectedEmail, applicationNeedsChangesEmail } from './email-templates'

// Port de src/utils/applications.js (#7 phase organisateur) — dossier de
// candidature organisateur/prestataire. Cette phase ne construit QUE le
// côté organisateur (le prestataire suit le même moteur générique
// type:'organisateur'|'prestataire' mais son UI/ses champs propres restent
// hors périmètre, phase 8).
//
// Différence volontaire avec le legacy : là où applications.js gardait un
// "brouillon anonyme" uniquement en localStorage (aucune écriture serveur
// avant la création du compte, précisément pour ne jamais créer de "compte
// fantôme"), ce port n'a pas de notion de brouillon anonyme CÔTÉ SERVEUR du
// tout — le mode anonyme est un aller simple : le client garde son état de
// formulaire en mémoire à travers les 4 étapes, et un SEUL appel final
// (`registerAndSubmitOrganizerApplication`) crée le compte ET la
// candidature, atomiquement, exactement au moment où le legacy le fait
// aussi (jamais avant).

export interface ApplicationCaller {
  id: string
}

type ErrResult = { ok: false; status: number; error: string }

export interface DocumentEntryInput {
  name: string
  dataUri: string
}

export interface ApplicationDocumentView {
  name: string
  url: string
  size: number
  uploadedAt: string | null
}

export interface ApplicationView {
  id: string
  type: 'organisateur' | 'prestataire'
  status: ApplicationDoc['status']
  formData: Record<string, unknown>
  documents: Record<string, ApplicationDocumentView[]>
  requestedChanges: string
  rejectionReason: string
  candidateNote: string
  submittedAt: string | null
  approvedAt: string | null
  rejectedAt: string | null
  updatedAt: string
}

// Organisateur : seule la pièce d'identité est réellement exigée — Stripe
// Connect gère la vérification bancaire séparément (voir
// OnboardingOrganisateur.jsx step "Tes revenus"/documents, comment legacy :
// "Stripe gère les coords bancaires — on ne demande que l'identité").
// Prestataire : exigences DYNAMIQUES selon les catégories choisies, voir
// getRequiredDocs (lib/shared/applicationValidation.ts, port de
// src/utils/applications.js) — jamais un simple ['identity'] fixe.

function toApplicationView(app: ApplicationDoc & { _id: unknown }): ApplicationView {
  const documents: Record<string, ApplicationDocumentView[]> = {}
  const docsMap = app.documents as unknown as Map<string, ApplicationDocumentView[]> | Record<string, ApplicationDocumentView[]> | undefined
  if (docsMap) {
    const entries = docsMap instanceof Map ? docsMap.entries() : Object.entries(docsMap)
    for (const [key, list] of entries) {
      documents[key] = (list || []).map((d) => ({ name: d.name, url: d.url, size: d.size ?? 0, uploadedAt: d.uploadedAt ? new Date(d.uploadedAt).toISOString() : null }))
    }
  }

  return {
    id: String(app._id),
    type: app.type,
    status: app.status,
    formData: (app.formData as Record<string, unknown>) ?? {},
    documents,
    requestedChanges: app.requestedChanges ?? '',
    rejectionReason: app.rejectionReason ?? '',
    candidateNote: app.candidateNote ?? '',
    submittedAt: app.submittedAt ? new Date(app.submittedAt).toISOString() : null,
    approvedAt: app.approvedAt ? new Date(app.approvedAt).toISOString() : null,
    rejectedAt: app.rejectedAt ? new Date(app.rejectedAt).toISOString() : null,
    updatedAt: new Date(app.updatedAt as unknown as string).toISOString(),
  }
}

export async function getMyApplication(caller: ApplicationCaller, type: 'organisateur' | 'prestataire'): Promise<ApplicationView | null> {
  await getDb()
  const app = await Application.findOne({ userId: caller.id, type }).lean()
  return app ? toApplicationView(app as ApplicationDoc & { _id: unknown }) : null
}

export type SaveDraftResult = ErrResult | { ok: true }

// Autosave (mode connecté uniquement) — le mode anonyme n'a aucun
// équivalent serveur, voir le commentaire d'en-tête.
export async function saveApplicationDraft(caller: ApplicationCaller, type: 'organisateur' | 'prestataire', formData: Record<string, unknown>): Promise<SaveDraftResult> {
  await getDb()

  const existing = await Application.findOne({ userId: caller.id, type })
  if (existing && !['draft', 'needs_changes'].includes(existing.status)) {
    // Un dossier déjà soumis/en review/approuvé ne se modifie plus par
    // autosave — cohérent avec MonDossierPage legacy (isEditable = draft ou
    // needs_changes uniquement).
    return { ok: false, status: 409, error: 'not_editable' }
  }

  await Application.findOneAndUpdate(
    { userId: caller.id, type },
    { $set: { formData }, $setOnInsert: { userId: caller.id, type, status: 'draft' } },
    { upsert: true }
  )
  return { ok: true }
}

interface SubmitInput {
  formData: OrganizerFormData
  documents: Record<string, DocumentEntryInput[]>
  candidateNote?: string
}

export type SubmitResult = ErrResult | { ok: true; application: ApplicationView }

type UploadDocsResult = { ok: true; documents: Record<string, ApplicationDocumentView[]> } | ErrResult

async function uploadApplicationDocuments(userId: string, appId: string, documents: Record<string, DocumentEntryInput[]>): Promise<UploadDocsResult> {
  const uploaded: Record<string, ApplicationDocumentView[]> = {}
  for (const [key, files] of Object.entries(documents)) {
    const list: ApplicationDocumentView[] = []
    for (const file of files) {
      const result = await uploadDataUri(file.dataUri, `applications/${userId}/${appId}/${key}`)
      if (!result.ok) return { ok: false, status: 400, error: result.error }
      list.push({ name: file.name, url: result.url, size: file.dataUri.length, uploadedAt: new Date().toISOString() })
    }
    uploaded[key] = list
  }
  return { ok: true, documents: uploaded }
}

function missingRequiredDocs(type: 'organisateur' | 'prestataire', documents: Record<string, DocumentEntryInput[]>, prestataireTypes: string[] = []): string[] {
  return getRequiredDocs(type, prestataireTypes).filter((key) => !(documents[key]?.length > 0))
}

// Soumission (mode CONNECTÉ) — dossier déjà rattaché à un compte existant.
export async function submitOrganizerApplication(caller: ApplicationCaller, input: SubmitInput): Promise<SubmitResult> {
  await getDb()

  const missing = missingRequiredDocs('organisateur', input.documents)
  if (missing.length > 0) return { ok: false, status: 400, error: 'missing_required_documents' }

  const validation = validateOrganizerFormData(input.formData)
  if (!validation.ok) return { ok: false, status: 400, error: validation.error }

  const user = await User.findById(caller.id)
  if (!user) return { ok: false, status: 404, error: 'user_not_found' }

  let app = await Application.findOne({ userId: caller.id, type: 'organisateur' })
  const wasCorrection = app?.status === 'needs_changes'
  if (!app) app = new Application({ userId: caller.id, type: 'organisateur', status: 'draft' })

  const docsResult = await uploadApplicationDocuments(caller.id, String(app._id), input.documents)
  if (!docsResult.ok) return docsResult

  app.formData = input.formData
  app.documents = new Map(Object.entries(docsResult.documents)) as typeof app.documents
  app.candidateNote = input.candidateNote ?? ''
  app.status = wasCorrection ? 'resubmitted' : 'submitted'
  app.submittedAt = new Date()
  app.auditLog.push({
    action: wasCorrection ? 'resubmitted' : 'submitted',
    by: caller.id,
    byName: [user.firstName, user.lastName].filter(Boolean).join(' '),
    at: new Date(),
    note: input.candidateNote ?? '',
  })
  await app.save()

  // Bascule l'interface active sur organisateur, en attente de validation —
  // fidèle au legacy (activeRole devient 'organisateur' dès la soumission,
  // pas seulement à l'approbation). orgStatus (par-rôle, #7) reste isolé du
  // statut global des autres rôles du compte.
  if (!user.roles.includes('organisateur')) user.roles.push('organisateur')
  user.activeRole = 'organisateur'
  user.orgStatus = 'pending'
  await user.save()

  const emailResult = await sendEmail(user.email, applicationReceivedEmail(user.email, undefined, 'organisateur'))
  if (!emailResult.ok) console.error('[submitOrganizerApplication] email failed for', user.email, emailResult.error)

  return { ok: true, application: toApplicationView(app.toObject()) }
}

export interface RegisterAndSubmitInput extends SubmitInput {
  email: string
  password: string
}

export type RegisterAndSubmitResult = ErrResult | { ok: true; application: ApplicationView; userId: string }

// Soumission (mode ANONYME) — crée le compte ET la candidature dans le même
// appel, jamais avant (voir commentaire d'en-tête). Le client doit ensuite
// s'authentifier lui-même (signIn('credentials', ...)) avec l'email/mot de
// passe fournis ici — cette fonction ne pose pas de session.
export async function registerAndSubmitOrganizerApplication(input: RegisterAndSubmitInput): Promise<RegisterAndSubmitResult> {
  await getDb()

  const email = input.email.trim().toLowerCase()
  if (!email || !email.includes('@')) return { ok: false, status: 400, error: 'invalid_email' }
  if (!input.password || input.password.length < 8) return { ok: false, status: 400, error: 'password_too_short' }

  const missing = missingRequiredDocs('organisateur', input.documents)
  if (missing.length > 0) return { ok: false, status: 400, error: 'missing_required_documents' }

  const validation = validateOrganizerFormData(input.formData)
  if (!validation.ok) return { ok: false, status: 400, error: validation.error }

  const existing = await User.findOne({ email }).lean()
  if (existing) return { ok: false, status: 409, error: 'email_taken' }

  const passwordHash = await bcrypt.hash(input.password, 12)
  const user = await User.create({
    email,
    passwordHash,
    firstName: input.formData.nomCommercial || '',
    lastName: '',
    phone: '',
    roles: ['organisateur'],
    activeRole: 'organisateur',
    status: 'active',
    orgStatus: 'pending',
  })

  const app = new Application({ userId: String(user._id), type: 'organisateur', status: 'draft' })
  const docsResult = await uploadApplicationDocuments(String(user._id), String(app._id), input.documents)
  if (!docsResult.ok) {
    // Rollback : ne jamais laisser un compte orphelin sans candidature si
    // l'upload échoue en cours de route.
    await User.deleteOne({ _id: user._id })
    return docsResult
  }

  app.formData = input.formData
  app.documents = new Map(Object.entries(docsResult.documents)) as typeof app.documents
  app.candidateNote = input.candidateNote ?? ''
  app.status = 'submitted'
  app.submittedAt = new Date()
  app.auditLog.push({ action: 'submitted', by: String(user._id), byName: input.formData.nomCommercial || '', at: new Date(), note: input.candidateNote ?? '' })
  await app.save()

  const emailResult = await sendEmail(email, applicationReceivedEmail(email, undefined, 'organisateur'))
  if (!emailResult.ok) console.error('[registerAndSubmitOrganizerApplication] email failed for', email, emailResult.error)

  return { ok: true, application: toApplicationView(app.toObject()), userId: String(user._id) }
}

// ─────────────────────────────── Prestataire ────────────────────────────────
// Même moteur générique que l'organisateur ci-dessus (Application type-
// paramétrée) — seules les fonctions de validation/champs diffèrent. Le
// `ProviderProfile` public (catalogue, page publique) n'est PAS créé ici : il
// est créé paresseusement, comme `OrganizerProfile`, au premier accès à
// l'espace prestataire (voir lib/server/providerProfile.ts, #8 tâche #88) —
// jamais à la soumission du dossier.

interface PrestataireSubmitInput {
  formData: PrestataireFormData
  documents: Record<string, DocumentEntryInput[]>
  candidateNote?: string
}

export type PrestataireSubmitResult = ErrResult | { ok: true; application: ApplicationView }

// Soumission (mode CONNECTÉ).
export async function submitPrestataireApplication(caller: ApplicationCaller, input: PrestataireSubmitInput): Promise<PrestataireSubmitResult> {
  await getDb()

  const missing = missingRequiredDocs('prestataire', input.documents, input.formData.prestataireTypes)
  if (missing.length > 0) return { ok: false, status: 400, error: 'missing_required_documents' }

  const validation = validatePrestataireFormData(input.formData)
  if (!validation.ok) return { ok: false, status: 400, error: validation.error }

  const user = await User.findById(caller.id)
  if (!user) return { ok: false, status: 404, error: 'user_not_found' }

  let app = await Application.findOne({ userId: caller.id, type: 'prestataire' })
  const wasCorrection = app?.status === 'needs_changes'
  if (!app) app = new Application({ userId: caller.id, type: 'prestataire', status: 'draft' })

  const docsResult = await uploadApplicationDocuments(caller.id, String(app._id), input.documents)
  if (!docsResult.ok) return docsResult

  app.formData = input.formData
  app.documents = new Map(Object.entries(docsResult.documents)) as typeof app.documents
  app.candidateNote = input.candidateNote ?? ''
  app.status = wasCorrection ? 'resubmitted' : 'submitted'
  app.submittedAt = new Date()
  app.auditLog.push({
    action: wasCorrection ? 'resubmitted' : 'submitted',
    by: caller.id,
    byName: [user.firstName, user.lastName].filter(Boolean).join(' '),
    at: new Date(),
    note: input.candidateNote ?? '',
  })
  await app.save()

  // orgStatus/prestStatus isolés par rôle (#7) : soumettre un dossier
  // prestataire ne doit jamais affecter l'accès organisateur du même compte.
  if (!user.roles.includes('prestataire')) user.roles.push('prestataire')
  user.activeRole = 'prestataire'
  user.prestStatus = 'pending'
  await user.save()

  const emailResult = await sendEmail(user.email, applicationReceivedEmail(user.email, undefined, 'prestataire'))
  if (!emailResult.ok) console.error('[submitPrestataireApplication] email failed for', user.email, emailResult.error)

  return { ok: true, application: toApplicationView(app.toObject()) }
}

export interface RegisterAndSubmitPrestataireInput extends PrestataireSubmitInput {
  email: string
  password: string
}

export type RegisterAndSubmitPrestataireResult = ErrResult | { ok: true; application: ApplicationView; userId: string }

// Soumission (mode ANONYME) — compte + candidature créés atomiquement au
// moment du submit, jamais avant (même garde que l'organisateur).
export async function registerAndSubmitPrestataireApplication(input: RegisterAndSubmitPrestataireInput): Promise<RegisterAndSubmitPrestataireResult> {
  await getDb()

  const email = input.email.trim().toLowerCase()
  if (!email || !email.includes('@')) return { ok: false, status: 400, error: 'invalid_email' }
  if (!input.password || input.password.length < 8) return { ok: false, status: 400, error: 'password_too_short' }

  const missing = missingRequiredDocs('prestataire', input.documents, input.formData.prestataireTypes)
  if (missing.length > 0) return { ok: false, status: 400, error: 'missing_required_documents' }

  const validation = validatePrestataireFormData(input.formData)
  if (!validation.ok) return { ok: false, status: 400, error: validation.error }

  const existing = await User.findOne({ email }).lean()
  if (existing) return { ok: false, status: 409, error: 'email_taken' }

  const passwordHash = await bcrypt.hash(input.password, 12)
  const user = await User.create({
    email,
    passwordHash,
    firstName: input.formData.prenom || '',
    lastName: input.formData.nom || '',
    phone: input.formData.telephone ? `${input.formData.telephoneCode || ''}${input.formData.telephone}` : '',
    roles: ['prestataire'],
    activeRole: 'prestataire',
    status: 'active',
    prestStatus: 'pending',
  })

  const app = new Application({ userId: String(user._id), type: 'prestataire', status: 'draft' })
  const docsResult = await uploadApplicationDocuments(String(user._id), String(app._id), input.documents)
  if (!docsResult.ok) {
    await User.deleteOne({ _id: user._id })
    return docsResult
  }

  app.formData = input.formData
  app.documents = new Map(Object.entries(docsResult.documents)) as typeof app.documents
  app.candidateNote = input.candidateNote ?? ''
  app.status = 'submitted'
  app.submittedAt = new Date()
  app.auditLog.push({ action: 'submitted', by: String(user._id), byName: [input.formData.prenom, input.formData.nom].filter(Boolean).join(' '), at: new Date(), note: input.candidateNote ?? '' })
  await app.save()

  const emailResult = await sendEmail(email, applicationReceivedEmail(email, undefined, 'prestataire'))
  if (!emailResult.ok) console.error('[registerAndSubmitPrestataireApplication] email failed for', email, emailResult.error)

  return { ok: true, application: toApplicationView(app.toObject()), userId: String(user._id) }
}

// ──────────────────────────── Revue agent (#9 phase agent/admin) ────────────
// Le contrôle « l'appelant est bien un agent » se fait à la couche route
// (requireAgent, lib/server/agentGuard.ts) — comme partout ailleurs dans ce
// port, les fonctions serveur ci-dessous font confiance à `agent` et ne
// revérifient pas le rôle.

export interface AgentCaller {
  id: string
  name: string
}

export type ApplicationStatus = ApplicationDoc['status']

export interface ApplicationSummaryView {
  id: string
  type: 'organisateur' | 'prestataire'
  status: ApplicationStatus
  userId: string
  userEmail: string
  userName: string
  displayName: string
  requestedChanges: string
  submittedAt: string | null
  updatedAt: string
}

export interface AuditLogEntryView {
  action: string
  by: string
  byName: string
  at: string
  note: string
}

// Vue agent = ApplicationView + tout ce qui ne doit JAMAIS fuiter vers
// getMyApplication (candidat) : identité complète, note interne, historique.
export interface AgentApplicationView extends ApplicationView {
  userEmail: string
  userName: string
  userPhone: string
  adminNote: string
  auditLog: AuditLogEntryView[]
}

function displayNameFromFormData(type: 'organisateur' | 'prestataire', formData: Record<string, unknown>): string {
  const nomCommercial = typeof formData.nomCommercial === 'string' ? formData.nomCommercial.trim() : ''
  if (nomCommercial) return nomCommercial
  if (type === 'prestataire') {
    const full = [formData.prenom, formData.nom].filter((v): v is string => typeof v === 'string' && v.trim().length > 0).join(' ')
    if (full) return full
  }
  return '—'
}

export interface ListApplicationsFilter {
  status?: ApplicationStatus
  type?: 'organisateur' | 'prestataire'
  search?: string
}

export async function listApplicationsForAgent(filter: ListApplicationsFilter = {}): Promise<ApplicationSummaryView[]> {
  await getDb()

  const query: Record<string, unknown> = {}
  if (filter.status) query.status = filter.status
  if (filter.type) query.type = filter.type

  const apps = await Application.find(query).sort({ updatedAt: -1 }).lean()
  const userIds = [...new Set(apps.map((app) => app.userId))]
  const users = await User.find({ _id: { $in: userIds } }).select('email firstName lastName').lean()
  const userById = new Map(users.map((u) => [String(u._id), u]))

  let results: ApplicationSummaryView[] = apps.map((app) => {
    const user = userById.get(app.userId)
    return {
      id: String(app._id),
      type: app.type,
      status: app.status,
      userId: app.userId,
      userEmail: user?.email ?? '',
      userName: user ? [user.firstName, user.lastName].filter(Boolean).join(' ') : '',
      displayName: displayNameFromFormData(app.type, (app.formData as Record<string, unknown>) ?? {}),
      requestedChanges: app.requestedChanges ?? '',
      submittedAt: app.submittedAt ? new Date(app.submittedAt).toISOString() : null,
      updatedAt: new Date(app.updatedAt as unknown as string).toISOString(),
    }
  })

  if (filter.search) {
    const term = filter.search.trim().toLowerCase()
    if (term) {
      results = results.filter(
        (r) => r.displayName.toLowerCase().includes(term) || r.userEmail.toLowerCase().includes(term) || r.userName.toLowerCase().includes(term)
      )
    }
  }

  return results
}

export async function getApplicationForAgent(applicationId: string): Promise<ErrResult | { ok: true; application: AgentApplicationView }> {
  await getDb()

  const app = await Application.findById(applicationId).lean()
  if (!app) return { ok: false, status: 404, error: 'application_not_found' }

  const user = await User.findById(app.userId).select('email firstName lastName phone').lean()
  const base = toApplicationView(app as ApplicationDoc & { _id: unknown })

  return {
    ok: true,
    application: {
      ...base,
      userEmail: user?.email ?? '',
      userName: user ? [user.firstName, user.lastName].filter(Boolean).join(' ') : '',
      userPhone: user?.phone ?? '',
      adminNote: app.adminNote ?? '',
      auditLog: (app.auditLog ?? []).map((entry) => ({
        action: entry.action,
        by: entry.by,
        byName: entry.byName ?? '',
        at: new Date(entry.at as unknown as string).toISOString(),
        note: entry.note ?? '',
      })),
    },
  }
}

export type AgentApplicationAction = 'under_review' | 'approve' | 'request_changes' | 'reject' | 'suspend' | 'reactivate'

// États de départ autorisés pour chaque action — voir le commentaire
// d'en-tête du plan Phase 9 pour la justification de chaque transition
// (notamment : 'suspend'/'reactivate' réutilisent le statut Application
// dédié 'suspended', mais retombent sur orgStatus/prestStatus='rejected' côté
// User car RoleApprovalStatus n'a pas de valeur 'suspended' propre — c'est
// précisément ce que canCreateEvent/canProposeServices bloquent déjà).
const ALLOWED_FROM: Record<AgentApplicationAction, ApplicationStatus[]> = {
  under_review: ['submitted', 'resubmitted'],
  approve: ['submitted', 'under_review', 'resubmitted'],
  request_changes: ['submitted', 'under_review', 'resubmitted'],
  reject: ['submitted', 'under_review', 'resubmitted', 'needs_changes'],
  suspend: ['approved'],
  reactivate: ['suspended'],
}

export type ModerateApplicationResult = ErrResult | { ok: true; application: ApplicationView }

export async function moderateApplication(
  agent: AgentCaller,
  applicationId: string,
  action: AgentApplicationAction,
  note?: string
): Promise<ModerateApplicationResult> {
  await getDb()

  const trimmedNote = note?.trim() ?? ''
  if (action === 'request_changes' && !trimmedNote) return { ok: false, status: 400, error: 'note_required' }

  const app = await Application.findById(applicationId)
  if (!app) return { ok: false, status: 404, error: 'application_not_found' }
  if (!ALLOWED_FROM[action].includes(app.status)) return { ok: false, status: 409, error: 'invalid_status' }

  const user = await User.findById(app.userId)
  if (!user) return { ok: false, status: 404, error: 'user_not_found' }

  const now = new Date()
  const isOrganisateur = app.type === 'organisateur'
  let auditAction: string = action
  let email: Awaited<ReturnType<typeof sendEmail>> | null = null

  switch (action) {
    case 'under_review':
      app.status = 'under_review'
      app.reviewedAt = now
      break
    case 'approve':
      app.status = 'approved'
      app.approvedAt = now
      app.reviewedAt = now
      if (isOrganisateur) user.orgStatus = 'active'
      else user.prestStatus = 'active'
      email = await sendEmail(user.email, applicationApprovedEmail(app.type))
      break
    case 'request_changes':
      app.status = 'needs_changes'
      app.requestedChanges = trimmedNote
      app.reviewedAt = now
      email = await sendEmail(user.email, applicationNeedsChangesEmail(app.type, trimmedNote))
      break
    case 'reject':
      app.status = 'rejected'
      app.rejectionReason = trimmedNote
      app.rejectedAt = now
      app.reviewedAt = now
      if (isOrganisateur) user.orgStatus = 'rejected'
      else user.prestStatus = 'rejected'
      // Port défensif du comportement legacy : ne réhabilite le statut de
      // compte global que s'il était encore 'pending' (dans ce port, `status`
      // vaut 'active' par défaut partout — probablement un no-op en pratique
      // actuellement, mais garde la parité si un futur flux le remet à 'pending').
      if (user.status === 'pending') user.status = 'active'
      email = await sendEmail(user.email, applicationRejectedEmail(app.type, trimmedNote))
      break
    case 'suspend':
      app.status = 'suspended'
      app.reviewedAt = now
      if (isOrganisateur) user.orgStatus = 'rejected'
      else user.prestStatus = 'rejected'
      auditAction = 'suspended'
      break
    case 'reactivate':
      app.status = 'approved'
      app.reviewedAt = now
      if (isOrganisateur) user.orgStatus = 'active'
      else user.prestStatus = 'active'
      auditAction = 'reactivated'
      break
  }

  app.auditLog.push({ action: auditAction, by: agent.id, byName: agent.name, at: now, note: trimmedNote })

  await user.save()
  await app.save()

  if (email && !email.ok) console.error(`[moderateApplication] email failed for ${user.email}`, email.error)

  return { ok: true, application: toApplicationView(app.toObject()) }
}

export async function setApplicationAdminNote(applicationId: string, note: string): Promise<ErrResult | { ok: true }> {
  await getDb()
  const result = await Application.updateOne({ _id: applicationId }, { $set: { adminNote: note } })
  if (result.matchedCount === 0) return { ok: false, status: 404, error: 'application_not_found' }
  return { ok: true }
}
