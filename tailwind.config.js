/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./assets/js/checkout.app.js",
    "./c/index.html",
    "./index.html"
  ],
  theme: {
    extend: {
      fontFamily: { sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'] },
      colors: { clifford: '#da373d' },
      spacing: {
          'safe-top': 'env(safe-area-inset-top)',
          'safe-bottom': 'env(safe-area-inset-bottom)'
      },
      keyframes: {
          fadeIn: {
              '0%': { opacity: '0', transform: 'translateY(10px)' },
              '100%': { opacity: '1', transform: 'translateY(0)' }
          },
          pulseUrgent: {
              '0%, 100%': { opacity: '1' },
              '50%': { opacity: '0.8' }
          }
      },
      animation: {
          'fade-in': 'fadeIn 0.5s ease-out forwards',
          'pulse-urgent': 'pulseUrgent 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
          'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite'
      }
    }
  },
  plugins: [],
}
