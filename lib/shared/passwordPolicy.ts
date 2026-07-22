export const PASSWORD_MIN_LENGTH = 8

export function getPasswordPolicyErrors(password: string): string[] {
  const errors: string[] = []
  if (password.length < PASSWORD_MIN_LENGTH) errors.push('Au moins 8 caractères')
  if (!/[A-Z]/.test(password)) errors.push('Au moins une majuscule')
  if (!/[0-9]/.test(password)) errors.push('Au moins un chiffre')
  return errors
}

export function isPasswordPolicyCompliant(password: string): boolean {
  return getPasswordPolicyErrors(password).length === 0
}
