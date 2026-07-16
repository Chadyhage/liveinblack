import Link from 'next/link'
import { listPublicEvents, type PublicEvent } from '@/lib/server/events'
import { listPublicProviders, type PublicProvider, type CatalogItem } from '@/lib/server/providers'
import { fmtMoney, eventCurrency } from '@/lib/shared/money'
import { getProviderCategories, getProviderCategory } from '@/lib/shared/providerCategories'
import { eventStartMs } from '@/lib/shared/event-time'

// Événements/prestataires changent en continu (nouvelles publications,
// stock) — sans dépendance à cookies()/searchParams, Next.js prérendrait
// sinon cette page une fois pour toutes au build.
export const dynamic = 'force-dynamic'

// Port de src/pages/PublicLanding.jsx (page réellement affichée aux visiteurs
// anonymes — HomePage.jsx elle-même ne rend son contenu riche (Top 3, reco...)
// qu'aux utilisateurs connectés, hors périmètre de la phase 2). Simplifications
// assumées : pas d'animation de révélation au scroll (contenu affiché
// directement), pas de bouton "ambiance sonore" (moteur audio global, à
// porter avec le lecteur musical transverse dans une phase ultérieure).

const HERO_IMG = 'https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?auto=format&fit=crop&w=1600&q=80'

function firstOfferImage(catalog: CatalogItem[] = []): string | null {
  for (const item of catalog) {
    const image = (item.media || []).find((m) => m?.url && m.type !== 'video')
    if (image) return image.url
  }
  return null
}

