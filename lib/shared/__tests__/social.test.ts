import { describe, expect, it } from 'vitest'
import { socialUrl } from '../social'

describe('socialUrl', () => {
  it('normalise un pseudo et un domaine sans protocole', () => {
    expect(socialUrl('instagram', '@liveinblack')).toBe('https://instagram.com/liveinblack')
    expect(socialUrl('website', 'liveinblack.com')).toBe('https://liveinblack.com/')
  })

  it('conserve uniquement les URL HTTP(S) valides', () => {
    expect(socialUrl('website', 'https://example.com/contact')).toBe('https://example.com/contact')
    expect(socialUrl('website', 'javascript:alert(1)')).toBeNull()
    expect(socialUrl('website', 'data:text/html;base64,PHNjcmlwdD4=')).toBeNull()
  })

  it('refuse les contrôles, URL malformées et valeurs excessives', () => {
    expect(socialUrl('website', 'https://example.com\nmalicious')).toBeNull()
    expect(socialUrl('website', 'not a domain')).toBeNull()
    expect(socialUrl('website', 'a'.repeat(501))).toBeNull()
  })
})
