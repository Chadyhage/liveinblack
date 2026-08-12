import { describe, expect, it } from 'vitest'
import { mergeMessagesById } from './mergeMessages'

// Extrait de MessagesClient.tsx (~3900 lignes, jusqu'ici zéro test) —
// utilisé à la fois par le chargement d'historique (loadOlderMessages,
// `before` en tête) et par le flux live SSE ajouté dans cette session
// (nouveaux messages en fin de fil). Un bug ici produirait soit des
// messages dupliqués visibles à l'écran, soit un fil dans le mauvais ordre
// — silencieux tant que personne ne le remarque en prod.
type Msg = { id: string; content: string }

function msg(id: string, content = ''): Msg {
  return { id, content }
}

describe('mergeMessagesById', () => {
  it('fusionne deux listes sans doublon', () => {
    const result = mergeMessagesById([msg('1'), msg('2')], [msg('3')])
    expect(result.map((m) => m.id)).toEqual(['1', '2', '3'])
  })

  it('trie toujours par id croissant, quel que soit l’ordre d’entrée', () => {
    const result = mergeMessagesById([msg('3'), msg('1')], [msg('2')])
    expect(result.map((m) => m.id)).toEqual(['1', '2', '3'])
  })

  it('déduplique un id présent dans les deux listes (chevauchement de fenêtre)', () => {
    const result = mergeMessagesById([msg('1'), msg('2')], [msg('2'), msg('3')])
    expect(result.map((m) => m.id)).toEqual(['1', '2', '3'])
  })

  it('la version la plus récente (`existing`) gagne en cas de conflit sur le même id', () => {
    // Cas réel : un message édité arrive via SSE (`existing`) alors que
    // l'ancienne version était déjà affichée depuis le chargement initial
    // (`older`) — c'est la version la plus à jour qui doit s'afficher,
    // jamais l'ancienne.
    const result = mergeMessagesById([msg('1', 'ancien contenu')], [msg('1', 'contenu édité')])
    expect(result).toHaveLength(1)
    expect(result[0].content).toBe('contenu édité')
  })

  it('gère deux listes vides sans erreur', () => {
    expect(mergeMessagesById([], [])).toEqual([])
  })

  it('gère une seule liste vide', () => {
    expect(mergeMessagesById([], [msg('1')]).map((m) => m.id)).toEqual(['1'])
    expect(mergeMessagesById([msg('1')], []).map((m) => m.id)).toEqual(['1'])
  })
})
