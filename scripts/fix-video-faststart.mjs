// Répare les vidéos d'aperçu d'événements non « faststart » (moov à la fin).
// Un MP4 dont l'index moov est en fin de fichier force le navigateur à
// télécharger TOUT le fichier avant de démarrer la lecture → le trailer au
// survol semble mort sur connexion lente. Ce script remuxe sans perte
// (ffmpeg -c copy -movflags +faststart) et réécrit le fichier AU MÊME chemin
// Storage avec le MÊME token de téléchargement : l'URL ne change pas, aucune
// écriture Firestore nécessaire.
//
// Usage :  node scripts/fix-video-faststart.mjs           (dry-run : diagnostic seul)
//          node scripts/fix-video-faststart.mjs --apply   (répare)
// Prérequis : ffmpeg dans le PATH, FIREBASE_* dans .env.local
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { execFileSync } from 'node:child_process'
import { getDb } from '../lib/firebaseAdmin.js'
import { getStorage } from 'firebase-admin/storage'

function loadLocalEnv() {
  const text = fs.readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const sep = line.indexOf('=')
    if (sep < 1) continue
    const key = line.slice(0, sep).trim()
    let value = line.slice(sep + 1).trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1)
    if (!process.env[key]) process.env[key] = value
  }
}

const APPLY = process.argv.includes('--apply')

function isFaststart(buf) {
  // Cherche l'atome moov dans les 64 premiers Ko (après ftyp c'est le début réel)
  return buf.subarray(0, 65536).includes(Buffer.from('moov', 'latin1'))
}

async function main() {
  loadLocalEnv()
  const db = getDb()
  const bucket = getStorage().bucket(`${process.env.FIREBASE_PROJECT_ID}.firebasestorage.app`)

  const snap = await db.collection('events').get()
  const withVideo = snap.docs
    .map(d => ({ id: d.id, name: d.data().name, videoUrl: d.data().videoUrl }))
    .filter(e => typeof e.videoUrl === 'string' && e.videoUrl.includes('firebasestorage'))

  console.log(`${withVideo.length} événement(s) avec vidéo.`)
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lib-faststart-'))

  for (const ev of withVideo) {
    const m = ev.videoUrl.match(/\/o\/([^?]+)/)
    if (!m) { console.log(`SKIP ${ev.name} : URL non reconnue`); continue }
    const storagePath = decodeURIComponent(m[1])
    const file = bucket.file(storagePath)

    const [buf] = await file.download()
    if (isFaststart(buf)) { console.log(`OK   ${ev.name} : déjà faststart (${(buf.length / 1e6).toFixed(1)} Mo)`); continue }
    console.log(`FIX  ${ev.name} : moov en fin de fichier (${(buf.length / 1e6).toFixed(1)} Mo)${APPLY ? '' : ' — dry-run, rien modifié'}`)
    if (!APPLY) continue

    const inPath = path.join(tmp, `${ev.id}-in.mp4`)
    const outPath = path.join(tmp, `${ev.id}-out.mp4`)
    fs.writeFileSync(inPath, buf) // sert aussi de backup local de l'original
    execFileSync('ffmpeg', ['-y', '-i', inPath, '-c', 'copy', '-movflags', '+faststart', outPath], { stdio: 'pipe' })

    const fixed = fs.readFileSync(outPath)
    if (!isFaststart(fixed)) { console.log(`ERREUR ${ev.name} : le remux n'a pas produit un faststart, fichier NON réécrit`); continue }

    // Préserver le token de téléchargement → l'URL existante reste valide
    const [meta] = await file.getMetadata()
    const token = meta?.metadata?.firebaseStorageDownloadTokens
    await file.save(fixed, {
      contentType: meta.contentType || 'video/mp4',
      metadata: { metadata: { ...(meta.metadata || {}), ...(token ? { firebaseStorageDownloadTokens: token } : {}) } },
    })
    console.log(`     réécrit (${(fixed.length / 1e6).toFixed(1)} Mo) — backup original : ${inPath}`)
  }
  console.log('Terminé.')
}

main().catch(e => { console.error(e); process.exit(1) })
