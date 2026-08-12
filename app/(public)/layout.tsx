import { Footer, PublicNav } from '@/app/components/layout'
import AmbientMusicPlayer from '@/app/components/AmbientMusicPlayer'
import './public-system.css'

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
        background: `radial-gradient(circle 900px at 6% 4%, rgba(184, 243, 74,.08), transparent 60%), radial-gradient(circle 820px at 96% 38%, rgba(124, 92, 255,.07), transparent 56%), linear-gradient(180deg, rgba(7,7,10,.72), rgba(7,7,10,.86)), url('/media1.jpg') 58% center / cover no-repeat`,
        backgroundAttachment: 'fixed',
      }}
    >
      <PublicNav />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>{children}</div>
      <Footer />
      <AmbientMusicPlayer publicMode />
      {modal}
    </div>
  )
}
