'use client'

import { useState } from 'react'
import type { ReactNode } from 'react'
import Button from './Button'
import { ChevronDown } from 'lucide-react'

export interface AccordionItem {
  question: ReactNode
  answer: ReactNode
}

// Accordéon FAQ custom — remplace le patron `openFaq === i ? ... : null` +
// bouton chevron rotatif dupliqué dans les écrans support/FAQ. Un seul item
// ouvert à la fois (comportement déjà en place partout où ce patron existait).
export default function Accordion({ items }: { items: AccordionItem[] }) {
  const [openIndex, setOpenIndex] = useState<number | null>(null)
  return (
    <div>
      {items.map((item, i) => (
        <div key={i} style={{ borderTop: i > 0 ? '1px solid var(--border)' : 'none' }}>
          <Button
            onClick={() => setOpenIndex(openIndex === i ? null : i)}
            variant="ghost"
            fullWidth
            style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '13px 0', color: 'var(--text)', fontSize: 13.5, textAlign: 'left' }}
          >
            {item.question}
            <ChevronDown size={17} strokeWidth={1.8} aria-hidden="true" style={{ transform: openIndex === i ? 'rotate(180deg)' : 'none', transition: 'transform .2s ease', color: 'var(--teal)', flexShrink: 0 }} />
          </Button>
          {openIndex === i && <div style={{ fontSize: 12.5, color: 'var(--text-muted)', lineHeight: 1.6, margin: '0 0 14px' }}>{item.answer}</div>}
        </div>
      ))}
    </div>
  )
}
