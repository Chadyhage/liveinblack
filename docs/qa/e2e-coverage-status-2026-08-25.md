# LIVEINBLACK Web — État de couverture E2E au 25/08/2026

## Résumé

La suite Playwright couvre désormais les surfaces publiques, les redirections historiques, les garde-fous anonymes des espaces privés, les contrats API publics/protégés de base, les en-têtes de sécurité critiques et un socle authentifié seedé par rôle.

Cette couverture n'est pas encore un 100% fonctionnel de tous les parcours métier: les paiements sandbox Stripe/FedaPay réels, le scan QR caméra, l'upload Cloudinary réel avec persistance média et certains workflows UI/back-office irréversibles nécessitent encore des fixtures et environnements dédiés.

## Couverture automatisée ajoutée

| Domaine | Fichier | Couverture |
|---|---|---|
| Pages publiques | `e2e/public-navigation.spec.ts` | Rendu de `/home`, `/events`, `/organizers`, `/providers`, `/about`, `/blog`, `/contact`, `/login`, onboarding organisateur/prestataire, pages légales, navigation partagée, absence d'erreurs page |
| Navigation responsive | `e2e/public-navigation.spec.ts` | Liens desktop, menu mobile, fermeture Escape, navigation depuis le tiroir |
| Recherche et formulaires publics | `e2e/public-forms-search.spec.ts` | Recherche événements avec état vide, recherche globale header, validation formulaire contact, modes login/inscription |
| Routes protégées | `e2e/protected-routes.spec.ts` | Redirection anonyme vers `/login?next=...` pour profil, messages, notifications, organisateur, prestataire, agent, scanner, caisse sur place |
| Redirections legacy | `e2e/legacy-redirects.spec.ts` | Alias FR/publics et alias protégés conservant la destination à travers login |
| Sécurité/API | `e2e/security-and-api.spec.ts` | CSP, health, annuaires publics API, refus API anonymes attendus |
| Authentification par rôle | `e2e/seeded-auth.spec.ts` | Connexion client/organisateur/prestataire/agent, accès espaces privés, déconnexion |
| Cycle de vie compte | `e2e/seeded-auth-flows.spec.ts` | Inscription API, doublon email, anti-énumération reset/verification, vérification email API et UI par token, reset password API et UI par token consommable, demande/annulation/confirmation changement email API et confirmation UI par lien public |
| Mutations authentifiées | `e2e/seeded-mutations.spec.ts` | Intérêt événement, message texte, check-in ticket, changement de nom profil, lecture dashboard/dossiers agent |
| Parcours métier avancés | `e2e/seeded-advanced.spec.ts` | Revente + retrait, invitation + annulation de siège, catalogue prestataire CRUD, abonnement prestataire FedaPay local avec webhook signé et publication annuaire, promo code, guestlist, staff événement, avis client, édition d'avis, réponse prestataire, signalement d'avis, note/masquage/republication/suppression agent, traitement signalement utilisateur agent, revue agent des demandes de suppression avec rejet, approbation, anonymisation et verrouillage du compte, reversements agent XOF/EUR, résolution d'alertes paiement, actions comptes agent, curation homepage actualité, CRUD blog agent et publication publique |
| Scanner | `e2e/seeded-scanner.spec.ts` | Saisie manuelle d'un code billet côté organisateur, affichage du statut déjà entré au replay, et garde d'accès du scanner pour un client sans rôle staff |
| Messagerie sociale | `e2e/seeded-messaging.spec.ts` | Création groupe, message, édition, réponse, transfert, suppression pour soi, suppression pour tous, nettoyage historique, masquage conversation, renommage groupe, présence typing, suppression groupe, réaction, favori, conversation épinglée, message épinglé, sondage, vote, sondage événement, ajout membre, sourdine membre/conversation, rôle admin, lu, blocage/signalement/déblocage |
| Notifications et push | `e2e/seeded-notifications.spec.ts` | Centre notifications, liste API, compteur unread, lecture individuelle, lecture globale, clé VAPID, abonnement et désabonnement push |
| Cycle sièges de table | `e2e/seeded-ticket-seat-lifecycle.spec.ts` | Invitation vue hôte/invité, acceptation, page billet QR valide, révocation hôte, refus invité, sortie volontaire invité, invalidation des anciens jetons QR |
| Signatures médias/uploads | `e2e/seeded-media-upload-signatures.spec.ts` | Signature upload événement/galerie organisateur, catalogue prestataire, refus client, validation MIME/taille, credentials Cloudinary E2E |
| Paiements/webhooks locaux | `e2e/seeded-payments-webhooks.spec.ts` | Checkout FedaPay local simulé, émission de billet, page ticket valide, code promo prévalidé puis appliqué au checkout, réservation avec acompte FedaPay local, paiement du solde, disparition du hold actif, demande de remboursement FedaPay protégée, refus de doublon, visibilité en file agent, clôture manuelle agent, refus de double clôture, retrait de la file, webhook FedaPay sans signature refusé, JSON invalide signé refusé, transaction inconnue signée ignorée proprement, webhook Stripe sans signature/invalide refusé, événement Stripe signé accepté, expiration Stripe et annulation FedaPay libérant le stock de façon idempotente |

