Salut !

Je te transmets le projet LIVEINBLACK (marketplace événementielle nightlife déployée sur liveinblack.com).

🔗 Repo GitHub : https://github.com/Chadyhage/liveinblack
   (je viens de t'inviter en collaborateur, tu devrais recevoir un mail GitHub)

📖 Pour commencer, deux docs à lire en premier dans le repo :
   • ONBOARDING.md  →  carte complète du projet (architecture, conventions, points fragiles)
   • DEPLOY.md      →  checklist de déploiement (config Stripe + Firebase + Vercel)

🛠 Stack en deux mots : React 19 + Vite + Tailwind + Firebase (Auth/Firestore/Storage) + Stripe + Vercel.

🚀 Pour lancer en local :
   git clone https://github.com/Chadyhage/liveinblack.git
   cd liveinblack
   npm install
   cp .env.example .env.local
   # → remplir les variables d'environnement (voir ci-dessous)
   npm run dev

🔑 Variables d'env qu'il te faut (à demander à Chady séparément, JAMAIS par WhatsApp) :
   • Clés Stripe TEST (pk_test_... / sk_test_...)
   • STRIPE_WEBHOOK_SECRET (whsec_...)
   • Credentials Firebase Admin (3 vars : projectId / clientEmail / privateKey)
   • VITE_SUPER_ADMIN_EMAILS = hagechady4@gmail.com
   • VITE_FIREBASE_VAPID_KEY

⚠️ Points d'attention immédiats (détaillés dans ONBOARDING.md §15-16) :
   • Imports de firestore-sync.js doivent rester DYNAMIQUES (jamais statiques)
   • voteOnPoll() gère 'poll' ET 'event_poll' ensemble — ne pas séparer
   • Bottom nav mobile = position fixed (pas sticky)
   • Le SECRET de signature des billets est encore dans le bundle JS (fix en cours)
   • Les règles Firestore sont permissives sur certaines collections (à durcir)

📋 Ce qui vient d'être fait (session de mai 2026) :
   • Webhook Stripe (api/stripe-webhook.js) → finalise paiements côté serveur, idempotent
   • Super admin externalisé en env var
   • VAPID FCM externalisée + fix d'un bug où `app` n'était pas exporté
   • Bug useNavigate orphelin nettoyé dans BoostModal

📋 Ce qui reste à faire :
   • Signature billets côté serveur (SECRET à sortir du bundle JS)
   • Durcir les règles Firestore (avec Firebase Emulator pour tester en local)

Si tu as des questions sur le code, regarde d'abord ONBOARDING.md — il couvre 90 % des cas. Pour le reste je suis dispo.
