# Activation Vercel Pro — diagnostic et plan 100%

Objectif: exploiter Vercel Pro comme une vraie couche de production, pas seulement comme un hebergeur Next.js. Le site utilise deja une partie importante du socle: Next.js sur Vercel, CDN, images, crons, analytics, Speed Insights, variables d'environnement et cache public. Le plus gros potentiel restant est dans l'observabilite, le pare-feu, le controle de cout, les flags/config globales et les workflows asynchrones.

## Etat actuel

Actif cote repo:

- Next.js deploye via `vercel.json`.
- Regions explicites: `cdg1` et `iad1`.
- `@vercel/analytics` et `@vercel/speed-insights` branches dans le layout global.
- Evenements business via `lib/client/growthAnalytics.ts`.
- 8 Cron Jobs declares dans `vercel.json`.
- Logs structures communs sur les Cron Jobs via `runVercelCron`: `cron_start`, `cron_done`, `cron_failed`, duree et identifiant Vercel.
- Logs structures sur les APIs critiques via `runObservedRoute`: checkout, Stripe/FedaPay webhooks, search, register, password reset.
- Script Firewall en dry-run/staging: `npm run ops:vercel:firewall:stage`.
- Script de scan erreurs runtime post-deploy: `npm run ops:vercel:logs`, integre a `npm run ops:deploy:prod`.
- Audit live Vercel prepare: `npm run audit:vercel-live`.
- Audit/sync des variables Vercel prepares: `npm run audit:vercel-env` et `npm run ops:vercel:env:sync`.
- Audit Workflows/Queues prepare: `npm run audit:vercel-workflows`.
- Audit Usage Vercel Pro prepare: `npm run audit:vercel-usage`.
- Audit revue Firewall prepare: `npm run audit:vercel-firewall`.
- Audit Spend Management prepare: `npm run audit:vercel-spend`.
- Audit revue Log Drain prepare: `npm run audit:vercel-drain`.
- Audit portes live prepare: `npm run audit:vercel-live-gates`, avec controle des statuts autorises et des liens vers les decisions Pro.
- Audit ordre activation prepare: `npm run audit:vercel-activation-order`, avec controle des niveaux d'automatisation autorises.
- Audit completion stricte prepare: `npm run audit:vercel-completion`.
- Suite d'audit globale preparee: `npm run audit:vercel-pro-suite`, avec controle du schema des commandes, cles de commandes uniques, scripts `package.json` et fichiers cibles controles separement, couverture de tous les scripts `audit:vercel-*` et `ops:vercel:*`, couverture des leviers Pro obligatoires (env, Firewall, Spend, Webhooks, Drains, Logs, Edge Config, Workflows, Usage, live gates, completion), coherence entre scope local/live et comportement attendu, obligation `requiredFor100`, outils manuels reserves aux leviers `ops:vercel:*` avec approbation explicite et raison visible, detection des outils manuels sans les lancer a vide, compteurs separes pour commandes selectionnees/audits executes et verdict `100% prouve` reserve au mode strict avec lecture live.
- Outil de consignation des preuves prepare: `npm run ops:vercel:evidence:record`, avec `--confirm-final` obligatoire pour passer une preuve en `complete` et preuve de decision obligatoire pour `active`/`rejected`.
- Outil prochaine action prepare: `npm run ops:vercel:next-action`, avec affichage de la dette de preuve restante avant la prochaine etape.
- Registre des decisions Vercel Pro prepare: `config/vercel-pro-decisions.json`, lu par `npm run audit:vercel-pro`.
- Setup Edge Config prepare: `npm run ops:vercel:edge-config:setup`.
- Activation Edge Config preparee: `npm run ops:vercel:edge-config:activate`.
- Edge Config consomme par le runtime via `getVercelOpsConfig`: maintenance, checkout, revente, longueur minimale de recherche et TTL cache public.
- Setup webhooks plateforme prepare: `npm run ops:vercel:webhooks:setup`.
- Setup Drain prepare: `npm run ops:vercel:drain:setup`.
- Endpoint interne de reception drain prepare: `/api/ops/vercel-drain`, signature HMAC verifiee via `DRAIN_SECRET`, stockage court en base avec expiration automatique.
- Variables ops Vercel documentees dans `.env.example`: bypass protection, fenetre logs, drains et webhook d'erreur.
- Endpoint Spend Management prepare: `/api/ops/vercel-spend`, signature HMAC verifiee via `VERCEL_SPEND_WEBHOOK_SECRET`, historique 90 jours et auto-maintenance optionnelle via Edge Config.
- Endpoint webhook Vercel plateforme prepare: `/api/ops/vercel-events`, signature HMAC verifiee via `VERCEL_ACCOUNT_WEBHOOK_SECRET`, historique 90 jours des evenements deploy/projet/domaine.
- Page agent Ops Vercel preparee: `/agent/vercel`, appuyee par `/api/agent/vercel/ops-events` et `/api/agent/vercel/ops-config`, lecture protegee par `requireAgent`, filtres `source`, `type`, `limit`, payloads rediges par defaut, barometre de completude Pro base sur les signaux recus et les secrets ops configures, feuille de route 100% issue de `config/vercel-pro-decisions.json`, pilotage Edge Config si `VERCEL_API_TOKEN` est configure, confirmations avant actions sensibles, modes rapides normal/urgence et audit trail des changements.
- Feu vert activation live prepare dans `/agent/vercel`: le panneau synthese preuves fraiches, risques cout/securite, besoin d accord explicite et prochaine commande sure avant toute mutation Vercel live.
- Dette de preuve 100% preparee dans `/agent/vercel`: le panneau liste les decisions, portes live et preuves strictes qui empechent encore de declarer Vercel Pro utilise a 100%, avec commande de preuve copiable par dette et etat explicite si les registres locaux sont indisponibles.
- Suivi Usage Pro prepare: `config/vercel-usage-watchlist.json`, expose dans `/agent/vercel` et verifiable via `npm run audit:vercel-usage`.
- Verification HMAC Vercel centralisee dans `lib/server/vercelSignature.ts` pour drains, Spend Management et webhooks plateforme.
- Cache public/ISR avec `revalidate`, `unstable_cache`, tags et headers `s-maxage`.
- Optimisation image Next.js configuree dans `next.config.ts`.
- Plusieurs routes critiques avec `maxDuration`, notamment checkout, webhooks, seat holds et import blog.
- Traitement post-reponse deja present sur les messages via `after()`.

