# LIVEINBLACK — Proposition de couverture email complète

> **Statut : templates tous écrits (lib/server/emails/), vague P0 câblée et testée (commit f2290e5).** Base de départ : les 17 emails déjà existants (voir inventaire précédent) + tous les événements métier significatifs identifiés dans le code (`lib/server/*`, `app/api/*`) pour lesquels aucun email n'existe aujourd'hui. Organisé par rôle destinataire puis par domaine. Chaque ligne indique : déclencheur → destinataire(s) → sujet proposé → contenu → priorité.
>
> **Priorités** : 🔴 P0 = critique (argent, accès au billet, sécurité) — **câblé** (achat E1/E2/E14, annulation/report E7/E8, remboursement E9/E10, versement E29/E30/E31, revente E11/E13, staff E33/E34, blocage cash E45). 🟡 P1 = important (expérience, transparence) — templates prêts, pas encore câblés. 🟢 P2 = confort — templates prêts, pas encore câblés.
>
> **Total proposé : 47 nouveaux emails**, en plus des 17 existants = **64 emails** au total. (Pas "une centaine" — voir note de cadrage en fin de document sur pourquoi je ne recommande pas d'aller au-delà.)

---

## 1. Client / Acheteur

### 1.1 Billetterie — achat & accès
| # | Déclencheur | Destinataire | Sujet proposé | Contenu | Priorité |
|---|---|---|---|---|---|
| E1 | Achat de billet confirmé (paiement réussi) | Acheteur | "Ton billet pour \<événement\> est prêt 🎟️" | Récap commande, QR code en pièce jointe/lien, date/lieu, lien "Ajouter au calendrier" | 🔴 P0 |
| E2 | Achat groupe/table confirmé | Acheteur (hôte) | "Vos \<N\> billets pour \<événement\>" | Récap groupe, liste des places, rappel qu'il doit redistribuer les billets aux invités | 🔴 P0 |
| E3 | Paiement échoué | Acheteur | "Ton paiement pour \<événement\> n'a pas abouti" | Raison si connue, lien pour réessayer, place non garantie | 🟡 P1 |
| E4 | Place bloquée (seat hold) sur le point d'expirer (J-2h) | Acheteur | "Ta place pour \<événement\> expire bientôt" | Rappel de compléter le paiement, lien direct | 🟡 P1 |
| E5 | Place bloquée expirée sans paiement | Acheteur | "Ta place pour \<événement\> a été libérée" | Confirmation neutre, lien pour retenter | 🟢 P2 |
| E6 | Billet transféré/reçu (revente ou don) | Nouvel acheteur | "Tu as reçu un billet pour \<événement\>" | QR code, détails événement | 🔴 P0 |

### 1.2 Remboursement / Annulation / Report
| # | Déclencheur | Destinataire | Sujet proposé | Contenu | Priorité |
|---|---|---|---|---|---|
| E7 | Événement annulé (remboursement auto déclenché) | Chaque acheteur de billet | "\<événement\> est annulé — tu es remboursé" | Montant, délai bancaire estimé, motif si fourni par l'organisateur | 🔴 P0 |
| E8 | Événement reporté | Chaque acheteur de billet | "\<événement\> est reporté au \<nouvelle date\>" | Ancienne/nouvelle date, ton billet reste valable, lien remboursement si tu ne peux pas venir | 🔴 P0 |
| E9 | Remboursement traité avec succès (hors annulation globale — ex. demande client) | Client demandeur | "Ton remboursement pour \<événement\> est confirmé" | Montant, délai bancaire | 🔴 P0 |
| E10 | Remboursement échoué (ex. carte expirée) | Client demandeur | "Ton remboursement pour \<événement\> a rencontré un problème" | Cause, action requise, contact support | 🟡 P1 |
| E11 | Billet scanné/invalidé suite à une revente | Ancien titulaire (vendeur) | "Ton billet pour \<événement\> a été transféré" | Confirmation que le billet n'est plus valable sur son compte | 🟢 P2 |

### 1.3 Revente de billets
| # | Déclencheur | Destinataire | Sujet proposé | Contenu | Priorité |
|---|---|---|---|---|---|
| E12 | Billet mis en vente avec succès | Vendeur | "Ton billet pour \<événement\> est en vente" | Prix affiché, lien pour retirer l'annonce | 🟢 P2 |
| E13 | Billet vendu | Vendeur | "Ton billet pour \<événement\> a trouvé preneur 💸" | Montant net reçu, délai de versement | 🔴 P0 |
| E14 | Achat d'un billet de revente confirmé | Acheteur | (fusionné avec E1/E6) | — | 🔴 P0 |
| E15 | Annonce de revente expirée (événement trop proche) sans acheteur | Vendeur | "Ton annonce pour \<événement\> a expiré" | Explique le retrait automatique (fenêtre 2h avant portes) | 🟢 P2 |

### 1.4 Compte / Sécurité
| # | Déclencheur | Destinataire | Sujet proposé | Contenu | Priorité |
|---|---|---|---|---|---|
| E16 | Connexion depuis un nouvel appareil/navigateur | Utilisateur | "Nouvelle connexion à ton compte LIVEINBLACK" | Appareil/localisation approximative, lien "ce n'était pas moi" | 🟡 P1 |
| E17 | Mot de passe modifié avec succès | Utilisateur | "Ton mot de passe a été modifié" | Confirmation, contact support si non initié par lui | 🟡 P1 |
| E18 | Compte supprimé (confirmation finale) | Utilisateur | "Ton compte LIVEINBLACK a été supprimé" | Confirmation, ce qui est conservé légalement (facturation) | 🟡 P1 |
| E19 | Demande de suppression de compte reçue (délai avant traitement) | Utilisateur | "Ta demande de suppression est prise en compte" | Délai de traitement, comment annuler | 🟢 P2 |

### 1.5 Social / Découverte
| # | Déclencheur | Destinataire | Sujet proposé | Contenu | Priorité |
|---|---|---|---|---|---|
| E20 | Nouveau message reçu (utilisateur hors ligne depuis >X min) | Destinataire du message | "\<expéditeur\> t'a envoyé un message" | Aperçu court, lien direct vers la conversation — **digest, pas un email par message** (throttlé) | 🟡 P1 |
| E21 | Ajout à un groupe de discussion | Nouveau membre | "Tu as été ajouté au groupe \<nom\>" | Qui t'a ajouté, lien | 🟢 P2 |
| E22 | Rappel événement intéressé (J-1) | Utilisateur ayant marqué "intéressé" | "\<événement\> c'est demain !" | Rappel, lien réservation si pas encore acheté | 🟢 P2 |

---

## 2. Organisateur

### 2.1 Cycle de vie de l'événement
| # | Déclencheur | Destinataire | Sujet proposé | Contenu | Priorité |
|---|---|---|---|---|---|
| E23 | Événement publié avec succès | Organisateur | "\<événement\> est en ligne 🎉" | Lien public, rappel checklist (staff, codes promo) | 🟢 P2 |
| E24 | Première vente de billet | Organisateur | "Première vente pour \<événement\> !" | Moment sympa, lien dashboard stats | 🟢 P2 |
| E25 | Jalon de ventes atteint (50%/80%/complet) | Organisateur | "\<événement\> est complet 🔥" ou "à 80% de ses places" | Stat, encourage à booster si pertinent | 🟢 P2 |
| E26 | Événement dans 48h — récap pré-événement | Organisateur | "\<événement\> c'est dans 2 jours" | Résumé billets vendus, staff assigné, checklist jour J | 🟡 P1 |
| E27 | Boost acheté avec succès | Organisateur | "Ton boost pour \<événement\> est actif" | Durée, portée estimée | 🟢 P2 |
| E28 | Conflit de boost (créneau déjà pris) | Organisateur | "Ton boost pour \<événement\> n'a pas pu être activé" | Raison, alternative proposée, remboursement si applicable | 🟡 P1 |

### 2.2 Argent
| # | Déclencheur | Destinataire | Sujet proposé | Contenu | Priorité |
|---|---|---|---|---|---|
| E29 | Versement (payout) initié | Organisateur | "Ton versement pour \<événement\> est en cours" | Montant, délai bancaire estimé | 🔴 P0 |
| E30 | Versement confirmé/reçu | Organisateur | "Versement de \<montant\> effectué" | Confirmation, référence | 🔴 P0 |
| E31 | Versement échoué | Organisateur | "Un problème est survenu avec ton versement" | Cause (RIB invalide, etc.), action requise | 🔴 P0 |
| E32 | Remboursement client déclenché par annulation — récap impact organisateur | Organisateur | "Impact financier de l'annulation de \<événement\>" | Total remboursé, effet sur le prochain versement | 🟡 P1 |

### 2.3 Équipe & modération
| # | Déclencheur | Destinataire | Sujet proposé | Contenu | Priorité |
|---|---|---|---|---|---|
| E33 | Ajouté comme staff sur un événement | Membre du staff (scan/serveur/manager/dj) | "Tu es staff sur \<événement\>" | Rôle attribué, lien accès app scanner le jour J | 🔴 P0 |
| E34 | Retiré du staff d'un événement | Ex-membre du staff | "Tu n'es plus staff sur \<événement\>" | Confirmation neutre | 🟢 P2 |
| E35 | Nouvel avis reçu sur la page organisateur | Organisateur | "Nouvel avis sur \<événement\>" | Note + extrait, lien pour répondre | 🟢 P2 |
| E36 | Signalement reçu contre l'organisateur | Organisateur | "Un signalement a été déposé — action requise" | Nature du signalement (sans détails sensibles), invite à contacter le support | 🟡 P1 |

---

## 3. Prestataire

| # | Déclencheur | Destinataire | Sujet proposé | Contenu | Priorité |
|---|---|---|---|---|---|
| E37 | Nouvel avis client reçu | Prestataire | "Nouvel avis sur ton profil" | Note + extrait, lien pour répondre | 🟢 P2 |
| E38 | Abonnement sur le point d'expirer — **déjà existant partiellement (#14 initial)**, à compléter avec les 2 jalons manquants (J0/masqué) si pas déjà tous câblés | Prestataire | (déjà couvert, vérifier couverture des 6 jalons) | — | 🔴 P0 (à vérifier, pas nouveau) |
| E39 | Profil mis en avant / consulté X fois (digest hebdo) | Prestataire | "Ton profil a été vu \<N\> fois cette semaine" | Stat d'engagement, incite à compléter le profil | 🟢 P2 |
| E40 | Nouveau message d'un organisateur potentiel | Prestataire | (fusionné avec E20, digest messagerie général) | — | 🟡 P1 |

---

## 4. Agent (plateforme)

| # | Déclencheur | Destinataire | Sujet proposé | Contenu | Priorité |
|---|---|---|---|---|---|
| E41 | Nouvelle candidature à traiter (organisateur/prestataire) | Agents (ou agent assigné) | "Nouvelle candidature à examiner" | Type, nom du candidat, lien back-office | 🟡 P1 |
| E42 | Nouveau signalement à traiter | Agents | "Nouveau signalement à modérer" | Type de contenu signalé, lien back-office | 🟡 P1 |
| E43 | Demande de suppression de compte à valider | Agents | "Demande de suppression à traiter" | Utilisateur concerné, délai légal | 🟡 P1 |
| E44 | Vente cash agent en attente de règlement (>X jours) | Agent concerné + son manager | "Règlement en attente pour \<événement\>" | Montant, délai | 🟡 P1 |
| E45 | Seuil de ventes cash impayées atteint (5, cf. règle déjà actée) | L'agent bloqué + son manager | "Tes ventes cash sont bloquées" | Explique le seuil, comment débloquer | 🔴 P0 |

---

## 5. Transverse (tous rôles)

| # | Déclencheur | Destinataire | Sujet proposé | Contenu | Priorité |
|---|---|---|---|---|---|
| E46 | Changement de rôle actif validé (ex. devenu organisateur en plus de client) | Utilisateur | "Ton espace organisateur est prêt" | Confirme l'accès au nouveau dashboard | 🟢 P2 |
| E47 | Digest hebdomadaire d'activité (optionnel, opt-in) | Utilisateur ayant activé la préférence | "Ta semaine sur LIVEINBLACK" | Résumé personnalisé (billets, messages, avis) | 🟢 P2 (clairement une v2, pas prioritaire) |

---

## Résumé par priorité

| Priorité | Nombre | Portée |
|---|---|---|
| 🔴 P0 — critique | **13** | Argent (versements, remboursements), accès billet (QR), sécurité, blocage agent |
| 🟡 P1 — important | **17** | Transparence, alertes agent, rappels |
| 🟢 P2 — confort | **17** | Engagement, statistiques, nice-to-have |

## Recommandation d'ordre d'implémentation

1. **Vague 1 (P0, ~13 emails)** — billetterie/argent : confirmation d'achat (E1/E2/E6), annulation/report (E7/E8), remboursement (E9), versements (E29/E30/E31), revente vendue (E13), staff assigné (E33), blocage agent cash (E45). C'est le socle "argent + accès" qui manque le plus criant aujourd'hui.
2. **Vague 2 (P1, ~17 emails)** — transparence et confiance : échec paiement, rappels expiration hold, alertes agents (candidatures/signalements/suppressions), sécurité connexion, digest messagerie.
3. **Vague 3 (P2, ~17 emails)** — engagement : avis, stats, jalons de vente, rappels événement intéressé. À ne faire qu'une fois les vagues 1-2 stabilisées et un contrôle de fréquence d'envoi en place (éviter le spam).

## ⚠️ Note de cadrage — pourquoi pas "une centaine"

Une centaine d'emails impliquerait soit :
- Multiplier chaque type par variante mineure (ex. un email différent par méthode de paiement, par devise XOF/EUR, par langue) — je recommande plutôt des **templates avec variables**, pas des emails séparés ;
- Ou inventer des cas d'usage qui n'ont pas de valeur utilisateur réelle (spam produit).

Les **47 propositions ci-dessus couvrent déjà toutes les actions significatives identifiées dans le code, pour les 4 rôles**. Si tu as en tête des cas d'usage précis que je n'ai pas couverts, dis-lesquels et je les ajoute — sinon je pars sur cette liste comme base de travail.

## Prochaine étape si tu valides

Pour chaque email retenu, il faudra : 1) un nouveau template dans `lib/server/email-templates.ts` (même pattern que l'existant), 2) le branchement `sendEmail(...)` au bon endroit dans `lib/server/*` (souvent déjà co-localisé avec la logique métier existante, ex. `orders.ts`, `eventRefunds.ts`, `eventPayouts.ts`, `resale.ts`, `eventStaff.ts`), 3) vérifier les préférences de notification existantes (`notificationsEnabled`, alertes par type) pour respecter l'opt-out utilisateur là où c'est pertinent (surtout P2).

Dis-moi quelles vagues/quels emails valider, et je commence l'implémentation par lots avec tests, comme pour le reste du projet.
