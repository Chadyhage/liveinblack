# Inventaire des modales

Dernier audit : 12 août 2026.

Toutes les expériences réellement modales passent par `BaseModal`, directement via l'une des trois présentations publiques :

- `Modal` : carte centrée, adaptative en feuille basse sur petit écran ;
- `SlideOverModal` : panneau de détail latéral, adaptatif en feuille basse ;
- `ImmersiveDialog` : expérience plein écran pour les contenus riches.

`BaseModal` est l'unique propriétaire du cycle d'ouverture et de fermeture, du clic sur l'arrière-plan, de la touche Échap, du piège et de la restauration du focus, du verrouillage du défilement et des attributs ARIA. Les variantes ne gèrent que leur présentation.

## Inventaire fonctionnel

L'audit recense 59 expériences ou états modaux : 50 cartes centrées, 6 panneaux latéraux et 3 vues immersives.

### Messagerie — 18

| Expérience | Présentation | Source |
| --- | --- | --- |
| Envoyer une photo | Centrée | `app/(app)/messages/MessagesClient.tsx` |
| Réagir à un message | Centrée | `app/(app)/messages/MessagesClient.tsx` |
| Confirmation contextuelle | Centrée | `app/(app)/messages/MessagesClient.tsx` |
| Nouvelle discussion | Centrée | `app/(app)/messages/MessagesClient.tsx` |
| Confirmer le groupe | Centrée | `app/(app)/messages/MessagesClient.tsx` |
| Nouveau groupe | Centrée | `app/(app)/messages/MessagesClient.tsx` |
| Amis | Centrée | `app/(app)/messages/MessagesClient.tsx` |
| Groupe | Centrée | `app/(app)/messages/MessagesClient.tsx` |
| Mettre en sourdine | Centrée | `app/(app)/messages/MessagesClient.tsx` |
| Contact | Centrée | `app/(app)/messages/MessagesClient.tsx` |
| Signaler un membre | Centrée | `app/(app)/messages/MessagesClient.tsx` |
| Messages importants | Centrée | `app/(app)/messages/MessagesClient.tsx` |
| Bloqués et signalés | Centrée | `app/(app)/messages/MessagesClient.tsx` |
| Transférer un message | Centrée | `app/(app)/messages/MessagesClient.tsx` |
| Nouveau sondage | Centrée | `app/(app)/messages/MessagesClient.tsx` |
| Partager un événement | Centrée | `app/(app)/messages/MessagesClient.tsx` |
| Prendre une photo | Immersive | `app/(app)/messages/MessagesClient.tsx` |
| Aperçu d'une photo | Immersive | `app/(app)/messages/MessagesClient.tsx` |

### Gestion des événements — 12

| Expérience | Présentation | Source |
| --- | --- | --- |
| Réservations | Immersive | `app/(app)/my-events/BookingsPanel.tsx` |
| Booster un événement | Centrée | `app/(app)/my-events/BoostModal.tsx` |
| Annuler ou supprimer un événement | Centrée | `app/(app)/my-events/CancelModal.tsx` |
| Guestlist | Centrée | `app/(app)/my-events/GuestlistModal.tsx` |
| Retirer un invité | Centrée | `app/(app)/my-events/GuestlistModal.tsx` |
| Chargement de la guestlist | Centrée | `app/(app)/my-events/MesEvenementsClient.tsx` |
| Reporter un événement | Centrée | `app/(app)/my-events/PostponeModal.tsx` |
| Codes promo | Centrée | `app/components/PromoCodesPanel.tsx` |
| Supprimer un code promo | Centrée | `app/components/PromoCodesPanel.tsx` |
| Chargement des codes promo | Centrée | `app/(app)/my-events/MesEvenementsClient.tsx` |
| Équipe de la soirée | Centrée | `app/components/EventStaffModal.tsx` |
| Retirer un membre de l'équipe | Centrée | `app/components/EventStaffModal.tsx` |

### Billetterie et page événement — 6

| Expérience | Présentation | Source |
| --- | --- | --- |
| Galerie des places | Centrée | `app/components/EventCheckoutPanel.tsx` |
| Éléments inclus dans un billet | Centrée | `app/components/EventCheckoutPanel.tsx` |
| Personnaliser une option | Centrée | `app/components/EventCheckoutPanel.tsx` |
| Récapitulatif de commande | Centrée | `app/components/EventCheckoutPanel.tsx` |
| Vérification de l'âge | Centrée | `app/components/AgeGateModal.tsx` |
| Carte du lieu | Centrée | `app/(public)/events/[id]/EventVenueMap.tsx` |

### Profil, authentification et prestations — 9

| Expérience | Présentation | Source |
| --- | --- | --- |
| Mot de passe oublié | Centrée | `app/(public)/login/AuthForm.tsx` |
| Assistant de préférences | Centrée | `app/(app)/profile/PreferencesWizard.tsx` |
| Recadrage d'image | Centrée | `app/components/ImageCropperModal.tsx` |
| Supprimer une offre | Centrée | `app/(app)/offer-services/ProposerServicesClient.tsx` |
| Demander un service au prestataire | Centrée | `app/components/ProviderCatalogInquiry.tsx` |
| Créer ou modifier un avis prestataire | Centrée | `app/components/ProviderReviewsClient.tsx` |
| Signaler un avis prestataire | Centrée | `app/components/ProviderReviewsClient.tsx` |
| Supprimer son avis prestataire | Centrée | `app/components/ProviderReviewsClient.tsx` |
| Signaler un profil public | Centrée | `app/components/PublicProfileActions.tsx` |

### Espace agent — 11

| Expérience | Présentation | Source |
| --- | --- | --- |
| Note interne sur un avis | Centrée | `app/components/AgentReviewsClient.tsx` |
| Supprimer un avis | Centrée | `app/components/AgentReviewsClient.tsx` |
| Créer ou modifier un article | Centrée | `app/components/AgentBlogClient.tsx` |
| Confirmer la suppression d'un compte | Centrée | `app/components/AgentDeletionClient.tsx` |
| Confirmation d'action sur un dossier | Centrée | `app/components/AgentDossiersClient.tsx` |
| Annuler un événement | Centrée | `app/components/AgentEventsClient.tsx` |
| Confirmation d'une action financière | Centrée | `app/components/AgentPaymentsClient.tsx` |
| Confirmation d'une action sur un compte | Centrée | `app/components/AgentUsersClient.tsx` |
| Détail d'une demande de suppression | Latérale | `app/components/AgentDeletionClient.tsx` |
| Détail d'un dossier | Latérale | `app/components/AgentDossiersClient.tsx` |
| Détail d'un compte | Latérale | `app/components/AgentUsersClient.tsx` |

### Détails publics interceptés — 3

| Expérience | Présentation | Source |
| --- | --- | --- |
| Détail d'un événement depuis une liste | Latérale | `app/(public)/@modal/(.)events/[id]/page.tsx` |
| Détail d'un organisateur depuis une liste | Latérale | `app/(public)/@modal/(.)organizers/[slug]/page.tsx` |
| Détail d'un prestataire depuis une liste | Latérale | `app/(public)/@modal/(.)providers/[id]/page.tsx` |

## Éléments volontairement exclus

- Le lecteur musical ambiant est un popover non modal déclaré avec `aria-modal="false"`.
- Le menu de partage d'un événement est un menu contextuel, pas une fenêtre de dialogue.

Ces deux éléments ne doivent pas utiliser `BaseModal`, car ils ne bloquent pas l'interaction avec le reste de la page.