Etat live:

- Le repo pointe vers `team_h4mKccT2DjY86oK09CGLnWaa` et `prj_X6bYRp4uhDdQYQnHIzU2aw6cWZhg`.
- Le CLI Vercel avec acces reseau autorise voit le projet live `liveinblack`.
- Les audits live confirment variables, deployments, domaines, Firewall draft et Edge Config.
- L'audit live controle aussi la presence d'un webhook plateforme vers `/api/ops/vercel-events`.
- Il reste le drain observabilite a creer cote Vercel pour fermer le dernier voyant live. `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` est classe optionnel car le code actuel ne le consomme pas.
- L'Edge Config est liee au projet en production et development. Preview attend une branche precise via `VERCEL_PREVIEW_GIT_BRANCH`; sans lien preview, le site utilise les valeurs par defaut et reste stable.

## Niveau d'exploitation

| Brique Pro | Etat | Action prioritaire |
| --- | --- | --- |
| Hosting/CDN/CI | Utilise | Garder et suivre les builds/deployments. |
| Analytics | Utilise | Verifier les events conversion dans le dashboard. |
| Speed Insights | Utilise | Suivre LCP/INP/CLS par route cle. |
| Cron Jobs | Utilise | Ajouter alerting sur echec et duree. |
| Functions/Fluid Compute | Partiel | Mesurer durees, cold starts, memoire, timeouts. |
| ISR/cache | Partiel fort | Mesurer cache hit ratio et routes dynamiques trop cheres. |
| Image Optimization | Partiel | Suivre transformations/cache reads/cache writes. |
| Firewall/WAF | Non prouve | Ajouter regles en mode `log` puis durcir apres observation. |
| Spend Management | Non prouve | Activer budgets, alertes et seuils 50/75/100%. |
| Runtime Logs/Errors | Non prouve | Mettre une routine post-deploy et logs structures. |
| Drains/Observability Plus | Non prouve | Brancher Sentry/Datadog/Honeycomb ou endpoint interne. |
| Edge Config/Flags | Non utilise | Y mettre maintenance mode, flags et config publique globale. |
| Blob | Non utilise | A evaluer seulement pour nouveaux fichiers simples; Cloudinary reste mieux pour media transformes. |
| Queues/Workflows | Non utilise | Migrer les traitements longs/retryables hors requete utilisateur. |
| AI Gateway/Sandbox | Non pertinent maintenant | Garder hors scope tant qu'il n'y a pas de feature IA ou code execution. |

