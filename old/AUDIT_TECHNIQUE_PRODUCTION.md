# Audit technique et securite pre-production - LIVEINBLACK

Date de l'audit : 15 juillet 2026  
Perimetre : code source local, configuration Vercel, regles Firebase, API serverless, dependances, tests, build et artefact public de `liveinblack.com`  
Decision recommandee : **NO-GO production en l'etat**

## 1. Resume executif

L'application ne doit pas etre consideree comme prete pour traiter des billets, des paiements et des donnees personnelles en production. L'audit a confirme plusieurs scenarios de fraude sans privilege administrateur : lecture du code d'un evenement prive, creation arbitraire d'evenements, manipulation du stock, creation de billets gratuits, multiplication de billets apres un paiement Stripe, modification du prix des precommandes et acceptation hors ligne d'un billet provenant uniquement du `localStorage` du scanner.

Le probleme principal n'est pas le choix de React ou de Firebase. Il vient de la frontiere de confiance : le navigateur peut ecrire directement dans trop de collections sensibles et plusieurs API font confiance a des montants, identifiants, URLs ou metadonnees fournis par le client. Pour une billetterie, les prix, stocks, droits d'entree, statuts, roles, commandes et mouvements financiers doivent etre calcules et ecrits par un serveur autoritaire.

L'audit confirme egalement :

- 14 vulnerabilites dans le graphe du `package-lock.json`, dont 5 classees hautes par `npm audit` ;
- un test metier en echec sur les evenements qui traversent minuit ;
- aucun pipeline CI bloquant le deploiement si les tests ou l'audit de dependances echouent ;
- un bundle JavaScript local d'environ 3,0 Mo, soit environ 794 Ko compresse, sans decoupage par route ;
- une video publique d'environ 27 Mo et plusieurs medias lourds precharges ;
- environ 63 000 lignes JavaScript/JSX, avec plusieurs composants de 1 000 a 4 180 lignes ;
- 248 blocs `catch` vides ou silencieux et environ 170 appels `console` dans le code applicatif et serveur ;
- 466 acces au `localStorage`, y compris pour des informations sensibles et des donnees autoritaires ;
- aucun TypeScript, aucun lint, aucun controle de types, aucune couverture, aucun test automatise des regles Firestore/Storage et aucun test navigateur integre au pipeline standard ;
- un artefact actuellement servi par `liveinblack.com` different du build produit depuis le depot audite, ce qui empeche de prouver exactement quel code est en production.

Il n'est pas professionnel d'annoncer artificiellement « 1 000 failles ». Le present rapport distingue **74 constats principaux verifiables**. Chacun se decompose en plusieurs travaux de correction, de test et d'exploitation, soit largement plus de cent actions. Les dix premiers constats suffisent deja a justifier une reprise par un expert.

## 2. Limites et niveau de preuve

L'audit est un audit statique et dynamique local, complete par l'inspection HTTP du site public. Il n'inclut pas l'acces aux consoles Firebase, Stripe, FedaPay, Vercel, Resend, DNS ou GitHub du client. Il ne permet donc pas de certifier les secrets de production, les journaux, les sauvegardes, les alertes, le WAF, les droits IAM ni les donnees deja exposees.

Les constats marques « confirme » sont directement demonstrables dans le code ou les resultats d'outils. Les risques d'exploitation n'ont pas ete exerces contre la production. Un test d'intrusion autorise, sur environnement de recette et avec comptes de test, reste necessaire apres les corrections.

## 3. Constats critiques

### C01 - Le code des evenements prives est publiquement lisible

**Preuve :** `firestore.rules:164-166` autorise la lecture de tous les documents `events`. `src/pages/MesEvenementsPage.jsx:865-866` enregistre `privateCode` dans ce meme document. Le filtrage de `src/utils/eventDiscovery.js:9-12` est uniquement visuel.

**Impact :** toute personne pouvant interroger Firestore peut lire un evenement prive et son code, sans passer par l'interface.

**Correction :** supprimer le secret du document public, utiliser une collection d'acces privee, stocker un hash du code et valider l'acces via une API limitee en tentatives.

### C02 - Tout utilisateur connecte peut creer un evenement arbitraire

**Preuve :** `firestore.rules:166` autorise l'ecriture si `resource == null`. Lors d'une creation, cette condition est toujours vraie. Aucun controle de role, de dossier approuve, de proprietaire ou de schema n'est applique.

**Impact :** un compte client ou en attente peut publier un evenement, definir des prix, un organisateur, un stock et des champs operationnels sans validation. Le proprietaire peut ensuite modifier tous les champs, y compris ceux qui devraient etre immuables.

