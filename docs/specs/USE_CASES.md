# LIVEINBLACK — Cas d'usage (Use Cases)

> Marketplace événementielle / nightlife (billetterie, organisateurs d'événements, prestataires de services). Document généré à partir de l'état réel du code (`app/`, `lib/server/`) — pas une spec théorique.
>
> Modèle de comptes : **multi-rôle**. Un même compte peut porter plusieurs rôles (`roles[]`) mais n'en a qu'un **actif** à la fois (`activeRole`) : `client`, `organisateur`, `prestataire`, `agent`. Les interfaces sont strictement séparées par rôle actif.

---

## 1. Visiteur non connecté (public)

| # | Cas d'usage | Détail |
|---|---|---|
| 1.1 | Parcourir les événements publics | Liste filtrable (`/events`), recherche plein texte (`/search`) |
| 1.2 | Consulter le détail d'un événement | Lieu, date, tarifs par place, médias, menu, organisateur |
| 1.3 | Parcourir l'annuaire des organisateurs | `/organizers`, fiche publique par organisateur (`/organizers/[slug]`) |
| 1.4 | Parcourir l'annuaire des prestataires | `/providers`, fiche publique par prestataire (`/providers/[id]`), catalogue de services |
| 1.5 | Débloquer un événement privé par code d'accès | Événements non listés publiquement, accès via code |
| 1.6 | Créer un compte | Client, organisateur, ou prestataire — onboarding dédié par rôle |
| 1.7 | Se connecter / réinitialiser son mot de passe | Auth par email/mot de passe uniquement (pas de social login) |
| 1.8 | Consulter les pages légales | CGU, confidentialité, cookies, mentions légales |
| 1.9 | Gérer son consentement cookies | Bandeau RGPD, granularité fonctionnel/ambiance |

---

## 2. Compte Client

### 2.1 Découverte & billetterie
- Réserver une ou plusieurs places sur un événement (paiement Stripe pour l'EUR, FedaPay Mobile Money pour le XOF)
- Acheter en groupe (table/groupe de places liées à un hôte)
- **Bloquer une place avec un acompte (seat-hold)** : 5 %/24h ou 10 %/72h du prix, prix figé, solde à payer avant expiration sinon la place repart en vente
- **Souscrire une protection annulation** au moment de l'achat (+10 % du prix du billet) — ouvre droit à un remboursement automatique en cas de report/modification majeure de l'événement
- Payer un billet gratuit (flux simplifié, sans passerelle de paiement)
- Débloquer un événement privé via code d'accès avant réservation

### 2.2 Portefeuille & billets
- Consulter son portefeuille de billets (groupés par événement)
- Afficher le QR code d'un billet pour le scan à l'entrée
- **Revendre un billet** sur la bourse de revente officielle (prix ≤ prix d'origine, commission plafonnée, ancien QR invalidé automatiquement)
- Retirer une annonce de revente (nouveau QR réémis pour le vendeur)
- **Acheter un billet en revente** d'un autre utilisateur (billet garanti, aucune identité vendeur/acheteur exposée)
- **Demander un remboursement** (événement reporté, modification majeure déclarée, ou protection annulation souscrite) — automatique, sans revue manuelle
- Recevoir un lien de remboursement sécurisé même sans compte (acheteur invité)

### 2.3 Profil & préférences
- Éditer identité, avatar (upload + recadrage), téléphone, année de naissance, genre
- Changer son email (confirmation par lien) / son mot de passe
- Définir ses préférences musicales/goûts (assistant de préférences, recherche d'artiste)
- Gérer sa confidentialité (visibilité en ligne, avatar visible, accusés de lecture, recommandations personnalisées)
- Exporter ses données personnelles (RGPD)
- Supprimer son compte
- Cumuler des points de fidélité

### 2.4 Organisateurs & événements suivis
- Suivre un organisateur (partage de son email pour recevoir ses actualités)
- Se désabonner / gérer ses alertes par organisateur suivi
- Marquer un événement comme « intéressé »
- Consulter ses organisateurs suivis / événements intéressés

### 2.5 Avis & réputation
- Laisser un avis sur un prestataire après une prestation
- Signaler un avis abusif

### 2.6 Messagerie
- Conversations directes et de groupe, polling (pas de WebSocket)
- Épingler / masquer / mettre en sourdine une conversation
- Réactions rapides, sondages dans les conversations (`poll` et `event_poll` — même mécanisme de vote)
- Photos, messages vocaux, transfert de message
- Demandes d'ami, liste d'amis, blocage d'utilisateur
- Messages importants (étoile), historique de conversation
- Aperçu des dernières conversations depuis un menu déroulant global (badge non-lus)

### 2.7 Ambiance
- Lecteur de musique d'ambiance persistant (recherche iTunes, lecture de preview)

---

## 3. Compte Organisateur

*Statut d'approbation propre au rôle (`orgStatus` : none/pending/active/rejected), indépendant du statut prestataire du même compte.*

### 3.1 Candidature & onboarding
- Postuler comme organisateur (dossier : établissement, description, revenus attendus, documents justificatifs)
- Suivre le statut de son dossier (`/my-application`)
- Consulter la raison d'un rejet

### 3.2 Espace organisateur (page publique + studio)
- Créer/éditer sa page organisateur publique (nom, description, bannière, avatar, zones de couverture)
- Gérer ses moyens d'encaissement (compte bancaire / Mobile Money)
- Uploader des médias (photos/vidéos) sur sa page publique
- Consulter son statut de versement (payout)

### 3.3 Gestion d'événements (`/my-events`)
- Créer un événement (assistant multi-étapes : infos, lieu, tarifs par place, menu, médias, vidéo de présentation)
- Éditer / annuler / reporter un événement
- Gérer les codes d'accès pour événements privés
- Gérer la guestlist (invités sans achat, avec ou sans compte)
- Configurer un menu (items, catégories, prix)
- **Booster un événement** (mise en avant payante, slots limités)
- Consulter les réservations (`BookingsPanel`) et les statistiques par événement (`/my-events/[id]/statistiques`)
- Gérer le staff d'un événement (rôles : scan, serveur, manager, dj — `EventStaff`)
- Assigner un agent de vente sur place à un événement

### 3.4 Suivi de trésorerie
- Consulter ses versements automatiques (payouts)
- Suivre les codes promo qu'il a émis

---

## 4. Compte Prestataire

*Statut d'approbation propre au rôle (`prestStatus`), symétrique à l'organisateur.*

### 4.1 Candidature & onboarding
- Postuler comme prestataire (activité, catégories de services, tarifs, documents justificatifs)
- Suivre le statut de son dossier

### 4.2 Offre de services (`/offer-services`)
- Créer/éditer sa page publique (photo, description, catégories, zones d'intervention)
- Gérer son catalogue de prestations (nom, description, prix, unité, médias par item)
- Répondre aux demandes de devis reçues via la messagerie (catalogue → conversation)
- Gérer son abonnement et son historique de paiement dans l'onglet `/offer-services?tab=abonnement`
- Consulter ses avis clients, signaler un avis abusif

### 4.3 Commande de services (côté client d'un autre rôle)
- Un client, un organisateur ou un agent peut commander une prestation (`canOrderServices`) — un prestataire ne peut pas commander de service à un autre prestataire

---

## 5. Compte Agent (administration plateforme)

*Rôle purement administratif — ne réserve pas de places, ne suit pas d'organisateur.*

### 5.1 Vue d'ensemble
- Tableau de bord global (métriques business, communauté, nouveaux comptes, répartition par rôle)

### 5.2 Modération & comptes
- Gérer les comptes utilisateurs (suspendre / réactiver, changer un rôle)
- Traiter les dossiers de candidature organisateur/prestataire (`AgentDossiersClient`)
- Traiter les demandes de suppression de compte (`AgentDeletionClient`)
- Modérer les avis (masquer, supprimer, republier, note interne)
- Gérer les événements (annuler, consulter, recharger)

### 5.3 Finance
- Gérer les paiements en attente (versements auto en échec, demandes de virement, soldes dus)
- Marquer un versement comme payé / remboursé / examiné

### 5.4 Vente de billets sur place (agent terrain)
- Vendre un billet en espèces ou Mobile Money directement à l'entrée d'un événement (sans besoin de compte pour l'acheteur — billet nommé, `source: agent_cash`/`agent_momo`)
- Règlement cash en deux modes : débit immédiat de la commission sur l'organisateur, ou règlement numérique par l'agent lui-même
- Vente de groupe à prix forfaitaire (3-5 places), premier participant nommé désigné hôte automatique
- Blocage des ventes cash pour un agent/organisateur après 5 ventes non réglées
- Paiement Mobile Money push direct (le client valide lui-même sur son téléphone, aucun OTP ne transite par l'agent)

### 5.5 Configuration plateforme
- Configurer la page d'accueil publique (mise en avant, carrousel actualité)
- Gérer les boosts (mise en avant payante d'événements)
- Consulter les rapports/signalements

---

## 6. Scan & contrôle d'accès

- Scanner un billet à l'entrée (QR code, `seatVersion`/`entryNonce` — un QR revendu ou retiré de la vente est automatiquement invalidé)
- Accessible aux rôles organisateur et agent
- Vérification stricte : billet déjà scanné, non payé, ou révoqué → refus

---

## 7. Paiements (transverse)

| Rail | Devise | Usage |
|---|---|---|
| Stripe | EUR | Billetterie, boosts, abonnements prestataire |
| FedaPay (Mobile Money) | XOF | Billetterie, seat-hold, revente, boosts |

- Frais plateforme calculés via une formule commune (`fees.ts` : pourcentage + plancher/plafond)
- Remboursements idempotents (`EventRefund` unique par `{eventId, paymentRef}`)
- Paiement de groupe : `seatCount` géré correctement (1 table = 1 unité de remboursement, pas par siège)

---

## 8. Notes d'architecture pertinentes aux use cases

- **`activeRole`, jamais `roles[]` directement** pilote tous les guards d'accès — un compte multi-rôle voit toujours une seule interface à la fois.
- **Temps réel = polling uniquement** (messagerie, présence) — aucune fonctionnalité ne dépend de WebSocket.
- **`proxy.ts`** filtre par préfixe de route côté UX ; la véritable frontière de sécurité est revérifiée dans chaque route API (`lib/server/*`).
- **Fidélité stricte au legacy** : ce document reflète une réécriture Next.js/MongoDB d'une app Vite/Firebase antérieure — les comportements ci-dessus (y compris certaines limites, ex. hôte de groupe agent sans droit de révocation) sont des décisions produit assumées, pas des oublis.

---

*Généré automatiquement à partir de l'exploration du code (`lib/server/`, `app/(public)`, `app/(app)`, `lib/server/permissions.ts`) — à mettre à jour si de nouvelles fonctionnalités sont ajoutées.*
