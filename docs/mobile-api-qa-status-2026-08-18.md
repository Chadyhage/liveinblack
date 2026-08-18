# État de validation Web/API/Mobile — 18 août 2026

## Verdict actuel

La compatibilité technique de l’APK avec le backend est validée. La suite automatisée complète, y compris les transactions MongoDB réelles, passe à 100 %. Le dernier niveau de validation fonctionnelle en production reste conditionné par des comptes/données QA et des moyens de paiement sandbox utilisables pour les parcours organisateur, prestataire, staff/scanner, billetterie et paiement.

Backend de production validé : `https://liveinblack.com`.

Les contrôles de production portent sur le déploiement actuellement en ligne. Le déploiement des correctifs locaux n’a pas été effectué automatiquement, car le workspace contient un grand volume de changements non isolés ; une validation explicite du périmètre est nécessaire avant publication.

La session Vercel connectée ici ne peut pas publier ce correctif : le projet local pointe vers `team_h4mKccT2DjY86oK09CGLnWaa`, tandis que la connexion disponible expose seulement `team_c6olwYCvPiPycRhxAIJ71c5H` et aucun projet. Le readiness Expo Web réel doit donc être relancé après connexion au bon compte/équipe Vercel ou après publication par le pipeline autorisé.

`https://troktrok.com` ne doit pas être utilisé par l’APK : ce domaine est rattaché au projet Vercel `trok` et ses routes `/api/*` renvoient 404.

## Résultats obtenus

| Domaine | Résultat | Preuve |
|---|---:|---|
| Tests automatisés web et API | OK | 934/934 tests, 84 fichiers, dont les intégrations et transactions MongoDB |
| Tests unitaires/integration disponibles dans ce workspace | OK | `npm run test` : 215/215 tests, 32 fichiers |
| Qualité du code web | OK | `lint:core` sans erreur |
| Compilation web | OK | build Next.js complet, 170 pages générées |
| TypeScript mobile | OK | `tsc --noEmit` sans erreur |
| Audit UI/UX mobile Apple-like | OK | `npm run check:ui-system` : 65 écrans, 13 composants et 10 assets vérifiés contre le design system |
| Couverture fonctionnelle mobile | OK | `npm run check:mobile-feature-coverage` : 9 domaines, 67 fichiers d’écrans, 60 clients mobile et 219 routes API vérifiés |
| Readiness mobile consolidée | Échec production tant que CORS non déployé | `LIB_WEB_BASE_URL=https://liveinblack.com npm run check:mobile-readiness` passe UI, TypeScript, config, couverture, contrat, exports Expo Web/Android et runtime API ; échoue sur `mobile-web-smoke` et `mobile-web-cors` |
| Exports Expo Web et Android | OK | `expo export --platform web` et `expo export --platform android` aboutissent dans `dist-web-test` et `dist-android-test` |
| Rendu Expo Web avec API fixture | OK | `npm run check:mobile-web-smoke:fixture` ouvre le bundle web local, injecte une réponse API valide et vérifie l’écran d’accueil sans état réseau |
| Correctif CORS local Expo Web | OK | `npm run check:mobile-web-cors:local` : 6/6 préflights OK pour `localhost:8095` et `127.0.0.1:8095` |
| URL API mobile locale, preview et production | Corrigée et OK | `.env.local` Expo Web et profils EAS preview/production pointent vers `https://liveinblack.com` ; les bundles `dist-web-test` et `dist-android-test` ne contiennent pas l’ancien domaine dev |
| Contrat mobile → API | OK | 176/176 appels non-admin reliés à une route et à la bonne méthode HTTP |
| Surface API production sans session | OK | 176/176 réponses sans 405 ni 5xx |
| CORS Expo Web local → API | Correctif local OK, production non conforme | `proxy.ts` répond aux préflights avec `Access-Control-Allow-Origin` en local ; `LIB_WEB_BASE_URL=https://liveinblack.com npm run check:mobile-web-cors` échoue encore 0/8 pour `localhost:8095` et `127.0.0.1:8095` tant que ce correctif n’est pas publié |
| Protection des données privées | OK | 156/176 appels refusés par 401 sans session ; seules les routes publiques attendues répondent 200/302 |
| Santé production | OK | application, MongoDB, webhook Stripe et webhook FedaPay indiqués `ok` |
| Pages/API publiques | OK | 15/15 contrôles de fumée sur `liveinblack.com` |
| Inscription et vérification e-mail | OK | compte QA créé, e-mail Resend reçu, jeton vérifié |
| Connexion mobile Auth.js | OK | CSRF + cookie de session reproduits comme dans React Native |
| Lectures privées client | OK | 19/19 endpoints privés en 200 |
| Profil et préférences | OK | nom, démographie, confidentialité et préférences écrits puis relus |
| Suivi organisateur | OK | ajout, lecture et retrait en production |
| Amis | OK | demande, réception, acceptation, lecture et retrait entre deux comptes QA |
| Messagerie | OK | conversation, envoi, réception, lecture, réaction, édition, favori et épinglage |
| Sondages | OK | création et vote entre deux comptes QA |
| Notifications | OK | réponse privée et payload vérifiés après actions sociales |
| Changement de mot de passe | OK | ancien refusé, nouveau accepté |
| Mot de passe oublié | OK | e-mail reçu, jeton consommé, mot de passe précédent invalidé |
| Suppression de compte | OK | comptes QA anonymisés/supprimés puis connexion refusée |

