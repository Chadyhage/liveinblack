import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import ConfirmDialog from '../ConfirmDialog'

const modalSpy = vi.fn()

vi.mock('../Modal', () => ({
  default: function MockModal({
    title,
    children,
    zIndex,
  }: {
    title?: string
    children: React.ReactNode
    zIndex?: number
  }) {
    modalSpy({ title, zIndex })
    return (
      <section data-testid="modal">
        {title ? <h2>{title}</h2> : null}
        {children}
      </section>
    )
  },
}))

describe('ConfirmDialog', () => {
  it('ignore maxWidth legacy mais conserve les autres props utiles', () => {
    renderToStaticMarkup(
      <ConfirmDialog
        open
        title="Supprimer"
        body="Texte"
        maxWidth={420}
        zIndex={120}
        onCancel={() => {}}
        onConfirm={() => {}}
      />
    )

    const call = modalSpy.mock.calls.at(-1)?.[0]
    expect(call).toEqual({ title: 'Supprimer', zIndex: 120 })
  })

  it('ne rend rien quand il est fermé', () => {
    const html = renderToStaticMarkup(
      <ConfirmDialog
        open={false}
        title="Supprimer"
        body="Texte"
        onCancel={() => {}}
        onConfirm={() => {}}
      />
    )

    expect(html).toBe('')
  })

  it('rend le titre, le corps et les labels personnalisés quand il est ouvert', () => {
    const html = renderToStaticMarkup(
      <ConfirmDialog
        open
        title="Supprimer mon compte"
        body={<span>Action irréversible.</span>}
        confirmLabel="Supprimer"
        cancelLabel="Retour"
        onCancel={() => {}}
        onConfirm={() => {}}
      />
    )

    expect(html).toContain('Supprimer mon compte')
    expect(html).toContain('Action irréversible.')
    expect(html).toContain('Supprimer')
    expect(html).toContain('Retour')
  })

  it('rend le contenu complémentaire sous le message', () => {
    const html = renderToStaticMarkup(
      <ConfirmDialog
        open
        title="Confirmation"
        body="Texte principal"
        onCancel={() => {}}
        onConfirm={() => {}}
      >
        <label>Mot de passe</label>
      </ConfirmDialog>
    )

    expect(html).toContain('Texte principal')
    expect(html).toContain('Mot de passe')
  })
})
