'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { SettingsPanel, type ProfilUser } from '../ProfilClient'
import styles from './ParametresClient.module.css'

// SettingsPanel reste défini dans ProfilClient.tsx (pas déplacé — trop de
// sous-composants privés partagés, IdentityCard/EmailCard/PasswordCard etc.,
// voir ce fichier) ; ce wrapper lui fournit juste l'état `user` local et un
// `onBack` qui pointe vers la vraie route /profile au lieu de l'ancien state
// local `panel=null`.
export default function ParametresClient({ initialUser }: { initialUser: ProfilUser }) {
  const router = useRouter()
  const [user, setUser] = useState<ProfilUser>(initialUser)
  return <div className={styles.root}><SettingsPanel user={user} setUser={setUser} onBack={() => router.push('/profile')} /></div>
}
