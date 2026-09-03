import { describe, expect, it } from 'vitest'
import { buildEventPayload, canProceedWizardAdvancedStep, defaultPlaceRow, validateWizardBasics, validateWizardLocation, validateWizardPlaces } from '../eventWizardUtils'
import { emptyMenuItem } from '../MenuItemEditor'

describe('eventWizardUtils', () => {
  it('valide les bases du wizard avec la date et les horaires', () => {
    expect(
      validateWizardBasics({
        name: '',
        dateStr: '2026-08-19',
        timeStart: '22:00',
        timeEnd: '22:00',
        locked: false,
        today: new Date('2026-08-20T10:00:00Z'),
      })
    ).toEqual({
      name: 'Le nom est obligatoire',
      date: 'La date que tu as choisie est déjà passée',
      timeEnd: "L'heure de fin doit être différente de l'heure de début",
    })
  })

  it('ignore la date passée quand l’événement est verrouillé', () => {
    expect(
      validateWizardBasics({
        name: 'Soirée',
        dateStr: '2026-08-19',
        timeStart: '22:00',
        timeEnd: '04:00',
        locked: true,
        today: new Date('2026-08-20T10:00:00Z'),
      })
    ).toEqual({})
  })

  it('valide les places groupe et le lieu', () => {
    const groupPlace = { ...defaultPlaceRow(), key: 'p1', type: 'Table VIP', groupType: 'group' as const, price: 0 }
    expect(validateWizardPlaces([groupPlace])).toEqual({
      place_p1: 'Une table de groupe doit avoir un prix (supérieur à 0)',
    })

    expect(validateWizardLocation({ city: '', region: '' })).toEqual({
      city: 'La ville est obligatoire',
      region: 'Choisis une région',
    })
  })

  it('bloque la progression avancée sans article valable en précommande', () => {
    expect(canProceedWizardAdvancedStep(true, [emptyMenuItem()])).toBe(false)
    expect(
      canProceedWizardAdvancedStep(true, [
        {
          ...emptyMenuItem(),
          name: 'Burger',
          price: 14,
        },
      ])
    ).toBe(true)
  })

  it('construit un payload propre et garde les inclus non liés au menu', () => {
    const payload = buildEventPayload({
      name: '  Nuit Black  ',
      subtitle: '',
      description: 'Une longue description de soirée premium avec line-up invité.',
      category: 'Autre',
      customGenre: 'Baile Funk',
      partyType: 'Rooftop',
      musicStyles: ['Amapiano'],
      ambiances: ['VIP'],
      artists: [{ name: '  DJ Nala  ', role: 'DJ', providerId: 'prov_1' }],
      minAge: 21,
      imageUrl: 'https://img.test/poster.jpg',
      videoUrl: null,
      places: [
        {
          ...defaultPlaceRow(),
          key: 'p1',
          id: 'place_1',
          type: '  Table Or ',
          price: 300,
          qty: 8,
          groupType: 'group',
          maxPerAccount: 9,
          cancellationOptionEnabled: true,
          included: [{ name: ' Vestiaire offert ', qty: 0 }],
        },
      ],
      venueName: ' Skyline ',
      address: ' 12 rue des Arts ',
      city: ' Paris ',
      region: 'IDF',
      playlist: true,
      preorder: true,
      menuItems: [
        {
          ...emptyMenuItem(),
          name: ' Champagne ',
          price: 120,
          hasShow: true,
          showOptions: [
            { id: 'show_1', label: '  Scintillants ', requiresInfo: false, infoPrompt: '  Message LED ', excludedPlaces: [] },
            { id: 'show_2', label: ' ', requiresInfo: false, infoPrompt: 'ignoré', excludedPlaces: [] },
          ],
        },
      ],
      publishAt: '2026-08-20T21:15',
      closingDate: '',
      dateStr: '2026-09-01',
      timeStart: '',
      timeEnd: '',
    })

    expect(payload).toMatchObject({
      name: 'Nuit Black',
      subtitle: 'Une longue description de soirée premium avec line-up invité',
      category: 'Baile Funk',
      eventType: 'Rooftop',
      date: '2026-09-01',
      time: '22:00',
      endTime: '05:00',
      location: 'Skyline, 12 rue des Arts',
      city: 'Paris',
      region: 'IDF',
      dj: 'DJ Nala',
      artists: [{ name: 'DJ Nala', role: 'DJ', providerId: 'prov_1' }],
      minAge: 21,
    })
    expect(payload.places).toEqual([
      expect.objectContaining({
        id: 'place_1',
        type: 'Table Or',
        maxPerAccount: 1,
        cancellationOptionEnabled: true,
        included: [{ name: 'Vestiaire offert', qty: 1 }],
      }),
    ])
    expect(payload.menu).toEqual([
      expect.objectContaining({
        name: 'Champagne',
        showOptions: [expect.objectContaining({ label: 'Scintillants', infoPrompt: 'Message LED' })],
      }),
    ])
    expect(payload.publishAt).toBe('2026-08-20T21:15')
    expect(payload.closingDate).toBeNull()
  })
})
