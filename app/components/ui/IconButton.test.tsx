import { describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import IconButton from './IconButton'

// `label` est la SEULE façon de rendre un bouton icône-seule accessible
// (pas de texte visible) — utilisé des dizaines de fois dans l'app
// (messagerie, sidebar, cartes billet...). Une régression sur la
// propagation aria-label/title cassait silencieusement l'accessibilité de
// tous ces boutons à la fois.
describe('IconButton', () => {
  it('utilise `label` comme aria-label ET title (icône seule, sans texte visible)', () => {
    render(<IconButton label="Fermer" icon={<span aria-hidden="true">×</span>} />)
    const button = screen.getByRole('button', { name: 'Fermer' })
    expect(button).toHaveAttribute('title', 'Fermer')
  })

  it('répond au clic', () => {
    const onClick = vi.fn()
    render(<IconButton label="Supprimer" icon={<span />} onClick={onClick} />)
    fireEvent.click(screen.getByRole('button', { name: 'Supprimer' }))
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('respecte une taille tactile minimale de 44px même pour une icône plus petite', () => {
    render(<IconButton label="Petit bouton" icon={<span />} size={28} />)
    const button = screen.getByRole('button', { name: 'Petit bouton' })
    // Le rendu visuel suit `size` (28px), mais la zone TACTILE minimale
    // (min-width/min-height) ne doit jamais descendre sous 44px — sinon
    // régression d'accessibilité tactile mobile (même règle que Button.tsx).
    expect(button).toHaveStyle({ width: '28px', height: '28px', minWidth: '28px', minHeight: '28px' })
  })

  it('plafonne la taille tactile minimale à 44px même pour une icône plus grande', () => {
    render(<IconButton label="Grand bouton" icon={<span />} size={64} />)
    const button = screen.getByRole('button', { name: 'Grand bouton' })
    expect(button).toHaveStyle({ width: '64px', height: '64px', minWidth: '44px', minHeight: '44px' })
  })

  it('désactive le bouton et bloque le clic quand disabled', () => {
    const onClick = vi.fn()
    render(<IconButton label="Indisponible" icon={<span />} disabled onClick={onClick} />)
    const button = screen.getByRole('button', { name: 'Indisponible' })
    expect(button).toBeDisabled()
    fireEvent.click(button)
    expect(onClick).not.toHaveBeenCalled()
  })
})
