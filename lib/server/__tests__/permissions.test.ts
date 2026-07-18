import { describe, it, expect } from 'vitest'
import {
  canBook,
  canCreateEvent,
  canProposeServices,
  canAdminister,
  getBookingBlockedReason,
  getCreateEventBlockedReason,
} from '../permissions'

describe('canBook', () => {
  it('refuse un visiteur non connecté', () => {
    expect(canBook(null)).toBe(false)
  })
  it('refuse un compte client en attente ou rejeté', () => {
    expect(canBook({ activeRole: 'client', status: 'pending' })).toBe(false)
    expect(canBook({ activeRole: 'client', status: 'rejected' })).toBe(false)
  })
  it('autorise un client actif', () => {
    expect(canBook({ activeRole: 'client', status: 'active' })).toBe(true)
  })
  it('refuse organisateur/prestataire/agent', () => {
    expect(canBook({ activeRole: 'organisateur', status: 'active' })).toBe(false)
    expect(canBook({ activeRole: 'prestataire', status: 'active' })).toBe(false)
    expect(canBook({ activeRole: 'agent', status: 'active' })).toBe(false)
  })
})

describe('canCreateEvent', () => {
  it('autorise organisateur actif, refuse organisateur en attente', () => {
    expect(canCreateEvent({ activeRole: 'organisateur', status: 'active' })).toBe(true)
    expect(canCreateEvent({ activeRole: 'organisateur', status: 'pending' })).toBe(false)
  })
  it('autorise agent', () => {
    expect(canCreateEvent({ activeRole: 'agent', status: 'active' })).toBe(true)
  })
  it('refuse client et prestataire', () => {
    expect(canCreateEvent({ activeRole: 'client', status: 'active' })).toBe(false)
    expect(canCreateEvent({ activeRole: 'prestataire', status: 'active' })).toBe(false)
  })
  it('refuse un organisateur rejeté ou suspendu (#9 phase agent/admin) — pas seulement en attente', () => {
    expect(canCreateEvent({ activeRole: 'organisateur', status: 'active', orgStatus: 'rejected' })).toBe(false)
    expect(canCreateEvent({ activeRole: 'organisateur', status: 'rejected' })).toBe(false)
  })
  it('lit orgStatus en priorité sur le statut de compte global (#7 phase organisateur)', () => {
    // Un organisateur déjà actif (status global 'active') qui candidate en
    // plus comme prestataire ne doit PAS perdre l'accès à /mes-evenements
    // pendant la review du second dossier — orgStatus reste 'active' même
    // si un futur prestStatus passe à 'pending' séparément.
    expect(canCreateEvent({ activeRole: 'organisateur', status: 'active', orgStatus: 'active' })).toBe(true)
    expect(canCreateEvent({ activeRole: 'organisateur', status: 'active', orgStatus: 'pending' })).toBe(false)
    // Statut global 'pending' mais orgStatus déjà 'active' (compte multi-rôle
    // dont une autre interface est en cours de review) : orgStatus l'emporte.
    expect(canCreateEvent({ activeRole: 'organisateur', status: 'pending', orgStatus: 'active' })).toBe(true)
  })
})

describe('canProposeServices', () => {
  it('autorise prestataire non rejeté (y compris en attente)', () => {
    expect(canProposeServices({ activeRole: 'prestataire', status: 'active' })).toBe(true)
    expect(canProposeServices({ activeRole: 'prestataire', status: 'pending' })).toBe(true)
  })
  it('refuse prestataire rejeté', () => {
    expect(canProposeServices({ activeRole: 'prestataire', status: 'rejected' })).toBe(false)
  })
  it('lit prestStatus en priorité sur le statut de compte global', () => {
    expect(canProposeServices({ activeRole: 'prestataire', status: 'active', prestStatus: 'rejected' })).toBe(false)
    expect(canProposeServices({ activeRole: 'prestataire', status: 'rejected', prestStatus: 'active' })).toBe(true)
  })
})

describe('canAdminister', () => {
  it('seul le rôle actif agent administre', () => {
    expect(canAdminister({ activeRole: 'agent', status: 'active' })).toBe(true)
    expect(canAdminister({ activeRole: 'client', status: 'active' })).toBe(false)
  })
})

describe('messages de blocage', () => {
  it('getBookingBlockedReason explique chaque cas de refus', () => {
    expect(getBookingBlockedReason(null)).toMatch(/Connecte-toi/)
    expect(getBookingBlockedReason({ activeRole: 'organisateur', status: 'active' })).toMatch(/organisateurs/)
    expect(getBookingBlockedReason({ activeRole: 'client', status: 'active' })).toBeNull()
  })
  it('getCreateEventBlockedReason explique chaque cas de refus', () => {
    expect(getCreateEventBlockedReason({ activeRole: 'client', status: 'active' })).toMatch(/organisateurs/)
    expect(getCreateEventBlockedReason({ activeRole: 'organisateur', status: 'active' })).toBeNull()
  })
})
