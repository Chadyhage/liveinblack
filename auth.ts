import NextAuth from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import { MongoDBAdapter } from '@auth/mongodb-adapter'
import bcrypt from 'bcryptjs'
import clientPromise from './lib/db/mongodb-client'
import { getDb } from './lib/db/mongoose'
import User from './lib/models/User'
import type { Role, AccountStatus, RoleApprovalStatus } from './lib/server/permissions'
import { checkRateLimit, getRequestIp } from './lib/server/rateLimit'

const SESSION_REVALIDATE_INTERVAL_MS = 5 * 60 * 1000

// Remplace Firebase Auth. Stratégie JWT obligatoire avec le provider
// Credentials (Auth.js ne persiste pas de session en base pour ce provider —
// voir https://authjs.dev/concepts/session-strategies). L'adaptateur MongoDB
// est branché pour les futurs flux de vérification email / reset mot de passe
// (phase profil/onboarding) ; il ne gère PAS la connexion Credentials elle-même,
// qui est entièrement portée par notre propre collection `users` (lib/models/User.ts).
export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: MongoDBAdapter(clientPromise),
  session: { strategy: 'jwt' },
  pages: {
    signIn: '/login',
  },
  providers: [
    Credentials({
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Mot de passe', type: 'password' },
      },
      async authorize(credentials, request) {
        const email = String(credentials?.email || '').trim().toLowerCase()
        const password = String(credentials?.password || '')
        if (!email || !password) return null

        const loginLimit = await checkRateLimit({
          scope: 'auth-login',
          identifier: `${getRequestIp(request)}:${email}`,
          limit: 10,
          windowMs: 15 * 60 * 1000,
        })
        if (!loginLimit.allowed) return null

        await getDb()
        const user = await User.findOne({ email }).lean()
        if (!user || !user.passwordHash) return null

        const valid = await bcrypt.compare(password, user.passwordHash)
        if (!valid) return null

        // Compte suspendu par un agent (#9 phase agent/admin) — connexion refusée,
        // voir lib/server/agentUsers.ts:setUserDisabled.
        if (user.disabled) return null

        // Email non vérifié — parité avec le legacy (src/pages/LoginPage.jsx
        // doEmailLogin: mustVerifyEmail = !isOrgOrPrest, donc TOUJOURS vrai
        // pour un compte client pur). Un organisateur/prestataire/agent n'a
        // jamais eu ce mur en legacy (mustVerifyEmail=false par défaut pour
        // eux) : leur dossier est de toute façon revu manuellement par un
        // agent, donc on ne bloque que les comptes 100% client ici — sans
        // quoi les flux registerAndSubmit*Application (connexion immédiate
        // après soumission du dossier, voir lib/server/applications.ts)
        // casseraient. Régression trouvée à l'audit : authorize() ne
        // vérifiait jamais emailVerifiedAt, un client non vérifié obtenait
        // une session complète.
        const isPureClient = !user.roles.includes('organisateur') && !user.roles.includes('prestataire') && !user.roles.includes('agent')
        if (isPureClient && !user.emailVerifiedAt) return null

        return {
          id: String(user._id),
          email: user.email,
          name: [user.firstName, user.lastName].filter(Boolean).join(' '),
          roles: user.roles,
          activeRole: user.activeRole,
          status: user.status,
          orgStatus: user.orgStatus,
          prestStatus: user.prestStatus,
          sessionVersion: user.sessionVersion || 0,
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        const u = user as unknown as { roles: Role[]; activeRole: Role; status: AccountStatus; orgStatus?: RoleApprovalStatus; prestStatus?: RoleApprovalStatus; sessionVersion: number }
        token.roles = u.roles
        token.activeRole = u.activeRole
        token.status = u.status
        token.orgStatus = u.orgStatus
        token.prestStatus = u.prestStatus
        token.sessionVersion = u.sessionVersion
        token.checkedAt = Date.now()
        return token
      }

      // Pas de `user` ici : ce n'est pas une connexion, c'est une requête
      // normale qui redécode le JWT existant. Une stratégie JWT ne revalide
      // jamais le compte en base entre deux connexions — une auto-suppression
      // (profile.ts:deleteAccount), une suppression validée par un agent
      // (agentDeletion.ts:approveDeletion) ou une suspension
      // (agentUsers.ts:setUserDisabled) ne révoquerait donc jamais une session
      // déjà émise (30 jours par défaut) sans ce contrôle périodique. On borne
      // l'exposition à SESSION_REVALIDATE_INTERVAL_MS plutôt que d'interroger
      // Mongo à chaque requête.
      const lastChecked = typeof token.checkedAt === 'number' ? token.checkedAt : 0
      if (Date.now() - lastChecked < SESSION_REVALIDATE_INTERVAL_MS) return token

      await getDb()
      const dbUser = await User.findById(token.sub).select('disabled sessionVersion').lean()
      if (!dbUser || dbUser.disabled || (dbUser.sessionVersion || 0) !== (token.sessionVersion || 0)) {
        return null
      }
      token.checkedAt = Date.now()
      return token
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = String(token.sub)
        session.user.roles = (token.roles as Role[]) || ['client']
        session.user.activeRole = (token.activeRole as Role) || 'client'
        session.user.status = (token.status as AccountStatus) || 'active'
        session.user.orgStatus = (token.orgStatus as RoleApprovalStatus) || 'none'
        session.user.prestStatus = (token.prestStatus as RoleApprovalStatus) || 'none'
      }
      return session
    },
  },
})
