'use client'

import { useEffect, useState, type CSSProperties, type ReactNode, type RefObject } from 'react'
import { Search, Handshake } from 'lucide-react'
import { Button, Checkbox, Input, Radio } from '@/app/components/ui'
import { ModalActions, ModalShell } from './MessagingModals'
import MessagingEmptyState from './MessagingEmptyState'
import type { ConversationMember, ConversationView, FriendRequestView, FriendView, SentFriendRequestView } from './types'
import styles from '@/app/(app)/messages/MessagesClient.module.css'

export function NewDirectModal({ friends, onPick, onEmail, onClose, renderAvatar }: { friends: FriendView[]; onPick: (userId: string) => void; onEmail: (email: string) => void; onClose: () => void; renderAvatar: (userId: string, name: string, size?: number) => ReactNode }) {
  const [query, setQuery] = useState('')
  const [email, setEmail] = useState('')
  const filtered = friends.filter((f) => f.name.toLowerCase().includes(query.trim().toLowerCase()))
  return (
    <ModalShell title="Nouvelle discussion" subtitle="Choisis une personne ou démarre une conversation par e-mail." onClose={onClose} wide>
      <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Rechercher un ami" aria-label="Rechercher un ami" leftIcon={<Search size={17} aria-hidden="true" />} containerStyle={{ marginBottom: 14 }} style={inputStyle} autoFocus />
      <p className={styles.modalSectionLabel}>Amis</p>
      <div className={styles.modalPeopleList}>
        {filtered.length === 0 && <p className={styles.modalEmpty}>Aucun ami trouvé.</p>}
        {filtered.map((f) => (
          <Button key={f.userId} variant="ghost" onClick={() => onPick(f.userId)} className={styles.modalPersonRow}>
            {renderAvatar(f.userId, f.name, 40)}
            <span className={styles.modalPersonName}>{f.name}</span>
            <span className={styles.modalChevron} aria-hidden="true">›</span>
          </Button>
        ))}
      </div>
      <div className={styles.modalDivider}><span>ou</span></div>
      <form className={styles.modalEmailForm} onSubmit={(event) => { event.preventDefault(); if (email.trim()) onEmail(email.trim()) }}>
        <Input value={email} onChange={(e) => setEmail(e.target.value)} type="email" autoComplete="email" placeholder="Adresse e-mail" aria-label="Adresse e-mail du contact" style={{ ...inputStyle, marginBottom: 0 }} />
        <Button type="submit" variant="primary" disabled={!email.trim()} size="md" style={{ borderRadius: 999, fontWeight: 650, textTransform: 'none', letterSpacing: 'normal' }}>Continuer</Button>
      </form>
    </ModalShell>
  )
}

