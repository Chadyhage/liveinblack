export const VERIFICATION_TOKEN_PURPOSES = ['verify-email', 'reset-password', 'change-email'] as const

export type VerificationTokenPurpose = (typeof VERIFICATION_TOKEN_PURPOSES)[number]

export function verificationTokenIdentifier(
  subjectId: string,
  email: string,
  purpose: VerificationTokenPurpose
): string {
  return `${purpose}:${subjectId}:${email.trim().toLowerCase()}`
}
