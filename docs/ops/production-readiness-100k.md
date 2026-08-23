# Readiness production — capacité 100 000 utilisateurs (plan d’exploitation)

Ce document sert de checklist d’exploitation continue pour tenir une forte charge tout en gardant une UX stable.

## 1) Santé applicative (toutes les 2-5 min)

```bash
npm run ops:smoke
```

Ce smoke vérifie:
- `/api/health` (200)
- routes publiques clés (`/home`, `/events`, `/providers`)
- routes publiques clés (`/organizers`)
- routes protégées (`/messages`, `/agent`) en redirection/login selon session
- APIs publiques clés (`/api/events`, `/api/organizers`, `/api/providers`, `/api/search`, `/api/search/quick`)
- webhooks sans signature (`/api/stripe-webhook`, `/api/webhooks/stripe`, `/api/webhooks/fedapay`) avec 400/500 attendu

⚠️ Si le déploiement est en protection Vercel (mode "Protected Deployment"), le smoke retourne `401 Protected deployment`. Dans ce cas:

- soit désactiver temporairement la protection pour l’environnement de test,
- soit passer le token de bypass via la variable:

```bash
VERCEL_AUTOMATION_BYPASS_SECRET=<token>
```

Pour la production, pointer explicitement l’URL cible:

```bash
LIB_WEB_BASE_URL=https://<ton-domaine-vercel> npm run ops:smoke
# Alternative: si tu as déjà une URL de déploiement prête (UI/Vercel API):
# VERCEL_DEPLOYMENT_URL=https://<url-deploiement> npm run ops:deploy:prod
```

Ou en flux unique:

```bash
LIB_WEB_BASE_URL=https://<ton-domaine-vercel> npm run ops:readiness

# Si tu veux que l’étape services bloque la pipeline quand des variables manquent:
STRICT_SERVICES=true LIB_WEB_BASE_URL=https://<ton-domaine-vercel> npm run ops:readiness
```

## 2) Vérification des dépendances externes (CI/Staging)

```bash
npm run check:services
```

- `missing` = variable d’env obligatoire absente.
- `échec` = réseau/credential invalide.

En prod, la commande doit être valide avec toutes les clés (ou explicitement tolérée si certaines intégrations sont débranchées par plan).

### Paramètre de build pour grands volumes

Pour éviter des builds trop longs quand la base grossit (100k+ enregistrements), on recommande :

- `SITEMAP_MAX_ENTRIES=3000` (par défaut en production pour garder un temps de build fiable)
- `SITEMAP_MAX_PAGES=25` (sécurise la profondeur de pagination lors de la génération du sitemap)
- `SITEMAP_BLOG_LIMIT=200` (limite les posts dans le sitemap)
- `PUBLIC_SITE_URL` correctement défini pour des URLs canonicales propres

Exemple:

```bash
SITEMAP_MAX_ENTRIES=50000 PUBLIC_SITE_URL=https://tondomaine.com npm run build
```

## 3) Test charge de base

```bash
LIB_WEB_BASE_URL=https://<ton-domaine-vercel> \
LIB_WEB_LOAD_CONCURRENCY=30 \
LIB_WEB_LOAD_ITERATIONS=300 \
LIB_WEB_LOAD_P95_MAX_MS=2500 \
npm run ops:load
```

Variables disponibles:
- `LIB_WEB_LOAD_P95_MAX_MS` (défaut: `2500`) pour forcer un SLO simple de latence par endpoint.

Critères de départ:
- p95 < 2500 ms (cible réaliste pour les pages dynamiques côté Next.js sans cache applicatif global)
- `0` erreur

Astuce fiabilité:
- Première passe: lancer un run de préchauffage (plus faible charge) puis la passe principale.
- Surveiller la progression après le déploiement (`@VERCEL_EDGE_CACHE`, observabilité et logs d’API).

Conseil de charge: garder des requêtes paginées (`page` + `pageSize`) et éviter les
requêtes de recherche trop courtes côté UI côté-client (min 2 caractères).

## 4) Contrôles qualité applicative

```bash
npm run lint:core
npm run lint
npm test
npm run build
```

## 5) Déploiement Vercel

Quand la branche est propre et validée:

```bash
npx vercel login                 # une fois par machine
npx vercel link                  # si le projet n’est pas lié
npx vercel --prod                # déploiement de production
```

ou en mode automatisé (script local):

```bash
npm run ops:deploy:prod
```

Le script:

- lance le déploiement en production (`vercel --prod --yes`) si `LIB_WEB_BASE_URL` et `VERCEL_DEPLOYMENT_URL` ne sont pas forcés,
- détecte l’URL de production,
- exécute automatiquement `ops:smoke` puis `ops:load`.

Tu peux aussi cibler une URL précise (utile quand l’environnement est déjà déployé):

```bash
LIB_WEB_BASE_URL=https://<ton-domaine-vercel> npm run ops:smoke
LIB_WEB_BASE_URL=https://<ton-domaine-vercel> npm run ops:load
VERCEL_DEPLOYMENT_URL=https://<url-affichee-par-vercel> npm run ops:deploy:prod
```

Si tu es en Vercel protected:

```bash
VERCEL_AUTOMATION_BYPASS_SECRET=<token> npm run ops:deploy:prod
```

Ensuite re-run immédiatement:

```bash
LIB_WEB_BASE_URL=https://<url-affichee-par-vercel> npm run ops:smoke
LIB_WEB_BASE_URL=https://<url-affichee-par-vercel> \
LIB_WEB_LOAD_CONCURRENCY=30 \
LIB_WEB_LOAD_ITERATIONS=300 \
npm run ops:load
```

## 6) Points de scaling à suivre (proches du 100k)

- Surveiller la latence des requêtes publiques: `/events`, `/providers`, `/home`, `/agent/*`, `/profile/*`.
- Vérifier les APIs publiques: `/api/events`, `/api/organizers`, `/api/providers` avec `page` + `pageSize` bornés.
- Vérifier l’usage effectif des indexes Mongo sur les tris/filters lourds.
- Conserver des pages de listes bornées + pagination stricte (limiter `pageSize`).
- CDN actif sur assets statiques + images.
- Surveiller les retries/locking des webhooks Stripe (éviter les traitements idempotents trop chers).
- Surveiller la charge des tâches background: polling messages, envois d’emails/push, tâches cron.

## 7) Alerting recommandé

- Hausse de 5xx / erreurs webhook
- P95 route `/api/health`, `/api/events`, `/api/providers`, `/events`, `/providers`, `/checkout`
- taux d’échec de requêtes externes (Stripe/FedaPay/Cloudinary/Resend)
- verrous répétitifs en webhook (`fulfillment_in_progress`)
