import { useLocation } from 'react-router-dom'
import PublicNav from './PublicNav'

export default function PublicShell({ children, maxWidth }) {
  const location = useLocation()
  return (
    <div style={{ minHeight: '100vh', color: '#fff' }}>
      <PublicNav />
      <div key={location.pathname} className="lib-page" style={{ maxWidth: maxWidth || undefined, margin: maxWidth ? '0 auto' : undefined, width: '100%' }}>
        {children}
      </div>
    </div>
  )
}
