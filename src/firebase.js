import { initializeApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'

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

const app = initializeApp(firebaseConfig)
export const auth = getAuth(app)
export const db = getFirestore(app)
