// ============================================================
//  LIVEINBLACK — Configuration Firebase
//  À remplir avec tes vraies clés (voir instructions ci-dessous)
// ============================================================
//
//  ÉTAPES POUR ACTIVER LA VRAIE AUTH :
//
//  1. Va sur https://console.firebase.google.com
//  2. Clique "Ajouter un projet" → nom : liveinblack
//  3. Dans le projet → "Authentication" → "Sign-in method"
//     Active : Email/Mot de passe, Google, Facebook
//  4. Dans "Paramètres du projet" → "Tes applications" → icône Web </>
//  5. Copie le firebaseConfig et colle-le ici ci-dessous
//  6. Remplace USE_REAL_FIREBASE par true
//
// ============================================================

export const USE_REAL_FIREBASE = false  // ← passe à true quand tu as ta config

const firebaseConfig = {
  apiKey: "COLLE-TA-CLE-ICI",
  authDomain: "ton-projet.firebaseapp.com",
  projectId: "ton-projet",
  storageBucket: "ton-projet.appspot.com",
  messagingSenderId: "000000000000",
  appId: "1:000000000000:web:xxxxxxxxxxxx",
}

// ----------------------------------------------------------------
// Initialisation Firebase (seulement si USE_REAL_FIREBASE = true)
// ----------------------------------------------------------------
let auth = null

if (USE_REAL_FIREBASE) {
  const { initializeApp } = await import('firebase/app')
  const { getAuth } = await import('firebase/auth')
  const app = initializeApp(firebaseConfig)
  auth = getAuth(app)
}

export { auth }
