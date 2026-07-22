import { describe, expect, it } from 'vitest'
import { safeInternalPath } from '../safeNavigation'

describe('safeInternalPath', () => {
  it('conserve les chemins internes et leurs paramètres', () => {
    expect(safeInternalPath('/events/42?tab=music#playlist', '/home')).toBe('/events/42?tab=music#playlist')
  })

  it.each([
    'https://evil.example',
    '//evil.example/path',
    '/\\evil.example/path',
    'javascript:alert(1)',
    '',
  ])('rejette une destination non interne (%s)', (value) => {
    expect(safeInternalPath(value, '/home')).toBe('/home')
  })
})
