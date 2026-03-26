import { useNavigate } from 'react-router-dom'

export default function CGUPage() {
  const navigate = useNavigate()

  return (
    <div className="min-h-screen bg-[#080808] px-4 py-6 space-y-5">
      <div className="flex items-center gap-3 mb-2">
        <button
          onClick={() => navigate(-1)}
          className="w-8 h-8 rounded-full bg-[#1a1a1a] flex items-center justify-center text-gray-400 text-lg"
        >
          ‹
        </button>
        <h1 className="text-white font-bold text-lg">Conditions Générales d'Utilisation</h1>
      </div>

      <p className="text-gray-600 text-xs">Dernière mise à jour : Janvier 2026</p>

      <div className="space-y-5 text-sm text-gray-400 leading-relaxed">
        <section>
          <h2 className="text-[#d4af37] font-semibold text-xs uppercase tracking-widest mb-2">1. Présentation de la plateforme</h2>
          <p>LIVEINBLACK est une marketplace événementielle qui met en relation des organisateurs d'événements, des prestataires de services et des participants. La plateforme permet la réservation de billets, la mise aux enchères de places VIP, la gestion de playlists interactives et la précommande de consommations.</p>
        </section>

        <section>
          <h2 className="text-[#d4af37] font-semibold text-xs uppercase tracking-widest mb-2">2. Acceptation des conditions</h2>
          <p>En utilisant la plateforme LIVEINBLACK, l'utilisateur accepte sans réserve les présentes Conditions Générales d'Utilisation. Si l'utilisateur n'accepte pas ces conditions, il doit cesser toute utilisation de la plateforme.</p>
        </section>

        <section>
          <h2 className="text-[#d4af37] font-semibold text-xs uppercase tracking-widest mb-2">3. Inscription et compte utilisateur</h2>
          <p>L'inscription à LIVEINBLACK est gratuite et ouverte à toute personne physique majeure. L'utilisateur s'engage à fournir des informations exactes et à jour lors de son inscription. Chaque utilisateur est responsable de la confidentialité de ses identifiants de connexion.</p>
        </section>

        <section>
          <h2 className="text-[#d4af37] font-semibold text-xs uppercase tracking-widest mb-2">4. Billetterie et réservations</h2>
          <p>Les réservations effectuées sur la plateforme sont fermes et définitives. Aucun remboursement ne sera accordé sauf en cas d'annulation de l'événement par l'organisateur. Les billets sont strictement personnels et non transmissibles sans autorisation préalable.</p>
        </section>

        <section>
          <h2 className="text-[#d4af37] font-semibold text-xs uppercase tracking-widest mb-2">5. Système d'enchères</h2>
          <p>Le système d'enchères permet aux utilisateurs de soumettre des offres pour des places à accès limité. Une offre soumise est un engagement ferme d'achat. LIVEINBLACK se réserve le droit de suspendre ou d'annuler une enchère en cas de comportement abusif.</p>
        </section>

        <section>
          <h2 className="text-[#d4af37] font-semibold text-xs uppercase tracking-widest mb-2">6. Données personnelles</h2>
          <p>LIVEINBLACK collecte et traite les données personnelles des utilisateurs conformément au RGPD. Les données sont utilisées exclusivement pour la gestion des comptes et des transactions. L'utilisateur dispose d'un droit d'accès, de rectification et de suppression de ses données.</p>
        </section>

        <section>
          <h2 className="text-[#d4af37] font-semibold text-xs uppercase tracking-widest mb-2">7. Propriété intellectuelle</h2>
          <p>L'ensemble des contenus présents sur LIVEINBLACK (logos, textes, visuels, code source) sont protégés par le droit de la propriété intellectuelle. Toute reproduction ou utilisation sans autorisation est strictement interdite.</p>
        </section>

        <section>
          <h2 className="text-[#d4af37] font-semibold text-xs uppercase tracking-widest mb-2">8. Responsabilité</h2>
          <p>LIVEINBLACK ne saurait être tenu responsable des dommages directs ou indirects résultant de l'utilisation de la plateforme. Les informations publiées sur les événements sont sous la responsabilité exclusive des organisateurs concernés.</p>
        </section>

        <section>
          <h2 className="text-[#d4af37] font-semibold text-xs uppercase tracking-widest mb-2">9. Modification des CGU</h2>
          <p>LIVEINBLACK se réserve le droit de modifier les présentes CGU à tout moment. Les utilisateurs seront informés des modifications par notification dans l'application. La poursuite de l'utilisation après modification vaut acceptation des nouvelles conditions.</p>
        </section>

        <section>
          <h2 className="text-[#d4af37] font-semibold text-xs uppercase tracking-widest mb-2">10. Contact</h2>
          <p>Pour toute question relative aux présentes CGU, contactez notre équipe à : <span className="text-[#d4af37]">support@liveinblack.com</span></p>
        </section>
      </div>

      <div className="glass p-4 rounded-2xl border border-white/5 mt-4">
        <p className="text-gray-600 text-[10px] text-center">
          Document provisoire — La version définitive sera rédigée par un juriste avant le lancement commercial.
        </p>
      </div>
    </div>
  )
}
