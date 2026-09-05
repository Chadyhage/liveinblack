import { Footer, PublicNav } from '@/app/components/layout'
import AmbientMusicPlayer from '@/app/components/layout/AmbientMusicPlayer'
import PublicRouteFrame from './_components/PublicRouteFrame'
import './public-system.css'

export default function PublicLayout({
  children,
  modal,
}: {
  children: React.ReactNode
  modal: React.ReactNode
}) {
  return (
    <PublicRouteFrame>
      <PublicNav />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>{children}</div>
      <Footer />
      <AmbientMusicPlayer />
      {modal}
    </PublicRouteFrame>
  )
}