## Priorite 1 — reprendre le controle du compte

1. Reconnecter Vercel/Codex au bon scope Pro.
2. Confirmer dans Vercel:
   - team Pro active,
   - projet lie au bon repo,
   - domaine production,
   - variables d'environnement production/preview/development,
   - budget/spend management active,
   - deployment protection et bypass automation,
   - analytics et speed insights actifs.
3. Relancer:

```bash
npm run audit:vercel-pro
npm run audit:vercel-live
npm run audit:vercel-env
```

`audit:vercel-live` lit `.vercel/project.json`, puis interroge Vercel pour le projet, les variables d'environnement, les deployments recents, les domaines, les drains et Edge Config. Tant que le CLI ou Codex n'est pas reconnecte au bon scope Pro, cette commande doit echouer clairement: c'est attendu et utile.

Pour les variables d'environnement, `audit:vercel-env` compare les cles production attendues au dashboard Vercel. `ops:vercel:env:sync` lit `.env.local` sans afficher les valeurs, et reste en dry-run par defaut:

```bash
npm run ops:vercel:env:sync
npm run ops:vercel:env:sync -- --public-only --apply
npm run ops:vercel:env:sync -- --apply
```

Preferer `--public-only` pour les premieres passes automatisees: ce mode ne pousse que les variables non sensibles en production. Utiliser `--apply` complet seulement apres confirmation que `.env.local` contient bien les valeurs production/preview attendues.

## Priorite 2 — securiser et reduire le gaspillage

Spend Management:

- Revue locale:

```bash
npm run audit:vercel-spend
```

- Source: `config/vercel-spend-management-review.json`.
- Activer Spend Management dans Billing avec un montant mensuel adapte.
- Garder les notifications 50%, 75% et 100% actives pour les roles Owner/Billing.
- Configurer le webhook vers `https://ton-domaine.com/api/ops/vercel-spend`.
- Copier le secret affiche par Vercel dans `VERCEL_SPEND_WEBHOOK_SECRET`.
- Laisser `VERCEL_SPEND_AUTO_MAINTENANCE=0` au debut. Passer a `1` seulement si l'equipe veut qu'une alerte 100% coupe automatiquement checkout et active `maintenance_mode` via Edge Config.
- Considerer la brique finalisee seulement quand la checklist confirme: montant, notifications, webhook, secret, decision auto-maintenance et visibilite dans `/agent/vercel`.

Regles Firewall a creer d'abord en action `log`, puis a publier seulement apres verification dashboard:

```bash
npm run ops:vercel:firewall:stage
npm run ops:vercel:firewall:stage -- --apply
npm run audit:vercel-firewall
vercel firewall diff
```

Le script stage des regles en brouillon Vercel et laisse la publication production separee. Il couvre les sondes d'exploitation, checkout, auth, search et webhooks.

Etat live mesure le 2026-09-01: 5 regles Firewall sont stagees en brouillon Vercel, non publiees. Elles doivent rester en observation/revue dashboard avant `vercel firewall publish --yes`.

Revue pre-publication:

- Source: `config/vercel-firewall-review.json`.
- La revue verifie les 5 regles attendues, leur risque et le checklist dashboard avant publication.
- La publication reste volontairement separee et humaine: `vercel firewall publish --yes`.
- Ne jamais publier si `vercel firewall diff` montre une regle inconnue, trop large, ou une action bloquante non prevue.

Equivalence CLI detaillee:

```bash
vercel firewall rules add "Log exploit probes" \
  --condition '{"type":"path","op":"inc","value":["/.env","/.git/config","/wp-admin","/phpmyadmin"]}' \
  --action log --yes

vercel firewall rules add "Log checkout pressure" \
  --condition '{"type":"path","op":"pre","value":"/api/checkout"}' \
  --action rate_limit \
  --rate-limit-window 60 \
  --rate-limit-requests 300 \
  --rate-limit-keys ip \
  --rate-limit-action log \
  --yes

vercel firewall rules add "Log auth pressure" \
  --condition '{"type":"path","op":"pre","value":"/api/auth"}' \
  --action rate_limit \
  --rate-limit-window 60 \
  --rate-limit-requests 120 \
  --rate-limit-keys ip \
  --rate-limit-action log \
  --yes

vercel firewall rules add "Log search pressure" \
  --condition '{"type":"path","op":"pre","value":"/api/search"}' \
  --action rate_limit \
  --rate-limit-window 60 \
  --rate-limit-requests 600 \
  --rate-limit-keys ip \
  --rate-limit-action log \
  --yes
```

