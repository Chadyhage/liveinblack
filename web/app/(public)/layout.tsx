import PublicNav from './_components/PublicNav'

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        color: 'var(--text)',
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        background: `radial-gradient(circle 900px at 6% 4%, rgba(139,92,246,.16), transparent 60%), radial-gradient(circle 820px at 96% 38%, rgba(78,232,200,.08), transparent 56%), radial-gradient(circle 950px at 50% 100%, rgba(224,90,170,.09), transparent 60%), var(--obsidian)`,
        backgroundAttachment: 'fixed',
      }}
    >
      <PublicNav />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>{children}</div>
    </div>
  )
}
