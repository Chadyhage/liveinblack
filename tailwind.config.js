/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        obsidian: {
          DEFAULT: '#04040b',
          2: '#08080f',
          3: '#0e0e18',
          4: '#14141f',
        },
        gold: {
          400: '#d4af37',
          500: '#b8962e',
          bright: '#f0e080',
        },
        chrome: {
          100: '#e8e8f2',
          200: '#c0c0d4',
          300: '#9090a8',
          400: '#606078',
          500: '#38384a',
          600: '#20202e',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      backgroundImage: {
        'metal-gold': 'linear-gradient(105deg, #b8962e 0%, #d4af37 30%, #f0e080 50%, #d4af37 70%, #b8962e 100%)',
        'metal-chrome': 'linear-gradient(105deg, #3a3a4a 0%, #6a6a80 25%, #9090a8 50%, #6a6a80 75%, #3a3a4a 100%)',
        'obsidian-gradient': 'linear-gradient(160deg, #04040b 0%, #08080f 50%, #0e0e18 100%)',
      },
      animation: {
        'pulse-slow': 'pulse 3s ease-in-out infinite',
        'float': 'liquid-float 6s ease-in-out infinite',
        'metal-shine': 'metal-shine 4s linear infinite',
        'chrome-shimmer': 'chrome-shimmer 5s linear infinite',
        'glow-pulse': 'glow-pulse 6s ease-in-out infinite',
      },
      keyframes: {
        'liquid-float': {
          '0%, 100%': { transform: 'translateY(0px) rotate(0deg)' },
          '33%':       { transform: 'translateY(-12px) rotate(1deg)' },
          '66%':       { transform: 'translateY(-6px) rotate(-1deg)' },
        },
        'metal-shine': {
          '0%':   { backgroundPosition: '0% center' },
          '100%': { backgroundPosition: '-220% center' },
        },
        'chrome-shimmer': {
          '0%':   { backgroundPosition: '-200% center' },
          '100%': { backgroundPosition: '200% center' },
        },
        'glow-pulse': {
          '0%, 100%': { opacity: '0.5', transform: 'scale(1)' },
          '50%':       { opacity: '0.9', transform: 'scale(1.05)' },
        },
      },
      boxShadow: {
        'gold-glow': '0 0 24px rgba(212,175,55,0.25), 0 0 48px rgba(212,175,55,0.1)',
        'chrome-glow': '0 0 24px rgba(180,180,220,0.15)',
        'metal-card': '0 8px 40px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.07)',
      },
    },
  },
  plugins: [],
}
