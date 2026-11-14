/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        eco: {
          emerald: '#10B981',
          cyan: '#06B6D4',
          deep: '#0B1220',
          ink: '#04070D',
        },
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      letterSpacing: {
        tightest: '-0.03em',
      },
      boxShadow: {
        glow: '0 0 45px -12px rgba(16,185,129,0.55)',
        'glow-cyan': '0 0 45px -12px rgba(6,182,212,0.55)',
        'glow-violet': '0 0 45px -12px rgba(139,92,246,0.5)',
        'glow-soft': '0 0 24px -10px rgba(16,185,129,0.45)',
        card: '0 30px 60px -35px rgba(0,0,0,0.95)',
        lift: '0 28px 50px -30px rgba(0,0,0,1), 0 0 0 1px rgba(148,163,184,0.06)',
        inset: 'inset 0 1px 0 0 rgba(255,255,255,0.06)',
      },
      backgroundImage: {
        'grid-soft':
          'linear-gradient(to right, rgba(148,163,184,0.055) 1px, transparent 1px), linear-gradient(to bottom, rgba(148,163,184,0.055) 1px, transparent 1px)',
      },
      backgroundSize: {
        grid: '58px 58px',
      },
      keyframes: {
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'scale-in': {
          '0%': { opacity: '0', transform: 'scale(0.96)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        shimmer: {
          '100%': { transform: 'translateX(100%)' },
        },
        'pulse-soft': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.4' },
        },
        aurora: {
          '0%, 100%': { transform: 'translate3d(0,0,0) scale(1)' },
          '33%': { transform: 'translate3d(4%, -3%, 0) scale(1.08)' },
          '66%': { transform: 'translate3d(-3%, 3%, 0) scale(0.95)' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-6px)' },
        },
        sheen: {
          '0%': { transform: 'translateX(-120%)' },
          '100%': { transform: 'translateX(220%)' },
        },
        'spin-slow': {
          to: { transform: 'rotate(360deg)' },
        },
        'draw-in': {
          '0%': { strokeDashoffset: '1200' },
          '100%': { strokeDashoffset: '0' },
        },
        'bar-grow': {
          '0%': { transform: 'scaleX(0)' },
          '100%': { transform: 'scaleX(1)' },
        },
      },
      animation: {
        'fade-up': 'fade-up 0.5s cubic-bezier(0.22, 1, 0.36, 1) both',
        'fade-in': 'fade-in 0.35s ease-out both',
        'scale-in': 'scale-in 0.4s cubic-bezier(0.22, 1, 0.36, 1) both',
        shimmer: 'shimmer 1.6s infinite',
        'pulse-soft': 'pulse-soft 2s ease-in-out infinite',
        aurora: 'aurora 22s ease-in-out infinite',
        float: 'float 6s ease-in-out infinite',
        sheen: 'sheen 2.6s ease-in-out infinite',
        'spin-slow': 'spin-slow 18s linear infinite',
        'bar-grow': 'bar-grow 0.9s cubic-bezier(0.22, 1, 0.36, 1) both',
      },
    },
  },
  plugins: [],
}
