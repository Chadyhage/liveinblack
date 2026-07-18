// src/components/icons.jsx
// Icônes SVG cohérentes (style Lucide) — remplacent les emojis utilisés comme icônes
// Convention : strokeWidth=1.7, line-cap round, viewBox 24x24

const STROKE = 1.7

function svgProps(size, color) {
  return {
    width: size, height: size, viewBox: '0 0 24 24',
    fill: 'none', stroke: color, strokeWidth: STROKE,
    strokeLinecap: 'round', strokeLinejoin: 'round',
  }
}

// Build / Tent (organisateur)
export function IconTent({ size = 24, color = 'currentColor' }) {
  return (
    <svg {...svgProps(size, color)}>
      <path d="M12 3 L3 21 L21 21 Z" />
      <path d="M12 3 L12 21" />
      <path d="M9 21 L12 14 L15 21" />
    </svg>
  )
}

// Microphone (prestataire / artiste)
export function IconMic({ size = 24, color = 'currentColor' }) {
  return (
    <svg {...svgProps(size, color)}>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0" />
      <line x1="12" y1="18" x2="12" y2="22" />
      <line x1="8" y1="22" x2="16" y2="22" />
    </svg>
  )
}

// Hourglass (en attente / pending)
export function IconHourglass({ size = 24, color = 'currentColor' }) {
  return (
    <svg {...svgProps(size, color)}>
      <path d="M6 2 H18" />
      <path d="M6 22 H18" />
      <path d="M6 2 V6 a6 6 0 0 0 12 0 V2" />
      <path d="M6 22 V18 a6 6 0 0 1 12 0 V22" />
    </svg>
  )
}

// Lock (sécurité / verrouillé)
export function IconLock({ size = 24, color = 'currentColor' }) {
  return (
    <svg {...svgProps(size, color)}>
      <rect x="4" y="11" width="16" height="10" rx="2" />
      <path d="M8 11 V7 a4 4 0 0 1 8 0 V11" />
    </svg>
  )
}

// Mail (contact / email)
export function IconMail({ size = 24, color = 'currentColor' }) {
  return (
    <svg {...svgProps(size, color)}>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M3 7 L12 13 L21 7" />
    </svg>
  )
}

// Badge ID (carte d'identification / accréditation)
export function IconIdBadge({ size = 24, color = 'currentColor' }) {
  return (
    <svg {...svgProps(size, color)}>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <circle cx="9" cy="10" r="2.5" />
      <path d="M5 17 a4 4 0 0 1 8 0" />
      <line x1="15" y1="9" x2="19" y2="9" />
      <line x1="15" y1="13" x2="19" y2="13" />
    </svg>
  )
}

// Edit / Pencil
export function IconEdit({ size = 24, color = 'currentColor' }) {
  return (
    <svg {...svgProps(size, color)}>
      <path d="M11 4H4 a2 2 0 0 0 -2 2 v14 a2 2 0 0 0 2 2 h14 a2 2 0 0 0 2 -2 v-7" />
      <path d="M18.5 2.5 a2.121 2.121 0 0 1 3 3 L12 15 l-4 1 1-4 9.5-9.5z" />
    </svg>
  )
}

// Trash
export function IconTrash({ size = 24, color = 'currentColor' }) {
  return (
    <svg {...svgProps(size, color)}>
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6 l-1 14 a2 2 0 0 1 -2 2 H8 a2 2 0 0 1 -2 -2 L5 6" />
      <path d="M10 11 v6" />
      <path d="M14 11 v6" />
      <path d="M9 6 V4 a1 1 0 0 1 1 -1 h4 a1 1 0 0 1 1 1 v2" />
    </svg>
  )
}

// Calendar (réservations)
export function IconCalendar({ size = 24, color = 'currentColor' }) {
  return (
    <svg {...svgProps(size, color)}>
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  )
}

// Lightning bolt (boost)
export function IconBolt({ size = 24, color = 'currentColor' }) {
  return (
    <svg {...svgProps(size, color)}>
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    </svg>
  )
}

// Crown (auction winner / prestige)
export function IconCrown({ size = 24, color = 'currentColor' }) {
  return (
    <svg {...svgProps(size, color)}>
      <path d="M3 18 L5 8 L9 12 L12 6 L15 12 L19 8 L21 18 Z" />
      <line x1="5" y1="22" x2="19" y2="22" />
    </svg>
  )
}

