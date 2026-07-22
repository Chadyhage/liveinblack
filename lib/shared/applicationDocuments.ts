import { z } from 'zod'

export const APPLICATION_DOCUMENT_MAX_BYTES = 10_000_000
export const APPLICATION_DOCUMENT_MAX_DATA_URI_LENGTH = 13_500_000
export const APPLICATION_DOCUMENT_MIME_TYPES = ['application/pdf', 'image/jpeg', 'image/png'] as const
export const APPLICATION_DOCUMENT_FORMATS = ['pdf', 'jpg', 'jpeg', 'png'] as const

const baseFields = {
  name: z.string().trim().min(1).max(180),
}

export const applicationDocumentUploadReferenceSchema = z.object({
  ...baseFields,
  publicId: z.string().min(1).max(500),
  format: z.enum(APPLICATION_DOCUMENT_FORMATS),
  resourceType: z.literal('image'),
  deliveryType: z.literal('authenticated'),
  bytes: z.number().int().positive().max(APPLICATION_DOCUMENT_MAX_BYTES),
  version: z.number().int().positive(),
  signature: z.string().regex(/^[a-f0-9]{40}$/i),
  intentToken: z.string().min(40).max(2000),
})

const legacyApplicationDocumentSchema = z.object({
  ...baseFields,
  dataUri: z.string().min(1).max(APPLICATION_DOCUMENT_MAX_DATA_URI_LENGTH),
})

export const applicationDocumentInputSchema = z.union([
  applicationDocumentUploadReferenceSchema,
  legacyApplicationDocumentSchema,
])

export const applicationDocumentsSchema = z
  .record(z.string().min(1).max(80), z.array(applicationDocumentInputSchema).max(5))
  .superRefine((documents, ctx) => {
    const totalFiles = Object.values(documents).reduce((total, files) => total + files.length, 0)
    if (totalFiles > 10) ctx.addIssue({ code: 'custom', message: 'Trop de documents.' })
  })

export type ApplicationDocumentUploadReference = z.infer<typeof applicationDocumentUploadReferenceSchema>
export type ApplicationDocumentInput = z.infer<typeof applicationDocumentInputSchema>
