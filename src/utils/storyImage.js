// ─── Générateur de STORY (1080×1920) — « Partager en story » ─────────────────
// Dessine une image verticale prête pour Instagram/WhatsApp/Snapchat aux
// couleurs LIVE IN BLACK : fond obsidienne, halos violet/rose, visuel de
// l'événement en tête, titre énorme, chips d'infos, tagline hype.
//
// ⚠️ SÉCURITÉ : le QR code n'est JAMAIS dessiné dans une story — un simple
// screenshot suffirait à voler l'entrée. On ne montre que l'ambiance/les infos.
//
// Partage : Web Share API niveau 2 (fichier → feuille native, l'utilisateur
// choisit Instagram → story). Repli : téléchargement du PNG (l'utilisateur le
// publie ensuite depuis sa galerie).

const W = 1080
const H = 1920
const FONT = 'Inter, Arial, sans-serif'

function roundedPath(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + rr, y)
  ctx.arcTo(x + w, y, x + w, y + h, rr)
  ctx.arcTo(x + w, y + h, x, y + h, rr)
  ctx.arcTo(x, y + h, x, y, rr)
  ctx.arcTo(x, y, x + w, y, rr)
  ctx.closePath()
}

// Découpe un texte en 2 lignes max qui tiennent dans maxWidth (à taille donnée).
function wrapTwoLines(ctx, text, maxWidth) {
  const words = String(text || '').trim().split(/\s+/)
  if (ctx.measureText(words.join(' ')).width <= maxWidth) return [words.join(' ')]
  let line1 = ''
  let i = 0
  for (; i < words.length; i++) {
    const test = line1 ? `${line1} ${words[i]}` : words[i]
    if (ctx.measureText(test).width > maxWidth && line1) break
    line1 = test
  }
  let line2 = words.slice(i).join(' ')
  while (line2 && ctx.measureText(line2 + '…').width > maxWidth) {
    line2 = line2.split(' ').slice(0, -1).join(' ')
    if (!line2.includes(' ')) break
  }
  if (i < words.length && ctx.measureText(words.slice(i).join(' ')).width > maxWidth) line2 += '…'
  return [line1, line2].filter(Boolean)
}

// Taille de police qui fait tenir le titre sur ≤ 2 lignes.
function fitTitle(ctx, text, maxWidth, maxSize, minSize) {
  for (let size = maxSize; size >= minSize; size -= 4) {
    ctx.font = `800 ${size}px ${FONT}`
    const lines = wrapTwoLines(ctx, text, maxWidth)
    if (lines.length <= 2 && lines.every(l => ctx.measureText(l).width <= maxWidth)) {
      return { size, lines }
    }
  }
  ctx.font = `800 ${minSize}px ${FONT}`
  return { size: minSize, lines: wrapTwoLines(ctx, text, maxWidth) }
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous' // requis pour toBlob (canvas non « taint »)
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = url
  })
}

