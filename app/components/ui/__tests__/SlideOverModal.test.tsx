import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import SlideOverModal from '../SlideOverModal'

const backSpy = vi.fn()
const baseModalSpy = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    back: backSpy,
  }),
}))

vi.mock('../BaseModal', () => ({
  default: function MockBaseModal(props: {
    onClose: () => void
    children: React.ReactNode | ((context: { close: () => void }) => React.ReactNode)
    panelClassName?: string
    panelStyle?: React.CSSProperties
    ariaLabel?: string
  }) {
    baseModalSpy(props)
    const content = typeof props.children === 'function' ? props.children({ close: props.onClose }) : props.children
    return <section data-testid="base-slide-over">{content}</section>
  },
}))

describe('SlideOverModal', () => {
  it('ignore les anciennes largeurs pour garder un panneau latéral uniforme', () => {
    renderToStaticMarkup(
      <SlideOverModal maxWidth={1180}>
        <p>Contenu</p>
      </SlideOverModal>
    )

    const call = baseModalSpy.mock.calls.at(-1)?.[0]
    expect(call?.panelStyle).toBeUndefined()
  })

  it('utilise router.back par défaut quand aucun onClose n’est fourni', () => {
    renderToStaticMarkup(
      <SlideOverModal ariaLabel="Détail">
        <p>Contenu</p>
      </SlideOverModal>
    )

    const call = baseModalSpy.mock.calls.at(-1)?.[0]
    expect(call?.ariaLabel).toBe('Détail')
    expect(call?.panelClassName).toContain('panel')
    call?.onClose()
    expect(backSpy).toHaveBeenCalledTimes(1)
  })

  it('privilégie onClose quand une fermeture locale est fournie', () => {
    const onClose = vi.fn()

    renderToStaticMarkup(
      <SlideOverModal onClose={onClose} variant="event">
        <p>Contenu</p>
      </SlideOverModal>
    )

    const call = baseModalSpy.mock.calls.at(-1)?.[0]
    expect(call?.panelClassName).toContain('eventPanel')
    call?.onClose()
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
