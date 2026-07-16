import { auth, signOut } from '@/auth'

export default async function ProfilPage() {
  const session = await auth()

  return (
    <main className="mx-auto flex max-w-sm flex-1 flex-col justify-center gap-4 p-8">
      <h1 className="text-xl font-semibold">Profil (stub phase 1)</h1>
      <p>Email : {session?.user?.email}</p>
      <p>Rôle actif : {session?.user?.activeRole}</p>
      <p>Statut : {session?.user?.status}</p>
      <form
        action={async () => {
          'use server'
          await signOut({ redirectTo: '/accueil' })
        }}
      >
        <button type="submit" className="rounded bg-black px-3 py-2 text-white">
          Se déconnecter
        </button>
      </form>
    </main>
  )
}
