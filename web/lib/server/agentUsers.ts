import { getDb } from '../db/mongoose'
import User from '../models/User'
import OrganizerProfile from '../models/OrganizerProfile'
import ProviderProfile from '../models/ProviderProfile'
import type { Role, AccountStatus } from './permissions'

// Gestion des comptes utilisateurs côté agent (#9 phase agent/admin), port de
// la section « Comptes » de src/pages/AgentPage.jsx (tab === 'users') et des
// actions api/admin-accounts.js qui touchaient Firebase Auth : verify_email,
// send_verification (non porté, voir plus bas), set_disabled, update_email
// (non porté — seuls firstName/lastName/phone sont éditables ici, voir la
// tâche #99). `mark_payout_paid` appartient à un autre panneau (#102).
//
// Le contrôle « l'appelant est bien un agent » se fait à la couche route
// (requireAgent, lib/server/agentGuard.ts) — comme partout ailleurs dans ce
// port, les fonctions ci-dessous font confiance à l'appelant et ne
// revérifient pas le rôle. Les garde-fous métier (auto-suspension, compte
// super-admin protégé) restent ici, au même titre que la machine à états de
// lib/server/applications.ts.

const ONLINE_WINDOW_MS = 5 * 60 * 1000 // fenêtre « en ligne » du legacy (isUserOnline, AgentPage.jsx)

export interface AgentCaller {
  id: string
}

export type UsersRoleFilter = Role | 'all'
export type UsersStatusFilter = AccountStatus | 'disabled' | 'all'

export interface ListUsersFilter {
  search?: string
  role?: UsersRoleFilter
  status?: UsersStatusFilter
  onlineOnly?: boolean
}

export interface AgentUserSummary {
  id: string
  personalName: string
  displayName: string
  email: string
  phone: string
  role: Role
  status: AccountStatus
  disabled: boolean
  emailVerified: boolean
  online: boolean
  createdAt: string
}