export function NewGroupModal({ friends, onCreate, onClose, onGoToFriends, onPickAvatar, renderAvatar, renderGroupAvatar }: { friends: FriendView[]; onCreate: (name: string, memberIds: string[], avatarDataUrl: string | null) => void; onClose: () => void; onGoToFriends: () => void; onPickAvatar: (file: File) => Promise<string>; renderAvatar: (userId: string, name: string, size?: number) => ReactNode; renderGroupAvatar: (name: string, avatar: string | null, size?: number) => ReactNode }) {
  const [step, setStep] = useState<1 | 2>(1)
  const [name, setName] = useState('')
  const [query, setQuery] = useState('')
  const [memberIds, setMemberIds] = useState<Set<string>>(new Set())
  const [avatarDataUrl, setAvatarDataUrl] = useState<string | null>(null)
  const filtered = friends.filter((f) => f.name.toLowerCase().includes(query.trim().toLowerCase()))

  function toggleMember(userId: string) {
    setMemberIds((prev) => {
      const next = new Set(prev)
      if (next.has(userId)) next.delete(userId)
      else next.add(userId)
      return next
    })
  }

  if (step === 2) {
    const selected = friends.filter((f) => memberIds.has(f.userId))
    return (
      <ModalShell title="Confirmer le groupe" onClose={onClose}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, cursor: 'pointer' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {avatarDataUrl ? <img src={avatarDataUrl} alt="Avatar du groupe" style={{ width: 52, height: 52, borderRadius: '50%', objectFit: 'cover' }} /> : renderGroupAvatar(name, null, 52)}
          <span style={{ fontSize: 12, color: 'var(--teal)' }}>Choisir une photo</span>
          <input type="file" accept="image/*" style={{ display: 'none' }} onChange={async (e) => { const file = e.target.files?.[0]; if (!file) return; setAvatarDataUrl(await onPickAvatar(file)) }} />
        </label>
        <p style={sectionLabelStyle}>{name}</p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
          {selected.map((f) => (
            <div key={f.userId} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--surface)', borderRadius: 999, padding: '4px 10px 4px 4px' }}>
              {renderAvatar(f.userId, f.name, 22)}
              <span style={{ fontSize: 12, color: 'var(--text)' }}>{f.name}</span>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
          <Button variant="secondary" onClick={() => setStep(1)} size="sm" style={{ borderRadius: 999 }}>Retour</Button>
          <Button variant="primary" onClick={() => onCreate(name, [...memberIds], avatarDataUrl)} size="sm" style={{ borderRadius: 3, fontWeight: 500, textTransform: 'none', letterSpacing: 'normal' }}>Créer le groupe</Button>
        </div>
      </ModalShell>
    )
  }

  return (
    <ModalShell title="Nouveau groupe" onClose={onClose} wide>
      <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nom du groupe" style={inputStyle} autoFocus />
      <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Rechercher un ami…" style={inputStyle} />
      <div style={{ maxHeight: 220, overflowY: 'auto', marginBottom: 14 }}>
        {filtered.map((f) => (
          <Checkbox key={f.userId} checked={memberIds.has(f.userId)} onChange={() => toggleMember(f.userId)} style={{ ...rowButtonStyle, cursor: 'pointer' }} label={<span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>{renderAvatar(f.userId, f.name, 32)}<span style={{ fontSize: 13, color: 'var(--text)', fontWeight: 400 }}>{f.name}</span></span>} />
        ))}
        {filtered.length === 0 && friends.length === 0 && <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-start' }}><p style={{ fontSize: 12, color: 'var(--text-faint)', margin: 0 }}>Tu n&apos;as pas encore d&apos;amis. Ajoute-en pour pouvoir créer un groupe.</p><Button variant="secondary" onClick={onGoToFriends} size="sm" style={{ borderRadius: 999 }}>Ajouter un ami</Button></div>}
        {filtered.length === 0 && friends.length > 0 && <p style={{ fontSize: 12, color: 'var(--text-faint)' }}>Aucun ami trouvé.</p>}
      </div>
      <ModalActions onCancel={onClose} onConfirm={() => setStep(2)} confirmLabel="Suivant" disabled={!name.trim() || memberIds.size === 0} />
    </ModalShell>
  )
}

export function FriendsPanel({ received, sent, friends, newFriendIds, onDismissNew, onAction, onSend, onRemove, onClose }: { received: FriendRequestView[]; sent: SentFriendRequestView[]; friends: FriendView[]; newFriendIds: Set<string>; onDismissNew: (userId: string) => void; onAction: (requestId: string, action: 'accept' | 'decline' | 'cancel') => void; onSend: (email: string) => Promise<boolean>; onRemove: (friendUserId: string, name: string) => void; onClose: () => void }) {
  const [email, setEmail] = useState('')
  return (
    <ModalShell title="Amis" onClose={onClose} wide>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email d'un ami" style={{ ...inputStyle, flex: 1, marginBottom: 0 }} />
        <Button variant="secondary" onClick={() => { const trimmed = email.trim(); if (trimmed) onSend(trimmed).then((success) => { if (success) setEmail('') }) }} size="sm" style={{ borderRadius: 999 }}>Envoyer</Button>
      </div>
      {received.length > 0 && <div style={{ marginBottom: 16 }}><p style={sectionLabelStyle}>Demandes reçues</p>{received.map((r) => <div key={r.id} style={rowStyle}><span style={{ fontSize: 13, color: 'var(--text)' }}>{r.fromName}</span><div style={{ display: 'flex', gap: 6 }}><Button variant="secondary" onClick={() => onAction(r.id, 'accept')} size="sm" style={{ borderRadius: 999 }}>Accepter</Button><Button variant="danger" onClick={() => onAction(r.id, 'decline')} size="sm" style={{ borderRadius: 999 }}>Refuser</Button></div></div>)}</div>}
      {sent.length > 0 && <div style={{ marginBottom: 16 }}><p style={sectionLabelStyle}>Demandes envoyées</p>{sent.map((r) => <div key={r.id} style={rowStyle}><span style={{ fontSize: 13, color: 'var(--text)' }}>{r.toName}</span><Button variant="secondary" onClick={() => onAction(r.id, 'cancel')} size="sm" style={{ borderRadius: 999 }}>Annuler</Button></div>)}</div>}
      <div>
        <p style={sectionLabelStyle}>Mes amis ({friends.length})</p>
        {friends.length === 0 && <MessagingEmptyState icon={<Handshake size={32} />} title="Aucun ami pour le moment" subtitle="Envoie une demande par email pour commencer" />}
        {friends.map((f) => <div key={f.userId} style={rowStyle}><span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text)' }}>{f.name}{newFriendIds.has(f.userId) && <Button variant="secondary" onClick={() => onDismissNew(f.userId)} title="Marquer comme vu" style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--teal)', background: 'var(--primary-a12)', border: '1px solid var(--primary-a35)', borderRadius: 999, padding: '2px 8px' }}>Nouveau</Button>}</span><Button variant="secondary" onClick={() => onRemove(f.userId, f.name)} size="sm" style={{ borderRadius: 999 }}>Retirer</Button></div>)}
      </div>
    </ModalShell>
  )
}

