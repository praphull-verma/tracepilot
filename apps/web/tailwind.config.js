/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: '#4f8ef7',
        secondary: '#8b5cf6',
        success: '#10d9a0',
        warning: '#f59e0b',
        danger: '#ef4444',
        'bg-base': '#0a0d14',
        'bg-surface': '#0f1420',
        'bg-elevated': '#141929',
        'bg-card': '#1a2035',
      },
      fontFamily: {
        sans: ['Inter', '-apple-system', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      animation: {
        'fade-in': 'fadeIn 0.3s ease-out',
        'slide-up': 'slideUp 0.3s ease-out',
        'pulse-glow': 'pulseGlow 2s infinite',
      },
    },
  },
  plugins: [],
};