**Correction :** creation et publication par API serveur, validation stricte du role et du dossier, schema en liste blanche, champs financiers et de moderation reserves au serveur.

### C03 - N'importe quel compte peut vider ou recreer le stock d'un evenement

**Preuve :** `api/event-stock.js:265-334` exige une authentification, mais pas de droit sur l'evenement ni de preuve de panier ou de paiement. L'action `reserve` diminue le stock et `release` peut le augmenter, avec une cle de liberation optionnelle et controlee par le client.

**Impact :** deni de service sur les ventes, creation artificielle de disponibilite, survente et concurrence non maitrisee entre reservation et emission du billet.

**Correction :** reservation serveur liee a un panier signe, idempotence, expiration atomique, verification de la capacite et finalisation transactionnelle avec le paiement.

### C04 - Creation illimitee de faux billets gratuits

**Preuve :** `firestore.rules:317-335` autorise tout utilisateur connecte a creer un document `tickets` avec `paid:false`, sans imposer `userId == request.auth.uid`, sans source autorisee et sans schema. `api/tickets.js:591` accepte un billet `source: 'free'` si le tarif de la place vaut zero, sans preuve de reservation ou de quota.

**Impact :** un attaquant peut fabriquer autant de billets gratuits qu'il souhaite pour un evenement comportant une place gratuite.

**Correction :** interdire toute creation client dans `tickets`, emettre les billets par transaction serveur et imposer les quotas par compte et par evenement.

### C05 - Un paiement Stripe peut confirmer plusieurs billets fabriques par le client

**Preuve :** `src/pages/PaiementReussiPage.jsx:323` cree un billet optimiste `client-postpay` non paye avec le `stripeSessionId`. `api/stripe-webhook.js:382-424` recherche tous les billets ayant cet identifiant et confirme chaque document correspondant, sans limiter leur nombre a la quantite payee ni revalider leur contenu.

**Impact :** avant la confirmation du paiement, l'acheteur peut creer plusieurs documents avec la meme session. Un seul paiement peut alors transformer plusieurs faux billets en billets `paid:true`.

**Correction :** le webhook doit creer lui-meme exactement les billets decrits dans une commande serveur immuable. Aucun billet client ne doit etre « adopte » apres paiement.

### C06 - Le prix Stripe des precommandes est controle par le navigateur

**Preuve :** `api/checkout.js:234-247` utilise directement `preorderItems[].priceEUR` recu dans la requete pour creer les lignes Stripe.

**Impact :** un client modifie peut acheter une precommande au prix de son choix et recevoir ensuite une preuve de paiement valide.

**Correction :** ne transmettre que les identifiants et quantites ; relire le catalogue serveur, la devise, le vendeur et le prix au moment du checkout.

### C07 - Le prix FedaPay des precommandes est egalement controle par le navigateur

**Preuve :** `api/fedapay.js:179-189` indique explicitement que les prix proviennent du client et calcule le total a partir de ces valeurs.

**Impact :** meme fraude tarifaire que C06 sur le rail XOF/FedaPay.

**Correction :** catalogue et calcul autoritaires cote serveur, avec version de prix et journal de commande immuable.

### C08 - Le scanner accepte un billet present uniquement dans son `localStorage`

**Preuve :** apres l'absence du billet dans le registre, `src/pages/ScannerPage.jsx:613-627` cherche `lib_bookings` et affiche le billet comme valide. Ce chemin est pris meme si le registre en ligne repond simplement « non trouve ». Le `localStorage` est entierement modifiable par l'utilisateur du navigateur.

**Impact :** un billet forge localement peut etre accepte a l'entree. En outre, le scanner contient encore des billets de demonstration acceptes aux lignes 631-645.

**Correction :** supprimer les fallbacks d'admission locale et de demonstration en production. Pour un mode hors ligne, utiliser un manifeste signe asymetriquement, limite a l'evenement et synchronise avant l'ouverture des portes.

### C09 - La tache cron financiere fonctionne sans secret si la variable manque

**Preuve :** `api/cron-subscriptions.js:69-75` ne rejette la requete que si `CRON_SECRET` est defini et incorrect. Si la variable est absente, l'API journalise un avertissement puis continue. Cette tache appelle les traitements automatiques de versement.

**Impact :** une erreur de configuration transforme une route publique en declencheur d'operations financieres et de traitements de masse.

**Correction :** echouer ferme si le secret est absent, verifier une methode et une signature Vercel, rendre les traitements idempotents et journaliser chaque execution.

### C10 - Les autorisations de messagerie permettent lecture et ecriture hors conversation

