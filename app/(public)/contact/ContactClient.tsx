'use client'

import { useState } from 'react'
import type { FormEvent } from 'react'
import LegalBackButton from '@/app/components/layout/LegalBackButton'
import { Button, Card, Input, Textarea, Label, Mascot } from '@/app/components/ui'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const CARD: React.CSSProperties = {
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius-lg)',
  boxShadow: '0 18px 46px rgba(var(--black-rgb), .22)',
}

type FormState = { name: string; email: string; subject: string; message: string }
type FieldErrors = Partial<Record<keyof FormState, string>>
type Status = 'idle' | 'submitting' | 'success' | 'error'

const INITIAL_STATE: FormState = { name: '', email: '', subject: '', message: '' }

function validate(form: FormState): FieldErrors {
  const errors: FieldErrors = {}
  if (!form.name.trim()) errors.name = 'Ton nom est requis.'
  if (!form.email.trim()) errors.email = 'Ton email est requis.'
  else if (!EMAIL_RE.test(form.email.trim())) errors.email = 'Format d’email invalide.'
  if (!form.subject.trim()) errors.subject = 'Un sujet est requis.'
  if (!form.message.trim()) errors.message = 'Un message est requis.'
  return errors
}

export default function ContactClient() {
  const [form, setForm] = useState<FormState>(INITIAL_STATE)
  const [errors, setErrors] = useState<FieldErrors>({})
  const [status, setStatus] = useState<Status>('idle')
  const [errorMessage, setErrorMessage] = useState('')

  function updateField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const cleanedForm: FormState = {
      name: form.name.trim(),
      email: form.email.trim().toLowerCase(),
      subject: form.subject.trim(),
      message: form.message.trim(),
    }
    const fieldErrors = validate(cleanedForm)
    setErrors(fieldErrors)
    if (Object.keys(fieldErrors).length > 0) return

    setStatus('submitting')
    setErrorMessage('')
    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cleanedForm),
      })
      if (!res.ok) {
        if (res.status === 429) {
          setErrorMessage('Trop de messages envoyés récemment. Réessaie un peu plus tard.')
        } else {
          setErrorMessage("L'envoi a échoué. Réessaie ou écris-nous directement par email.")
        }
        setStatus('error')
        return
      }
      setStatus('success')
      setForm(INITIAL_STATE)
    } catch {
      setErrorMessage("L'envoi a échoué. Vérifie ta connexion et réessaie.")
      setStatus('error')
    }
  }

  return (
    <main
      className="lb-contact-page"
      style={{
        minHeight: '100vh',
        position: 'relative',
        zIndex: 1,
        padding: '20px clamp(14px, 2vw, 28px) 48px',
        background: 'radial-gradient(circle at 80% 0%, var(--primary-a07), transparent 38%), linear-gradient(180deg, var(--obsidian) 0%, var(--media-canvas) 100%)',
      }}
    >
      <div style={{ maxWidth: 1560, margin: '0 auto', position: 'relative', zIndex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
          <LegalBackButton />
          <div>
            <h1
              className="font-display"
              style={{ fontSize: 'var(--font-size-headline-lg)', letterSpacing: '.01em', color: 'var(--text)', margin: 0, lineHeight: 1.15 }}
            >
              Contact
            </h1>
            <p style={{ fontSize: 'var(--font-size-callout)', color: 'var(--text-muted)', margin: '4px 0 0' }}>
              Une question, un souci, une suggestion ? Écris-nous, on te répond au plus vite.
            </p>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 12, alignItems: 'start' }}>
        <Card style={{ boxShadow: CARD.boxShadow, padding: '16px 14px', maxWidth: 860 }}>
          {status === 'success' ? (
            <div style={{ textAlign: 'center', padding: '18px 8px' }}>
              <Mascot mood="message" size={104} />
              <h2 style={{ fontSize: 'var(--font-size-headline-lg)', color: 'var(--text)', margin: '0 0 10px' }}>Message envoyé</h2>
              <p style={{ fontSize: 'var(--font-size-body-sm)', color: 'var(--text-muted)', lineHeight: 1.6, margin: '0 0 20px' }}>
                Merci, ton message a bien été transmis à l&apos;équipe LIVEINBLACK. On te répond généralement sous 24 à 48 h.
              </p>
              <Button variant="secondary" onClick={() => setStatus('idle')}>
                Envoyer un autre message
              </Button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} noValidate>
              <div style={{ display: 'grid', gap: 10 }}>
                <div>
                  <Label htmlFor="contact-name">Nom</Label>
                  <Input
                    id="contact-name"
                    value={form.name}
                    onChange={(e) => updateField('name', e.target.value)}
                    invalid={Boolean(errors.name)}
                    placeholder="Ton nom"
                    autoComplete="name"
                  />
                  {errors.name && <p style={{ fontSize: 'var(--font-size-footnote)', color: 'var(--danger)', margin: '6px 0 0' }}>{errors.name}</p>}
                </div>

                <div>
                  <Label htmlFor="contact-email">Email</Label>
                  <Input
                    id="contact-email"
                    type="email"
                    value={form.email}
                    onChange={(e) => updateField('email', e.target.value)}
                    invalid={Boolean(errors.email)}
                    placeholder="ton@email.com"
                    autoComplete="email"
                  />
                  {errors.email && <p style={{ fontSize: 'var(--font-size-footnote)', color: 'var(--danger)', margin: '6px 0 0' }}>{errors.email}</p>}
                </div>

                <div>
                  <Label htmlFor="contact-subject">Sujet</Label>
                  <Input
                    id="contact-subject"
                    value={form.subject}
                    onChange={(e) => updateField('subject', e.target.value)}
                    invalid={Boolean(errors.subject)}
                    placeholder="En quelques mots"
                  />
                  {errors.subject && <p style={{ fontSize: 'var(--font-size-footnote)', color: 'var(--danger)', margin: '6px 0 0' }}>{errors.subject}</p>}
                </div>

                <div>
                  <Label htmlFor="contact-message">Message</Label>
                  <Textarea
                    id="contact-message"
                    value={form.message}
                    onChange={(e) => updateField('message', e.target.value)}
                    invalid={Boolean(errors.message)}
                    placeholder="Décris-nous ta demande..."
                    rows={6}
                  />
                  {errors.message && <p style={{ fontSize: 'var(--font-size-footnote)', color: 'var(--danger)', margin: '6px 0 0' }}>{errors.message}</p>}
                </div>

                {status === 'error' && (
                  <p style={{ fontSize: 'var(--font-size-callout)', color: 'var(--danger)', margin: 0 }}>{errorMessage}</p>
                )}

                <Button type="submit" loading={status === 'submitting'} loadingText="Envoi en cours..." fullWidth>
                  Envoyer le message
                </Button>
              </div>
            </form>
          )}
        </Card>

        <Card style={{ boxShadow: CARD.boxShadow, padding: '22px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <h2 style={{ fontSize: 'var(--font-size-body-sm)', color: 'var(--text)', margin: '0 0 5px', fontWeight: 800 }}>Un délai de réponse rapide</h2>
            <p style={{ fontSize: 'var(--font-size-callout)', color: 'var(--text-muted)', lineHeight: 1.5, margin: 0 }}>
              L&apos;équipe LIVEINBLACK répond généralement sous 24 à 48h ouvrées. Pour une urgence liée à un
              événement en cours, précise-le dans l&apos;objet de ton message.
            </p>
          </div>
          <div>
            <h2 style={{ fontSize: 'var(--font-size-body-sm)', color: 'var(--text)', margin: '0 0 5px', fontWeight: 800 }}>Avant d&apos;écrire</h2>
            <p style={{ fontSize: 'var(--font-size-callout)', color: 'var(--text-muted)', lineHeight: 1.5, margin: 0 }}>
              La plupart des questions sur les billets, remboursements ou ton compte trouvent une réponse plus
              rapide directement depuis ton espace « Mon profil » ou la page{' '}
              <a href="/about" style={{ color: 'var(--teal)' }}>C&apos;est quoi</a>.
            </p>
          </div>
          <div>
            <h2 style={{ fontSize: 'var(--font-size-body-sm)', color: 'var(--text)', margin: '0 0 5px', fontWeight: 800 }}>Tu es organisateur ou prestataire ?</h2>
            <p style={{ fontSize: 'var(--font-size-callout)', color: 'var(--text-muted)', lineHeight: 1.5, margin: 0 }}>
              Pour une question sur ton dossier ou tes paiements, passe plutôt par la messagerie intégrée depuis
              ton espace connecté — la réponse y sera plus rapide et centralisée avec ton compte.
            </p>
          </div>
        </Card>
        </div>
      </div>
    </main>
  )
}
