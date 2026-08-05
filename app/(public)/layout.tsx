import { Footer, PublicNav } from '@/app/components/layout'
import AmbientMusicPlayer from '@/app/components/AmbientMusicPlayer'

export default function PublicLayout({
  children,
  modal,
}: {
  children: React.ReactNode
  modal: React.ReactNode
}) {
  return (
    <div
      className="lb-public-layout"
      style={{
        color: 'var(--text)',
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        // Fond transparent en dehors des deux halos dorés : laisse voir le
        // motif décoratif fixe de body::before (globals.css) au lieu de le
        // masquer avec un fond opaque, comme dans la partie dashboard
        // (app/(app)/) qui n'a pas ce wrapper.
        background: `radial-gradient(circle 900px at 6% 4%, rgba(184, 243, 74,.10), transparent 60%), radial-gradient(circle 820px at 96% 38%, rgba(159, 224, 34,.07), transparent 56%)`,
        backgroundAttachment: 'fixed',
      }}
    >
      <PublicNav />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>{children}</div>
      <Footer />
      <AmbientMusicPlayer />
      {modal}
    </div>
  )
}