Avant publication production:

```bash
vercel firewall diff
```

Apres quelques jours de trafic propre, transformer progressivement `log` en `rate_limit`, `challenge` ou `deny` selon les hits reels.

## Priorite 3 — rendre l'observabilite utile

Minimum production:

- garder `@vercel/analytics` et `@vercel/speed-insights`;
- lire chaque semaine les routes LCP/INP/CLS les plus faibles;
- scanner les erreurs apres chaque deploy;
- conserver les logs structures sur les crons, checkout, webhooks, auth et search;
- configurer un webhook Vercel Account vers `https://ton-domaine.com/api/ops/vercel-events` pour historiser les evenements de plateforme sans exporter tous les logs runtime;
- brancher au moins un drain ou une integration d'erreur si l'equipe veut une retention superieure au dashboard de base.

Webhook Vercel plateforme:

- Dry-run/apply:

```bash
npm run audit:vercel-webhooks
npm run ops:vercel:webhooks:setup
npm run ops:vercel:webhooks:setup -- --apply
```

- Source de revue: `config/vercel-account-webhook-review.json`.
- Par defaut, le script cree un Account Webhook limite au projet courant vers `PUBLIC_SITE_URL + /api/ops/vercel-events`.
- Evenements par defaut: `deployment.created` et `deployment.ready`.
- Pour ajouter d'autres evenements supportes par Vercel: `VERCEL_ACCOUNT_WEBHOOK_EVENTS=deployment.created,deployment.ready,...`.
- Si la CLI renvoie le secret au format lisible par le script, il est synchronise dans `VERCEL_ACCOUNT_WEBHOOK_SECRET` en production et development sans etre affiche.
- Sinon, copier le secret affiche une seule fois par Vercel dans `VERCEL_ACCOUNT_WEBHOOK_SECRET`.
- Ce webhook ne remplace pas un Log Drain: il trace les evenements de plateforme, pas le detail des logs runtime.
- Considerer cette brique finalisee seulement quand la checklist confirme: endpoint production, signature, scope projet, selection d'evenements, retention et visibilite agent.

Webhook Spend Management:

- Dashboard Vercel > Team Settings > Billing > Spend Management.
- Endpoint: `https://ton-domaine.com/api/ops/vercel-spend` ou la valeur `VERCEL_SPEND_WEBHOOK_URL`.
- Copier le secret affiche par Vercel dans `VERCEL_SPEND_WEBHOOK_SECRET`.
- Ce webhook reste volontairement configure dans Billing, car il depend du montant mensuel, des seuils et des droits Owner/Billing.

Lecture interne des evenements Vercel:

```bash
/agent/vercel
/api/agent/vercel/ops-events
/api/agent/vercel/ops-events?source=platform&limit=20
/api/agent/vercel/ops-events?source=spend&limit=20
/api/agent/vercel/ops-events?source=drain&type=error&limit=20
```

La page et l'API sont reservees aux comptes `agent`. L'API renvoie des resumes par defaut; `includeSample=1` existe pour debug ponctuel mais redige les champs sensibles evidents.

Pilotage Edge Config depuis l'espace agent:

