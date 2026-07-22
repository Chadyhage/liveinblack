export interface ShowOption {
  id: string
  label: string
  requiresInfo: boolean
  infoPrompt: string
  excludedPlaces: string[]
}

function cleanStrings(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return [...new Set(value.filter((entry): entry is string => typeof entry === 'string').map((entry) => entry.trim()).filter(Boolean))].slice(0, 50)
}

function fallbackId(index: number, label: string): string {
  const slug = label
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 32)
  return `show-${index + 1}-${slug || 'option'}`
}

// Les tout premiers événements migrés stockaient showOptions sous forme de
// string[]. Cette normalisation maintient leur lecture tout en exposant une
// forme riche et stable aux nouveaux écrans.
export function normalizeShowOptions(value: unknown): ShowOption[] {
  if (!Array.isArray(value)) return []

  const ids = new Set<string>()
  const options: ShowOption[] = []
  value.slice(0, 20).forEach((entry, index) => {
    const raw = typeof entry === 'string' ? { label: entry } : entry && typeof entry === 'object' ? (entry as Record<string, unknown>) : null
    if (!raw) return
    const label = typeof raw.label === 'string' ? raw.label.trim().slice(0, 160) : ''
    if (!label) return
    const requestedId = typeof raw.id === 'string' ? raw.id.trim().replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 80) : ''
    let id = requestedId || fallbackId(index, label)
    if (ids.has(id)) id = `${fallbackId(index, label)}-${index + 1}`
    ids.add(id)
    options.push({
      id,
      label,
      requiresInfo: raw.requiresInfo === true,
      infoPrompt: typeof raw.infoPrompt === 'string' ? raw.infoPrompt.trim().slice(0, 240) : '',
      excludedPlaces: cleanStrings(raw.excludedPlaces),
    })
  })
  return options
}
