export default function Spinner({ text, size = 14 }: { text?: string; size?: number }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
      <span
        style={{
          width: size,
          height: size,
          border: '2px solid rgba(255,255,255,0.15)',
          borderTopColor: 'rgba(255,255,255,0.7)',
          borderRadius: '50%',
          animation: 'lb-spin 0.7s linear infinite',
          display: 'inline-block',
          flexShrink: 0,
        }}
      />
      {text}
    </span>
  )
}