export function GroupSettingsModal({ conversation, currentUserId, friends, addMemberSearch, onAddMemberSearchChange, onAddMember, onRemoveMember, onSetRole, onOpenMuteDialog, onClearMute, onRename, onUploadAvatar, groupAvatarInputRef, onLeave, onDelete, onClose, renderAvatar, renderGroupAvatar }: { conversation: ConversationView; currentUserId: string; friends: FriendView[]; addMemberSearch: string; onAddMemberSearchChange: (value: string) => void; onAddMember: (userId: string) => void; onRemoveMember: (userId: string, name: string) => void; onSetRole: (userId: string, role: 'admin' | 'member') => void; onOpenMuteDialog: (userId: string, name: string) => void; onClearMute: (userId: string) => void; onRename: (name: string) => void; onUploadAvatar: (file: File) => void; groupAvatarInputRef: RefObject<HTMLInputElement | null>; onLeave: () => void; onDelete: () => void; onClose: () => void; renderAvatar: (userId: string, name: string, size?: number) => ReactNode; renderGroupAvatar: (name: string, avatar: string | null, size?: number) => ReactNode }) {
  const [name, setName] = useState(conversation.name || '')
  const [showAddMember, setShowAddMember] = useState(false)
  const isAdmin = conversation.members.find((m) => m.userId === currentUserId)?.role === 'admin'
  const memberIds = new Set(conversation.members.map((m) => m.userId))
  const addableFriends = friends.filter((f) => !memberIds.has(f.userId) && f.name.toLowerCase().includes(addMemberSearch.trim().toLowerCase()))
  return (
    <ModalShell title="Groupe" onClose={onClose} wide>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <label style={{ cursor: isAdmin ? 'pointer' : 'default' }}>
          {renderGroupAvatar(conversation.name || '', conversation.avatar, 52)}
          {isAdmin && <input ref={groupAvatarInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => { const file = e.target.files?.[0]; if (file) onUploadAvatar(file); e.target.value = '' }} onClick={(e) => e.stopPropagation()} />}
        </label>
        {isAdmin ? <div style={{ flex: 1, display: 'flex', gap: 8 }}><Input value={name} onChange={(e) => setName(e.target.value)} style={{ ...inputStyle, marginBottom: 0, flex: 1 }} /><Button variant="secondary" onClick={() => name.trim() && name.trim() !== conversation.name && onRename(name.trim())} size="sm" style={{ borderRadius: 999 }}>Renommer</Button></div> : <p style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', margin: 0 }}>{conversation.name}</p>}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <p style={{ ...sectionLabelStyle, margin: 0 }}>Membres ({conversation.members.length})</p>
        {isAdmin && <Button variant="secondary" onClick={() => setShowAddMember((v) => !v)} size="sm" style={{ borderRadius: 999 }}>+ Ajouter</Button>}
      </div>
      {showAddMember && <div style={{ marginBottom: 12, background: 'var(--surface)', borderRadius: 10, padding: 10 }}><Input value={addMemberSearch} onChange={(e) => onAddMemberSearchChange(e.target.value)} placeholder="Rechercher un ami…" style={{ ...inputStyle, marginBottom: 8 }} /><div style={{ maxHeight: 140, overflowY: 'auto' }}>{addableFriends.length === 0 && <p style={{ fontSize: 12, color: 'var(--text-faint)' }}>Aucun ami à ajouter.</p>}{addableFriends.map((f) => <Button key={f.userId} variant="ghost" onClick={() => onAddMember(f.userId)} style={{ ...rowButtonStyle, fontWeight: 400 }}>{renderAvatar(f.userId, f.name, 28)}<span style={{ fontSize: 13, color: 'var(--text)' }}>{f.name}</span></Button>)}</div></div>}
      <div style={{ marginBottom: 18 }}>{conversation.members.map((m) => <div key={m.userId} style={rowStyle}><div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>{renderAvatar(m.userId, m.name, 30)}<span style={{ fontSize: 13, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.name}{m.role === 'admin' && <em style={{ color: 'var(--gold)', fontStyle: 'normal', fontSize: 11 }}> · admin</em>}{m.muteUntilAt !== undefined && <em style={{ color: 'var(--pink)', fontStyle: 'normal', fontSize: 11 }}> · en sourdine</em>}</span></div>{isAdmin && m.userId !== currentUserId && <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>{m.role !== 'admin' && (m.muteUntilAt !== undefined ? <Button variant="secondary" onClick={() => onClearMute(m.userId)} size="sm" style={{ borderRadius: 999 }}>Réactiver</Button> : <Button variant="secondary" onClick={() => onOpenMuteDialog(m.userId, m.name)} size="sm" style={{ borderRadius: 999 }}>Sourdine</Button>)}<Button variant="secondary" onClick={() => onSetRole(m.userId, m.role === 'admin' ? 'member' : 'admin')} size="sm" style={{ borderRadius: 999 }}>{m.role === 'admin' ? 'Retirer admin' : 'Nommer admin'}</Button><Button variant="danger" onClick={() => onRemoveMember(m.userId, m.name)} size="sm" style={{ borderRadius: 999, background: 'transparent', border: '1px solid var(--border-strong)', color: '#c2347f' }}>Retirer</Button></div>}</div>)}</div>
      <div style={{ display: 'flex', gap: 8 }}><Button variant="secondary" onClick={onLeave} size="sm" style={{ borderRadius: 999 }}>Quitter le groupe</Button>{isAdmin && <Button variant="danger" onClick={onDelete} size="sm" style={{ borderRadius: 999, background: 'transparent', border: '1px solid var(--border-strong)', color: '#c2347f' }}>Supprimer le groupe</Button>}</div>
    </ModalShell>
  )
}

export function MuteMemberModal({ name, durations, onApply, onClose }: { name: string; durations: { id: string; label: string; ms: number | null }[]; onApply: (durationMs: number | null) => void; onClose: () => void }) {
  const [durationMs, setDurationMs] = useState<number | null>(durations[1]?.ms ?? null)
  return (
    <ModalShell title={`Mettre ${name} en sourdine`} onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14 }}>{durations.map((d) => <Radio key={d.id} name="mute-duration" checked={durationMs === d.ms} onChange={() => setDurationMs(d.ms)} label={<span style={{ fontSize: 13, color: 'var(--text)', fontWeight: 400 }}>{d.label}</span>} />)}</div>
      <ModalActions onCancel={onClose} onConfirm={() => onApply(durationMs)} confirmLabel="Mettre en sourdine" />
    </ModalShell>
  )
}