## Corrections produit effectuées

- CSP: ajout de `https://va.vercel-scripts.com` à `script-src`.
- CSP: ajout de `https://vitals.vercel-insights.com` et `https://va.vercel-scripts.com` à `connect-src`.
- Proxy: ajout de `/on-site-sales/:path*` dans les routes protégées anonymes, avec conservation du paramètre `next`.
- Profil: déconnexion alignée sur la redirection native Auth.js vers `/home`, ce qui vide correctement la session avant retour public.
- E2E: helper de connexion seedée via Auth.js API, pour supprimer les faux échecs liés à une page visible avant hydratation.
- E2E: stabilisation des interactions publiques sensibles à l'hydratation, notamment recherche header, formulaire contact et menu mobile.
- E2E: seed paiements rendu idempotent en supprimant les commandes, billets et réservations résiduelles des acheteurs dédiés avant recréation des fixtures.
- E2E: exécution Playwright séquentielle pour éviter les timeouts du serveur Next dev local pendant les passes complètes.
- Publication agent: invalidation immédiate des caches publics blog/homepage avec `revalidateTag(..., { expire: 0 })` depuis les Route Handlers, pour éviter de servir une ancienne actualité juste après sauvegarde.
- Abonnement prestataire: rail FedaPay local simulé hors production quand aucune clé secrète FedaPay n'est configurée, tout en exigeant le webhook signé pour activer l'abonnement.
- Abonnement prestataire: invalidation immédiate de l'annuaire public après activation FedaPay par webhook, pour rendre le profil visible sans attendre la TTL du cache.
- E2E: seed abonnement rendu idempotent en nettoyant les paiements d'abonnement résiduels avant recréation des fixtures.
- Auth UI: les pages de lien consommable `/verify-email` et `/confirmer-email` ne déclenchent plus deux consommations de token sous React dev/Strict Mode; le succès n'est plus remplacé par un état expiré ou bloqué.
- E2E: fixtures de comptes/tokens dédiées aux parcours UI de vérification email, reset password et confirmation de nouvelle adresse, indépendantes des tests API.
- Scanner UI: le flux manuel de saisie d'un code billet est couvert côté organisateur, avec replay qui remonte l'état "déjà entré" et garde d'accès pour un client sans rôle staff.

## Vérifications exécutées

- `npm run lint:core`: OK.
- `npm run test:unit`: 116 fichiers, 578 tests passés.
- `PLAYWRIGHT_BASE_URL=http://127.0.0.1:3011 npm exec playwright test`: 49 tests passés, 48 tests seedés ignorés en mode non seedé.
- `LIB_RUN_SEEDED_E2E=1 LIB_E2E_DISABLE_RATE_LIMIT=1 PLAYWRIGHT_BASE_URL=http://127.0.0.1:3011 npm exec playwright test`: 98 tests passés.
- `PLAYWRIGHT_BASE_URL=http://127.0.0.1:3011 LIB_RUN_SEEDED_E2E=1 npm exec playwright test e2e/seeded-advanced.spec.ts`: 11 tests passés.
- `PLAYWRIGHT_BASE_URL=http://127.0.0.1:3011 LIB_RUN_SEEDED_E2E=1 npm exec playwright test e2e/seeded-auth-flows.spec.ts`: 8 tests passés.
- `PLAYWRIGHT_BASE_URL=http://127.0.0.1:3011 LIB_RUN_SEEDED_E2E=1 npm exec playwright test e2e/seeded-scanner.spec.ts`: 2 tests passés.
- `npm run build`: OK, 175 pages statiques générées.

