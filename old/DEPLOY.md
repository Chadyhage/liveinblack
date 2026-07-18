# DEPLOY — Procédure de déploiement post-session de fixes (mai 2026)

> Cette session a livré 5 fixes critiques + 1 bonus. Avant de pousser sur `main` (Vercel auto-déploie), il faut configurer 6 variables d'environnement, créer un service account Firebase et enregistrer un webhook Stripe.
>
> **Temps estimé : 25-30 minutes.** Tout est à faire UNE seule fois.

---

## Étape 1 — Stripe : créer le webhook (5 min)

1. Aller sur https://dashboard.stripe.com/webhooks (mode TEST pour commencer).
2. Cliquer **« Add endpoint »**.
3. **Endpoint URL** : `https://liveinblack.com/api/stripe-webhook`
4. **Events to send** : cliquer « Select events », ne cocher que `checkout.session.completed`.
5. **Add endpoint** → tu arrives sur la page de l'endpoint créé.
6. Section **« Signing secret »** → cliquer **« Reveal »** → copier la valeur qui commence par `whsec_...`. **Garde cette valeur**, on en a besoin à l'étape 4.

> ⚠️ Une fois validé en TEST, refaire la même procédure en mode LIVE (basculer en haut à droite du dashboard) et créer un 2e endpoint avec sa propre clé `whsec_...`.

---

## Étape 2 — Firebase : créer un service account (5 min)

1. Aller sur https://console.firebase.google.com/project/liveinblack-15d30/settings/serviceaccounts/adminsdk
2. Cliquer **« Generate new private key »** → un fichier JSON est téléchargé.
3. **NE JAMAIS commiter ce JSON.** Le mettre dans un endroit sûr (gestionnaire de mots de passe, dossier `~/secrets/` local).
4. Ouvrir le JSON et noter 3 valeurs :
   - `project_id` (devrait être `liveinblack-15d30`)
   - `client_email` (ressemble à `firebase-adminsdk-xxxxx@liveinblack-15d30.iam.gserviceaccount.com`)
   - `private_key` (le bloc complet `-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n` avec les `\n` littéraux)

---

## Étape 3 — Firebase : récupérer la clé VAPID (2 min)

1. Aller sur https://console.firebase.google.com/project/liveinblack-15d30/settings/cloudmessaging
2. Section **« Web Push certificates »** → si rien n'est listé : cliquer **« Generate key pair »**.
3. Copier la clé affichée (longue chaîne base64 commençant souvent par `B...`).

---

## Étape 4 — Vercel : ajouter les variables d'env (5 min)

1. Aller sur https://vercel.com/dashboard → ton projet `liveinblack` → **Settings** → **Environment Variables**.
2. Ajouter les **6 variables** suivantes, en cochant **Production + Preview + Development** pour chacune :

