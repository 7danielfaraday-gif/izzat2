/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./index.html",
    "./c/index.html",
    "./assets/js/checkout.app.js",
    "./assets/js/index.bundle.js"
  ],
  safelist: [
    "animate-fade-in",
    "animate-pulse-urgent",
    "animate-pulse-slow",
    "bg-[#f8fafc]",
    "shadow-[0_2px_8px_rgba(0,0,0,0.04)]",
    "shadow-[0_2px_15px_rgb(0,0,0,0.03)]",
    "shadow-[0_4px_20px_rgb(0,0,0,0.03)]",
    "safe-area-padding",
    "border-red-500",
    "bg-red-50/30",
    "border-green-500",
    "bg-green-50/30",
    "hover:shadow-green-500/50",
    "hover:-translate-y-0.5"
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