**Preuve :** `firestore.rules:240-246` autorise tout utilisateur connecte a lire/ecrire `conv_messages/{convId}` lorsque le document `conversations/{convId}` n'existe pas. Les identifiants sont bases sur `Date.now()` dans `src/utils/messaging.js:391`. `firestore.rules:219-238` autorise aussi des modifications trop larges sur les conversations directes.

**Impact :** lecture d'un historique orphelin, pre-creation de messages, reecriture ou suppression de l'historique, usurpation d'expediteur et modification des participants.

**Correction :** un document par message dans une sous-collection, creation serveur ou regles strictes `senderId == auth.uid`, participants immuables, suppression logique et verification systematique de l'appartenance.

## 4. Constats eleves

### H01 - Donnees personnelles de tous les comptes accessibles aux utilisateurs connectes

`firestore.rules:55-102` autorise la lecture de tous les profils `users`. L'inscription stocke notamment telephone normalise, annee de naissance, genre, role et statut (`src/pages/LoginPage.jsx:219-266`). `src/utils/firestore-sync.js:826-839` telecharge toute la collection a la connexion. Risque : extraction massive de donnees personnelles, profilage et demarchage.

### H02 - Tous les billets sont lisibles par tous les utilisateurs connectes

`firestore.rules:317` expose tous les documents `tickets`, donc codes, identites, evenement, precommandes, paiement et statut de controle. La lecture doit etre limitee au titulaire, a l'organisateur de l'evenement et aux agents autorises via API.

### H03 - Toutes les pieces jointes de messagerie sont lisibles par un utilisateur connecte

`storage.rules:56-64` autorise la lecture de `messages/{uid}/...` a toute personne authentifiee, sans verifier l'appartenance a la conversation. Les notes vocales et fichiers peuvent etre listes ou recuperes si le chemin est connu.

### H04 - Suppression de fichiers probablement impossible dans Storage

Les regles utilisent `allow write` avec `request.resource.size` et `request.resource.contentType` (`storage.rules:17-72`). Lors d'une suppression, `request.resource` est nul. La condition echoue donc, laissant des KYC, avatars et medias orphelins. Il faut separer `create`, `update` et `delete`.

### H05 - Depot de fichiers arbitraires sous un domaine Firebase de confiance

Les avatars, dossiers et messages n'ont pas tous une liste blanche MIME ; le type declare par le client n'est pas une preuve. Aucun scan antivirus ou quarantaine n'est present. Cela expose au stockage de contenu malveillant, a l'abus de bande passante et a des obligations de moderation.

### H06 - URLs de retour de paiement construites depuis `Origin` ou `Host`

`api/checkout.js:308`, `api/create-subscription.js:60`, `api/fedapay.js:271`, `api/checkout-boost.js:168` et `api/connect.js:66` font confiance aux en-tetes fournis par l'appelant. Risques : redirection vers un domaine attaquant, fuite d'identifiant de session, phishing et callback Connect detourne. Une origine canonique doit venir d'une variable serveur en liste blanche.

### H07 - Paiement possible pour un evenement annule, termine, non publie ou prive

Les chemins checkout Stripe et FedaPay chargent l'evenement mais ne bloquent pas systematiquement `cancelled`, la date de fin, `publishAt` ou l'absence d'autorisation privee (`api/checkout.js:56-75`, `api/fedapay.js:121-149`). Le webhook ne doit pas etre le premier endroit a decouvrir l'annulation apres encaissement.

### H08 - La limite `maxPerAccount` n'est appliquee que dans l'interface

La limite apparait dans `src/pages/EventDetailPage.jsx:551`, mais n'est pas imposee par `api/checkout.js`, `api/fedapay.js` ou `api/event-stock.js`. Un appel direct contourne donc la limite.

### H09 - Absence d'idempotence du checkout billet Stripe

Le `bookingId` est controle par le client et aucune cle d'idempotence Stripe n'est utilisee lors du checkout billet (`api/checkout.js:311-330`). Un double clic ou deux requetes concurrentes peuvent reserver deux fois le stock et creer plusieurs sessions de paiement.

### H10 - L'identite et le libelle de paiement proviennent du client

`api/checkout.js:318` et `api/fedapay.js:279-283` utilisent l'adresse email du corps de requete au lieu de l'email verifie du token. Le nom de l'evenement et d'autres metadonnees sont egalement acceptes du client. Risques : recus envoyes a un tiers, incoherence comptable et injection de libelles.

### H11 - Le demandeur peut modifier son dossier de candidature, y compris son statut

`firestore.rules:134-144` permet au proprietaire d'ecrire tout le document `applications`, sans rendre `status`, `auditLog`, `approvedAt` et les champs de revue immuables. L'approbation finale est effectuee depuis le client (`src/utils/applications.js:400`). L'integrite du processus KYC n'est pas garantie.