| Variable                     | Valeur                                                                                      |
| ---------------------------- | ------------------------------------------------------------------------------------------- |
| `VITE_SUPER_ADMIN_EMAILS`    | `hagechady4@gmail.com`                                                                       |
| `VITE_FIREBASE_VAPID_KEY`    | (de l'étape 3)                                                                              |
| `STRIPE_WEBHOOK_SECRET`      | `whsec_...` (de l'étape 1, mode TEST pour commencer)                                        |
| `FIREBASE_PROJECT_ID`        | `liveinblack-15d30`                                                                          |
| `FIREBASE_CLIENT_EMAIL`      | (de l'étape 2)                                                                              |
| `FIREBASE_PRIVATE_KEY`       | (de l'étape 2 — coller la valeur COMPLÈTE avec les `\n` littéraux, sans les transformer)    |

> 💡 Si tu colles la `private_key` et que Vercel la formate bizarrement (saute des lignes), retape les `\n` à la main pour qu'ils restent littéraux. Le webhook fait `replace(/\\n/g, '\n')` au runtime.

---

## Étape 5 — Pousser le code et vérifier le déploiement

```bash
# 1. Installer la nouvelle dépendance localement (optionnel mais recommandé)
npm install

# 2. Commit + push
git add .
git commit -m "fix: webhook Stripe + super admin/VAPID externalisés + app non-exporté"
git push origin main
```

Vercel va auto-builder. **Vérifier dans Vercel → Deployments** que le build réussit (statut « Ready »).

---

## Étape 6 — Tester le webhook (5 min)

1. **Ouvrir** https://liveinblack.com (ou ton URL de preview) en mode incognito.
2. **Créer un compte** test ou se connecter à un compte existant en tant que client.
3. **Aller sur un événement payant** et acheter un billet en cliquant « Réserver ».
4. Sur la page Stripe Checkout, utiliser la carte test : **`4242 4242 4242 4242`**, date future (ex. `12/30`), CVV `123`, code postal `75001`.
5. Payer.

**Validation côté Stripe** :
- Aller sur https://dashboard.stripe.com/test/payments → tu dois voir le paiement réussi.
- Aller sur l'endpoint webhook → onglet « Events » → tu dois voir 1 event `checkout.session.completed` avec status **200** (et pas 4xx/5xx).

**Validation côté Firestore** :
- Aller sur https://console.firebase.google.com/project/liveinblack-15d30/firestore/data
- Ouvrir la collection `bookings` → un nouveau doc avec l'ID `bookingId` doit être présent, avec `paid: true`, `finalizedBy: 'webhook'`, et un tableau `tickets`.
- Ouvrir `user_bookings/{ton_uid}` → le tableau `items` doit contenir les nouveaux billets.

**Si tout passe au vert** : 🎉 le webhook tourne. Tu peux désormais répéter l'étape 1 en mode **LIVE** pour la prod et ajouter le `whsec_...` LIVE dans Vercel (variable `STRIPE_WEBHOOK_SECRET` pour Production uniquement).

---

## En cas de problème

**Stripe envoie le webhook mais Vercel renvoie 400 « Invalid signature »** :
- Le `STRIPE_WEBHOOK_SECRET` n'est pas le bon. Re-vérifier que tu as bien celui de l'**endpoint** (pas la clé API Stripe).
- Si tu as plusieurs environnements Stripe (TEST vs LIVE), chaque endpoint a son propre `whsec_...`.

**Vercel renvoie 500 « Firebase Admin credentials missing »** :
- Une des 3 variables `FIREBASE_*` n'est pas définie ou est vide. Vérifier l'étape 4.

**Vercel renvoie 500 sur l'init Firebase Admin (« Error: invalid_grant »)** :
- La `FIREBASE_PRIVATE_KEY` est mal formattée. Les `\n` doivent être littéraux (la chaîne `\\n` n'est PAS pareil que les vrais sauts de ligne). Re-coller la valeur depuis le JSON original.

**Le webhook réussit (Stripe affiche 200) mais le booking n'apparaît pas dans Firestore** :
- Aller dans Vercel → ton projet → **Functions** (ou Runtime Logs) → chercher les logs récents de `stripe-webhook` pour voir l'erreur.
- Vérifier que le service account a bien le rôle Firestore Editor (Firebase Console → IAM).

---

## Après cette session : ce qui reste à faire

- **Fix #5 — Signature billets côté serveur.** Pas urgent maintenant que le webhook est en place (le billet est sauvé même si onglet fermé). À faire pour la sécurité : actuellement le `SECRET` est dans le bundle JS, donc forgeable.
- **Fix #6 — Durcir les règles Firestore.** Demande de setup Firebase Emulator local d'abord. Voir `ONBOARDING.md` §12 pour la liste des règles à durcir.
- **Refactor optionnel** : faire que `PaiementReussiPage` détecte si le webhook a déjà créé le booking (poll Firestore) au lieu de tout regénérer en local. Ça évite la création double (en pratique pas critique car les IDs sont déterministes).
