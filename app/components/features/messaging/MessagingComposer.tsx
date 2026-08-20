'use client'

import { Button, Textarea } from '@/app/components/ui'
import { Check, Mic, Send, Trash2, X } from 'lucide-react'
import { DropdownMenu } from './MessagingMenus'
import { formatRecordingDuration } from './messagingComposerUtils'
import type { ConversationMember } from './types'

export const inputStyle: React.CSSProperties = {
  width: '100%',
  borderRadius: 14,
  border: '1px solid rgba(255,255,255,.12)',
  background: 'rgba(118,118,128,.16)',
  color: 'var(--text)',
  fontSize: 14,
  marginBottom: 10,
  fontFamily: 'inherit',
}

export default function MessagingComposer({
  mentionMatches,
  onApplyMention,
  editingMessage,
  onCancelEdit,
  replyTo,
  onCancelReply,
  isRecording,
  recordDuration,
  onCancelRecording,
  onSendRecording,
  onOpenAttachMenu,
  showAttachMenu,
  onCloseAttachMenu,
  onOpenPhotoPicker,
  onOpenCamera,
  onOpenPoll,
  onOpenEventShare,
  fileInputRef,
  onPhotoFileChange,
  activeConversationId,
  composerText,
  onComposerChange,
  onComposerKeyDown,
  onSendText,
  busy,
  editingMessageId,
  onMicPointerDown,
  onMicPointerUp,
}: {
  mentionMatches: ConversationMember[]
  onApplyMention: (member: ConversationMember) => void
  editingMessage: boolean
  onCancelEdit: () => void
  replyTo: { senderName: string; preview: string } | null
  onCancelReply: () => void
  isRecording: boolean
  recordDuration: number
  onCancelRecording: () => void
  onSendRecording: () => void
  onOpenAttachMenu: () => void
  showAttachMenu: boolean
  onCloseAttachMenu: () => void
  onOpenPhotoPicker: () => void
  onOpenCamera: () => void
  onOpenPoll: () => void
  onOpenEventShare: () => void
  fileInputRef: React.RefObject<HTMLInputElement | null>
  onPhotoFileChange: (event: React.ChangeEvent<HTMLInputElement>, targetConversationId: string | null) => void
  activeConversationId: string | null
  composerText: string
  onComposerChange: (value: string) => void
  onComposerKeyDown: (event: React.KeyboardEvent<HTMLTextAreaElement>) => void
  onSendText: () => void
  busy: boolean
  editingMessageId: string | null
  onMicPointerDown: () => void
  onMicPointerUp: () => void
}) {
  return (
    <div style={{ padding: '12px 20px 16px', borderTop: '1px solid var(--border)' }}>
      {mentionMatches.length > 0 ? (
        <div style={{ marginBottom: 8, background: 'var(--surface-2)', border: '1px solid var(--border-strong)', borderRadius: 10, overflow: 'hidden' }}>
          {mentionMatches.map((member) => (
            <Button
              key={member.userId}
              variant="ghost"
              onClick={() => onApplyMention(member)}
              style={{
                display: 'block',
                width: '100%',
                textAlign: 'left',
                padding: '8px 12px',
                color: 'var(--text)',
                fontSize: 13,
                fontWeight: 400,
              }}
            >
              @{member.name}
            </Button>
          ))}
        </div>
      ) : null}

      {editingMessage ? (
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            background: 'var(--surface-2)',
            borderRadius: 10,
            padding: '6px 10px',
            marginBottom: 8,
            borderLeft: '3px solid var(--gold)',
          }}
        >
          <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--gold)', margin: 0 }}>Modifier le message</p>
          <Button variant="ghost" aria-label="Annuler la modification" onClick={onCancelEdit} style={{ padding: 0 }}>
            <X size={14} />
          </Button>
        </div>
      ) : null}

      {replyTo && !editingMessage ? (
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            background: 'var(--surface-2)',
            borderRadius: 10,
            padding: '6px 10px',
            marginBottom: 8,
            borderLeft: '3px solid var(--violet)',
          }}
        >
          <div style={{ minWidth: 0 }}>
            <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--teal)', margin: '0 0 1px' }}>Répondre à {replyTo.senderName}</p>
            <p style={{ fontSize: 11, color: 'var(--text-faint)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {replyTo.preview}
            </p>
          </div>
          <Button variant="ghost" onClick={onCancelReply} style={{ padding: 0 }}>
            <X size={14} />
          </Button>
        </div>
      ) : null}

      {isRecording ? (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: '10px 14px',
            background: 'var(--surface)',
            borderRadius: 999,
            border: '1px solid var(--border-strong)',
          }}
        >
          <Button variant="ghost" onClick={onCancelRecording} style={{ color: 'var(--pink)', fontSize: 18, padding: 0 }} aria-label="Annuler">
            <Trash2 size={18} />
          </Button>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--pink)', animation: 'lib-pulse 1.2s infinite' }} />
          <span style={{ flex: 1, fontSize: 13, color: 'var(--text)' }}>
            {formatRecordingDuration(recordDuration)}
          </span>
          <Button variant="primary" onClick={onSendRecording} style={{ borderRadius: '50%', width: 44, height: 44, minHeight: 44, minWidth: 44, padding: 0 }} aria-label="Envoyer">
            <Check size={18} />
          </Button>
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', position: 'relative' }}>
          <div style={{ position: 'relative' }}>
            <ComposerIconButton title="Joindre" onClick={onOpenAttachMenu}>
              +
            </ComposerIconButton>
            {showAttachMenu ? (
              <div style={{ position: 'absolute', bottom: 44, left: 0, zIndex: 50 }}>
                <DropdownMenu
                  onClose={onCloseAttachMenu}
                  items={[
                    { label: 'Photo', onClick: onOpenPhotoPicker },
                    { label: 'Appareil photo', onClick: onOpenCamera },
                    { label: 'Sondage', onClick: onOpenPoll },
                    { label: 'Partager un événement', onClick: onOpenEventShare },
                  ]}
                />
              </div>
            ) : null}
            <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={(event) => onPhotoFileChange(event, activeConversationId)} />
          </div>
          <Textarea
            value={composerText}
            onChange={(event) => onComposerChange(event.target.value)}
            onKeyDown={onComposerKeyDown}
            placeholder="Écris un message…"
            rows={1}
            style={{
              ...inputStyle,
              marginBottom: 0,
              flex: 1,
              resize: 'none',
              maxHeight: 120,
              borderRadius: 22,
              background: 'var(--surface)',
            }}
          />
          {composerText.trim() ? (
            <Button
              variant="primary"
              onClick={onSendText}
              disabled={busy}
              aria-label={editingMessageId ? 'Modifier' : 'Envoyer'}
              title={editingMessageId ? 'Modifier' : 'Envoyer'}
              style={{
                width: 44,
                height: 44,
                minWidth: 44,
                minHeight: 44,
                padding: 0,
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#04120e',
                background: busy ? 'rgba(159, 224, 34,0.5)' : 'var(--teal-solid)',
                cursor: busy ? 'default' : 'pointer',
                flexShrink: 0,
              }}
            >
              {editingMessageId ? <Check size={18} /> : <Send size={17} />}
            </Button>
          ) : (
            <Button
              variant="primary"
              onPointerDown={onMicPointerDown}
              onPointerUp={onMicPointerUp}
              style={{
                width: 44,
                height: 44,
                minWidth: 44,
                minHeight: 44,
                padding: 0,
                borderRadius: '50%',
                background: 'var(--teal-solid)',
                color: '#04120e',
                flexShrink: 0,
              }}
              aria-label="Message vocal"
            >
              <Mic size={18} />
            </Button>
          )}
        </div>
      )}
    </div>
  )
}

function ComposerIconButton({ title, onClick, children }: { title: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <Button
      variant="secondary"
      title={title}
      aria-label={title}
      onClick={onClick}
      style={{
        position: 'relative',
        width: 44,
        height: 44,
        minWidth: 44,
        minHeight: 44,
        padding: 0,
        borderRadius: '50%',
        fontSize: 14,
      }}
    >
      {children}
    </Button>
  )
}
