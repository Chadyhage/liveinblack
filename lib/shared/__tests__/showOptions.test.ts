import { describe, expect, it } from 'vitest'
import { normalizeShowOptions } from '../showOptions'

describe('normalizeShowOptions', () => {
  it('conserve les anciennes options texte avec un identifiant stable', () => {
    expect(normalizeShowOptions(['Pancarte anniversaire'])).toEqual([
      { id: 'show-1-pancarte-anniversaire', label: 'Pancarte anniversaire', requiresInfo: false, infoPrompt: '', excludedPlaces: [] },
    ])
  })

  it('nettoie la forme riche et retire les options sans libellé', () => {
    expect(normalizeShowOptions([
      { id: 'show_1', label: '  Étincelles  ', requiresInfo: true, infoPrompt: '  Quel prénom ? ', excludedPlaces: ['Standard', 'Standard', ''] },
      { id: 'empty', label: '   ' },
    ])).toEqual([
      { id: 'show_1', label: 'Étincelles', requiresInfo: true, infoPrompt: 'Quel prénom ?', excludedPlaces: ['Standard'] },
    ])
  })
})