export interface AgentUserDetail extends AgentUserSummary {
  firstName: string
  lastName: string
  roles: Role[]
  emailVerifiedAt: string | null
  lastSeenAt: string | null
  superAdmin: boolean
  prestataireTypes: string[]
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function isOnline(lastSeenAt: Date | null | undefined): boolean {
  return !!lastSeenAt && Date.now() - new Date(lastSeenAt).getTime() < ONLINE_WINDOW_MS
}

type LeanUser = {
  _id: unknown
  firstName?: string
  lastName?: string
  email: string
  phone?: string
  activeRole: Role
  status: AccountStatus
  disabled?: boolean
  emailVerifiedAt?: Date | null
  lastSeenAt?: Date | null
  createdAt: Date
  roles?: Role[]
  superAdmin?: boolean
}

async function displayNamesFor(users: LeanUser[]): Promise<Map<string, string>> {
  const orgIds = users.filter((u) => u.activeRole === 'organisateur').map((u) => String(u._id))
  const prestIds = users.filter((u) => u.activeRole === 'prestataire').map((u) => String(u._id))

  const [orgProfiles, providerProfiles] = await Promise.all([
    orgIds.length ? OrganizerProfile.find({ userId: { $in: orgIds } }).select('userId publicName').lean() : [],
    prestIds.length ? ProviderProfile.find({ userId: { $in: prestIds } }).select('userId name').lean() : [],
  ])

  const map = new Map<string, string>()
  for (const p of orgProfiles) if (p.publicName) map.set(p.userId, p.publicName)
  for (const p of providerProfiles) if (p.name) map.set(p.userId, p.name)
  return map
}

function personalNameOf(u: LeanUser): string {
  return [u.firstName, u.lastName].filter(Boolean).join(' ').trim() || '—'
}

function toSummary(u: LeanUser, displayName: string): AgentUserSummary {
  return {
    id: String(u._id),
    personalName: personalNameOf(u),
    displayName,
    email: u.email,
    phone: u.phone ?? '',
    role: u.activeRole,
    status: u.status,
    disabled: u.disabled === true,
    emailVerified: !!u.emailVerifiedAt,
    online: isOnline(u.lastSeenAt),
    createdAt: new Date(u.createdAt).toISOString(),
  }
}

export async function listUsersForAgent(filter: ListUsersFilter = {}): Promise<AgentUserSummary[]> {
  await getDb()

  const query: Record<string, unknown> = {}
  if (filter.role && filter.role !== 'all') query.activeRole = filter.role
  if (filter.status === 'disabled') query.disabled = true
  else if (filter.status && filter.status !== 'all') query.status = filter.status
  if (filter.onlineOnly) query.lastSeenAt = { $gte: new Date(Date.now() - ONLINE_WINDOW_MS) }

  const term = filter.search?.trim()
  if (term) {
    const rx = { $regex: escapeRegex(term), $options: 'i' }
    query.$or = [{ firstName: rx }, { lastName: rx }, { email: rx }, { phone: rx }]
  }

  const users = (await User.find(query).sort({ createdAt: -1 }).lean()) as unknown as LeanUser[]
  const displayNames = await displayNamesFor(users)

  return users.map((u) => toSummary(u, displayNames.get(String(u._id)) || personalNameOf(u)))
}

export type GetUserResult = { ok: false; status: number; error: string } | { ok: true; user: AgentUserDetail }

export async function getUserForAgent(userId: string): Promise<GetUserResult> {
  await getDb()

  const u = (await User.findById(userId).lean()) as unknown as LeanUser | null
  if (!u) return { ok: false, status: 404, error: 'user_not_found' }

  const displayNames = await displayNamesFor([u])
  const summary = toSummary(u, displayNames.get(String(u._id)) || personalNameOf(u))

  let prestataireTypes: string[] = []
  if (u.activeRole === 'prestataire') {
    const profile = await ProviderProfile.findOne({ userId: String(u._id) }).select('prestataireTypes').lean()
    prestataireTypes = profile?.prestataireTypes ?? []
  }

  return {
    ok: true,
    user: {
      ...summary,
      firstName: u.firstName ?? '',
      lastName: u.lastName ?? '',
      roles: u.roles ?? [u.activeRole],
      emailVerifiedAt: u.emailVerifiedAt ? new Date(u.emailVerifiedAt).toISOString() : null,
      lastSeenAt: u.lastSeenAt ? new Date(u.lastSeenAt).toISOString() : null,
      superAdmin: u.superAdmin === true,
      prestataireTypes,
    },
  }
}

export type UserActionResult = { ok: false; status: number; error: string } | { ok: true; user: AgentUserDetail }

// Suspendre bloque uniquement la CONNEXION (voir auth.ts:authorize) — pas de
// notion de session serveur à révoquer dans ce port (stratégie JWT, cf.
// auth.ts), contrairement au legacy qui révoquait les refresh tokens Firebase.
export async function setUserDisabled(agent: AgentCaller, userId: string, disabled: boolean): Promise<UserActionResult> {
  await getDb()

  if (userId === agent.id) return { ok: false, status: 400, error: 'self_action' }

  const user = await User.findById(userId)
  if (!user) return { ok: false, status: 404, error: 'user_not_found' }
  if (user.superAdmin) return { ok: false, status: 403, error: 'protected_account' }

  user.disabled = disabled
  await user.save()

  const result = await getUserForAgent(userId)
  return result.ok ? { ok: true, user: result.user } : { ok: false, status: result.status, error: result.error }
}

export async function forceVerifyEmail(userId: string): Promise<UserActionResult> {
  await getDb()

  const user = await User.findById(userId)
  if (!user) return { ok: false, status: 404, error: 'user_not_found' }

  user.emailVerifiedAt = new Date()
  await user.save()

  const result = await getUserForAgent(userId)
  return result.ok ? { ok: true, user: result.user } : { ok: false, status: result.status, error: result.error }
}

export interface UpdateUserFieldsInput {
  firstName?: string
  lastName?: string
  phone?: string
}

export async function updateUserFields(userId: string, fields: UpdateUserFieldsInput): Promise<UserActionResult> {
  await getDb()

  const user = await User.findById(userId)
  if (!user) return { ok: false, status: 404, error: 'user_not_found' }

  if (fields.firstName !== undefined) user.firstName = fields.firstName.trim()
  if (fields.lastName !== undefined) user.lastName = fields.lastName.trim()
  if (fields.phone !== undefined) user.phone = fields.phone.trim()
  await user.save()

  const result = await getUserForAgent(userId)
  return result.ok ? { ok: true, user: result.user } : { ok: false, status: result.status, error: result.error }
}
