import { Footer, PublicNav } from '@/app/components/layout'
import AmbientMusicPlayer from '@/app/components/AmbientMusicPlayer'

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        color: 'var(--text)',
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        background: `radial-gradient(circle 900px at 6% 4%, rgba(255,229,0,.10), transparent 60%), radial-gradient(circle 820px at 96% 38%, rgba(255,208,0,.07), transparent 56%), var(--obsidian)`,
        backgroundAttachment: 'fixed',
      }}
    >
      <PublicNav />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>{children}</div>
      <Footer />
      <AmbientMusicPlayer />
    </div>
  )
}
