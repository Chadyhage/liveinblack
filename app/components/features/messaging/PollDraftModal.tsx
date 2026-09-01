'use client'

import { Button, Input } from '@/app/components/ui'
import { ModalActions, ModalShell } from './MessagingModals'

const inputStyle: React.CSSProperties = {
  width: '100%',
  borderRadius: 14,
  border: '1px solid var(--border)',
  background: 'var(--field-bg)',
  color: 'var(--text)',
  fontSize: 'var(--font-size-body-sm)',
  marginBottom: 10,
  fontFamily: 'inherit',
}

export default function PollDraftModal({
  draft,
  onChange,
  onSubmit,
  onClose,
}: {
  draft: { question: string; options: string[] }
  onChange: (next: { question: string; options: string[] }) => void
  onSubmit: () => void
  onClose: () => void
}) {
  const normalized = draft.options.map((o) => o.trim().toLowerCase())
  const duplicateIndexes = new Set<number>()
  normalized.forEach((val, i) => {
    if (!val) return
    if (normalized.indexOf(val) !== i) {
      duplicateIndexes.add(i)
      duplicateIndexes.add(normalized.indexOf(val))
    }
  })
  const hasBlankOption = normalized.some((val) => !val)
  const hasDuplicate = duplicateIndexes.size > 0

  return (
    <ModalShell title="Nouveau sondage" onClose={onClose}>
      <Input value={draft.question} onChange={(e) => onChange({ ...draft, question: e.target.value })} placeholder="Question" style={inputStyle} autoFocus />
      {draft.options.map((opt, i) => (
        <Input
          key={i}
          value={opt}
          onChange={(e) => {
            const next = [...draft.options]
            next[i] = e.target.value
            onChange({ ...draft, options: next })
          }}
          placeholder={`Option ${i + 1}`}
          invalid={duplicateIndexes.has(i)}
          style={{ ...inputStyle, border: duplicateIndexes.has(i) ? '1px solid var(--pink)' : inputStyle.border }}
        />
      ))}
      {hasDuplicate ? <p style={{ fontSize: 'var(--font-size-caption-lg)', color: 'var(--pink)', margin: '-6px 0 10px' }}>Deux options ne peuvent pas être identiques.</p> : null}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        {draft.options.length < 6 ? (
          <Button variant="secondary" onClick={() => onChange({ ...draft, options: [...draft.options, ''] })} size="sm" style={{ borderRadius: 999 }}>
            + Option
          </Button>
        ) : null}
        {draft.options.length > 2 ? (
          <Button variant="secondary" onClick={() => onChange({ ...draft, options: draft.options.slice(0, -1) })} size="sm" style={{ borderRadius: 999 }}>
            − Option
          </Button>
        ) : null}
      </div>
      <ModalActions onCancel={onClose} onConfirm={onSubmit} confirmLabel="Envoyer" disabled={!draft.question.trim() || hasBlankOption || hasDuplicate} />
    </ModalShell>
  )
}