### H12 - Une demande de validation peut etre reecrite par son auteur

`firestore.rules:148-154` autorise l'utilisateur a modifier sa propre demande sans schema strict. Il peut manipuler le statut, l'historique ou multiplier les documents, meme si d'autres regles limitent la promotion finale du role.

### H13 - Acheteur et vendeur peuvent reecrire integralement une commande de service

`firestore.rules:268-281` laisse l'une ou l'autre partie creer, modifier ou supprimer tout le document `service_orders`. Prix, contrepartie, statut et historique ne sont pas immuables. La logique locale de `src/utils/services.js:78` ne constitue pas une securite.

### H14 - Le journal des commandes evenementielles n'est ni reserve ni append-only

`firestore.rules:718-728` autorise tout utilisateur connecte a ecrire `event_order_log/{eventId}`. Un attaquant peut remplacer ou falsifier un journal utilise pour les litiges et le suivi operationnel.

### H15 - Les commandes d'evenement sont lisibles par tous les comptes

`firestore.rules:707-716` autorise toute personne connectee a lire les documents `event_orders/{eventId}`. Les donnees de commande, de participant et de paiement doivent etre cloisonnees.

### H16 - Les playlists d'evenement peuvent etre sabotees par un membre ordinaire

`firestore.rules:367-385` permet a tout utilisateur connecte de creer une playlist et de modifier presque tout le document d'une playlist existante. La protection du seul champ `nowPlaying` ne protege pas la liste des morceaux, les votes ou les metadonnees.

### H17 - Injection HTML stockee dans les cartes d'accreditation

`src/pages/ProfilePage.jsx:28-180` concatene sans echappement les donnees du dossier dans une chaine HTML, puis appelle `document.write`. Un nom, email, ville ou champ de dossier contenant du HTML peut executer du script dans la nouvelle fenetre.

### H18 - Overlay global d'erreur base sur `innerHTML`

`src/main.jsx:6-45` affiche en production messages, URLs et stacks par `innerHTML`. Une erreur contenant une valeur attaquable peut devenir une injection HTML ; les traces internes sont en outre divulguees aux utilisateurs. `src/utils/musicEngine.js:116` contient un sink comparable.

### H19 - La « signature » QR est publique et non cryptographique

`src/utils/ticket.js:1-24` inclut la cle `LIB_S3CR3T_K3Y_2026_PRIV` dans le bundle et applique un hash maison non cryptographique. Le code reconnait lui-meme qu'elle est falsifiable. Combine a C08, le prefiltre n'apporte pas de garantie d'authenticite.

### H20 - Generation serveur de codes billet avec `Math.random`

`api/stripe-webhook.js:862` genere un code de six caracteres avec `Math.random`, sans preuve de controle de collision avant ecriture. Un collision peut ecraser un document ou associer un droit incorrect. Utiliser `crypto.randomBytes`/`randomUUID` et une creation conditionnelle.

### H21 - Aucune protection App Check, rate limit ou anti-bot

Aucune integration Firebase App Check ni limite commune par IP/UID n'a ete trouvee. Les routes de reset de mot de passe, recherche externe, stock, notifications, relations sociales, signalements et compteurs sont donc abusables pour consommer des quotas ou harceler des utilisateurs.

### H22 - Les webhooks lisent un corps non borne en memoire

`api/stripe-webhook.js:31-38` et `api/fedapay.js:34-41` accumulent tout le flux avant verification de signature, sans taille maximale. Une requete anonyme volumineuse peut consommer memoire et temps d'execution serverless.

### H23 - Super-administrateur code en dur et divergent selon les couches

`firestore.rules:31-38` contient une adresse email en dur. `lib/adminGuard.js:8-21` et `src/pages/LoginPage.jsx:14` utilisent des variables d'environnement ou des listes differentes. Les regles Firebase ne lisent pas ces variables : les droits peuvent diverger entre UI, API et base. La compromission d'un seul compte donne un pouvoir total.

### H24 - Le document portefeuille reste entierement modifiable par son proprietaire

Bien que la fonctionnalite soit annoncee comme retiree, `firestore.rules:158-161` autorise encore le proprietaire de `wallets/{uid}` a modifier tous les champs. Les donnees et chemins historiques restent une surface d'attaque tant qu'ils ne sont pas migres et fermes.

## 5. Constats moyens

### M01 - 14 vulnerabilites dans le lockfile npm

`npm audit --json` sur le `package-lock.json` remonte 5 vulnerabilites hautes et 9 moderees. Les chaines concernees incluent `react-router`, Vite, `@grpc/grpc-js`, `picomatch`, `firebase-admin`, PostCSS et plusieurs dependances Google. Il faut mettre a jour, regenerer un seul lockfile et reexecuter tests et audit.

