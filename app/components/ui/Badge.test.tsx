import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import Badge, { type BadgeTone } from './Badge'

describe('Badge', () => {
  it('affiche son contenu', () => {
    render(<Badge>Nouveau</Badge>)
    expect(screen.getByText('Nouveau')).toBeInTheDocument()
  })

  it('applique la teinte "neutral" par défaut', () => {
    render(<Badge>Standard</Badge>)
    expect(screen.getByText('Standard')).toHaveStyle({ color: 'var(--text-muted)' })
  })

  // Table de vérité sur chaque teinte plutôt qu'un seul cas — le style de
  // fond/texte de CHAQUE teinte est une décision produit (badges de statut
  // partout dans l'app : boosts, candidatures, rôles). Une régression sur
  // UNE seule teinte doit faire échouer le test correspondant, pas
  // silencieusement passer parce qu'on n'a vérifié qu'un cas au hasard.
  const tones: { tone: BadgeTone; color: string }[] = [
    { tone: 'teal', color: 'var(--primary)' },
    { tone: 'gold', color: 'var(--gold)' },
    { tone: 'pink', color: 'var(--pink)' },
    { tone: 'violet', color: 'var(--violet)' },
    { tone: 'danger', color: '#e05a5a' },
    { tone: 'neutral', color: 'var(--text-muted)' },
  ]
  it.each(tones)('teinte $tone applique la couleur de texte attendue', ({ tone, color }) => {
    render(<Badge tone={tone}>Label</Badge>)
    expect(screen.getByText('Label')).toHaveStyle({ color })
  })
})
