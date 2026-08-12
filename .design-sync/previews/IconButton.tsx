import { IconButton } from 'liveinblack-ui'
import { Music4, Shuffle, Trash2, Heart } from 'lucide-react'
import { Stage } from './_stage'

export const Tones = () => (
  <Stage>
    <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
      <IconButton label="Rouvrir l'ambiance musicale" icon={<Music4 size={16} strokeWidth={1.8} aria-hidden="true" />} />
      <IconButton label="Un titre au hasard" icon={<Shuffle size={16} strokeWidth={2} aria-hidden="true" />} tone="accent" />
      <IconButton label="Supprimer" icon={<Trash2 size={16} strokeWidth={2} aria-hidden="true" />} tone="danger" />
    </div>
  </Stage>
)

export const Sizes = () => (
  <Stage>
    <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
      <IconButton label="Favori" icon={<Heart size={13} strokeWidth={2.4} aria-hidden="true" />} tone="accent" size={32} />
      <IconButton label="Favori" icon={<Heart size={16} strokeWidth={2} aria-hidden="true" />} tone="accent" size={44} />
    </div>
  </Stage>
)