### M02 - Deux gestionnaires de paquets et deux graphes de dependances

Le depot suit `package-lock.json`, tandis qu'un `pnpm-lock.yaml` non suivi existe et que `node_modules` est installe via pnpm avec des versions plus recentes. Vercel utilise `npm`, mais les tests locaux observes utilisent le graphe pnpm. Un build local reussi ne prouve donc pas le build deploye.

### M03 - Version Node et gestionnaire non verrouilles

`package.json` ne definit ni `engines` ni `packageManager`. Le poste d'audit utilise Node 26/npm 11, mais le runtime Vercel peut differer. Les builds ne sont pas reproductibles.

### M04 - Aucun pipeline CI bloquant

Il n'existe pas de workflow `.github`, et `vercel.json` execute uniquement `npm run build`. Aucun lint, typecheck, test, audit de dependances ou test de regles ne bloque un auto-deploiement.

### M05 - Un test metier echoue deja

La suite standard retourne 122 tests reussis et 1 echec dans `scripts/event-discovery.test.mjs:12`. Un evenement traversant minuit reste visible apres sa fin. `src/utils/event-time.js:8` et `src/utils/eventUrgency.js:25` construisent des dates locales dependantes du fuseau.

### M06 - Les tests E2E ne font pas partie de `npm test`

Les scripts `stripe-e2e.mjs`, `boost-e2e.mjs` et `ledger-e2e.mjs` ne sont pas lances par la commande standard. Aucun Playwright/Cypress ne valide le parcours inscription -> paiement -> webhook -> billet -> scan -> remboursement.

### M07 - Aucune suite de tests pour les regles Firebase

Aucun test emulator n'a ete trouve pour `firestore.rules` ou `storage.rules`. Les regles les plus sensibles de l'application sont donc modifiees sans matrice automatisee roles/actions.

### M08 - Architecture « un gros document » non scalable

Les messages d'une conversation, commandes d'un evenement, billets d'un utilisateur, notifications et listes sociales sont souvent stockes dans des tableaux d'un document. Chaque ajout relit et reecrit l'ensemble (`src/utils/firestore-sync.js:27`, `src/utils/firestore-sync.js:732`). Cela conduit a la limite Firestore de taille de document, a de la contention et a un cout croissant.

### M09 - Telechargement de collections completes a la connexion

`src/utils/firestore-sync.js:826-839` charge tous les utilisateurs et `src/utils/firestore-sync.js:870` tous les evenements. D'autres listeners chargent fournisseurs, catalogues, profils et boosts. Le cout, la latence et le risque de fuite augmentent lineairement avec la plateforme.

### M10 - Chargement N+1 et sequentiel des conversations

`src/utils/firestore-sync.js:735-742` charge les documents de messages l'un apres l'autre. Un compte actif subira une connexion de plus en plus lente.

### M11 - Le cache write-through masque les conflits et pertes de donnees

Le navigateur ecrit d'abord dans `localStorage`, puis lance souvent la synchronisation Firestore en fire-and-forget. En cas d'echec, l'UI peut afficher une operation comme reussie alors qu'elle n'existe pas sur le serveur. Les conflits cross-device ne disposent pas de version, merge explicite ou file de retry durable.

### M12 - Donnees sensibles et autoritaires dans `localStorage`

Profil de session, messages, contacts, billets, dossiers et commandes sont accessibles a tout JavaScript execute sur l'origine, aux extensions et a un utilisateur du meme appareil. Le quota navigateur peut etre depasse silencieusement. Le `localStorage` ne doit pas etre une autorite pour un droit d'entree ou un paiement.

### M13 - 248 erreurs ignorees

Le code comporte environ 248 `catch {}` ou variantes silencieuses dans `src`, `api` et `lib`. Les pannes de sync, de stockage, de parsing et de paiement deviennent invisibles, rendant les incidents difficiles a diagnostiquer et les pertes de donnees probables.

### M14 - Journaux non structures et potentiellement sensibles

Environ 170 appels `console.log/warn/error` ont ete trouves. Plusieurs APIs renvoient aussi `err.message` au client. Sans redaction, correlation ID et niveaux par environnement, les logs peuvent contenir UID, sessions, codes billet ou details fournisseur, tout en restant inexploitables pour l'alerte.

### M15 - Aucune observabilite de production

Aucun Sentry, OpenTelemetry, suivi Web Vitals, alerte de webhook, dead-letter queue ou tableau de rapprochement paiement/billet n'a ete identifie. Une erreur financiere peut rester inconnue jusqu'a une plainte client.

### M16 - Bundle initial beaucoup trop volumineux