## Couverture authentifiée seedée

Un script dédié existe pour créer les comptes et données E2E dans une base locale isolée:

- `npm run seed:e2e`
- `npm run test:e2e:seeded`

Les identifiants seedés sont:

- `client@liveinblack.dev`
- `organisateur@liveinblack.dev`
- `prestataire@liveinblack.dev`
- `prestataire-subscription@liveinblack.dev`
- `agent@liveinblack.dev`
- `checkout-buyer@liveinblack.dev`
- `payment-buyer@liveinblack.dev`
- `nonverifie-ui@liveinblack.dev`
- `reset-ui@liveinblack.dev`
- `email-change-ui@liveinblack.dev`
- Mot de passe commun: `DevTest1234!`

La spec `e2e/seeded-auth.spec.ts` couvre la connexion et les accès de premier niveau aux espaces client, organisateur, prestataire et agent. La spec `e2e/seeded-mutations.spec.ts` couvre des mutations authentifiées seedées: intérêt événement, envoi de message, check-in de ticket, changement de nom profil et lecture API agent.

La spec `e2e/seeded-auth-flows.spec.ts` couvre le cycle de vie compte: inscription API, doublon email, garanties anti-énumération, vérification email API avec token invalide puis token valide, reset password API avec consommation et refus du replay, demande/annulation et confirmation API du changement d'email, puis les parcours UI complets des liens publics `/verify-email`, `/reset-password` et `/confirmer-email` avec connexion effective après succès.

