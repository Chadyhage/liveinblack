'use client'

import { useSyncExternalStore } from 'react'
import { getServerSnapshot, getState, playRandom, subscribe } from '@/lib/client/musicEngine'

export default function HomeAmbienceButton() {
  const state = useSyncExternalStore(subscribe, getState, getServerSnapshot)

  return (
    <button
      type="button"
      onClick={() => playRandom()}
      aria-pressed={state.playing}
      style={{
        marginTop: 16,
        padding: '10px 17px',
        borderRadius: 999,
        border: `1px solid ${state.playing ? 'rgba(78,232,200,.58)' : 'rgba(255,255,255,.18)'}`,
        background: state.playing ? 'rgba(78,232,200,.12)' : 'rgba(8,9,15,.56)',
        color: state.playing ? 'var(--teal)' : 'var(--text)',
        fontSize: 12.5,
        fontWeight: 800,
        cursor: 'pointer',
        backdropFilter: 'blur(12px)',
      }}
    >
      {state.playing ? 'Ambiance en cours' : "Mettre l'ambiance"}
    </button>
  )
}