Le build local produit un fichier principal d'environ 3 003 135 octets, soit environ 793,6 Ko gzip. `src/App.jsx:1-41` importe statiquement toutes les pages ; il n'y a pas de `lazy` par route. Firebase est aussi importe statiquement dans `src/firebase.js:1-5`.

### M17 - Medias disproportionnes et precharges

`public/bg-liquid.mp4` pese environ 27 Mo. Plusieurs medias de 1 a 4,5 Mo sont servis et certaines videos utilisent `preload="auto"` ou autoplay. Impact : temps de chargement, donnees mobiles, batterie et Core Web Vitals.

### M18 - SEO dynamique insuffisant pour une marketplace publique

`index.html:8-25` fournit les memes title/meta/OG a toutes les routes. Le `sitemap.xml` n'inclut pas les pages dynamiques d'evenements et de prestataires. Les modifications de meta uniquement cote client sont mal interpretees par certains robots sociaux et moteurs.

### M19 - En-tetes de securite incomplets

Le site public sert HSTS, ce qui est positif, mais aucune CSP explicite, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy` ou protection `frame-ancestors` n'a ete observee. `vercel.json` ne declare aucun header. Risques : clickjacking et impact accru d'une injection.

### M20 - Dependances runtime externes et versions divergentes

`public/firebase-messaging-sw.js` charge Firebase compat 10.11.0 depuis Google, tandis que l'application depend d'une version 12.x. D'autres ressources viennent de Google Fonts, Unsplash, unpkg, iTunes et OSM. Une CSP future, la disponibilite, la vie privee et la reproductibilite doivent etre gerees.

### M21 - Variables d'environnement non documentees

Le code utilise notamment `CRON_SECRET`, `RESEND_API_KEY`, `EMAIL_FROM` et `PUBLIC_SITE_URL`, mais elles ne sont pas toutes presentes dans `.env.example`. Une variable oubliee peut ouvrir C09 ou casser les emails et callbacks.

### M22 - Versions API Stripe incoherentes

Certaines routes utilisent `2024-06-20`, d'autres `2026-02-25.clover`. Les memes objets Stripe peuvent donc avoir des representations ou comportements differents selon le parcours. Une seule version testee doit etre centralisee.

### M23 - Absence de validation commune des requetes

Il n'existe pas de schema partage pour tailles, types, enums, devises, montants et tableaux. Plusieurs endpoints acceptent des objets et listes volumineux ou partiellement valides. Utiliser un schema runtime, meme apres migration TypeScript.

### M24 - Identifiants previsibles ou a collision possible

De nombreux identifiants de conversation, rapport, commande ou demande combinent `Date.now()` et `Math.random`. Utiliser des identifiants serveur ou `crypto.randomUUID`, avec contraintes d'unicite.

### M25 - Compteurs publics manipulables

`firestore.rules:448-478` permet a des utilisateurs connectes de faire varier vues, clics ou followers avec des controles insuffisants pour empecher la repetition. Les indicateurs de popularite et de reputation peuvent etre bottes.

### M26 - Demandes de versement insuffisamment contraintes

`firestore.rules:619-637` autorise le vendeur a creer une demande avec des champs montant/devise/statut largement controles par lui. L'interface admin recalcule certains plafonds, mais la file et l'audit peuvent etre pollues. Le serveur doit calculer le solde exigible et creer la demande canonique.

## 6. Qualite, maintenabilite et produit

### Q01 - Composants monolithiques

`AgentPage.jsx` contient environ 4 180 lignes, `MesEvenementsPage.jsx` 4 003, `ProfilePage.jsx` 3 630, `MessagingPage.jsx` 3 490 et `EventDetailPage.jsx` 2 861. Les responsabilites UI, stockage, validation, paiement et metier sont melangees, ce qui augmente fortement le risque de regression.

### Q02 - JavaScript sans contrats sur un domaine financier

Environ 63 000 lignes JS/JSX gerent des unions de roles/statuts, des formes Firestore, des montants EUR en centimes et XOF, des webhooks et des contrats API sans controle statique. JavaScript n'est pas une faille en soi, mais l'echelle et le domaine rendent TypeScript strict necessaire.

### Q03 - Bug confirme dans le contrat `setUser`

`src/App.jsx:63-68` attend une valeur et la serialise, tandis que `src/pages/ProfilePage.jsx:3418` lui transmet une fonction de mise a jour. React peut appliquer la fonction a l'etat, mais `JSON.stringify(function)` produit `undefined`, ce qui peut corrompre la session locale.

### Q04 - Session Firebase et session locale peuvent diverger

Dans `src/App.jsx:83-98`, si Firebase possede un utilisateur mais que `lib_user` n'existe pas, le callback retourne sans reconstruire le profil. Le navigateur peut etre authentifie pour Firestore tout en paraissant deconnecte dans l'interface.

### Q05 - Aucun Error Boundary React

L'overlay global de `src/main.jsx` ne remplace pas un Error Boundary, ne permet pas une reprise locale et divulgue les stacks. Les grandes pages peuvent faire tomber toute l'application.

### Q06 - Aucun lint, formatage ou controle de complexite

`package.json` ne propose ni ESLint, ni Prettier, ni regles d'import, ni limites de complexite. Le depot contient 31 desactivations ESLint historiques sans outil actif correspondant.

### Q07 - Accessibilite non verifiee

Une recherche statique trouve environ 654 balises `<button>` sans `type` explicite ; toutes ne sont pas necessairement dans un formulaire, mais le volume impose un audit. Les modales, zones cliquables, focus, libelles, contraste, clavier et lecteur d'ecran ne sont pas testes automatiquement.

### Q08 - Design system divergent de la documentation

`tailwind.config.js` contient encore l'ancien or `#d4af37` et une police Inter, alors que le guide exige `#c8a96e`, Bebas Neue, Playfair Display et DM Mono. Les styles inline massifs rendent les corrections visuelles difficiles et favorisent les divergences.