## Bloquants avant le vrai « 100 % »

| Domaine | État | Donnée ou accès requis |
|---|---|---|
| Intérêt événement | Non exécutable en production | `/api/events` renvoie actuellement `total: 0` sur `https://liveinblack.com` |
| Billetterie, réservation, places, revente | Contrat et sécurité validés, parcours métier non exécuté | au moins un événement QA public avec billets |
| Stripe Checkout | Webhook sain, achat non exécuté | clés/moyen de paiement Stripe sandbox et événement QA |
| FedaPay | Webhook sain, achat non exécuté | clés/moyen de paiement FedaPay sandbox et événement QA |
| Organisateur | Logique et transactions validées en intégration ; parcours production non exécuté | compte organisateur QA approuvé |
| Prestataire | Logique et transactions validées en intégration ; parcours production non exécuté | compte prestataire QA approuvé et abonnement sandbox |
| Staff, scanner, vente sur place, commandes bar | Logique et transactions validées en intégration ; parcours production non exécuté | événement QA, billet QA et compte staff affecté |
| Upload image/voix/avatar/documents | Routes présentes ; upload réel non exécuté dans ce cycle | preset Cloudinary QA et actifs nettoyables |
| Push natif | API présente et tests unitaires disponibles | appareil Android réel + jeton Expo/FCM QA |
| Publication du correctif CORS | Bloquée dans cette session | compte Vercel connecté à `team_h4mKccT2DjY86oK09CGLnWaa` ou pipeline de déploiement autorisé |

## Correctifs confirmés par la suite complète

- Isolation de `revalidateTag` pendant les tests directs de fonctions serveur, sans neutraliser la logique métier.
- Suppression des index MongoDB composés impossibles sur deux tableaux dans `Conversation` et `Message`.
- Exclusion correcte des profils prestataires vides ou dont le catalogue est entièrement indisponible.
- Sélection correcte des boosts actifs pour les recommandations mobiles (expiration, conflit et statut).

## Commandes de contrôle ajoutées

- `npm run check:mobile-api` : compare statiquement tous les appels de l’APK avec les Route Handlers web.
- `npm run check:mobile-api:runtime` : appelle toute la surface mobile contre un déploiement et refuse les 405/5xx.
- `npm run check:mobile-feature-coverage` : vérifie que les grands domaines mobile disposent d’écrans, clients mobiles, routes API et signaux d’implémentation.
- `npm run check:mobile-readiness` : orchestre UI mobile, TypeScript mobile, config APK, couverture fonctionnelle, contrat API, exports Expo Web/Android, smoke Expo Web réel, runtime API, CORS Expo Web et, si les variables existent, les parcours QA authentifiés.
- `npm run check:mobile-web-cors` : vérifie les préflights et en-têtes CORS nécessaires à Expo Web local.
- `npm run check:mobile-web-cors:local` : démarre Next localement et vérifie les préflights CORS exposés par `proxy.ts`, sans dépendre de MongoDB.
- `npm run check:mobile-web-smoke` : sert le bundle Expo Web exporté, ouvre un viewport mobile et échoue si l’accueil affiche `Connexion interrompue`, déborde horizontalement ou produit des erreurs runtime/réseau.
- `npm run check:mobile-web-smoke:fixture` : même smoke visuel, mais avec réponses API contrôlées pour isoler le rendu UI du CORS distant.
- `npm run check:mobile-config` : interdit une URL locale/dev/preview dans le profil APK production.
- `npm run check:mobile-auth` : reproduit la connexion Auth.js mobile et vérifie les lectures privées par rôle.
- `npm run check:mobile-client-flow` : exécute le parcours social/messagerie entre deux comptes QA puis les supprime.
- `npm run check:mobile-password-flow` : vérifie changement et réinitialisation du mot de passe.
- `npm run check:ui-system` côté `LIB_Mobile` : vérifie l’inventaire des écrans, les contrôles tactiles ApplePressable, les SF Symbols/NativeTabs, les cibles 44 pt, les assets et l’absence d’appels API bruts non audités.

## Règle de livraison APK

Un APK de production ne doit être généré que si :

1. `check:mobile-config`, `check:mobile-api`, les tests et le TypeScript mobile passent ;
2. l’export EAS simulé utilise `https://liveinblack.com` comme base API et ne contient aucune ancienne base API `-dev`, preview ou `vercel.app` ;
3. les parcours métier bloqués ci-dessus ont été exécutés avec les fixtures QA requises.
4. `LIB_WEB_BASE_URL=https://liveinblack.com npm run check:mobile-readiness` passe sans échec.

Pour une relance rapide hors livraison, `SKIP_EXPO_EXPORTS=true` peut ignorer les exports Expo et `SKIP_EXPO_WEB_SMOKE=true` peut ignorer le smoke visuel ; ces options ne doivent pas être utilisées pour valider une livraison.
