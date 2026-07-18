export default async function getCroppedImg(imageSrc, croppedAreaPixels) {
  const image = await createImage(imageSrc)
  // Plafond 1280px : suffisant pour une affiche plein écran, et garde les
  // uploads Storage rapides (une image pleine résolution peut peser > 5 Mo)
  const MAX_DIM = 1280
  const scale = Math.min(1, MAX_DIM / Math.max(croppedAreaPixels.width, croppedAreaPixels.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(croppedAreaPixels.width * scale))
  canvas.height = Math.max(1, Math.round(croppedAreaPixels.height * scale))
  const ctx = canvas.getContext('2d')
  ctx.drawImage(
    image,
    croppedAreaPixels.x,
    croppedAreaPixels.y,
    croppedAreaPixels.width,
    croppedAreaPixels.height,
    0, 0,
    canvas.width,
    canvas.height,
  )
  return canvas.toDataURL('image/jpeg', 0.85)
}

function createImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.addEventListener('load', () => resolve(img))
    img.addEventListener('error', reject)
    img.setAttribute('crossOrigin', 'anonymous')
    img.src = url
  })
}
