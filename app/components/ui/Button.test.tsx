import { describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import Button from './Button'

// Premier test de composant du repo (audit du 12/08/2026 : "aucun test
// frontend" — 0 fichier .test.tsx trouvé, y compris pour Button.tsx alors
// que c'est LE composant réutilisé partout dans l'app, cf. CLAUDE.md
// "jamais de <button> brut stylé inline ailleurs"). Toute régression ici se
// propagerait silencieusement à des dizaines d'écrans.

describe('Button', () => {
  it('affiche son contenu et répond au clic', () => {
    const onClick = vi.fn()
    render(<Button onClick={onClick}>Valider</Button>)
    const button = screen.getByRole('button', { name: 'Valider' })
    fireEvent.click(button)
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('est de type="button" par défaut (jamais "submit" implicite)', () => {
    render(<Button>Action</Button>)
    expect(screen.getByRole('button')).toHaveAttribute('type', 'button')
  })

  it('respecte un type explicite (ex. "submit" dans un formulaire)', () => {
    render(<Button type="submit">Envoyer</Button>)
    expect(screen.getByRole('button')).toHaveAttribute('type', 'submit')
  })

  it('désactive le bouton et bloque le clic quand disabled', () => {
    const onClick = vi.fn()
    render(
      <Button disabled onClick={onClick}>
        Indisponible
      </Button>
    )
    const button = screen.getByRole('button', { name: 'Indisponible' })
    expect(button).toBeDisabled()
    fireEvent.click(button)
    expect(onClick).not.toHaveBeenCalled()
  })

  it('désactive le bouton pendant loading, même sans disabled explicite', () => {
    const onClick = vi.fn()
    render(
      <Button loading onClick={onClick}>
        Enregistrer
      </Button>
    )
    // loading=true remplace le contenu par le Spinner — le bouton reste
    // repérable par son role, jamais par son texte d'origine dans cet état.
    const button = screen.getByRole('button')
    expect(button).toBeDisabled()
    fireEvent.click(button)
    expect(onClick).not.toHaveBeenCalled()
  })

  it('affiche loadingText pendant le chargement au lieu du contenu normal', () => {
    render(
      <Button loading loadingText="Envoi en cours…">
        Envoyer
      </Button>
    )
    expect(screen.getByText('Envoi en cours…')).toBeInTheDocument()
    expect(screen.queryByText('Envoyer')).not.toBeInTheDocument()
  })

  it("n'affiche jamais deux fois le texte de secours du Spinner sans loadingText", () => {
    render(<Button loading>Envoyer</Button>)
    expect(screen.queryByText('Envoyer')).not.toBeInTheDocument()
  })

  it('transmet la ref au véritable élément <button> du DOM', () => {
    let node: HTMLButtonElement | null = null
    render(
      <Button
        ref={(el) => {
          node = el
        }}
      >
        Cible
      </Button>
    )
    expect(node).toBeInstanceOf(HTMLButtonElement)
  })

  it('fusionne un style personnalisé sans écraser les propriétés de base', () => {
    render(<Button style={{ marginTop: 12 }}>Avec marge</Button>)
    const button = screen.getByRole('button', { name: 'Avec marge' })
    expect(button).toHaveStyle({ marginTop: '12px' })
    // La taille minimale tactile (44px, accessibilité) doit survivre à la
    // fusion avec un style personnalisé — jamais silencieusement écrasée.
    expect(button).toHaveStyle({ minHeight: '44px' })
  })
})
