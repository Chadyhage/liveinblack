// Port de src/utils/share.js + src/utils/storyImage.js — utilitaires
// CÔTÉ NAVIGATEUR uniquement (canvas, partage natif, presse-papiers,
// téléchargement de fichier) pour le portefeuille de billets de
// ProfilePage.jsx (#6 phase profil). Aucune de ces fonctions ne touche au
// jeton QR lui-même (server-only, voir lib/server/ticketToken.ts) : elles ne
// font que dessiner / partager ce qui est déjà affiché à l'écran.

export function combineDateTime(dateStr: string | null | undefined, timeStr: string | null | undefined): Date | null {
  if (!dateStr) return null
  const time = timeStr && /^\d{1,2}:\d{2}/.test(timeStr) ? timeStr : '20:00'
  const iso = `${dateStr}T${time.length === 4 ? '0' + time : time}:00`
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? null : d
}

function icsEscape(s: string): string {
  return s.replace(/[\\,;]/g, (m) => '\\' + m).replace(/\n/g, '\\n')
}

function icsDate(d: Date): string {
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
}

export function downloadICS(input: { name: string; dateStr: string | null; timeStr: string | null; city?: string }): { ok: boolean } {
  const start = combineDateTime(input.dateStr, input.timeStr)
  if (!start) return { ok: false }
  const end = new Date(start.getTime() + 4 * 60 * 60 * 1000)
  const ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//LIVEINBLACK//FR',
    'BEGIN:VEVENT',
    `UID:${Date.now()}@liveinblack.com`,
    `DTSTAMP:${icsDate(new Date())}`,
    `DTSTART:${icsDate(start)}`,
    `DTEND:${icsDate(end)}`,
    `SUMMARY:${icsEscape(input.name)}`,
    input.city ? `LOCATION:${icsEscape(input.city)}` : '',
    'END:VEVENT',
    'END:VCALENDAR',
  ]
    .filter(Boolean)
    .join('\r\n')

  const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${input.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.ics`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
  return { ok: true }
}

export type ShareOrCopyResult = { method: 'share' | 'copy' | 'unsupported' }

export async function shareOrCopy(url: string, text: string): Promise<ShareOrCopyResult> {
  const nav = navigator as Navigator & { share?: (data: ShareData) => Promise<void> }
  if (nav.share) {
    try {
      await nav.share({ title: 'LIVEINBLACK', text, url })
      return { method: 'share' }
    } catch {
      // L'utilisateur a annulé le partage natif — on retente une copie
      // silencieuse plutôt que de considérer ça comme un échec bruyant.
    }
  }
  try {
    await navigator.clipboard.writeText(url)
    return { method: 'copy' }
  } catch {
    return { method: 'unsupported' }
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })
}

function fitText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, baseSize: number, fontWeight = '800'): number {
  let size = baseSize
  ctx.font = `${fontWeight} ${size}px Inter, sans-serif`
  while (ctx.measureText(text).width > maxWidth && size > 20) {
    size -= 2
    ctx.font = `${fontWeight} ${size}px Inter, sans-serif`
  }
  return size
}

export interface TicketCardExportInput {
  eventName: string
  dateDisplay: string
  place: string
  ticketCode: string
  ticketNumber: string
  qrCanvas: HTMLCanvasElement
  color?: string
}

// Port du hand-rolled canvas 1600×720 de PremiumTicketCard.handleDownload —
// même carte "boarding pass" que celle affichée à l'écran, exportée en PNG.
export async function downloadTicketPNG(input: TicketCardExportInput): Promise<{ ok: boolean }> {
  try {
    const W = 1600
    const H = 720
    const canvas = document.createElement('canvas')
    canvas.width = W
    canvas.height = H
    const ctx = canvas.getContext('2d')
    if (!ctx) return { ok: false }

    const grad = ctx.createLinearGradient(0, 0, W, H)
    grad.addColorStop(0, '#12131c')
    grad.addColorStop(1, '#0a0b12')
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, W, H)

    const stubX = W - 460
    ctx.setLineDash([14, 12])
    ctx.strokeStyle = 'rgba(255,255,255,0.25)'
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.moveTo(stubX, 0)
    ctx.lineTo(stubX, H)
    ctx.stroke()
    ctx.setLineDash([])

    // Encoches perforées de part et d'autre du séparateur.
    ctx.fillStyle = '#04040b'
    ;[0, H].forEach((y) => {
      ctx.beginPath()
      ctx.arc(stubX, y, 28, 0, Math.PI * 2)
      ctx.fill()
    })

    ctx.fillStyle = input.color || '#c8a96e'
    ctx.font = '700 22px Inter, sans-serif'
    ctx.fillText('LIVE IN BLACK · BILLET OFFICIEL', 60, 70)

    ctx.fillStyle = '#ffffff'
    const nameSize = fitText(ctx, input.eventName.toUpperCase(), stubX - 120, 64)
    ctx.font = `800 ${nameSize}px Inter, sans-serif`
    ctx.fillText(input.eventName.toUpperCase(), 60, 150)

    ctx.fillStyle = 'rgba(255,255,255,0.55)'
    ctx.font = '600 24px Inter, sans-serif'
    ctx.fillText(input.dateDisplay, 60, 210)

    const metaY = 320
    const cols = [
      { label: 'PLACE', value: input.place },
      { label: 'DATE', value: input.dateDisplay },
      { label: 'BILLET', value: input.ticketNumber },
    ]
    cols.forEach((col, i) => {
      const x = 60 + i * ((stubX - 120) / 3)
      ctx.fillStyle = 'rgba(255,255,255,0.4)'
      ctx.font = '700 16px Inter, sans-serif'
      ctx.fillText(col.label, x, metaY)
      ctx.fillStyle = '#ffffff'
      ctx.font = '700 30px Inter, sans-serif'
      ctx.fillText(col.value, x, metaY + 40)
    })

    ctx.drawImage(input.qrCanvas, stubX + 130, 140, 200, 200)

    ctx.fillStyle = 'rgba(255,255,255,0.5)'
    ctx.font = '600 18px Inter, sans-serif'
    let code = input.ticketCode
    while (ctx.measureText(code).width > 340 && code.length > 4) code = code.slice(0, -1)
    if (code !== input.ticketCode) code = code.slice(0, -1) + '…'
    ctx.textAlign = 'center'
    ctx.fillText(code, stubX + 230, 380)
    ctx.textAlign = 'left'

    return await new Promise((resolve) => {
      canvas.toBlob((blob) => {
        if (!blob) return resolve({ ok: false })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `billet-liveinblack-${input.ticketCode}.png`
        document.body.appendChild(a)
        a.click()
        a.remove()
        URL.revokeObjectURL(url)
        resolve({ ok: true })
      }, 'image/png')
    })
  } catch {
    return { ok: false }
  }
}

export interface StoryImageInput {
  eventName: string
  dateDisplay: string
  city?: string
  imageUrl?: string | null
  color?: string
}

// Port de storyImage.js:shareStory — image 1080×1920 pour partage Instagram
// story. Ne dessine JAMAIS le QR (une capture d'écran ne doit pas pouvoir
// servir de billet d'entrée).
export async function shareStory(input: StoryImageInput): Promise<{ ok: boolean; method?: 'share' | 'download' }> {
  try {
    const W = 1080
    const H = 1920
    const canvas = document.createElement('canvas')
    canvas.width = W
    canvas.height = H
    const ctx = canvas.getContext('2d')
    if (!ctx) return { ok: false }

    if (input.imageUrl) {
      try {
        const img = await loadImage(input.imageUrl)
        const scale = Math.max(W / img.width, H / img.height)
        const dw = img.width * scale
        const dh = img.height * scale
        ctx.drawImage(img, (W - dw) / 2, (H - dh) / 2, dw, dh)
      } catch {
        ctx.fillStyle = '#12131c'
        ctx.fillRect(0, 0, W, H)
      }
    } else {
      ctx.fillStyle = '#12131c'
      ctx.fillRect(0, 0, W, H)
    }

    const overlay = ctx.createLinearGradient(0, H * 0.45, 0, H)
    overlay.addColorStop(0, 'rgba(4,4,11,0)')
    overlay.addColorStop(1, 'rgba(4,4,11,0.92)')
    ctx.fillStyle = overlay
    ctx.fillRect(0, 0, W, H)

    ctx.fillStyle = input.color || '#c8a96e'
    ctx.font = '700 32px Inter, sans-serif'
    ctx.fillText("J'AI MA PLACE", 70, H - 340)

    ctx.fillStyle = '#ffffff'
    const size = fitText(ctx, input.eventName.toUpperCase(), W - 140, 80)
    ctx.font = `800 ${size}px Inter, sans-serif`
    ctx.fillText(input.eventName.toUpperCase(), 70, H - 260)

    ctx.fillStyle = 'rgba(255,255,255,0.75)'
    ctx.font = '600 34px Inter, sans-serif'
    ctx.fillText(input.dateDisplay + (input.city ? ` · ${input.city}` : ''), 70, H - 190)

    ctx.fillStyle = 'rgba(255,255,255,0.5)'
    ctx.font = '600 26px Inter, sans-serif'
    ctx.fillText('LIVE IN BLACK', 70, H - 100)

    const blob: Blob | null = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'))
    if (!blob) return { ok: false }

    const file = new File([blob], 'story-liveinblack.png', { type: 'image/png' })
    const nav = navigator as Navigator & { canShare?: (data: ShareData) => boolean; share?: (data: ShareData) => Promise<void> }
    if (nav.canShare && nav.share && nav.canShare({ files: [file] })) {
      try {
        await nav.share({ files: [file], title: 'LIVEINBLACK' })
        return { ok: true, method: 'share' }
      } catch {
        return { ok: false }
      }
    }

    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'story-liveinblack.png'
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
    return { ok: true, method: 'download' }
  } catch {
    return { ok: false }
  }
}

export function countdownLabel(dateStr: string | null): string | null {
  if (!dateStr) return null
  const target = new Date(dateStr + 'T00:00:00')
  if (Number.isNaN(target.getTime())) return null
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const days = Math.round((target.getTime() - today.getTime()) / 86400000)
  if (days < 0 || days > 7) return null
  if (days === 0) return "C'est ce soir !"
  if (days === 1) return 'Demain'
  return `Dans ${days} jours`
}

export function getPasswordStrength(pw: string): { score: number; label: 'FAIBLE' | 'MOYEN' | 'FORT'; color: string; pct: number } {
  let score = 0
  if (pw.length >= 8) score++
  if (pw.length >= 12) score++
  if (/[A-Z]/.test(pw)) score++
  if (/[0-9]/.test(pw)) score++
  if (/[^A-Za-z0-9]/.test(pw)) score++
  if (score <= 1) return { score, label: 'FAIBLE', color: '#ef4444', pct: 25 }
  if (score <= 3) return { score, label: 'MOYEN', color: '#f97316', pct: 60 }
  return { score, label: 'FORT', color: '#4ee8c8', pct: 100 }
}