### Q09 - Ressources de notification manquantes

`public/firebase-messaging-sw.js` reference `/logo192.png`, absent du dossier public inspecte. Certaines notifications auront une icone ou un badge casse.

### Q10 - Artefact de production non tracable depuis le depot audite

Le site public sert `assets/index-DevDa4dO.js` d'environ 2,26 Mo, tandis que le build local produit `assets/index-BX88ymUk.js` d'environ 3,0 Mo. Sans SHA de commit expose, build immuable et promotion d'artefact, il est impossible d'affirmer que le code audite est celui en production.

### Q11 - Documentation technique incomplete

Le README principal est non suivi dans l'etat Git observe, les variables et procedures de recovery sont incompletes, et aucun runbook incident, restauration, rapprochement financier ou rotation de secrets n'a ete trouve.

### Q12 - Absence de politique de retention et d'effacement

Messages, pieces KYC, journaux, billets et caches locaux n'ont pas de duree de conservation, purge automatique ou procedure RGPD documentee. H04 peut en outre empecher la suppression effective des fichiers.

### Q13 - Pas de sauvegarde/restauration testee dans le depot

Aucune procedure automatisee de backup Firestore/Storage, test de restauration ou objectif RPO/RTO n'est documente. Pour une billetterie, la restauration doit etre exercee avant lancement.

### Q14 - Fallbacks et donnees de demonstration presents dans les parcours reels

Le scanner accepte encore `MOCK_TICKETS` (`src/pages/ScannerPage.jsx:631-645`). Des donnees statiques et caches legacy sont fusionnes dans plusieurs parcours. Les modes demo, migration et production doivent etre separes par build et feature flags.

## 7. Evaluation des choix technologiques

### JavaScript ou TypeScript

Le passage a TypeScript est recommande, mais de maniere incrementale. Le benefice attendu est eleve pour :

- les contrats des routes API ;
- les schemas Firestore et DTO publics/prives ;
- les roles, statuts et transitions d'etat ;
- les montants avec unite explicite (`EUR_CENTS`, `XOF_UNITS`) ;
- les evenements Stripe/FedaPay et resultats de webhook ;
- les props des grands composants et les retours de hooks.

TypeScript ne remplace pas la validation runtime. Chaque entree externe doit aussi passer par Zod, Valibot ou equivalent. La migration peut commencer par `api`, `lib`, les modeles et les fonctions de paiement, puis les pages a haut risque.

### React/Vite ou Next.js

React avec Vite n'est pas un mauvais choix pour un espace applicatif authentifie. Le remplacement complet par Next.js n'est donc pas une correction de securite en soi.

Next.js est toutefois pertinent ici pour les pages publiques d'evenements, d'organisateurs et de prestataires : rendu serveur/statique, metadata et Open Graph dynamiques, sitemap, decoupage par route et regroupement plus naturel des endpoints serveur. Une migration doit etre justifiee par le SEO, les performances et la consolidation backend, pas par un argument marketing.

### Firebase ou API custom

Firebase Auth, FCM et Storage peuvent etre conserves. Firestore peut egalement rester adapte pour certaines donnees temps reel. En revanche, les operations suivantes ne doivent plus etre directement ecrites par le navigateur :

- creation/publication d'evenement ;
- prix, stock et reservations ;
- commandes, billets et check-in ;
- candidatures, roles et moderation ;
- commandes de service ;
- ledgers, versements et remboursements ;
- donnees privees de messagerie necessitant une autorisation complexe.

