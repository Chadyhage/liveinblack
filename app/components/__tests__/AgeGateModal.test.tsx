import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import AgeGateModal from '../AgeGateModal'

const modalSpy = vi.fn()

vi.mock('@/app/components/ui', () => ({
  Button: function MockButton({
    children,
  }: {
    children: React.ReactNode
  }) {
    return <button>{children}</button>
  },
  Modal: function MockModal({
    children,
    ariaLabel,
    zIndex,
  }: {
    children: React.ReactNode
    ariaLabel?: string
    zIndex?: number
  }) {
    modalSpy({ ariaLabel, zIndex })
    return <section data-testid="modal">{children}</section>
  },
}))

describe('AgeGateModal', () => {
  it('rend le message attendu et n’utilise plus de largeur legacy', () => {
    const html = renderToStaticMarkup(
      <AgeGateModal minAge={21} onConfirm={() => {}} onCancel={() => {}} />
    )

    expect(html).toContain('Réservé aux 21 ans et plus')
    expect(html).toContain('Pièce d&#x27;identité')
    expect(html).toContain('J&#x27;ai compris')
    expect(modalSpy.mock.calls.at(-1)?.[0]).toEqual({
      ariaLabel: 'Réservé aux 21 ans et plus',
      zIndex: 999,
    })
  })
})
