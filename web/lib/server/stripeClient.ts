import Stripe from 'stripe'

// Client Stripe partagé — UNE seule version d'API épinglée pour tout le
// projet (l'audit M22 note que le legacy utilisait deux versions différentes
// selon les fichiers, ce qui peut faire varier la forme des objets Stripe
// selon le parcours). Ne pas dupliquer `new Stripe(...)` ailleurs.
//
// Construction PARESSEUSE (Proxy) : de nombreuses routes/tests importent ce
// module transitivement (ex. fulfillOrder → eventRefunds → stripeClient) sans
// jamais appeler Stripe sur leur chemin heureux — construire le client dès
// l'import forcerait STRIPE_SECRET_KEY à exister même pour ces cas.
declare global {
  // eslint-disable-next-line no-var
  var __stripeClient: Stripe | undefined
}

function getRealClient(): Stripe {
  if (globalThis.__stripeClient) return globalThis.__stripeClient
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) throw new Error('STRIPE_SECRET_KEY manquant — définis-le dans web/.env.local')
  const client = new Stripe(key, { apiVersion: '2026-06-24.dahlia' })
  globalThis.__stripeClient = client
  return client
}

const stripe = new Proxy({} as Stripe, {
  get(_target, prop, receiver) {
    return Reflect.get(getRealClient(), prop, receiver)
  },
})

export default stripe