- `/agent/vercel` lit `/api/agent/vercel/ops-config`.
- En lecture seule, la page affiche les flags actifs.
- En ecriture, ajouter `VERCEL_API_TOKEN`, `VERCEL_TEAM_ID` et `VERCEL_EDGE_CONFIG_ID` pour permettre aux agents de changer les flags sans redéploiement.
- Flags pilotables: maintenance, checkout, revente, longueur minimale de recherche et TTL cache recherche.
- Actions sensibles protegees par confirmation: maintenance, checkout, revente et presets normal/urgence.
- Le barometre Pro met en evidence les briques encore manquantes: webhook plateforme, webhook budget, Log Drain et capacite de reponse incident.
- Le barometre ne lit jamais les valeurs secretes. Il affiche seulement si les secrets attendus sont configures: `VERCEL_ACCOUNT_WEBHOOK_SECRET`, `VERCEL_SPEND_WEBHOOK_SECRET`, `DRAIN_SECRET`, `VERCEL_DRAIN_URL` ou `ERROR_WEBHOOK_URL`.
- Si un webhook est configure mais n'a pas encore recu d'evenement, le barometre le signale comme pret et en attente du prochain signal.
- Le bloc `Verdict 100% Vercel Pro` separe explicitement l'etat prepare de l'etat prouve: tant que les decisions, portes live ou preuves strictes manquent, il affiche `100% non prouve`.
- Le bloc `Mode d'exploitation Vercel Pro` resume l'etat en une phrase: prepare, live sensible a approuver, ou 100% prouve, avec la commande associee.
- Le bloc `Fraicheur des preuves` signale les registres vieux de plus de 14 jours, pour eviter de declarer le 100% avec des preuves perimees.
- La feuille de route 100% affiche les lignes du registre qui ne sont pas encore `active` ou `rejected`, avec la prochaine action concrete.
- Le suivi Usage Pro affiche les metriques a surveiller dans Vercel: spend, edge requests, data transfer, functions, images, cache/ISR, web vitals et pression Firewall.
- Les portes live restantes, l'ordre recommande et les preuves du 100% sont visibles dans `/agent/vercel`; les portes et etapes deja `active` ou `rejected` dans le registre de decisions ne sont plus comptees comme restantes.
- Le bloc `Matrice des preuves live` relie chaque porte ouverte a sa source de preuve: audit live, dashboard, accord explicite ou implementation, avec commande de consignation pre-remplie.
- Le bloc `Prochaine preuve a capturer` met en avant la prochaine preuve live/dashboard a fermer, son lien Vercel et la commande a copier apres confirmation.
- La suite d'audit 100% est aussi visible dans `/agent/vercel`, avec distinction local/live-read/strict.
- La prochaine action recommandee est calculee depuis l'ordre d'activation, les portes live et le registre de decisions, puis affichee en haut de `/agent/vercel`.
- La carte de prochaine action inclut aussi le lien dashboard Vercel le plus pertinent selon la porte live: Billing, Firewall, Webhooks, Log Drains ou dashboard projet.
- La carte de prochaine action affiche un niveau de securite: preparation safe, live manuel ou feu vert requis.
- La carte de prochaine action affiche une checklist avant action: responsable, preflight, dashboard cible, preuve attendue et garde-fou de securite.
- Le bloc `Blocages vers 100%` resume les actions restantes par nature: automatisables, humaines, accord explicite et responsable principal.
- Le bloc `Risque et cout restants` classe les portes ouvertes par risque cout, securite, observabilite, architecture ou plateforme, avec severite et action sure.
- Le bloc `Acces dashboard Vercel` donne les raccourcis vers projet, Usage, Billing/Spend, Firewall, Webhooks, Log Drains et Edge Config.
- Les preuves de completion affichent aussi une commande `ops:vercel:evidence:record` pre-remplie pour consigner la preuve et mettre a jour la decision associee quand il y en a une.
- Les commandes de preuve et d'audit sont copiables depuis `/agent/vercel`, pour que le diagnostic mene directement a l'execution.
- Chaque changement est historise dans `VercelOpsConfigChange` avec agent, ancienne valeur, nouvelle valeur et date.

Commandes utiles:

```bash
npm run ops:vercel:logs
LIB_WEB_BASE_URL=https://ton-domaine.com npm run ops:vercel:logs
VERCEL_LOGS_SINCE=24h LIB_WEB_BASE_URL=https://ton-domaine.com npm run ops:vercel:logs
npm run ops:deploy:prod
vercel logs <deployment-url> --level error --since 1h
vercel logs <deployment-url> --json --since 1h
```

Le flux `ops:deploy:prod` enchaine maintenant deploy, smoke, load test et scan d'erreurs runtime Vercel. Si le scan trouve des erreurs, le deploy est considere non valide operationnellement meme si le build a reussi.

Setup Drain:

```bash
npm run audit:vercel-drain
npm run ops:vercel:drain:setup
VERCEL_DRAIN_URL=https://ton-domaine.com/api/ops/vercel-drain npm run ops:vercel:drain:setup -- --apply
VERCEL_DRAIN_URL=https://ton-collecteur.example.com/logs npm run ops:vercel:drain:setup -- --apply
```

Source de revue: `config/vercel-drain-activation-review.json`.

