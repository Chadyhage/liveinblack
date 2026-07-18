import { Suspense } from 'react'
import ConnexionForm from './ConnexionForm'

// Stub phase 1 : prouve que Credentials + JWT fonctionnent de bout en bout.
// Le vrai design (AuthModal, inscription multi-étapes) arrive avec les
// pages qu'il concerne (phase 2+). `useSearchParams` (dans ConnexionForm)
// exige une frontière Suspense pour ne pas bloquer le pré-rendu statique.
export default function ConnexionPage() {
  return (
    <main className="mx-auto flex max-w-sm flex-1 flex-col justify-center gap-4 p-8">
      <h1 className="text-xl font-semibold">Connexion</h1>
      <Suspense fallback={null}>
        <ConnexionForm />
      </Suspense>
    </main>
  )
}
