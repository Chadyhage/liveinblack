import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  DESKTOP_THREAD_VIEW_QUERY,
  getDesktopThreadViewServerSnapshot,
  getDesktopThreadViewSnapshot,
  subscribeToDesktopThreadView,
} from '../useDesktopThreadView'

describe('useDesktopThreadView helpers', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('lit correctement le snapshot du media query desktop', () => {
    vi.stubGlobal('window', {
      matchMedia: vi.fn().mockReturnValue({ matches: true }),
    })

    expect(getDesktopThreadViewSnapshot()).toBe(true)
    expect(window.matchMedia).toHaveBeenCalledWith(DESKTOP_THREAD_VIEW_QUERY)
  })

  it('retourne toujours false côté serveur', () => {
    expect(getDesktopThreadViewServerSnapshot()).toBe(false)
  })

  it('s’abonne et se désabonne sur le bon media query', () => {
    const addEventListener = vi.fn()
    const removeEventListener = vi.fn()
    const callback = vi.fn()

    vi.stubGlobal('window', {
      matchMedia: vi.fn().mockReturnValue({
        matches: false,
        addEventListener,
        removeEventListener,
      }),
    })

    const unsubscribe = subscribeToDesktopThreadView(callback)

    expect(window.matchMedia).toHaveBeenCalledWith(DESKTOP_THREAD_VIEW_QUERY)
    expect(addEventListener).toHaveBeenCalledWith('change', callback)

    unsubscribe()

    expect(removeEventListener).toHaveBeenCalledWith('change', callback)
  })
})