L'endpoint interne `/api/ops/vercel-drain` ne loggue pas lui-meme les payloads et conserve seulement un resume pendant 14 jours. Il faut ajouter le secret fourni par Vercel dans `DRAIN_SECRET` pour que les payloads signes soient acceptes. Un collecteur externe type Sentry/Datadog/Honeycomb reste preferable si l'equipe veut de la retention longue, de l'alerting avance et des tableaux de bord dedies.
Le script lit `PUBLIC_SITE_URL` depuis l'environnement ou `.env.local`/`.env.example` et utilise l'endpoint interne par defaut si `VERCEL_DRAIN_URL` n'est pas fourni. Si Vercel renvoie un secret de signature a la creation, le script ajoute `DRAIN_SECRET` en production et development sans l'afficher.

Decision avant activation live:

- Le Log Drain exporte des logs runtime hors du dashboard Vercel vers un endpoint persistant.
- L'endpoint interne verifie la signature HMAC, ne loggue pas le payload et expire les resumes apres 14 jours.
- La revue doit confirmer destination, signature, retention, anti-boucle, sources et visibilite agent.
- Malgre ces garde-fous, l'equipe doit approuver explicitement l'activation avant de lancer `npm run ops:vercel:drain:setup -- --apply`.

## Priorite 4 — exploiter Edge Config sans casser l'existant

Bons candidats:

- `maintenance_mode`;
- `checkout_enabled`;
- `ticket_resale_enabled`;
- `search_min_query_length`;
- `public_cache_ttl_seconds`;
- messages operationnels temporaires.

Consommation runtime actuelle:

- `maintenance_mode`: coupe les APIs checkout, search et revente avec une reponse 503 ou vide selon le contexte.
- `checkout_enabled`: coupe les achats Stripe/FedaPay sans redeployer.
- `ticket_resale_enabled`: coupe la bourse de revente, la mise en vente et l'achat de billets revendus.
- `search_min_query_length`: ajuste la pression sur `/api/search`.
- `public_cache_ttl_seconds`: ajuste le TTL CDN des resultats de recherche.

Setup initial:

```bash
npm run ops:vercel:edge-config:setup
npm run ops:vercel:edge-config:setup -- --apply
npm run ops:vercel:edge-config:activate
npm run ops:vercel:edge-config:activate -- --apply
```

`ops:vercel:edge-config:activate` cree un token lecture, construit `EDGE_CONFIG` au format `https://edge-config.vercel.com/<id>?token=...`, puis l'ajoute dans production et development sans afficher le token. Pour Preview, definir `VERCEL_PREVIEW_GIT_BRANCH=nom-de-branche` afin d'eviter une activation ambigue sur toutes les branches.

Ne pas y mettre:

- donnees utilisateur;
- sessions;
- stocks de tickets;
- paiements;
- donnees souvent ecrites.

## Priorite 5 — deplacer les traitements longs

Candidats Workflows/Queues:

- recap evenement;
- expiration resale;
- rappels cash sale;
- rappels interested events;
- import blog/campaign;
- retries email/push;
- reconciliation paiement.

Objectif: les routes utilisateur doivent repondre vite, puis continuer le travail en arriere-plan quand c'est possible.

Inventaire verifiable:

```bash
npm run audit:vercel-workflows
```

Sources:

- `config/vercel-workflow-candidates.json`;
- `config/vercel-workflow-activation-review.json`.

Premier lot recommande:

- `resale-expiry`: priorite haute, frequent, doit rester idempotent.
- `payouts`: priorite haute, financier, necessite audit trail fort.

Strategie de migration:

- garder le Cron Job Vercel comme declencheur;
- lancer un workflow durable depuis la route cron;
- transformer la logique metier en steps retryables;
- ajouter une cle d'idempotence par entite traitee;
- conserver les logs structures via `runVercelCron`.
- prevoir un retour arriere simple: le cron peut revenir au traitement actuel si le workflow montre une anomalie.

Revue obligatoire avant la premiere migration:

- choisir explicitement le candidat prioritaire;
- conserver le planning cron actuel;
- definir l'idempotence par billet, paiement, rappel ou notification;
- garder la logique Node.js/DB/fournisseurs dans des steps;
- distinguer erreurs retryables et erreurs definitives;
- conserver l'observabilite;
- garder un chemin rollback.

## Definition de "100%" utile

Pour ce projet, "Vercel Pro utilise a 100%" veut dire:

