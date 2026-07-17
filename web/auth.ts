import NextAuth from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import { MongoDBAdapter } from '@auth/mongodb-adapter'
import bcrypt from 'bcryptjs'
import clientPromise from './lib/db/mongodb-client'
import { getDb } from './lib/db/mongoose'
import User from './lib/models/User'
import type { Role, AccountStatus, RoleApprovalStatus } from './lib/server/permissions'

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
    signIn: '/connexion',
  },
  providers: [
    Credentials({
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Mot de passe', type: 'password' },
      },
      async authorize(credentials) {
        const email = String(credentials?.email || '').trim().toLowerCase()
        const password = String(credentials?.password || '')
        if (!email || !password) return null

        await getDb()
        const user = await User.findOne({ email }).lean()
        if (!user || !user.passwordHash) return null

        const valid = await bcrypt.compare(password, user.passwordHash)
        if (!valid) return null

        return {
          id: String(user._id),
          email: user.email,
          name: [user.firstName, user.lastName].filter(Boolean).join(' '),
          roles: user.roles,
          activeRole: user.activeRole,
          status: user.status,
          orgStatus: user.orgStatus,
          prestStatus: user.prestStatus,
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        const u = user as unknown as { roles: Role[]; activeRole: Role; status: AccountStatus; orgStatus?: RoleApprovalStatus; prestStatus?: RoleApprovalStatus }
        token.roles = u.roles
        token.activeRole = u.activeRole
        token.status = u.status
        token.orgStatus = u.orgStatus
        token.prestStatus = u.prestStatus
      }
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
