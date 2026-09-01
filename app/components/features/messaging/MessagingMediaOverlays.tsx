'use client'

import type { CSSProperties, ReactNode, RefObject } from 'react'
import { Button, ImmersiveDialog, Radio } from '@/app/components/ui'
import { Avatar, GroupAvatar } from './MessageThreadParts'
import { ModalActions, ModalShell } from './MessagingModals'
import { conversationLabel } from './messagingUtils'
import type { ConversationView } from './types'

const sectionLabelStyle: CSSProperties = {
  fontSize: 'var(--font-size-callout)',
  fontWeight: 650,
  color: 'var(--text-faint)',
  letterSpacing: '-0.01em',
  fontFamily: 'var(--font-interface), sans-serif',
  margin: '0 0 8px',
}

const rowButtonStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  width: '100%',
  textAlign: 'left',
  padding: '7px 4px',
  border: 'none',
  background: 'transparent',
  cursor: 'pointer',
}

export function PhotoPreviewModal({
  photoPreview,
  photoPreviewPickedConv,
  conversations,
  currentUserId,
  onPickConversation,
  onCancel,
  onConfirm,
}: {
  photoPreview: { dataUrl: string; conversationId: string | null }
  photoPreviewPickedConv: string | null
  conversations: ConversationView[]
  currentUserId: string
  onPickConversation: (conversationId: string) => void
  onCancel: () => void
  onConfirm: () => void
}) {
  return (
    <ModalActionsWrapper title="Envoyer la photo" onClose={onCancel}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={photoPreview.dataUrl} alt="Aperçu" style={{ width: '100%', borderRadius: 10, marginBottom: 12, maxHeight: 320, objectFit: 'contain' }} />
      {photoPreview.conversationId === null ? (
        <>
          <p style={sectionLabelStyle}>Choisir un destinataire</p>
          <div style={{ maxHeight: 200, overflowY: 'auto', marginBottom: 10 }}>
            {conversations.map((conv) => {
              const label = conversationLabel(conv, currentUserId)
              return (
                <Radio
                  key={conv.id}
                  name="photo-target-conversation"
                  checked={photoPreviewPickedConv === conv.id}
                  onChange={() => onPickConversation(conv.id)}
                  style={{ ...rowButtonStyle, cursor: 'pointer' }}
                  label={
                    <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {conv.type === 'group' ? <GroupAvatar conv={conv} size={28} /> : <Avatar userId={conv.id} name={label} size={28} />}
                      <span style={{ fontSize: 'var(--font-size-callout)', color: 'var(--text)', fontWeight: 400 }}>{label}</span>
                    </span>
                  }
                />
              )
            })}
          </div>
        </>
      ) : null}
      <ModalActions onCancel={onCancel} onConfirm={onConfirm} confirmLabel="Envoyer" disabled={photoPreview.conversationId === null && !photoPreviewPickedConv} />
    </ModalActionsWrapper>
  )
}

export function CameraCaptureModal({
  videoRef,
  onClose,
  onCapture,
}: {
  videoRef: RefObject<HTMLVideoElement | null>
  onClose: () => void
  onCapture: () => void
}) {
  return (
    <ImmersiveDialog
      title="Prendre une photo"
      subtitle="Cadre ta photo avant de la partager"
      onClose={onClose}
      zIndex={500}
      media
      actions={
        <>
          <Button variant="secondary" onClick={onClose}>Annuler</Button>
          <Button variant="primary" onClick={onCapture}>Capturer</Button>
        </>
      }
    >
      <video ref={videoRef} autoPlay playsInline aria-label="Aperçu de la caméra" style={{ width: 'min(100%, 1100px)', maxHeight: 'calc(100dvh - 170px)', objectFit: 'contain', borderRadius: 20, boxShadow: '0 28px 90px rgba(var(--black-rgb), .50)' }} />
    </ImmersiveDialog>
  )
}

function ModalActionsWrapper({
  title,
  onClose,
  children,
}: {
  title: string
  onClose: () => void
  children: ReactNode
}) {
  return <ModalShell title={title} onClose={onClose}>{children}</ModalShell>
}
