export type LegacyCloudinaryAsset = {
  cloudName: string
  resourceType: 'image' | 'raw'
  format: string
  publicIdCandidates: string[]
}

export function parseLegacyCloudinaryAssetUrl(
  value: string,
  expectedCloudName?: string
): LegacyCloudinaryAsset | null {
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:' || url.hostname !== 'res.cloudinary.com') return null

    const segments = url.pathname.split('/').filter(Boolean).map((segment) => decodeURIComponent(segment))
    const [cloudName, resourceType, deliveryType] = segments
    if (!cloudName || (resourceType !== 'image' && resourceType !== 'raw') || deliveryType !== 'upload') return null
    if (expectedCloudName && cloudName !== expectedCloudName) return null

    const versionIndex = segments.findIndex((segment, index) => index >= 3 && /^v\d+$/.test(segment))
    const assetSegments = segments.slice(versionIndex >= 0 ? versionIndex + 1 : 3)
    if (assetSegments.length === 0) return null

    const assetPath = assetSegments.join('/')
    const extensionMatch = /\.([a-z0-9]{1,10})$/i.exec(assetPath)
    if (!extensionMatch) return null
    const format = extensionMatch[1].toLowerCase()
    const withoutExtension = assetPath.slice(0, -extensionMatch[0].length)
    const publicIdCandidates = resourceType === 'raw'
      ? [assetPath, withoutExtension]
      : [withoutExtension]

    return { cloudName, resourceType, format, publicIdCandidates: [...new Set(publicIdCandidates)] }
  } catch {
    return null
  }
}
