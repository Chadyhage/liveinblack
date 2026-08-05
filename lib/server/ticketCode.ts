import crypto from 'node:crypto'
import Ticket from '../models/Ticket'

// Génère un code billet unique. Le legacy utilisait Math.random() sans
// vérification de collision avant écriture (audit H20, adjacent à C05) — ici
// on utilise crypto.randomBytes (aléa fort) ET on vérifie l'absence de
// collision en base avant de considérer le code utilisable.
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // exclut I/O/0/1 (ambiguïté visuelle)

function randomCode(length = 8): string {
  const bytes = crypto.randomBytes(length)
  let out = ''
  for (let i = 0; i < length; i++) out += ALPHABET[bytes[i] % ALPHABET.length]
  return out
}

export async function generateUniqueTicketCode(): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = randomCode()
    const exists = await Ticket.exists({ ticketCode: code })
    if (!exists) return code
  }
  // Filet extrêmement improbable : 5 collisions de suite sur un alphabet de
  // 32^8 possibilités — un code plus long ferme définitivement la porte.
  return randomCode(12)
}
