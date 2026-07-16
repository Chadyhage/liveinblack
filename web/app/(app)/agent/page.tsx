import { auth } from '@/auth'

// Stub phase 1, uniquement pour prouver que proxy.ts bloque bien /agent
// aux comptes dont activeRole !== 'agent'. La vraie interface (AgentPage,
// 4180 lignes côté legacy) arrive en phase 9.
export default async function AgentStubPage() {
  const session = await auth()
  return (
    <main className="mx-auto flex max-w-sm flex-1 flex-col justify-center gap-4 p-8">
      <h1 className="text-xl font-semibold">Espace agent (stub phase 1)</h1>
      <p>Connecté en tant que {session?.user?.email}, rôle {session?.user?.activeRole}.</p>
    </main>
  )
}
