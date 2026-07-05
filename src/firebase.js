import { initializeApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'
import { initializeFirestore, getFirestore } from 'firebase/firestore'
import { getStorage } from 'firebase/storage'

export const USE_REAL_FIREBASE = true

const firebaseConfig = {
  apiKey: "AIzaSyBee1WKyQmZSuzHVsn1DBoZ0p-fRkUvlI0",
  authDomain: "liveinblack-15d30.firebaseapp.com",
  projectId: "liveinblack-15d30",
  storageBucket: "liveinblack-15d30.firebasestorage.app",
  messagingSenderId: "758710974251",
  appId: "1:758710974251:web:613dfca10c5f8e7aedb76e",
  measurementId: "G-8YBQ81DR6H"
}

export const app = initializeApp(firebaseConfig)
export const auth = getAuth(app)
// ignoreUndefinedProperties : sans ça, UN SEUL champ undefined dans un objet
// fait rejeter TOUTE l'écriture par le SDK (ex. catalogue entier qui ne se
// synchronise plus après l'ajout d'un média à une offre).
let _db
try {
  _db = initializeFirestore(app, { ignoreUndefinedProperties: true })
} catch {
  // Hot-reload dev : une instance Firestore existe déjà sur cette app → réutiliser.
  _db = getFirestore(app)
}
export const db = _db
export const storage = getStorage(app)