function drawStory(ctx, { kicker, title, chips = [], tagline, image }) {
  // ── Fond obsidienne + halos de marque ──
  ctx.fillStyle = '#04040b'
  ctx.fillRect(0, 0, W, H)

  const glow1 = ctx.createRadialGradient(140, 260, 0, 140, 260, 900)
  glow1.addColorStop(0, 'rgba(132,68,255,0.38)')
  glow1.addColorStop(1, 'rgba(132,68,255,0)')
  ctx.fillStyle = glow1
  ctx.fillRect(0, 0, W, H)

  const glow2 = ctx.createRadialGradient(W - 100, H - 300, 0, W - 100, H - 300, 820)
  glow2.addColorStop(0, 'rgba(224,90,170,0.30)')
  glow2.addColorStop(1, 'rgba(224,90,170,0)')
  ctx.fillStyle = glow2
  ctx.fillRect(0, 0, W, H)

  const glow3 = ctx.createRadialGradient(W - 160, 180, 0, W - 160, 180, 500)
  glow3.addColorStop(0, 'rgba(78,232,200,0.16)')
  glow3.addColorStop(1, 'rgba(78,232,200,0)')
  ctx.fillStyle = glow3
  ctx.fillRect(0, 0, W, H)

  // ── Logo texte « L|VE IN BLACK » ──
  ctx.textBaseline = 'alphabetic'
  ctx.font = `800 44px ${FONT}`
  ctx.fillStyle = '#ffffff'
  const lx = 84, ly = 128
  ctx.fillText('L', lx, ly)
  const lWidth = ctx.measureText('L').width
  ctx.fillStyle = '#4ee8c8' // la barre du logo
  ctx.fillRect(lx + lWidth + 8, ly - 38, 5, 42)
  ctx.fillStyle = '#ffffff'
  ctx.fillText('VE IN BLACK', lx + lWidth + 22, ly)

  // ── Visuel (affiche événement / photo prestataire) ──
  const imgTop = 200
  const imgH = image ? 880 : 0
  if (image) {
    ctx.save()
    roundedPath(ctx, 64, imgTop, W - 128, imgH, 44)
    ctx.clip()
    // cover : remplir le cadre en conservant le ratio
    const frameW = W - 128, frameH = imgH
    const scale = Math.max(frameW / image.width, frameH / image.height)
    const dw = image.width * scale, dh = image.height * scale
    ctx.drawImage(image, 64 + (frameW - dw) / 2, imgTop + (frameH - dh) / 2, dw, dh)
    // dégradé bas pour fondre vers le contenu
    const fade = ctx.createLinearGradient(0, imgTop + imgH - 360, 0, imgTop + imgH)
    fade.addColorStop(0, 'rgba(4,4,11,0)')
    fade.addColorStop(1, 'rgba(4,4,11,0.94)')
    ctx.fillStyle = fade
    ctx.fillRect(64, imgTop, frameW, imgH)
    ctx.restore()
    ctx.strokeStyle = 'rgba(255,255,255,0.14)'
    ctx.lineWidth = 2
    roundedPath(ctx, 64, imgTop, W - 128, imgH, 44)
    ctx.stroke()
  }

  // ── Bloc texte ──
  let y = image ? imgTop + imgH + 110 : 560

  // kicker
  if (kicker) {
    ctx.font = `700 30px ${FONT}`
    ctx.fillStyle = '#4ee8c8'
    const spaced = String(kicker).toUpperCase().split('').join('  ')
    ctx.fillText(spaced, 84, y)
    y += 76
  }

  // titre (≤ 2 lignes, taille adaptative)
  const { size, lines } = fitTitle(ctx, title, W - 168, 118, 62)
  ctx.fillStyle = '#ffffff'
  ctx.font = `800 ${size}px ${FONT}`
  for (const line of lines) {
    ctx.fillText(line, 84, y + size * 0.82)
    y += size * 1.08
  }
  y += 56

  // chips d'infos
  ctx.font = `700 34px ${FONT}`
  let cx = 84
  for (const chip of chips.filter(Boolean).slice(0, 4)) {
    const tw = ctx.measureText(chip).width
    const cw = tw + 64
    if (cx + cw > W - 84) { cx = 84; y += 96 }
    roundedPath(ctx, cx, y, cw, 74, 37)
    ctx.fillStyle = 'rgba(255,255,255,0.07)'
    ctx.fill()
    ctx.strokeStyle = 'rgba(255,255,255,0.22)'
    ctx.lineWidth = 2
    roundedPath(ctx, cx, y, cw, 74, 37)
    ctx.stroke()
    ctx.fillStyle = 'rgba(255,255,255,0.92)'
    ctx.fillText(chip, cx + 32, y + 51)
    cx += cw + 20
  }
  y += 170

  // tagline hype
  if (tagline) {
    ctx.font = `800 58px ${FONT}`
    const grad = ctx.createLinearGradient(84, y, 900, y)
    grad.addColorStop(0, '#c8a96e')
    grad.addColorStop(0.55, '#e05aaa')
    grad.addColorStop(1, '#8b5cf6')
    ctx.fillStyle = grad
    ctx.fillText(tagline, 84, y)
  }

  // ── Watermark géant + footer ──
  ctx.save()
  ctx.font = `800 150px ${FONT}`
  ctx.fillStyle = 'rgba(255,255,255,0.035)'
  ctx.fillText('LIVE IN BLACK', 40, H - 170)
  ctx.restore()

  ctx.font = `700 32px ${FONT}`
  ctx.fillStyle = 'rgba(255,255,255,0.55)'
  const site = 'liveinblack.com'
  ctx.fillText(site, (W - ctx.measureText(site).width) / 2, H - 74)
  ctx.fillStyle = '#4ee8c8'
  ctx.fillRect((W - 72) / 2, H - 130, 72, 4)
}

async function toBlob(canvas) {
  return new Promise((resolve, reject) => {
    try {
      canvas.toBlob(b => (b ? resolve(b) : reject(new Error('PNG impossible'))), 'image/png')
    } catch (e) { reject(e) }
  })
}

/**
 * Génère le PNG de story. Tente d'inclure le visuel ; si l'image bloque
 * l'export (CORS) ou ne charge pas, re-dessine la version sans visuel —
 * les halos de marque suffisent à faire une belle story.
 */
export async function generateStoryBlob({ kicker, title, chips, tagline, imageUrl }) {
  try { await document.fonts?.ready } catch {}
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')

  if (imageUrl && /^https?:\/\//i.test(imageUrl)) {
    try {
      const image = await loadImage(imageUrl)
      drawStory(ctx, { kicker, title, chips, tagline, image })
      return await toBlob(canvas) // échoue ici si le canvas est « taint » (CORS)
    } catch { /* retombe sur la version sans visuel */ }
  }
  drawStory(ctx, { kicker, title, chips, tagline, image: null })
  return await toBlob(canvas)
}

/**
 * Partage la story : feuille native si le navigateur sait partager un fichier
 * (mobile → l'utilisateur choisit Instagram/WhatsApp), sinon téléchargement.
 * @returns {{ method: 'share' | 'download' | 'none' }}
 */
export async function shareStory(opts) {
  let blob
  try {
    blob = await generateStoryBlob(opts)
  } catch { return { method: 'none' } }

  const file = new File([blob], `story-liveinblack-${Date.now()}.png`, { type: 'image/png' })
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: opts.title || 'Live in Black' })
      return { method: 'share' }
    } catch (e) {
      if (e?.name === 'AbortError') return { method: 'share' } // l'utilisateur a fermé la feuille
      // sinon → repli téléchargement
    }
  }
  try {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = file.name
    a.style.display = 'none'
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 10000)
    return { method: 'download' }
  } catch { return { method: 'none' } }
}