// Bell (notifications)
export function IconBell({ size = 24, color = 'currentColor' }) {
  return (
    <svg {...svgProps(size, color)}>
      <path d="M18 8 a6 6 0 0 0 -12 0 c0 7 -3 9 -3 9 h18 s-3 -2 -3 -9" />
      <path d="M13.7 21 a2 2 0 0 1 -3.4 0" />
    </svg>
  )
}

// Settings / Cog
export function IconSettings({ size = 24, color = 'currentColor' }) {
  return (
    <svg {...svgProps(size, color)}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1 -2.83 0 l-.06 -.06 a1.65 1.65 0 0 0 -1.82 -.33 1.65 1.65 0 0 0 -1 1.51V21 a2 2 0 0 1 -2 2 2 2 0 0 1 -2 -2 v-.09 A1.65 1.65 0 0 0 9 19.4 a1.65 1.65 0 0 0 -1.82 .33 l-.06 .06 a2 2 0 0 1 -2.83 0 2 2 0 0 1 0 -2.83 l.06 -.06 a1.65 1.65 0 0 0 .33 -1.82 1.65 1.65 0 0 0 -1.51 -1H3 a2 2 0 0 1 -2 -2 2 2 0 0 1 2 -2 h.09 A1.65 1.65 0 0 0 4.6 9 a1.65 1.65 0 0 0 -.33 -1.82 l-.06 -.06 a2 2 0 0 1 0 -2.83 2 2 0 0 1 2.83 0 l.06 .06 a1.65 1.65 0 0 0 1.82 .33 H9 a1.65 1.65 0 0 0 1 -1.51V3 a2 2 0 0 1 2 -2 2 2 0 0 1 2 2 v.09 A1.65 1.65 0 0 0 15 4.6 a1.65 1.65 0 0 0 1.82 -.33 l.06 -.06 a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83 l-.06 .06 a1.65 1.65 0 0 0 -.33 1.82 V9 a1.65 1.65 0 0 0 1.51 1H21 a2 2 0 0 1 2 2 2 2 0 0 1 -2 2 h-.09 A1.65 1.65 0 0 0 19.4 15 z" />
    </svg>
  )
}

// Pin (location / map)
export function IconPin({ size = 24, color = 'currentColor' }) {
  return (
    <svg {...svgProps(size, color)}>
      <path d="M21 10 c0 7 -9 13 -9 13 s-9 -6 -9 -13 a9 9 0 0 1 18 0 z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  )
}

// Ticket
export function IconTicket({ size = 24, color = 'currentColor' }) {
  return (
    <svg {...svgProps(size, color)}>
      <path d="M3 10 V8 a2 2 0 0 1 2 -2 h14 a2 2 0 0 1 2 2 v2 a2 2 0 0 0 0 4 v2 a2 2 0 0 1 -2 2 H5 a2 2 0 0 1 -2 -2 v-2 a2 2 0 0 0 0 -4 z" />
      <line x1="13" y1="6" x2="13" y2="18" strokeDasharray="2 2" />
    </svg>
  )
}

// Speech bubble (chat / message)
export function IconChat({ size = 24, color = 'currentColor' }) {
  return (
    <svg {...svgProps(size, color)}>
      <path d="M21 15 a2 2 0 0 1 -2 2 H7 l-4 4 V5 a2 2 0 0 1 2 -2 h14 a2 2 0 0 1 2 2 z" />
    </svg>
  )
}

// Group / Users (group)
export function IconUsers({ size = 24, color = 'currentColor' }) {
  return (
    <svg {...svgProps(size, color)}>
      <path d="M17 21 v-2 a4 4 0 0 0 -4 -4 H5 a4 4 0 0 0 -4 4 v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21 v-2 a4 4 0 0 0 -3 -3.87" />
      <path d="M16 3.13 a4 4 0 0 1 0 7.75" />
    </svg>
  )
}

// Check / Confirmed
export function IconCheck({ size = 24, color = 'currentColor' }) {
  return (
    <svg {...svgProps(size, color)}>
      <polyline points="20 6 9 17 4 12" />
    </svg>
  )
}

// Alert / Warning
export function IconAlert({ size = 24, color = 'currentColor' }) {
  return (
    <svg {...svgProps(size, color)}>
      <path d="M10.29 3.86 L1.82 18 a2 2 0 0 0 1.71 3 h16.94 a2 2 0 0 0 1.71 -3 L13.71 3.86 a2 2 0 0 0 -3.42 0 z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12" y2="17" />
    </svg>
  )
}
