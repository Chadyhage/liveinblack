import type { DefaultSession } from 'next-auth'
import type { Role, AccountStatus } from '@/lib/server/permissions'

declare module 'next-auth' {
  interface Session {
    user: {
      id: string
      roles: Role[]
      activeRole: Role
      status: AccountStatus
    } & DefaultSession['user']
  }

  interface User {
    roles: Role[]
    activeRole: Role
    status: AccountStatus
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    roles?: Role[]
    activeRole?: Role
    status?: AccountStatus
  }
}
