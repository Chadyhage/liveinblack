import type { MenuItemRow } from './MenuItemEditor'

export interface ArtistRow {
  name: string
  role: string
  providerId?: string | null
}

export interface PlaceRow {
  key: string
  id: string
  type: string
  price: number
  qty: number
  sold: number
  maxPerAccount: number
  groupType: 'solo' | 'group'
  groupMin: number
  groupMax: number
  cancellationOptionEnabled: boolean
  photos: string[]
  included: { name: string; qty: number }[]
}

export interface EventFormInput {
  name: string
  subtitle?: string
  description?: string
  category?: string
  tags?: string[]
  eventType?: string
  musicStyles?: string[]
  ambiances?: string[]
  date: string
  time?: string
  endTime?: string
  location?: string
  city: string
  region: string
  imageUrl?: string | null
  videoUrl?: string | null
  places: Array<{
    id: string
    type: string
    price: number
    total: number
    icon?: string
    maxPerAccount?: number
    groupType?: 'solo' | 'group'
    groupMin?: number
    groupMax?: number
    cancellationOptionEnabled?: boolean
    photos?: string[]
    included?: { name: string; qty: number }[]
  }>
  playlist?: boolean
  preorder?: boolean
  menu?: MenuItemRow[] | null
  artists?: { name: string; role?: string; providerId?: string | null }[]
  dj?: string
  performers?: string[]
  minAge?: number
  publishAt?: string | null
  closingDate?: string | null
}

export interface EventWizardSnapshotInput {
  name: string
  subtitle: string
  description: string
  dateStr: string
  timeStart: string
  timeEnd: string
  artists: ArtistRow[]
  category: string
  customGenre: string
  partyType: string
  musicStyles: string[]
  ambiances: string[]
  minAge: number
  imageUrl: string | null
  videoUrl: string | null
  places: PlaceRow[]
  venueName: string
  address: string
  city: string
  region: string
  playlist: boolean
  preorder: boolean
  menuItems: MenuItemRow[]
  publishAt: string
  closingDate: string
}

export interface BuildEventPayloadInput {
  name: string
  subtitle: string
  description: string
  category: string
  customGenre: string
  partyType: string
  musicStyles: string[]
  ambiances: string[]
  artists: ArtistRow[]
  minAge: number
  imageUrl: string | null
  videoUrl: string | null
  places: PlaceRow[]
  venueName: string
  address: string
  city: string
  region: string
  playlist: boolean
  preorder: boolean
  menuItems: MenuItemRow[]
  publishAt: string
  closingDate: string
  dateStr: string
  timeStart: string
  timeEnd: string
}

export function makeLocalKey(): string {
  return 'k' + Math.random().toString(36).slice(2, 9)
}

export function defaultPlaceRow(): PlaceRow {
  return {
    key: makeLocalKey(),
    id: '',
    type: 'Entrée libre',
    price: 0,
    qty: 100,
    sold: 0,
    maxPerAccount: 0,
    groupType: 'solo',
    groupMin: 0,
    groupMax: 0,
    cancellationOptionEnabled: false,
    photos: [],
    included: [],
  }
}

export function newPlaceRow(): PlaceRow {
  return {
    key: makeLocalKey(),
    id: '',
    type: '',
    price: 0,
    qty: 50,
    sold: 0,
    maxPerAccount: 0,
    groupType: 'solo',
    groupMin: 0,
    groupMax: 0,
    cancellationOptionEnabled: false,
    photos: [],
    included: [],
  }
}