export function ContactPanelModal({ conversationId, member, online, lastSeenAt, isFriend, isBlocked, onClearHistory, onRemoveFriend, onBlock, onUnblock, onReport, onClose, onLoadPhone, renderAvatar }: { conversationId: string; member: ConversationMember; online?: boolean; lastSeenAt: string | null; isFriend: boolean; isBlocked: boolean; onClearHistory: () => void; onRemoveFriend: () => void; onBlock: () => void; onUnblock: () => void; onReport: () => void; onClose: () => void; onLoadPhone: (conversationId: string) => Promise<string | null>; renderAvatar: (userId: string, name: string, size?: number, online?: boolean, showOnline?: boolean) => ReactNode }) {
  const [phone, setPhone] = useState<string | null>(null)
  useEffect(() => { let cancelled = false; onLoadPhone(conversationId).then((value) => { if (!cancelled) setPhone(value) }); return () => { cancelled = true } }, [conversationId, onLoadPhone])
  return (
    <ModalShell title="Contact" onClose={onClose} wide>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, marginBottom: 20 }}>
        {renderAvatar(member.userId, member.name, 64, online, true)}
        <p style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', margin: 0 }}>{member.name}</p>
        <p style={{ fontSize: 12, color: online ? '#22c55e' : 'var(--text-faint)', margin: 0 }}>{online ? 'En ligne' : lastSeenAt ? `Vu ${new Date(lastSeenAt).toLocaleString('fr-FR')}` : 'Hors ligne'}</p>
        {phone && <a href={`tel:${phone.replace(/\s+/g, '')}`} style={{ fontSize: 13, color: 'var(--teal)', textDecoration: 'none' }}>{phone}</a>}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <Button variant="secondary" onClick={onClearHistory} style={{ ...fullRowButtonStyle, borderRadius: 10 }}>Vider l&apos;historique</Button>
        {isFriend && <Button variant="secondary" onClick={onRemoveFriend} style={{ ...fullRowButtonStyle, borderRadius: 10 }}>Retirer des amis</Button>}
        {isBlocked ? <Button variant="secondary" onClick={onUnblock} style={{ ...fullRowButtonStyle, borderRadius: 10 }}>Débloquer</Button> : <Button variant="danger" onClick={onBlock} style={{ ...fullRowButtonStyle, borderRadius: 10, background: 'var(--surface)', border: '1px solid var(--border-strong)', color: '#c2347f' }}>Bloquer</Button>}
        <Button variant="danger" onClick={onReport} style={{ ...fullRowButtonStyle, borderRadius: 10, background: 'var(--surface)', border: '1px solid var(--border-strong)', color: '#c2347f' }}>Signaler</Button>
      </div>
    </ModalShell>
  )
}

const inputStyle: CSSProperties = { width: '100%', borderRadius: 14, border: '1px solid rgba(255,255,255,.12)', background: 'rgba(118,118,128,.16)', color: 'var(--text)', fontSize: 14, marginBottom: 10, fontFamily: 'inherit' }
const fullRowButtonStyle: CSSProperties = { padding: '10px 14px', borderRadius: 10, border: '1px solid var(--border-strong)', background: 'var(--surface)', color: 'var(--text)', fontSize: 13, fontWeight: 600, cursor: 'pointer', textAlign: 'left' }
const rowStyle: CSSProperties = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 0', borderBottom: '1px solid var(--border)', gap: 8 }
const rowButtonStyle: CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left', padding: '7px 4px', border: 'none', background: 'transparent', cursor: 'pointer' }
const sectionLabelStyle: CSSProperties = { fontSize: 13, fontWeight: 650, color: 'var(--text-faint)', letterSpacing: '-0.01em', fontFamily: 'var(--font-interface), sans-serif', margin: '0 0 8px' }