export default async function AccueilPage() {
  const [allEvents, providers] = await Promise.all([listPublicEvents(), listPublicProviders()])

  const events = [...allEvents].sort((a, b) => eventStartMs(a) - eventStartMs(b)).slice(0, 6)
  const featuredProviders = providers.slice(0, 4)

  return (
    <>
      {/* HERO */}
      <section style={{ position: 'relative', minHeight: '85vh', display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '0 22px', textAlign: 'center' }}>
        <div style={{ position: 'absolute', inset: 0, backgroundImage: `url(${HERO_IMG})`, backgroundSize: 'cover', backgroundPosition: 'center', opacity: 0.32 }} />
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background:
              'radial-gradient(ellipse at 50% 30%, rgba(139,92,246,.14), transparent 55%), radial-gradient(ellipse at 80% 80%, rgba(78,232,200,.08), transparent 50%), linear-gradient(to bottom, rgba(4,4,11,.72) 0%, rgba(4,4,11,.55) 40%, rgba(4,4,11,.98) 100%)',
          }}
        />
        <div style={{ position: 'relative', maxWidth: 760, margin: '0 auto' }}>
          <p style={{ fontSize: 34, fontWeight: 300, letterSpacing: '0.08em', margin: 0 }}>
            L<span>|</span>VE IN <span style={{ fontFamily: "'Playfair Display', serif", fontStyle: 'italic', fontWeight: 700 }}>BLACK</span>
          </p>
          <h1 style={{ fontSize: 'clamp(34px, 8vw, 62px)', fontWeight: 800, lineHeight: 1.03, letterSpacing: '-1.5px', margin: '22px 0 0' }}>
            Les meilleures soirées,
            <br />
            <span style={{ color: 'var(--teal)' }}>au bout des doigts.</span>
          </h1>
          <p style={{ fontSize: 'clamp(15px,4vw,19px)', color: 'var(--text-muted)', margin: '18px auto 0', maxWidth: 520, lineHeight: 1.5 }}>
            Réserve, découvre, profite. Ta prochaine sortie commence ici. Billets, événements privés et prestataires réunis au même endroit.
          </p>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap', marginTop: 30 }}>
            <Link href="/connexion?mode=register" style={btnPrimary}>Créer mon compte</Link>
            <Link href="/evenements" style={btnGhost}>Découvrir les événements</Link>
          </div>
          <p style={{ fontSize: 13, color: 'var(--text-faint)', marginTop: 18 }}>
            Déjà un compte ? <Link href="/connexion" style={{ color: 'rgba(255,255,255,.85)', fontWeight: 700, textDecoration: 'underline' }}>Se connecter</Link>
          </p>
        </div>
      </section>

      {/* ÉVÉNEMENTS À DÉCOUVRIR */}
      <Section eyebrow="À l'affiche" title="Des soirées à découvrir" sub="Explore librement. Pour réserver et garder ton billet, il te suffit d'un compte.">
        {events.length === 0 ? (
          <EmptyCard text="De nouvelles soirées arrivent très vite." ctaHref="/evenements" ctaLabel="Voir la page événements" />
        ) : (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 16 }}>
              {events.map((e) => {
                const prices = (e.places || []).map((p) => Number(p.price) || 0).filter(Boolean)
                const min = prices.length ? Math.min(...prices) : null
                return (
                  <Link key={e.id} href={`/evenements/${e.id}`} className="lb-card" style={{ ...card, overflow: 'hidden', display: 'block', textDecoration: 'none', color: 'inherit' }}>
                    <div style={{ position: 'relative', aspectRatio: '4/3', background: `linear-gradient(135deg, ${'var(--violet)'}44, var(--obsidian))` }}>
                      {e.imageUrl && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={e.imageUrl} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
                      )}
                      {min != null && (
                        <span style={{ position: 'absolute', top: 10, right: 10, fontSize: 11, fontWeight: 800, color: 'var(--gold)', background: 'rgba(5,6,10,.92)', padding: '4px 9px', borderRadius: 999, border: '1px solid rgba(200,169,110,.4)' }}>
                          dès {fmtMoney(min, eventCurrency(e))}
                        </span>
                      )}
                    </div>
                    <div style={{ padding: '12px 14px 14px' }}>
                      <p style={{ fontSize: 15, fontWeight: 800, letterSpacing: '-.3px', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{e.name}</p>
                      <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '4px 0 0' }}>{[e.dateDisplay, e.city].filter(Boolean).join(' · ') || 'Bientôt'}</p>
                    </div>
                  </Link>
                )
              })}
            </div>
            <div style={{ textAlign: 'center', marginTop: 22 }}>
              <Link href="/evenements" style={btnGhost}>Tout voir</Link>
            </div>
          </>
        )}
      </Section>

      {/* PRESTATAIRES À LA UNE */}
      <Section eyebrow="L'annuaire" title="Les prestataires de la nuit" sub="DJ, salles, sono, boissons… Trouve le bon prestataire et contacte-le en un clic.">
        {featuredProviders.length === 0 ? (
          <EmptyCard text="Les premiers prestataires arrivent très vite." ctaHref="/prestataires" ctaLabel="Voir l'annuaire" />
        ) : (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: 16 }}>
              {featuredProviders.map((p) => {
                const categories = getProviderCategories(p)
                const pc = categories[0] || getProviderCategory(p.prestataireType)
                const coverImage = p.coverUrl || firstOfferImage(p.catalog) || p.photoUrl
                return (
                  <Link key={p.userId} href={`/prestataires/${encodeURIComponent(p.userId)}`} className="lb-card" style={{ ...card, overflow: 'hidden', display: 'flex', flexDirection: 'column', textDecoration: 'none', color: 'inherit' }}>
                    <div style={{ position: 'relative', height: 110, background: `linear-gradient(135deg, ${pc.color}44, ${pc.color}12 55%, var(--obsidian))`, overflow: 'hidden' }}>
                      {coverImage && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={coverImage} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
                      )}
                      <span style={{ position: 'absolute', top: 10, left: 10, fontSize: 10.5, fontWeight: 800, color: '#fff', background: `${pc.color}cc`, padding: '4px 9px', borderRadius: 999 }}>
                        {pc.label}
                        {categories.length > 1 ? ` +${categories.length - 1}` : ''}
                      </span>
                      <div style={{ position: 'absolute', left: 12, bottom: -20, width: 46, height: 46, borderRadius: '50%', border: '2px solid #0b0d16', overflow: 'hidden', background: pc.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 18, color: 'var(--obsidian)' }}>
                        {p.photoUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={p.photoUrl} alt={p.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        ) : (
                          p.name?.[0]?.toUpperCase() || '?'
                        )}
                      </div>
                    </div>
                    <div style={{ padding: '26px 14px 14px', flex: 1, display: 'flex', flexDirection: 'column' }}>
                      <p style={{ fontSize: 15, fontWeight: 800, letterSpacing: '-.3px', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</p>
                      {(p.city || p.location || p.country) && (
                        <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '3px 0 0' }}>{[p.city || p.location, p.country].filter(Boolean).join(' · ')}</p>
                      )}
                      <span style={{ marginTop: 'auto', paddingTop: 12, fontSize: 12.5, fontWeight: 700, color: 'var(--teal)' }}>Voir le profil →</span>
                    </div>
                  </Link>
                )
              })}
            </div>
            <div style={{ textAlign: 'center', marginTop: 22 }}>
              <Link href="/prestataires" style={btnGhost}>Tous les prestataires</Link>
            </div>
          </>
        )}
      </Section>

      {/* POURQUOI CRÉER UN COMPTE */}
      <Section eyebrow="Ton compte" title="Pourquoi créer un compte ?" sub="Gratuit, en 30 secondes.">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px,1fr))', gap: 14 }}>
          {[
            ['Réserve tes billets', 'Paiement sécurisé, billet instantané.'],
            ['Ton QR code partout', 'Tes billets toujours dans ta poche.'],
            ['Recommandations', 'Des soirées selon tes goûts et ta ville.'],
            ['Favoris', 'Sauvegarde les événements qui te plaisent.'],
            ['Messagerie', 'Parle aux organisateurs et prestataires.'],
            ['Tes commandes', 'Précommandes et consos suivies.'],
            ['Des points', "Chaque achat te rapproche d'avantages."],
            ['Événements privés', 'Accède aux soirées sur invitation.'],
          ].map(([t, d]) => (
            <div key={t} style={{ ...card, padding: '18px 16px' }}>
              <p style={{ fontSize: 15, fontWeight: 800, margin: 0 }}>{t}</p>
              <p style={{ fontSize: 12.5, color: 'var(--text-muted)', margin: '6px 0 0', lineHeight: 1.4 }}>{d}</p>
            </div>
          ))}
        </div>
        <div style={{ textAlign: 'center', marginTop: 26 }}>
          <Link href="/connexion?mode=register" style={btnPrimary}>Créer mon compte gratuitement</Link>
        </div>
      </Section>

      {/* ORGANISATEURS + PRESTATAIRES */}
      <Section eyebrow="Tu fais vivre la nuit ?" title="Organisateurs & prestataires">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px,1fr))', gap: 16 }}>
          <div style={{ ...card, padding: 24, borderLeft: '3px solid rgba(139,92,246,.75)' }}>
            <p style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--violet)', margin: 0 }}>Organisateur</p>
            <h3 style={{ fontSize: 22, fontWeight: 800, margin: '10px 0 12px', letterSpacing: '-.5px' }}>Crée, vends, gère tes soirées</h3>
            <ul style={featList}>
              {['Crée et publie ton événement', 'Vends tes billets en ligne', 'Gère les invités & la guestlist', 'Scanne les QR à l\'entrée', 'Booste ta visibilité'].map((f) => (
                <li key={f} style={featItem}><span style={{ color: 'var(--violet)' }}>◆</span> {f}</li>
              ))}
            </ul>
            <Link href="/connexion?mode=register" style={{ ...btnSolid, marginTop: 16, background: 'linear-gradient(180deg, #8f56ff, #7a3bf2)', color: '#fff' }}>Créer un espace organisateur</Link>
          </div>
          <div style={{ ...card, padding: 24, borderLeft: '3px solid rgba(200,169,110,.75)' }}>
            <p style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--gold)', margin: 0 }}>Prestataire</p>
            <h3 style={{ fontSize: 22, fontWeight: 800, margin: '10px 0 12px', letterSpacing: '-.5px' }}>Développe ton activité</h3>
            <ul style={featList}>
              {['Crée un profil public (vitrine)', 'Présente tes services & ton portfolio', 'Sois visible des organisateurs', 'Reçois des demandes et devis'].map((f) => (
                <li key={f} style={featItem}><span style={{ color: 'var(--gold)' }}>◆</span> {f}</li>
              ))}
            </ul>
            <Link href="/connexion?mode=register" style={{ ...btnSolid, marginTop: 16, background: 'var(--gold)', color: '#04120e' }}>Devenir prestataire</Link>
          </div>
        </div>
      </Section>

      {/* CTA FINAL */}
      <section style={{ padding: '10px 22px 70px' }}>
        <div style={{ maxWidth: 820, margin: '0 auto', padding: '40px 26px', borderRadius: 24, textAlign: 'center', border: '1px solid var(--border)', background: 'radial-gradient(ellipse at 50% 0%, rgba(139,92,246,.14), transparent 60%), var(--surface-2)' }}>
          <h2 style={{ fontSize: 'clamp(26px,6vw,40px)', fontWeight: 800, letterSpacing: '-1px', margin: 0 }}>Rejoins Live in Black</h2>
          <p style={{ fontSize: 15, color: 'var(--text-muted)', margin: '12px auto 0', maxWidth: 440, lineHeight: 1.5 }}>
            Découvre les meilleures soirées autour de toi, et ne rate plus jamais une sortie.
          </p>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap', marginTop: 26 }}>
            <Link href="/connexion?mode=register" style={btnPrimary}>Créer mon compte</Link>
            <Link href="/evenements" style={btnGhost}>Découvrir les événements</Link>
          </div>
          <p style={{ fontSize: 12.5, color: 'var(--text-faint)', marginTop: 24 }}>
            Déjà un compte ? <Link href="/connexion" style={{ color: 'var(--teal)', fontWeight: 700, textDecoration: 'none' }}>Me connecter</Link>
          </p>
        </div>
      </section>
    </>
  )
}

