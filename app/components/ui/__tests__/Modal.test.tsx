import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import Modal from '../Modal'

const baseModalSpy = vi.fn()

vi.mock('../BaseModal', () => ({
  default: function MockBaseModal(props: {
    children: React.ReactNode | ((context: { close: () => void }) => React.ReactNode)
    panelStyle?: React.CSSProperties
    ariaLabel?: string
    ariaLabelledBy?: string
    ariaDescribedBy?: string
  }) {
    baseModalSpy(props)
    const content = typeof props.children === 'function' ? props.children({ close: () => undefined }) : props.children
    return (
      <section data-testid="base-modal">
        {content}
      </section>
    )
  },
}))

describe('Modal', () => {
  it('transmets --modal-max-width quand un appelant le fournit', () => {
    renderToStaticMarkup(
      <Modal onClose={() => {}} maxWidth={420}>
        <p>Contenu</p>
      </Modal>
    )

    const call = baseModalSpy.mock.calls.at(-1)?.[0]
    expect(call?.panelStyle).toEqual({ '--modal-max-width': '420px' })
  })

  it('plafonne une largeur excessive pour empêcher une modale plein écran', () => {
    renderToStaticMarkup(
      <Modal onClose={() => {}} maxWidth={1400}>
        <p>Contenu</p>
      </Modal>
    )

    const call = baseModalSpy.mock.calls.at(-1)?.[0]
    expect(call?.panelStyle).toEqual({ '--modal-max-width': '760px' })
  })

  it('nettoie les contraintes de taille injectées par contentStyle', () => {
    renderToStaticMarkup(
      <Modal
        onClose={() => {}}
        title="Titre"
        contentStyle={{
          width: 420,
          maxWidth: 560,
          minWidth: 200,
          height: 300,
          maxHeight: 340,
          minHeight: 180,
          padding: 24,
        }}
      >
        <p>Contenu</p>
      </Modal>
    )

    const call = baseModalSpy.mock.calls.at(-1)?.[0]
    expect(call?.panelStyle).toEqual({ padding: 24 })
    expect(call?.ariaLabel).toBeUndefined()
    expect(call?.ariaLabelledBy).toBeTruthy()
  })

  it('conserve un aria-label direct quand aucun titre n’est fourni', () => {
    renderToStaticMarkup(
      <Modal onClose={() => {}} ariaLabel="Fenêtre simple">
        <p>Contenu</p>
      </Modal>
    )

    const call = baseModalSpy.mock.calls.at(-1)?.[0]
    expect(call?.ariaLabel).toBe('Fenêtre simple')
    expect(call?.ariaLabelledBy).toBeUndefined()
  })
})
