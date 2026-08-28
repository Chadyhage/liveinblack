# Inventaire des écrans UI

Inventaire de référence pour l'audit d'uniformité visuelle et d'accessibilité.
Les routes `api`, les flux XML/JSON et les pages techniques sans interface ne
sont pas inclus dans cet inventaire.

## Public

- `/home`
- `/about`
- `/search`
- `/blog`
- `/blog/benin`
- `/blog/[slug]`
- `/events`
- `/events/[id]`
- `/providers`
- `/providers/[id]`
- `/organizers`
- `/organizers/[slug]`
- `/contact`
- `/legal-notice`
- `/terms`
- `/privacy`
- `/cookies`
- `/login`
- `/confirmer-email`
- `/verify-email`
- `/reset-password`
- `/organizer-signup`
- `/provider-signup`
- `/boost-active`
- `/payment-success`
- `/ticket/[token]`

## Espace authentifié

- `/profile`
- `/profile/billets`
- `/profile/followed-organizers`
- `/profile/interested-events`
- `/profile/parametres`
- `/help`
- `/messages`
- `/notifications`
- `/my-application`
- `/my-events`
- `/my-events/[id]/statistiques`
- `/my-shifts`
- `/offer-services`
- `/organizer-studio`
- `/on-site-sales/[eventId]`
- `/order/[eventId]/[ticketCode]`
- `/playlist/[eventId]`
- `/scanner/[eventId]`

## Espace agent

- `/agent`
- `/agent/actualite`
- `/agent/avis`
- `/agent/blog`
- `/agent/comptes`
- `/agent/dossiers`
- `/agent/evenements`
- `/agent/paiements`
- `/agent/signalements`
- `/agent/suppressions`

## Contrats à vérifier sur chaque écran

- Gouttière et largeur de contenu issues des tokens globaux.
- Boutons et champs avec zone tactile minimale de 44 px et focus visible.
- Hiérarchie typographique et contrastes cohérents.
- Défilement limité au panneau qui possède réellement une liste ou une discussion.
- Modales fermables au clavier, avec focus visible et contenu interne défilable.
- Aucun débordement horizontal à 320, 768 et 1440 px.
