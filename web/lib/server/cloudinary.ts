import { v2 as cloudinary } from 'cloudinary'

// Remplace Firebase Storage. Pas encore de route d'upload en phase 2 (lecture
// seule) — ce module sert de point d'entrée unique, prêt pour les phases où
// organisateurs/prestataires uploadent des médias (photos d'événements,
// avatars, catalogues).
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
})

export default cloudinary