export function toDatetimeLocalValue(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function fromDatetimeLocalValue(v: string): string | null {
  return v?.trim() || null
}

export function snapshotEventWizardForm(input: EventWizardSnapshotInput): string {
  return JSON.stringify(input)
}

export function validateWizardBasics(input: {
  name: string
  dateStr: string
  timeStart: string
  timeEnd: string
  locked: boolean
  today?: Date
}): Record<string, string> {
  const errs: Record<string, string> = {}
  if (!input.name.trim()) errs.name = 'Le nom est obligatoire'
  if (!input.dateStr) {
    errs.date = 'La date est obligatoire'
  } else if (!input.locked) {
    const today = input.today ? new Date(input.today) : new Date()
    today.setHours(0, 0, 0, 0)
    const picked = new Date(input.dateStr + 'T00:00:00')
    if (picked < today) errs.date = 'La date que tu as choisie est déjà passée'
  }
  if (input.timeStart && input.timeEnd && input.timeStart === input.timeEnd) {
    errs.timeEnd = "L'heure de fin doit être différente de l'heure de début"
  }
  return errs
}

export function validateWizardPlaces(places: PlaceRow[]): Record<string, string> {
  const errs: Record<string, string> = {}
  places.forEach((p) => {
    if (!p.type.trim()) errs[`place_${p.key}`] = 'Donne un nom à cette place'
    else if (p.groupType === 'group' && (Number(p.price) || 0) <= 0) errs[`place_${p.key}`] = 'Une table de groupe doit avoir un prix (supérieur à 0)'
  })
  return errs
}

export function validateWizardLocation(input: { city: string; region: string }): Record<string, string> {
  const errs: Record<string, string> = {}
  if (!input.city.trim()) errs.city = 'La ville est obligatoire'
  if (!input.region) errs.region = 'Choisis une région'
  return errs
}

export function getValidMenuItems(menuItems: MenuItemRow[]): MenuItemRow[] {
  return menuItems
    .filter((i) => i.name.trim() && i.price > 0)
    .map((item) => ({
      ...item,
      name: item.name.trim(),
      showOptions: item.hasShow
        ? item.showOptions
            .filter((option) => option.label.trim())
            .map((option) => ({ ...option, label: option.label.trim(), infoPrompt: option.infoPrompt.trim() }))
        : [],
    }))
}

export function canProceedWizardAdvancedStep(preorder: boolean, menuItems: MenuItemRow[]): boolean {
  return !preorder || getValidMenuItems(menuItems).length > 0
}

function sanitizeIncluded(list: { name: string; qty: number }[]) {
  return list.map((inc) => ({ name: inc.name.trim(), qty: Math.max(1, Number(inc.qty) || 1) })).filter((inc) => inc.name)
}

export function buildEventPayload(input: BuildEventPayloadInput): EventFormInput {
  const finalCategory = input.category === 'Autre' ? input.customGenre.trim() || 'Autre' : input.category
  const tags = [input.partyType, ...input.musicStyles, ...input.ambiances].filter(Boolean).slice(0, 6)
  const filteredArtists = input.artists
    .filter((a) => a.name.trim())
    .map((a) => ({ name: a.name.trim(), role: a.role, providerId: a.providerId || null }))
  const dj = filteredArtists.length > 0 ? filteredArtists.map((a) => a.name).join(', ') : ''
  const validMenuItems = getValidMenuItems(input.menuItems)
  const anyIncluded = input.places.some((p) => p.included.length > 0)
  const locationValue = [input.venueName.trim(), input.address.trim()].filter(Boolean).join(', ')

  return {
    name: input.name.trim(),
    subtitle: input.subtitle.trim() || input.description.trim().slice(0, 60),
    description: input.description.trim(),
    category: finalCategory,
    tags,
    eventType: input.partyType,
    musicStyles: input.musicStyles,
    ambiances: input.ambiances,
    date: input.dateStr,
    time: input.timeStart || '22:00',
    endTime: input.timeEnd || '05:00',
    location: locationValue,
    city: input.city.trim(),
    region: input.region,
    imageUrl: input.imageUrl,
    videoUrl: input.videoUrl,
    places: input.places.map((p) => ({
      id: p.id,
      type: p.type.trim() || 'Entrée',
      price: Number(p.price) || 0,
      total: Number(p.qty) || 0,
      icon: '',
      maxPerAccount: p.groupType === 'group' ? 1 : Number(p.maxPerAccount) || 0,
      groupType: p.groupType,
      groupMin: Number(p.groupMin) || 0,
      groupMax: Number(p.groupMax) || 0,
      cancellationOptionEnabled: Boolean(p.cancellationOptionEnabled),
      photos: p.photos,
      included: sanitizeIncluded(p.included),
    })),
    playlist: input.playlist,
    preorder: input.preorder,
    menu: input.preorder || anyIncluded ? validMenuItems : null,
    artists: filteredArtists,
    dj,
    performers: [],
    minAge: input.minAge,
    publishAt: fromDatetimeLocalValue(input.publishAt),
    closingDate: fromDatetimeLocalValue(input.closingDate),
  }
}
