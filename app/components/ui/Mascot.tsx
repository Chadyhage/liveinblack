import Image from 'next/image'

export type MascotMood = 'happy' | 'confused' | 'sad' | 'sleeping' | 'search' | 'message' | 'success' | 'error'

const MASCOT_IMAGES: Record<MascotMood, string> = {
  happy: '/images/mascot/mascot-success.png',
  confused: '/images/mascot/mascot-404.png',
  sad: '/images/mascot/mascot-search.png',
  sleeping: '/images/mascot/mascot-waiting.png',
  search: '/images/mascot/mascot-search.png',
  message: '/images/mascot/mascot-message.png',
  success: '/images/mascot/mascot-success.png',
  error: '/images/mascot/mascot-error.png',
}

export default function Mascot({ mood = 'happy', size = 140 }: { mood?: MascotMood; size?: number }) {
  return (
    <div
      className="lb-mascot-image"
      aria-hidden="true"
      style={{ width: size, height: size, margin: '0 auto' }}
    >
      <style>{`
        @keyframes lb-mascot-float {
          0%, 100% { transform: translateY(0) rotate(-0.4deg); }
          50% { transform: translateY(-6px) rotate(0.4deg); }
        }
        .lb-mascot-image { animation: lb-mascot-float 3.8s ease-in-out infinite; }
        @media (prefers-reduced-motion: reduce) {
          .lb-mascot-image { animation: none; }
        }
      `}</style>
      <Image
        src={MASCOT_IMAGES[mood]}
        width={720}
        height={720}
        sizes={`${size}px`}
        alt=""
        style={{ width: '100%', height: '100%', objectFit: 'contain' }}
      />
    </div>
  )
}