function Section({ eyebrow, title, sub, children }: { eyebrow?: string; title: string; sub?: string; children: React.ReactNode }) {
  return (
    <section style={{ padding: '54px 22px', maxWidth: 1120, margin: '0 auto', width: '100%' }}>
      <div style={{ textAlign: 'center', marginBottom: 30 }}>
        {eyebrow && <p style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--teal)', margin: 0 }}>{eyebrow}</p>}
        <h2 style={{ fontSize: 'clamp(24px,5.5vw,36px)', fontWeight: 800, letterSpacing: '-.8px', margin: '8px 0 0' }}>{title}</h2>
        {sub && <p style={{ fontSize: 14.5, color: 'var(--text-muted)', margin: '10px auto 0', maxWidth: 520, lineHeight: 1.5 }}>{sub}</p>}
      </div>
      {children}
    </section>
  )
}

function EmptyCard({ text, ctaHref, ctaLabel }: { text: string; ctaHref: string; ctaLabel: string }) {
  return (
    <div style={{ ...card, padding: 30, textAlign: 'center', maxWidth: 460, margin: '0 auto' }}>
      <p style={{ fontSize: 15, color: 'var(--text-muted)', margin: 0 }}>{text}</p>
      <Link href={ctaHref} style={{ ...btnGhost, marginTop: 16, display: 'inline-block' }}>{ctaLabel}</Link>
    </div>
  )
}

const card: React.CSSProperties = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, boxShadow: '0 8px 24px rgba(0,0,0,.35)' }
const btnPrimary: React.CSSProperties = { padding: '14px 26px', borderRadius: 999, fontSize: 15, fontWeight: 700, color: '#04120e', background: 'var(--teal-solid)', textDecoration: 'none', display: 'inline-block' }
const btnGhost: React.CSSProperties = { padding: '13px 24px', borderRadius: 999, fontSize: 14, fontWeight: 700, color: '#fff', background: 'rgba(255,255,255,.08)', border: '1px solid var(--border-strong)', textDecoration: 'none', display: 'inline-block' }
const btnSolid: React.CSSProperties = { padding: '13px 20px', borderRadius: 12, fontSize: 14, fontWeight: 700, textDecoration: 'none', display: 'inline-block', textAlign: 'center' }
const featList: React.CSSProperties = { listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 9 }
const featItem: React.CSSProperties = { fontSize: 13.5, color: 'var(--text-muted)', display: 'flex', gap: 9, alignItems: 'baseline' }
