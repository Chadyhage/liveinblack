// Upload d'affiches d'événements vers Firebase Storage.
//
// POURQUOI : Firestore limite chaque document à 1 Mo. Une affiche en base64
// pleine résolution dépasse facilement cette limite → l'écriture events/{id}
// est rejetée → l'événement reste en localStorage et n'apparaît JAMAIS sur
// les autres comptes/appareils. (C'était LA cause du bug cross-device.)
// La solution : uploader l'image sur Storage et ne stocker que l'URL.

// Photo de profil prestataire → Storage avatars/{uid}/ (lecture publique,
// écriture par le propriétaire — règle déjà en place). Renvoie l'URL.
export async function uploadProviderPhoto(uid, dataUrl) {
  if (!dataUrl || !dataUrl.startsWith('data:')) return dataUrl
  const { storage } = await import('../firebase')
  const { ref, uploadString, getDownloadURL } = await import('firebase/storage')
  const path = `avatars/${uid}/provider_${Date.now()}.jpg`
  const snap = await uploadString(ref(storage, path), dataUrl, 'data_url')
  return await getDownloadURL(snap.ref)
}

export async function uploadEventPoster(eventId, dataUrl) {
  if (!dataUrl || !dataUrl.startsWith('data:')) return dataUrl // déjà une URL http(s)
  const { storage, auth } = await import('../firebase')
  const { ref, uploadString, getDownloadURL } = await import('firebase/storage')
  // Chemin uid-scopé : events/{uid}/{eventId}/... — la règle Storage exige
  // request.auth.uid == uid, donc un user ne peut uploader que pour ses events.
  const uid = auth?.currentUser?.uid
  if (!uid) throw new Error('Non authentifié — impossible d\'uploader l\'affiche')
  const path = `events/${uid}/${eventId}/poster_${Date.now()}.jpg`
  const snap = await uploadString(ref(storage, path), dataUrl, 'data_url')
  return await getDownloadURL(snap.ref)
}

// Sanitise une liste d'événements avant sync vers user_events/{uid} :
// les anciens events peuvent encore contenir des images base64 énormes
// qui feraient dépasser la limite Firestore de 1 Mo sur le doc complet.
// On compresse chaque image data: en vignette légère (~30-60 Ko).
export async function sanitizeEventsForSync(events) {
  return Promise.all((events || []).map(async (ev) => {
    if (ev?.imageUrl && ev.imageUrl.startsWith('data:')) {
      try {
        return { ...ev, imageUrl: await compressDataUrl(ev.imageUrl, 400, 0.5) }
      } catch {
        return { ...ev, imageUrl: null }
      }
    }
    return ev
  }))
}

// Réduit une image base64 sous maxDim px (côté le plus grand) et la
// recompresse en JPEG. Utilisé en secours si l'upload Storage échoue,
// pour garder le document Firestore sous la limite de 1 Mo.
export function compressDataUrl(dataUrl, maxDim = 700, quality = 0.6) {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      const scale = Math.min(1, maxDim / Math.max(img.width, img.height))
      const canvas = document.createElement('canvas')
      canvas.width = Math.max(1, Math.round(img.width * scale))
      canvas.height = Math.max(1, Math.round(img.height * scale))
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height)
      resolve(canvas.toDataURL('image/jpeg', quality))
    }
    img.onerror = () => resolve(dataUrl)
    img.src = dataUrl
  })
}
