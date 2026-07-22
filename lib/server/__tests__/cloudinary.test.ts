import { describe, expect, it } from 'vitest'
import {
  AUDIO_MIME_TYPES,
  DOCUMENT_MIME_TYPES,
  IMAGE_MIME_TYPES,
  validateDataUri,
} from '../cloudinary'

function dataUri(mimeType: string, bytes: Uint8Array) {
  return `data:${mimeType};base64,${Buffer.from(bytes).toString('base64')}`
}

describe('validateDataUri', () => {
  it('accepte une image base64 autorisée et calcule sa taille réelle', () => {
    const result = validateDataUri(dataUri('image/png', new Uint8Array([1, 2, 3, 4])), {
      allowedMimeTypes: IMAGE_MIME_TYPES,
    })

    expect(result).toEqual({ mimeType: 'image/png', bytes: 4, resourceType: 'image' })
  })

  it('refuse les formats actifs même si leur préfixe est une image', () => {
    expect(validateDataUri(dataUri('image/svg+xml', new Uint8Array([1])), {
      allowedMimeTypes: IMAGE_MIME_TYPES,
    })).toBeNull()
  })

  it('refuse un MIME valide pour un autre usage', () => {
    expect(validateDataUri(dataUri('audio/webm', new Uint8Array([1, 2])), {
      allowedMimeTypes: IMAGE_MIME_TYPES,
    })).toBeNull()
  })

  it('accepte les PDF justificatifs et les traite comme fichiers bruts', () => {
    expect(validateDataUri(dataUri('application/pdf', new Uint8Array([1, 2])), {
      allowedMimeTypes: DOCUMENT_MIME_TYPES,
    })).toEqual({ mimeType: 'application/pdf', bytes: 2, resourceType: 'raw' })
  })

  it('accepte les notes vocales dans leur politique dédiée', () => {
    expect(validateDataUri(dataUri('audio/ogg', new Uint8Array([1, 2])), {
      allowedMimeTypes: AUDIO_MIME_TYPES,
    })?.resourceType).toBe('video')
  })

  it('refuse les données non base64 et les fichiers vides ou trop gros', () => {
    expect(validateDataUri('data:image/png,%3Cscript%3E', { allowedMimeTypes: IMAGE_MIME_TYPES })).toBeNull()
    expect(validateDataUri('data:image/png;base64,', { allowedMimeTypes: IMAGE_MIME_TYPES })).toBeNull()
    expect(validateDataUri(dataUri('image/png', new Uint8Array([1, 2, 3])), {
      allowedMimeTypes: IMAGE_MIME_TYPES,
      maxBytes: 2,
    })).toBeNull()
  })
})
