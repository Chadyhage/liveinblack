import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  server: {
    // Respecte le port assigné par l'outillage (env PORT) — permet de lancer
    // plusieurs serveurs dev en parallèle sans collision. Fallback : 5175.
    port: Number(process.env.PORT) || 5175,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
    dedupe: ['three'],
  },
})