La spec `e2e/seeded-advanced.spec.ts` couvre les mutations métier avancées réversibles ou isolées: mise en revente puis retrait d'un billet, invitation puis annulation d'un siège de table, création/modification/suppression d'une offre catalogue prestataire, activation d'un abonnement prestataire FedaPay local via webhook signé avec paiement enregistré, renouvellement calculé, idempotence du replay et visibilité publique par l'annuaire, gestion promo code/guestlist/staff pour un événement organisateur, cycle avis client/prestataire/agent (création, édition, réponse, signalement, note, masquage, republication, suppression), traitement d'un signalement utilisateur agent, revue agent des demandes de suppression de compte (liste, détail/audit, rejet, approbation, anonymisation, verrouillage, idempotence d'état), reversement XOF échoué soldé manuellement, demande de payout EUR plafonnée au ledger réel, résolution d'alerte paiement, recherche/liste/détail et actions comptes agent (nom, téléphone, email, suspension/réactivation, vérification email, garde anti auto-suspension), curation de la section actualité homepage visible publiquement, et CRUD blog agent avec article public créé/modifié/supprimé.

La spec `e2e/seeded-messaging.spec.ts` couvre les contrôles sociaux et groupe: création de groupe, envoi, édition, réponse, transfert, suppression pour soi, suppression pour tous, nettoyage d'historique, masquage de conversation, renommage de groupe, présence typing, suppression de groupe, réaction, favori, conversation et message épinglés, sondage et vote, sondage événement, ajout de membre, sourdine de membre et de conversation, promotion admin, marquage lu, blocage, signalement et déblocage.

La spec `e2e/seeded-notifications.spec.ts` couvre la lecture du centre notifications, le marquage lu, le marquage global lu, la clé publique push et l'abonnement/désabonnement web push.

La spec `e2e/seeded-ticket-seat-lifecycle.spec.ts` couvre le cycle de vie complet d'un siège de table: invitation envoyée par l'hôte, affichage sortant/entrant, acceptation par l'invité, billet public valide via jeton signé, révocation hôte invalidant l'ancien QR, refus invité et sortie volontaire invalidant aussi l'ancien QR.

La spec `e2e/seeded-media-upload-signatures.spec.ts` couvre la signature d'uploads publics protégés: images événement, vidéos galerie organisateur, images catalogue prestataire, refus d'un client non autorisé et validation MIME/taille avant émission de credentials.

La spec `e2e/seeded-payments-webhooks.spec.ts` couvre une tranche paiement/webhook vérifiable localement: checkout FedaPay simulé en développement, émission d'un ticket, validation de la page publique du ticket, prévalidation et application d'un code promo au checkout, réservation d'une place avec acompte FedaPay simulé, apparition du hold actif, paiement du solde, émission du billet final, disparition du hold actif, demande de remboursement FedaPay avec assurance annulation, marquage du billet comme remboursement demandé, refus du doublon, apparition en file agent de remboursement manuel, clôture manuelle par agent, refus de double clôture et retrait de la file, refus webhook FedaPay sans signature, refus JSON invalide signé, acceptation idempotente d'une transaction FedaPay signée inconnue, refus webhook Stripe sans signature/invalide, acceptation d'un événement Stripe signé valide sans commande, expiration Stripe et annulation FedaPay qui relibèrent exactement le stock retenu sans double-restock au replay.

Validation locale effectuée sur une instance isolée `http://127.0.0.1:3011` avec `AUTH_TRUST_HOST=true`: 98 tests passés en mode seedé complet.

Note: les connexions E2E déclenchent le mécanisme d'email "nouvelle connexion". En local, Resend peut journaliser un 403 si le domaine d'envoi n'est pas vérifié; l'auth continue car cette notification est non bloquante.

Note rate-limit: la suite seedée utilise `LIB_E2E_DISABLE_RATE_LIMIT=1`, accepté uniquement quand `MONGODB_URI` pointe vers une base E2E, pour éviter que les relances locales avec les mêmes comptes ne bloquent les tests de connexion.

Note standalone: pour lancer `node .next/standalone/server.js` manuellement, copier d'abord `.next/static` vers `.next/standalone/.next/static` et le contenu de `public/` vers `.next/standalone/public/`; sinon les composants client comme le formulaire de connexion peuvent rester bloqués en chargement ou certaines images peuvent manquer.

## Reste à faire pour tendre vers 100%

| Domaine | Besoin |
|---|---|
| Authentification complète | Connexion/déconnexion, inscription API, reset password API/UI, vérification email API/UI et changement d'email API/UI couverts; restent surtout les cas d'expiration de token affichés côté UI |
| Billetterie | Revente/retrait, check-in, checkout FedaPay local simulé, promo en checkout, réservation/acompte FedaPay local, paiement du solde et ticket généré depuis paiement couverts; restent panier UI complet, checkout Stripe et FedaPay sandbox réels |
| Tickets et QR | Portefeuille billets, check-in, invitation/annulation/acceptation/refus/révocation/sortie de siège, revente, page `/ticket/[token]` avec invalidation QR et scanner manuel côté staff couverts; reste le scan QR caméra réel |
| Organisateur | Accès, stats, promo codes, guestlist, staff et signature médias événement/galerie couverts; restent création/modification événement UI, upload Cloudinary réel, reports, payouts |
| Prestataire | Accès workspace, catalogue CRUD, abonnement FedaPay local, avis/réponses et signature média catalogue couverts; restent onboarding complet, persistance médias profil/catalogue et abonnement Stripe/FedaPay sandbox réel |
| Messagerie | Lecture, envoi texte, groupe, édition, réponse, transfert, suppressions, nettoyage historique, masquage, renommage groupe, présence typing, réactions, favori, sondages, signalement, blocage et lu couverts; restent avatar groupe et import média |
| Agent | Accès dashboard/sections, lecture APIs dossiers, traitement signalement utilisateur, modération avis, file remboursements manuels FedaPay avec clôture, reversements/payouts XOF/EUR, résolution d'alertes paiement, demandes de suppression avec rejet/approbation/anonymisation, actions comptes API, blog CRUD et homepage config couverts; restent variantes UI fines et envoi email réel agent dépendant du domaine Resend |
| Notifications/push | Centre, marquage lu et abonnement/désabonnement couverts; restent permission navigateur réelle, service worker et livraison push bout en bout |
| Webhooks/paiements | Contrats FedaPay locaux, abonnement prestataire FedaPay local, réservation/acompte, solde de réservation, remboursement manuel FedaPay protégé avec clôture agent, reversements/payouts agent XOF/EUR, alertes paiement, signatures invalides/valides FedaPay/Stripe, expiration Stripe et annulation FedaPay avec release de stock couverts; restent webhooks Stripe/FedaPay reliés à des commandes réelles sandbox et fixtures provider/boost/resale |
