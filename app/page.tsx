import Image from "next/image";

export default function Home() {
  return (
    <div className="min-h-screen bg-black text-white">
      {/* Top bar */}
      <div className="w-full border-b border-white/10 bg-black/60 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-2 text-xs sm:text-sm">
          <div className="flex flex-wrap items-center gap-2 text-white/80">
            <span className="text-white/90">Prochaine soirée :</span>
            <span className="font-medium text-white">LIVE IN BLACK</span>
            <span className="text-white/50">—</span>
            <span>Samedi 25 Jan</span>
            <span className="text-white/50">—</span>
            <span>23:00</span>
            <span className="ml-2 rounded-full bg-emerald-500/15 px-2 py-0.5 text-emerald-300">
              Réservations ouvertes
            </span>
          </div>
          <a
            href="#reserver"
            className="rounded-full bg-white px-3 py-1 font-medium text-black hover:bg-white/90"
          >
            Réserver
          </a>
        </div>
      </div>

      {/* Header */}
      <header className="sticky top-0 z-20 border-b border-white/10 bg-black/70 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-white/10 ring-1 ring-white/15" />
            <div className="leading-tight">
              <div className="text-sm font-semibold tracking-wide">LIVE IN</div>
              <div className="-mt-1 text-lg font-semibold tracking-widest">
                BLACK
              </div>
            </div>
          </div>

          <nav className="hidden items-center gap-6 text-sm text-white/80 md:flex">
            <a className="hover:text-white" href="#events">
              Événements
            </a>
            <a className="hover:text-white" href="#reserver">
              Réserver
            </a>
            <a className="hover:text-white" href="#carte">
              Bouteilles & Carte
            </a>
            <a className="hover:text-white" href="#concept">
              Concept
            </a>
          </nav>

          <div className="flex items-center gap-2">
            <button className="hidden rounded-full border border-white/15 px-4 py-2 text-sm text-white/90 hover:bg-white/5 sm:block">
              Se connecter
            </button>
            <a
              href="#reserver"
              className="rounded-full bg-white px-4 py-2 text-sm font-medium text-black hover:bg-white/90"
            >
              Réserver
            </a>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.12),transparent_55%)]" />
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 md:grid-cols-2 md:py-20">
          <div className="relative z-10">
            <p className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs text-white/80">
              <span className="h-1.5 w-1.5 rounded-full bg-white/60" />
              Luxe • Nuit • Expérience
            </p>

            <h1 className="mt-5 text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">
              Réserve ton <span className="text-white/80">Entrée</span> ou ton{" "}
              <span className="text-white/80">Carré VIP</span>.
            </h1>

            <p className="mt-5 max-w-xl text-base leading-7 text-white/70">
              Deux parcours clairs. Paiement simple. Confirmation immédiate. Une
              expérience haut de gamme pensée pour aller vite, sans te perdre.
            </p>

            {/* Quick cards */}
            <div className="mt-8 grid gap-4 sm:grid-cols-2" id="reserver">
              <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
                <div className="text-sm font-medium">Entrée</div>
                <div className="mt-1 text-2xl font-semibold">à partir de 20€</div>
                <p className="mt-2 text-sm text-white/70">
                  Accès rapide, liste, contrôle simplifié.
                </p>
                <button className="mt-4 w-full rounded-xl bg-white px-4 py-3 text-sm font-medium text-black hover:bg-white/90">
                  Réserver Entrée
                </button>
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
                <div className="text-sm font-medium">Carré VIP</div>
                <div className="mt-1 text-2xl font-semibold">à partir de 250€</div>
                <p className="mt-2 text-sm text-white/70">
                  Table + service + bouteilles.
                </p>
                <button className="mt-4 w-full rounded-xl border border-white/15 bg-black px-4 py-3 text-sm font-medium text-white hover:bg-white/5">
                  Réserver Carré
                </button>
              </div>
            </div>

            <div className="mt-6 flex flex-wrap items-center gap-4 text-sm text-white/60">
              <div className="rounded-full border border-white/10 bg-white/5 px-3 py-2">
                ✅ Dispos en temps réel
              </div>
              <div className="rounded-full border border-white/10 bg-white/5 px-3 py-2">
                ✅ Paiement sécurisé
              </div>
              <div className="rounded-full border border-white/10 bg-white/5 px-3 py-2">
                ✅ Confirmation instant
              </div>
            </div>
          </div>

          {/* Right side preview card */}
          <div className="relative z-10">
            <div className="rounded-3xl border border-white/10 bg-gradient-to-b from-white/10 to-white/5 p-6">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm text-white/70">Prochain event</div>
                  <div className="mt-1 text-xl font-semibold">LIVE IN BLACK</div>
                </div>
                <div className="rounded-full bg-white/10 px-3 py-1 text-xs text-white/70">
                  Sam 25 Jan • 23:00
                </div>
              </div>

              <div className="mt-6 grid gap-3">
                <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-medium">Entrée — Standard</div>
                    <div className="text-sm text-white/70">20€</div>
                  </div>
                  <div className="mt-2 h-2 w-full rounded-full bg-white/10">
                    <div className="h-2 w-3/4 rounded-full bg-white/40" />
                  </div>
                  <div className="mt-2 text-xs text-white/60">
                    Dernières places
                  </div>
                </div>

                <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-medium">Carré VIP — 6 pers</div>
                    <div className="text-sm text-white/70">250€</div>
                  </div>
                  <div className="mt-2 h-2 w-full rounded-full bg-white/10">
                    <div className="h-2 w-1/2 rounded-full bg-white/40" />
                  </div>
                  <div className="mt-2 text-xs text-white/60">
                    Disponibilités limitées
                  </div>
                </div>
              </div>

              <div className="mt-6 flex gap-3">
                <button className="w-full rounded-xl bg-white px-4 py-3 text-sm font-medium text-black hover:bg-white/90">
                  Voir événements
                </button>
                <button className="w-full rounded-xl border border-white/15 bg-black px-4 py-3 text-sm font-medium text-white hover:bg-white/5">
                  Carte bouteilles
                </button>
              </div>
            </div>

            <p className="mt-4 text-center text-xs text-white/50">
              (Ceci est une maquette. On ajoutera la vraie logique après.)
            </p>
          </div>
        </div>
      </section>

      {/* Sections anchors */}
      <section className="mx-auto max-w-6xl px-4 pb-16">
        <div className="grid gap-6 md:grid-cols-3">
          <div id="events" className="rounded-2xl border border-white/10 bg-white/5 p-6">
            <h2 className="text-lg font-semibold">Événements</h2>
            <p className="mt-2 text-sm text-white/70">
              Liste des soirées à venir + statut (open / last spots / sold out).
            </p>
          </div>
          <div id="carte" className="rounded-2xl border border-white/10 bg-white/5 p-6">
            <h2 className="text-lg font-semibold">Bouteilles & Carte</h2>
            <p className="mt-2 text-sm text-white/70">
              Menu clair, prix, packs, upsells (plus tard).
            </p>
          </div>
          <div id="concept" className="rounded-2xl border border-white/10 bg-white/5 p-6">
            <h2 className="text-lg font-semibold">Concept</h2>
            <p className="mt-2 text-sm text-white/70">
              Positionnement luxe sombre, expérience VIP, sécurité.
            </p>
          </div>
        </div>
      </section>

      <footer className="border-t border-white/10 py-10">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 text-sm text-white/60 sm:flex-row sm:items-center sm:justify-between">
          <div>© {new Date().getFullYear()} Live in Black</div>
          <div className="flex gap-4">
            <a className="hover:text-white" href="#">
              FAQ
            </a>
            <a className="hover:text-white" href="#">
              Contact
            </a>
            <a className="hover:text-white" href="#">
              CGU
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
