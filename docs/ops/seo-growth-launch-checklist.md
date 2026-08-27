# Checklist lancement SEO & croissance — LIVEINBLACK

Objectif : rendre `https://liveinblack.com` découvrable, mesurable et vérifiable avant une campagne de croissance, avec le Bénin comme marché prioritaire.

## 1. Préparer les propriétés externes

- Google Search Console : créer une propriété pour `https://liveinblack.com`.
- Bing Webmaster Tools : créer/importer la propriété `https://liveinblack.com`.
- Yandex Webmaster : optionnel, utile pour couvrir davantage de moteurs et agrégateurs.
- Pinterest Domain Verification : optionnel, utile si des contenus événements/blog sont partagés sur Pinterest.
- Google Analytics 4 : créer le flux Web et récupérer le Measurement ID au format `G-...`.
- Vercel Production : renseigner uniquement les jetons, jamais les balises HTML complètes.

Variables attendues en production :

- `PUBLIC_SITE_URL=https://liveinblack.com`
- `EXPECTED_PUBLIC_SITE_HOST=liveinblack.com`
- `NEXT_PUBLIC_GA_MEASUREMENT_ID=G-...`
- `GOOGLE_SITE_VERIFICATION=...`
- `BING_SITE_VERIFICATION=...`
- `YANDEX_SITE_VERIFICATION=...` optionnel
- `PINTEREST_SITE_VERIFICATION=...` optionnel

## 2. Soumettre les URL d’indexation

Dans Google Search Console et Bing Webmaster Tools, soumettre :

- `https://liveinblack.com/sitemap.xml`
- `https://liveinblack.com/sitemaps/core/0.xml`

À vérifier après le crawl :

- `/home`
- `/events`
- `/organizers`
- `/providers`
- `/blog`
- `/blog/benin`
- les sitemaps `/sitemaps/blog/`, `/sitemaps/events/`, `/sitemaps/organizers/`, `/sitemaps/providers/`

## 3. Vérifier les signaux de croissance

- GA4 reçoit les pages vues après consentement cookies.
- Vercel Analytics reçoit les événements anonymes.
- La recherche publique trace `search_submit` et les clics de résultats.
- Les CTA importants tracent `cta_click`.
- Les conversions tracent `checkout_start`, `seat_hold_start`, `purchase_confirmed` et `professional_application_submit`.

## 4. Commandes de validation

Avant déploiement :

```bash
npm run audit:growth
npm run check:seo:prod
npm run build
```

Après déploiement production :

```bash
npm run check:seo:live
npm run check:growth:launch:full
```

## 5. Critères de go/no-go

Go seulement si :

- `npm run check:growth:launch:full` passe.
- `robots.txt` pointe vers `https://liveinblack.com/sitemap.xml`.
- `/sitemap.xml` liste les collections `core`, `blog`, `events`, `organizers`, `providers`.
- `/blog/benin` contient le hub Bénin, les FAQ JSON-LD et les CTA organisateur/prestataire.
- Google Search Console et Bing voient les balises de vérification.
- Yandex/Pinterest voient leurs balises si ces canaux sont activés.
- GA4 utilise le bon Measurement ID production.

No-go si :

- `PUBLIC_SITE_URL` pointe vers localhost ou un domaine preview Vercel.
- un jeton Google/Bing est vide, placeholder ou collé avec la balise `<meta>`.
- un jeton optionnel Yandex/Pinterest est renseigné mais invalide ou collé avec la balise `<meta>`.
- le sitemap live ne contient pas `/blog/benin`.
- le build production échoue.