Deux trajectoires sont viables :

1. conserver Firebase, mais placer les collections sensibles derriere des API Admin SDK et rendre leurs regles client en lecture limitee ou totalement fermees ;
2. migrer le coeur transactionnel vers PostgreSQL avec contraintes, transactions et historique, tout en conservant Firebase Auth/FCM/Storage et eventuellement Firestore pour le chat.

Pour une billetterie financiere, la seconde option donne generalement une meilleure integrite, un audit plus simple et des requetes analytiques plus fiables. Elle coute toutefois plus cher qu'une remise en ordre Firebase bien executee.

## 8. Plan de remediation recommande

### Phase 0 - Gel et protection immediate, 1 a 3 jours

- suspendre le lancement et limiter les comptes de production ;
- sauvegarder Firestore et Storage ;
- fermer les ecritures client sur `tickets`, `events`, `applications`, `service_orders`, `event_order_log` et `wallets` ;
- desactiver le fallback scanner local et les billets de demonstration ;
- rendre le cron fail-closed ;
- imposer une origine canonique aux callbacks ;
- verifier et faire tourner les secrets, droits IAM et MFA administrateur ;
- verifier les journaux pour detecter une exploitation anterieure.

### Phase 1 - Billetterie et paiements, 1 a 2 semaines

- creer une commande serveur immuable avant paiement ;
- recalculer tous les prix depuis les catalogues serveur ;
- reserver le stock de maniere atomique et idempotente ;
- creer les billets uniquement dans les webhooks verifies ;
- rapprocher montant, devise, evenement, quantite, stock et utilisateur ;
- ajouter replay protection, limites de corps, retries et dead-letter ;
- tester paiement reussi, double webhook, echec, expiration, remboursement, annulation et concurrence.

### Phase 2 - Autorisations et donnees, 1 a 2 semaines

- redessiner les documents publics/prives ;
- supprimer les lectures globales de `users`, `tickets`, `event_orders` et fichiers messages ;
- reecrire les regles avec schemas et champs immuables ;
- ajouter une suite Emulator couvrant chaque role et action ;
- migrer la messagerie vers une sous-collection par message ;
- mettre en place App Check et rate limiting.

### Phase 3 - Qualite et exploitation, 1 a 2 semaines

- choisir npm ou pnpm, verrouiller Node et le lockfile ;
- mettre en place CI : install frozen, lint, typecheck, tests, rules tests, build et audit ;
- introduire TypeScript strict et schemas runtime ;
- ajouter observabilite, alertes financieres, correlation IDs et redaction ;
- documenter sauvegarde, restauration, incident, rotation de secrets et rapprochement.

### Phase 4 - Performance, SEO et maintenabilite, 2 a 4 semaines

- decouper les pages et fonctions metier ;
- charger les routes a la demande ;
- compresser/remplacer les medias et ajuster le preload ;
- ajouter rendu serveur ou pre-rendu pour les pages publiques ;
- paginer les donnees et remplacer les documents-tableaux ;
- executer tests navigateur, accessibilite et charge.

## 9. Criteres minimaux de GO production

Le lancement ne devrait etre reconsidere que lorsque :

- C01 a C10 et H01 a H24 sont corriges ou formellement acceptes par le responsable de risque ;
- aucun prix, stock, billet, role, statut KYC ou mouvement financier n'est controle par le client ;
- les regles Firestore et Storage ont une matrice de tests automatisee verte ;
- le parcours paiement -> webhook -> billet -> scan est teste de bout en bout ;
- tous les tests, le build, le typecheck, le lint et l'audit de dependances bloquent le deploiement ;
- l'artefact deploye est rattache a un commit et a un rapport CI ;
- les alertes, sauvegardes, restaurations et procedures d'incident ont ete testees ;
- un pentest de recette confirme l'absence de contournement des controles corriges.

## 10. Conclusion

L'application presente une vraie valeur produit et plusieurs mecanismes ont deja ete penses avec de bonnes intentions, notamment le registre serveur des billets, la verification de webhooks et certains controles transactionnels. Cependant, ces protections sont contournees par des chemins clients, des regles trop permissives et des fallbacks historiques.

Le besoin d'un expert n'est donc pas justifie par le fait que le projet a ete « vibe code » ni par l'absence de Next.js. Il est justifie par des preuves techniques reproductibles touchant directement l'argent, l'entree aux evenements, les donnees personnelles et la capacite d'exploiter la plateforme. La recommandation responsable est un gel du lancement, une reprise des frontieres de confiance et une validation independante avant toute commercialisation.