- chaque brique Pro pertinente est soit activee, soit explicitement rejetee avec une raison produit/cout;
- les metriques reelles sont visibles dans le dashboard;
- les couts ont des garde-fous;
- le firewall protege les endpoints chers;
- les crons et webhooks ont logs et alertes;
- les routes publiques exploitent cache/CDN/images;
- les traitements longs ne bloquent pas l'utilisateur;
- l'equipe peut relancer `npm run audit:vercel-pro` et voir l'etat.

Le registre source de verite pour cette decision est `config/vercel-pro-decisions.json`.
Les dernieres actions live a fermer sont suivies dans `config/vercel-live-activation-gates.json`.
L'ordre recommande pour les fermer est suivi dans `config/vercel-pro-activation-order.json`.
Les preuves strictes avant de declarer le 100% sont suivies dans `config/vercel-pro-completion-evidence.json`.
La suite d'audit globale est suivie dans `config/vercel-pro-audit-suite.json`.

Statuts utilises:

- `active`: la brique est deja exploitee par le site ou l'ops.
- `prepared`: le code et l'outillage sont prets, mais il reste une activation live/dashboard.
- `planned`: la brique est pertinente mais pas encore implementee.
- `rejected`: la brique est volontairement ecartee avec une raison produit/cout.

Pour atteindre un 100% prouvable, chaque ligne doit finir en `active` ou `rejected`. Au 2026-09-01, les lignes encore non finalisees sont principalement Firewall publication, Spend Management dashboard, Account Webhook live, Log Drain live et premiere migration Workflows/Queues.

Audit des portes restantes:

```bash
npm run audit:vercel-live-gates
npm run audit:vercel-activation-order
npm run audit:vercel-completion
npm run audit:vercel-pro-suite
npm run audit:vercel-pro-suite -- --include-live
npm run audit:vercel-pro-suite -- --strict --include-live
npm run ops:vercel:next-action
```

Ces portes separent volontairement le pret-local du prouve-live:

- Firewall publie seulement apres observation;
- Spend Management finalise dans Billing;
- Account Webhook cree sur le bon domaine;
- Log Drain active seulement avec accord explicite;
- premier Workflow migre avec idempotence et rollback.

Ordre recommande:

1. Creer le webhook Vercel Account: visibilite faible risque.
2. Finaliser Spend Management: garde-fou cout avant d'augmenter les usages.
3. Publier Firewall apres observation: protection sans faux positifs.
4. Activer Log Drain seulement si l'equipe accepte l'export des logs runtime.
5. Migrer `resale-expiry` vers Workflow, puis seulement ensuite les flux financiers comme `payouts`.

Regle de completion:

- `npm run audit:vercel-completion` doit rester strict.
- Il est normal qu'il echoue tant que les preuves live/dashboard manquent.
- On ne marque pas Vercel Pro comme 100% utilise parce que le code est pret; on le marque seulement quand les decisions sont `active` ou `rejected`, les portes live sont fermees, et les preuves sont documentees.
- La suite `audit:vercel-pro-suite` lance les audits locaux ensemble.
- `--include-live` ajoute les lectures Vercel live.
- `--strict --include-live` est le mode final: il doit passer seulement quand le 100% est vraiment prouve.
- `npm run ops:vercel:next-action` lit les registres et affiche la prochaine porte a fermer dans l'ordre recommande.
- `/agent/vercel` affiche la meme priorite sous forme de carte actionnable: responsable, niveau d'automatisation, preflight, action, preuve attendue et risque si force.
- La carte affiche aussi la commande de preuve a adapter apres l'action live, pour eviter les preuves oubliees ou desynchronisees.

Consigner une preuve apres action live:

```bash
npm run ops:vercel:evidence:record -- --key live-gates-closed --status complete --evidence "Firewall publie, Spend Management actif, webhook/drain confirmes, workflow resale-expiry migre." --next "Relancer audit:vercel-pro-suite -- --strict --include-live"
```

Pour mettre a jour une decision Pro en meme temps:

```bash
npm run ops:vercel:evidence:record -- --key live-gates-closed --status complete --evidence "Webhook Account live confirme par audit:vercel-live." --next "Continuer avec Spend Management." --decision-key account-webhooks --decision-status active --decision-evidence "Webhook Account cree et secret configure." --decision-next "Surveiller les evenements dans /agent/vercel."
```
