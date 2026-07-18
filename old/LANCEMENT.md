# 🚀 LIVEINBLACK — Checklist de lancement

Document de pilotage pour passer de « prêt techniquement » à « ouvert au public ».
Mis à jour le 2026-06-18.

---

## ✅ Ce qui est FAIT et TESTÉ (côté produit)

- **Billetterie** : achat de billets via Stripe (carte test 4242), webhook, registre anti-fraude, scanner QR. Vérifié E2E.
- **Boosts / Top 3** : placements sponsorisés payants, 100 % plateforme. Vérifié E2E.
- **Marketplace prestataires** : 4 types (artiste / salle / matériel / food), profils, annuaire cross-device, contact par messagerie. Onboarding complet vérifié pour les 4 types.
- **Espace agent** : validation des dossiers (approuver / demander des corrections / refuser) + emails transactionnels automatiques.
- **Emails transactionnels** (Resend) : reçu / validé / corrections / refusé, depuis `noreply@liveinblack.com`, **délivrés en boîte de réception** (domaine vérifié SPF/DKIM/DMARC).
- **Monétisation — chaîne d'argent complète et prouvée E2E** :
  - Frais de service acheteur **5 % + 0,49 €** (plafond 2,50 €), calculé serveur.
  - Reversement vendeurs : Stripe Connect (auto, UE) **ou** ledger interne + paiement manuel (Afrique).
  - Onglet admin « Reversements » : voir les soldes dus, marquer payé (avec audit).
  - Vérifié : achat payé → webhook crédite le solde vendeur (net) → admin solde.
- **Légal** : Mentions légales, CGU/CGV (modèle marketplace + frais + rétractation), Politique de confidentialité (RGPD), Cookies — accessibles depuis le footer.

---

## 🔴 À FAIRE PAR CHADY avant l'ouverture (bloquants)

### 1. Activer le compte Stripe (avec ton père)
- [ ] Compléter le **KYC** sur dashboard.stripe.com (mode **Live**) : identité, date de naissance, adresse.
- [ ] Ajouter ton **IBAN** (compte où recevoir l'argent).
- [ ] Accepter les CGU Stripe.
- [ ] Vérifier que le compte passe `charges_enabled: true` et `payouts_enabled: true`.

### 2. Activer Stripe Connect (pour reverser aux vendeurs UE)
- [ ] Dashboard Stripe → **Settings → Connect** → activer.
- [ ] Webhook Stripe : ajouter l'événement **`account.updated`** à l'endpoint `https://liveinblack.com/api/stripe-webhook` (en plus de `checkout.session.completed` déjà présent).

### 3. Basculer en clés Stripe LIVE
- [ ] Dans Vercel (projet **`liveinblack`**, pas `-oryv`), remplacer `STRIPE_SECRET_KEY` (test → live) et `STRIPE_WEBHOOK_SECRET` (le signing secret de l'endpoint live).
- [ ] Redéployer.
- [ ] Faire **un vrai achat de test** (petit montant) pour confirmer l'encaissement réel.

### 4. Statut juridique + mentions
- [ ] Créer un statut (auto-entrepreneur a minima — tu encaisses pour le compte de tiers).
- [ ] Remplir `src/data/legal.js` : `legalForm`, `companyName`, `siren`, `address`, etc.
- [ ] Faire **relire les CGU/CGV par un juriste** (statut d'intermédiaire de paiement, obligations DAC7).

---

## 🟠 Recommandé avant de scaler

- [ ] **Amorcer le contenu** : quelques vrais événements + prestataires pour ne pas ouvrir sur une marketplace vide.
- [ ] Email de support (`contact@liveinblack.com`) + page d'aide.
- [ ] Monitoring d'erreurs (ex. Sentry).
- [ ] Tester sur de vrais téléphones (iOS + Android).
- [ ] Politique de remboursement claire affichée à l'achat.

---

## 💸 Modèle de monétisation (rappel)

| Levier | Tarif | Reversement requis ? |
|--------|-------|----------------------|
| Frais de service billets (acheteur) | 5 % + 0,49 € (plafond 2,50 €) | ❌ marche partout |
| Boosts / Top 3 | grille existante | ❌ |
| Abonnement annuaire prestataire | 14 € / 29 € / mois | ❌ |
| Premium organisateur (Phase 3) | 19 € / 49 € / mois | ❌ |
| Commission services prestataires | 10 % | ✅ (quand paiement via plateforme) |

Tous les taux sont centralisés dans **`lib/fees.js`** (modifiables à un seul endroit).

---

## 🗺️ Après le lancement (roadmap)

1. **Phase 1** — Connect Express en production : reversement auto aux vendeurs UE.
2. **Phase 2** — Afrique : PSP local (CinetPay / Flutterwave / Paystack) quand le volume le justifie, sinon paiement manuel.
3. **Phase 3** — Premium organisateur (abonnement), paiement en ligne des services prestataires (active la commission 10 %), partenariats clubs & pub native.
